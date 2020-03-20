// tslint:disable-next-line: no-implicit-dependencies
import {AuthInterface} from '@octokit/types';
import {request} from '@octokit/request';
import {getUserAgent} from 'universal-user-agent';
import {Batch} from 'graphql-merge-unmerge';
import {DocumentNode} from 'graphql/language/ast';
import {print} from 'graphql';
import gql from 'graphql-tag';
import * as auth from '@octokit/auth';
import {Octokit} from '@octokit/rest';

export {auth};
export {gql};

export type Options = {
  auth: Pick<AuthInterface<any, any>, 'hook'>;
  userAgent?: string;
  onRequest?: (request: {query: string; variables: any}) => void;
  onResponse?: (
    request: {query: string; variables: any},
    response: {
      headers: any;
      status: number;
      url: any;
      data: any;
    },
  ) => void;
};
const VERSION = require('../package.json').version;
const USER_AGENT = `github-graph-api/${VERSION} ${getUserAgent()}`;

export type Method<TResult, TArgs> = {} extends TArgs
  ? (client: Client, args?: TArgs) => Promise<TResult>
  : (client: Client, args: TArgs) => Promise<TResult>;
export function getMethod<TResult, TArgs>(
  doc: DocumentNode,
): Method<TResult, TArgs> {
  return (async (client: Client, args?: TArgs): Promise<TResult> =>
    client.query(doc, args)) as Method<TResult, TArgs>;
}

export class GraphqlError extends Error {
  constructor(request: {query: string; variables: any}, response: {data: any}) {
    const message = response.data.errors[0].message;
    super(message);

    Object.assign(this, response.data, {request});
    this.name = 'GraphqlError';

    // Maintains proper stack trace (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// tslint:disable-next-line: no-implicit-dependencies
type PaginateInterface = import('@octokit/plugin-paginate-rest').PaginateInterface;
// tslint:disable-next-line: no-implicit-dependencies
type RestEndpointMethods = import('@octokit/plugin-rest-endpoint-methods/dist-types/generated/types').RestEndpointMethods;
export type RestApi = Readonly<
  {paginate: PaginateInterface} & RestEndpointMethods
>;
// tslint:disable-next-line: no-implicit-dependencies
type EndpointOptions = import('@octokit/types').EndpointOptions;
export default class Client {
  private _batch: Batch | null = null;
  private readonly _options: Options;
  public readonly rest: RestApi;
  constructor(options: Options) {
    this._options = options;
    this.rest = new Octokit({authStrategy: () => this._options.auth});
  }
  private readonly _processQueue = async () => {
    if (this._batch) {
      const b = this._batch;
      this._batch = null;
      await b.run();
    }
  };

  public async request(options: EndpointOptions) {
    return await request({
      ...options,
      headers: {
        'user-agent': this._options.userAgent || USER_AGENT,
        ...options.headers,
      },
      request: {hook: this._options.auth.hook},
    });
  }

  public async query(query: DocumentNode, variables: any = {}): Promise<any> {
    if (!this._batch) {
      this._batch = new Batch(async (q) => {
        const req = {
          query: print(q.query),
          variables: q.variables,
        };
        if (this._options.onRequest) this._options.onRequest(req);
        const response = await request({
          ...req,
          method: 'POST',
          url: '/graphql',
          headers: {'user-agent': this._options.userAgent || USER_AGENT},
          request: {hook: this._options.auth.hook},
        });

        if (this._options.onResponse) this._options.onResponse(req, response);

        if (response.data.errors) {
          throw new GraphqlError(req, response);
        }

        return response.data.data;
      });
      void Promise.resolve(null).then(this._processQueue);
    }
    return await this._batch?.queue({query, variables});
  }
}
