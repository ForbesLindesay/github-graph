# @github-graph/cli

Generate a strongly typed API for GitHub from a set of GraphQL Queries.

## Installation

```
yarn add @github-graph/cli
```

## Usage

api.graphql

```graphql
query GetLogin {
  viewer {
    login
  }
}

query GetStargazers($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    stargazers {
      totalCount
    }
  }
}

query GetWatchers($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    watchers {
      totalCount
    }
  }
}
```

Then build it with:

```
npx @github-graph/cli api.graphql
```

Then import:

```ts
import Client, {auth} from '@github-graph/api';
import {getStargazers, getWatchers} from './api';

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
