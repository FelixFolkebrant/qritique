import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  zip: {
    includeSources: [
      'src/**',
      'public/**',
      'scripts/**',
      'docs/PRIVACY.md',
      '*.json',
      '*.ts',
      '*.yaml',
      '*.yml',
      'README.md',
      'BUILD-FIREFOX.md',
      'LICENSE',
      '.gitignore',
    ],
  },
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ browser }) => ({
    name: 'Qritique',
    description: 'Mark a website. Add your notes. Copy visual feedback for your next iteration.',
    permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite'],
    incognito: 'not_allowed',
    web_accessible_resources: [{ resources: ['notes.html'], matches: ['<all_urls>'] }],
    action: { default_title: 'Start / stop Qritique' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+Q' },
        description: 'Start or stop annotating this page',
      },
    },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    minimum_chrome_version: browser === 'chrome' ? '116' : undefined,
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'qritique@qritique.local',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          }
        : undefined,
  }),
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // On-demand injection uses activeTab instead of permanent website access.
      delete manifest.host_permissions;
    },
  },
});
