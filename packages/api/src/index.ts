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
import takeToken, {
  BucketOptions,
  BucketState,
} from '@authentication/rate-limit/lib/bucket';

export {auth};
export {gql};

export interface RateLimitOptions extends BucketOptions {
  /**
   * Defaults to 30 seconds
   */
  maxDelay?: number;
}
export type Options = {
  maxBatchSize?: number;
  onRequest?: (request: {query: string; variables: any}) => void;
  onResponse?: (
    request: {query: string; variables: any},
    response: {data?: any; errors?: readonly any[]},
  ) => void;
  onBatchRequest?: (request: {query: string; variables: any}) => void;
  onBatchResponse?: (
    request: {query: string; variables: any},
    response: {
      headers: any;
      status: number;
      url: any;
      data: {data?: any; errors?: any[]};
    },
  ) => void;
} & (
  | {
      auth: Pick<AuthInterface<any, any>, 'hook'>;
      rateLimitOptions?: RateLimitOptions;
      userAgent?: string;
      request?: undefined;
    }
  | {
      auth?: undefined;
      userAgent?: undefined;
      request: (options: EndpointOptions) => Promise<OctoKitResponse<any>>;
    }
);
const VERSION = require('../package.json').version;
const USER_AGENT = `github-graph-api/${VERSION} ${getUserAgent()}`;

export type Method<TResult, TArgs> = {} extends TArgs
  ? (client: GitHubClient, args?: TArgs) => Promise<TResult>
  : (client: GitHubClient, args: TArgs) => Promise<TResult>;
export function getMethod<TResult, TArgs>(
  doc: DocumentNode,
): Method<TResult, TArgs> {
  return (async (client: GitHubClient, args?: TArgs): Promise<TResult> =>
    client.query(doc, args)) as Method<TResult, TArgs>;
}

export class GraphqlError extends Error {
  constructor(
    request: {query: string; variables: any},
    response: {data?: any; errors?: readonly any[]},
  ) {
    const message = response.errors![0].message;
    super(message);

    Object.assign(this, response, {request});
    this.name = 'GraphqlError';

    // Maintains proper stack trace (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// tslint:disable-next-line: no-implicit-dependencies
export type OctoKitResponse<T> = import('@octokit/types').OctokitResponse<T>;
// tslint:disable-next-line: no-implicit-dependencies
type PaginateInterface = import('@octokit/plugin-paginate-rest').PaginateInterface;
// tslint:disable-next-line: no-implicit-dependencies
type RestEndpointMethods = Octokit;
export type RestApi = Readonly<
  {paginate: PaginateInterface} & RestEndpointMethods
>;
// tslint:disable-next-line: no-implicit-dependencies
type EndpointOptions = import('@octokit/types').EndpointOptions;
export default class GitHubClient {
  private _batch: Batch | null = null;
  private _batchSize: number = 0;
  private readonly _options: Options;
  public readonly request: (
    options: EndpointOptions,
  ) => Promise<OctoKitResponse<any>>;
  public readonly rest: RestApi;
  constructor(options: Options) {
    if (options.auth) {
      this._options = options;
      const rateLimitOptions: RateLimitOptions | undefined =
        options.rateLimitOptions;
      let rateLimitState: BucketState | null = null;
      this.request = async (_options) => {
        if (rateLimitOptions) {
          const now = Date.now();
          const newRateLimitState = takeToken(rateLimitState, rateLimitOptions);
          if (
            newRateLimitState.timestamp - now >
            (rateLimitOptions.maxDelay || 30_000)
          ) {
            const err: any = new Error(
              `You have hit the rate limit you set when constructing the GitHubClient. You can make another request in ${Math.floor(
                (newRateLimitState.timestamp - now) / 1000,
              )} seconds`,
            );
            err.code = 'RATE_LIMIT_EXCEEDED';
            throw err;
          }
          rateLimitState = newRateLimitState;
          if (newRateLimitState.timestamp > now) {
            await new Promise((resolve) => {
              setTimeout(resolve, newRateLimitState.timestamp - now);
            });
          }
        }
        return await request({
          ..._options,
          headers: {
            'user-agent': options.userAgent || USER_AGENT,
            ..._options.headers,
          },
          request: {hook: options.auth.hook},
        });
      };
    } else {
      this._options = options;
      this.request = options.request;
    }
    this.rest = new Octokit({request: options.request});
  }
  private readonly _processQueue = async () => {
    if (this._batch) {
      const b = this._batch;
      this._batch = null;
      this._batchSize = 0;
      await b.run();
    }
  };

  public async query(query: DocumentNode, variables: any = {}): Promise<any> {
    if (this._batchSize >= (this._options.maxBatchSize || 100)) {
      void this._processQueue();
    }
    this._batchSize++;
    if (!this._batch) {
      this._batch = new Batch(async (q) => {
        let attempts = 0;
        while (true) {
          const req = {
            query: print(q.query),
            variables: q.variables,
          };
          if (this._options.onBatchRequest) this._options.onBatchRequest(req);
          const response = await this.request({
            ...req,
            method: 'POST',
            url: '/graphql',
          });

          if (this._options.onBatchResponse)
            this._options.onBatchResponse(req, response);
          if (
            response.data.errors?.length === 1 &&
            response.data.errors[0].type === 'RATE_LIMITED'
          ) {
            if (attempts++ > 3) {
              throw new GraphqlError(req, response);
            }
            await new Promise((resolve) => {
              setTimeout(resolve, attempts * 5000);
            });
            continue;
          }
          return response.data;
        }
      });
      void Promise.resolve(null).then(this._processQueue);
    }
    let request: {query: string; variables: any} | undefined;
    const getRequest = () =>
      request || (request = {query: print(query), variables});
    if (this._options.onRequest) {
      this._options.onRequest(getRequest());
    }
    const response = await this._batch?.queue({query, variables});
    if (this._options.onResponse) {
      this._options.onResponse(getRequest(), response);
    }
    if (response.errors && response.errors.length) {
      throw new GraphqlError(getRequest(), response);
    }
    return response.data;
  }
}
