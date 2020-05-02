import {readFileSync} from 'fs';
import Client, {auth, gql, getMethod} from '../';
import {Octokit} from '@octokit/rest';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || readToken();

function readToken() {
  try {
    return readFileSync('.github-token', 'utf8').trim();
  } catch (ex) {
    throw new Error(
      'Could not find a GitHub token in the env var GITHUB_TOKEN or the file .github-token',
    );
  }
}

test('getMethod', async () => {
  const getStargazers = getMethod<
    {repository: {nameWithOwner: string; stargazers: {totalCount: number}}},
    {owner: string; name: string}
  >(gql`
    query GetStargazers($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        nameWithOwner
        stargazers {
          totalCount
        }
      }
    }
  `);

  const expectedStargazers = (nameWithOwner: string) => ({
    repository: {
      nameWithOwner,
      stargazers: {totalCount: expect.any(Number)},
    },
  });

  const getWatchers = getMethod<
    {repository: {nameWithOwner: string; watchers: {totalCount: number}}},
    {owner: string; name: string}
  >(gql`
    query GetWatchers($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        nameWithOwner
        watchers {
          totalCount
        }
      }
    }
  `);

  const expectedWatchers = (nameWithOwner: string) => ({
    repository: {
      nameWithOwner,
      watchers: {totalCount: expect.any(Number)},
    },
  });

  const requests: any[] = [];
  const client = new Client({
    auth: auth.createTokenAuth(GITHUB_TOKEN),
    onRequest: (req) => requests.push(req),
  });

  await Promise.all([
    client
      .query(
        gql`
          {
            rateLimit {
              limit
              cost
              remaining
              resetAt
            }
          }
        `,
      )
      .then((result) => console.info(result)),
    expect(
      getStargazers(client, {owner: 'pugjs', name: 'pug'}),
    ).resolves.toEqual(expectedStargazers('pugjs/pug')),
    expect(getWatchers(client, {owner: 'pugjs', name: 'pug'})).resolves.toEqual(
      expectedWatchers('pugjs/pug'),
    ),
    expect(
      getStargazers(client, {owner: 'ForbesLindesay', name: 'atdatabases'}),
    ).resolves.toEqual(expectedStargazers('ForbesLindesay/atdatabases')),
    expect(
      getWatchers(client, {owner: 'ForbesLindesay', name: 'atdatabases'}),
    ).resolves.toEqual(expectedWatchers('ForbesLindesay/atdatabases')),
  ]);
  expect(requests).toMatchInlineSnapshot(`
    Array [
      Object {
        "query": "query ($owner: String!, $name: String!, $b: String!, $c: String!) {
      rateLimit {
        limit
        cost
        remaining
        resetAt
      }
      repository(owner: $owner, name: $name) {
        nameWithOwner
        stargazers {
          totalCount
        }
        watchers {
          totalCount
        }
      }
      b: repository(owner: $b, name: $c) {
        nameWithOwner
        stargazers {
          totalCount
        }
        watchers {
          totalCount
        }
      }
    }
    ",
        "variables": Object {
          "b": "ForbesLindesay",
          "c": "atdatabases",
          "name": "pug",
          "owner": "pugjs",
        },
      },
    ]
  `);

  const clientFromOctokit = new Client({
    request: new Octokit({auth: GITHUB_TOKEN}).request,
    onRequest: (req) => requests.push(req),
  });

  await expect(
    getStargazers(clientFromOctokit, {
      owner: 'ForbesLindesay',
      name: 'atdatabases',
    }),
  ).resolves.toEqual(expectedStargazers('ForbesLindesay/atdatabases'));
});

test('rest endpoint', async () => {
  const client = new Client({
    auth: auth.createTokenAuth(GITHUB_TOKEN),
  });
  const result = await client.rest.repos.get({
    owner: 'ForbesLindesay',
    repo: 'atdatabases',
  });
  expect(result.data.url).toMatchInlineSnapshot(
    `"https://api.github.com/repos/ForbesLindesay/atdatabases"`,
  );
});
