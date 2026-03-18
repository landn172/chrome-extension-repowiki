import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'DeepWiki',
    version: '1.0.0',
    description: 'Open any GitHub repo in DeepWiki with one click',
    permissions: ['activeTab'],
    action: {
      default_title: 'Open in DeepWiki',
    },
  },
});
