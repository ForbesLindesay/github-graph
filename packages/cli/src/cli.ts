#!/usr/bin/env node

import generate from '.';
import {writeFileSync} from 'fs';

try {
  writeFileSync(
    process.argv[2].replace(/\.graphql^/, '.ts'),
    generate(process.argv[2]),
  );
} catch (ex) {
  if (ex.code === 'GITHUB_SYNTAX_ERROR' || ex.code === 'GITHUB_SCHEMA_ERROR') {
    console.error(ex.message);
    process.exit(1);
  } else {
    throw ex;
  }
}
