import { spawnSync } from 'node:child_process';

for (const file of process.argv.slice(2)) {
  const staged = spawnSync('git', ['show', `:${file}`], { encoding: 'utf8' });
  if (staged.status !== 0) {
    process.stderr.write(staged.stderr || `Could not read staged file: ${file}\n`);
    process.exit(1);
  }

  const result = spawnSync(
    'pnpm',
    ['exec', 'biome', 'check', '--write', `--stdin-file-path=${file}`],
    { input: staged.stdout, encoding: 'utf8' },
  );
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (result.stdout !== staged.stdout) {
    console.error(`Staged file needs formatting or import fixes: ${file}`);
    process.exit(1);
  }
}
