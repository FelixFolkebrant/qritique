import { readFileSync } from 'node:fs';

const input = readFileSync(0, 'utf8');
const pattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
for (const line of input.split('\n').filter(Boolean)) {
  const [localRef, , remoteRef, remoteSha] = line.split(' ');
  if (localRef === '(delete)' || !remoteRef.startsWith('refs/heads/')) continue;
  if (localRef === 'refs/heads/main' && remoteRef === 'refs/heads/main' && /^0+$/.test(remoteSha))
    continue;
  for (const ref of [localRef, remoteRef]) {
    if (!ref.startsWith('refs/heads/')) continue;
    const name = ref.slice('refs/heads/'.length);
    if (!pattern.test(name)) {
      console.error(`Invalid branch name '${name}'. Use {username}/{short-description}.`);
      process.exit(1);
    }
  }
}
