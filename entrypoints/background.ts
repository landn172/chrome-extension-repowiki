import { PROVIDERS, extractGithubRepo } from '../utils/providers';

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-pinned-wiki') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const repoInfo = extractGithubRepo(tab.url);
    if (!repoInfo) return;

    // Resolve pinned provider with fallback (matches content script logic)
    let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
    try {
      const result = await browser.storage.sync.get('pinnedProvider');
      if (typeof result.pinnedProvider === 'string') {
        pinnedId = result.pinnedProvider;
      }
    } catch {
      // Fall back to default
    }

    const provider = PROVIDERS.find(p => p.id === pinnedId);
    if (!provider) return;

    const url = provider.transform(repoInfo.owner, repoInfo.repo);
    await browser.tabs.create({ url });
  });
});
