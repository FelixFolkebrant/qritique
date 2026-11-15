import { readFileSync } from 'node:fs';

const subject = readFileSync(process.argv[2], 'utf8').split('\n')[0].trim();
if (!/^\S+\s+\S/.test(subject) || (/\(#[^)]*\)/.test(subject) && !/\(#[1-9]\d*\)$/.test(subject))) {
  console.error(
    'Use a descriptive commit title, optionally ending with an issue suffix such as (#142).',
  );
  process.exit(1);
}
