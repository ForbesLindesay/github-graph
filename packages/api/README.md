# @github-graph/api

API client for GitHub's GraphQL API that automatically merges multiple requests into one where possible, saving you from hitting the API rate limits.

## Installation

```
yarn add @github-graph/api
```

## Usage

```ts
import Client, {auth, gql, getMethod} from '@github-graph/api';

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

const client = new Client({
  auth: auth.createTokenAuth(GITHUB_TOKEN),
});

await Promise.all([
  getStargazers(client, {owner: 'pugjs', name: 'pug'}),
  getWatchers(client, {owner: 'pugjs', name: 'pug'})),
  getStargazers(client, {owner: 'ForbesLindesay', name: 'atdatabases'}),
  getWatchers(client, {owner: 'ForbesLindesay', name: 'atdatabases'}),
]);
```

Unlike other libraries, that would send 4 separate queries to the backend. This library will only send one:

```ts
{
  query: `
    query ($owner: String!, $name: String!, $b: String!, $c: String!) {
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
  `,
  variables: {
    b: 'ForbesLindesay',
    c: 'atdatabases',
    name: 'pug',
    owner: 'pugjs',
  },
}
```

This is 4 times fewer tokens used from your rate limit.

### REST API

Unfortunatley not everything on GitHub is available via the GraphQL API. If you need to, you can use `client.rest` which matches the [octokit/rest](https://octokit.github.io/rest.js/v17) API. or you can use `client.request` which lets you make direct un-typed requests to the GitHub API.

### Constructing from octokit

If you already have an octokit client, you can construct a github-graph client via:

```ts
const client = new Client({
  request: octokitClient.request,
});
```
