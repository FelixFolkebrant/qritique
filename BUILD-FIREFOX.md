# Build Qritique for Firefox review

Reference environment: Linux x86_64 (Arch Linux), Node.js 26.6.0, pnpm 12.19.0.
All build dependencies are pinned by `pnpm-lock.yaml`.

1. Install [Node.js 26.6.0](https://nodejs.org/en/download/archive).
2. Install pnpm: `npm install --global pnpm@12.19.0`.
3. Extract the submitted source archive and run these commands in its root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec wxt prepare
pnpm build:firefox
```

The resulting extension files are in `.output/firefox-mv3`. Compare their
paths and contents with the submitted Firefox extension ZIP. ZIP metadata
such as timestamps and compression can differ.

Dependency installation requires access to the public package registry.
No account, credentials, environment secrets, Git checkout, or server is needed.
Install scripts are skipped to avoid installing development Git hooks; WXT
preparation is run explicitly. Native build tools use their packaged binaries.

The source archive includes `.gitignore`. Tailwind class discovery is explicitly
limited to `src/`, so unrelated files do not change generated styles.
