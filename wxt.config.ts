import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'RepoWiki',
    description: 'Open any GitHub repo in DeepWiki, CodeWiki, and more',
    permissions: ['activeTab', 'storage', 'tabs'],
    action: {
      default_title: 'RepoWiki',
    },
    commands: {
      'open-pinned-wiki': {
        suggested_key: { default: 'Alt+W' },
        description: 'Open repo in pinned wiki provider',
      },
    },
  },
});
