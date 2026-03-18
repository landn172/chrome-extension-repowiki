import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'RepoWiki',
    description: 'Open any GitHub repo in DeepWiki, CodeWiki, and more',
    permissions: ['activeTab', 'storage'],
    action: {
      default_title: 'RepoWiki',
    },
  },
});
