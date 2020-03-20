import {buildClientSchema} from 'graphql/utilities/buildClientSchema';
import {
  compileToIR,
  SelectionSet,
  CompilerContext,
} from 'apollo-codegen-core/lib/compiler';
import {parse, Source} from 'graphql';
import {readFileSync} from 'fs';
import {generateGlobalSource} from 'apollo-codegen-typescript';
import {TypescriptAPIGenerator} from 'apollo-codegen-typescript/lib/codeGeneration';
import {camelCase} from 'camel-case';
import {codeFrameColumns} from '@babel/code-frame';
const rawSchema = require('@octokit/graphql-schema/schema.json');

const schema = buildClientSchema(rawSchema);

export default function generate(inputFile: string) {
  const source = readFileSync(inputFile, 'utf8');
  let document;
  try {
    document = parse(new Source(source, inputFile));
  } catch (ex) {
    ex.message = formatError(ex, source);
    ex.code = 'GITHUB_SYNTAX_ERROR';
    throw ex;
  }
  let context: CompilerContext;
  try {
    context = compileToIR(schema, document, {passthroughCustomScalars: true});
  } catch (ex) {
    ex.message = formatError(ex, source);
    ex.code = 'GITHUB_SCHEMA_ERROR';
    throw ex;
  }
  const sharedTypes = generateGlobalSource(context).fileContents;
  const generator = new TypescriptAPIGenerator(context);

  function getFragmentNames(set: SelectionSet): string[] {
    return set.selections
      .map((s): string[] => {
        switch (s.kind) {
          case 'Field':
            return s.selectionSet ? getFragmentNames(s.selectionSet) : [];
          case 'BooleanCondition':
            return getFragmentNames(s.selectionSet);
          case 'FragmentSpread':
            return [s.fragmentName, ...getFragmentNames(s.selectionSet)];
          case 'TypeCondition':
            return getFragmentNames(s.selectionSet);
        }
      })
      .reduce((a, b) => [...a, ...b], []);
  }
  Object.values(context.operations).forEach((operation) => {
    generator.interfacesForOperation(operation);

    const fragments = [...new Set(getFragmentNames(operation.selectionSet))];

    generator.printer.enqueue(
      `export const ${camelCase(operation.operationName)} = getMethod<${
        operation.operationName
      }, ${
        operation.variables.length
          ? `${operation.operationName}Variables`
          : `{}`
      }>(gql\`\n${operation.source}${fragments.map(
        (fragmentName) => `\n${context.fragments[fragmentName].source}`,
      )}\n\`);`,
    );
  });

  Object.values(context.fragments).forEach((fragment) => {
    generator.interfacesForFragment(fragment);
  });
  const [header, ...rest] = sharedTypes.split('\n\n');
  const customScalars = {
    Date: {
      type: 'string',
      comment: 'An ISO-8601 encoded date string',
    },
    DateTime: {
      type: 'string',
      comment: 'An ISO-8601 encoded UTC date string',
    },
    GitObjectID: {
      type: 'string',
      comment: 'A Git object ID',
    },
    GitRefname: {
      type: 'string',
      comment: 'A fully qualified reference name (e.g. "refs/heads/master")',
    },
    GitSSHRemote: {
      type: 'string',
      comment: 'Git SSH string',
    },
    GitTimestamp: {
      type: 'string',
      comment:
        'An ISO-8601 encoded date string. Unlike the DateTime type, GitTimestamp is not converted in UTC.',
    },
    HTML: {
      type: 'string',
      comment: 'A string containing HTML code.',
    },
    PreciseDateTime: {
      type: 'string',
      comment: 'An ISO-8601 encoded UTC date string with millisecond precison.',
    },
    URI: {
      type: 'string',
      comment:
        'An RFC 3986, RFC 3987, and RFC 6570 (level 4) compliant URI string.',
    },
    X509Certificate: {
      type: 'string',
      comment: 'A valid x509 certificate string',
    },
  };
  return (
    header +
    `\n\nimport {getMethod, gql} from '@github-graph/api';\n\n${Object.entries(
      customScalars,
    )
      .map(
        ([key, value]) =>
          `/**\n * ${value.comment}\n */\nexport type ${key} = ${value.type};`,
      )
      .join('\n')}\n\n` +
    rest.join('\n\n') +
    '\n\n' +
    generator.printer.printAndClear()
  );
}

function formatError(e: any, source: string) {
  if (e.locations && e.locations.length === 1) {
    const [loc] = e.locations;
    return `${e.message}\n\n${codeFrameColumns(source, {
      start: {
        line: loc.line,
        column: loc.column,
      },
    })}\n`;
  } else {
    return e.message;
  }
}
