import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';

const files = process.argv.slice(2).map((file) => path.resolve(file));
const configPath = ts.findConfigFile('.', ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('Could not find tsconfig.json');

const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
const staged = new Map();
for (const file of files) {
  staged.set(
    file,
    execFileSync('git', ['show', `:${path.relative(process.cwd(), file)}`], { encoding: 'utf8' }),
  );
}

const host = ts.createCompilerHost(parsed.options);
const readFile = host.readFile.bind(host);
host.readFile = (file) => staged.get(path.resolve(file)) ?? readFile(file);
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, host });
const diagnostics = [
  ...parsed.errors,
  ...program.getOptionsDiagnostics(),
  ...program.getGlobalDiagnostics(),
];
for (const file of files) {
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Staged file is not included in tsconfig.json: ${file}`);
  diagnostics.push(
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  );
}
if (diagnostics.length) {
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    }),
  );
  process.exit(1);
}
