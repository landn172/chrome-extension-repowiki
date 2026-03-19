import { PROVIDERS, extractGithubRepo, mergeCustomProviders, type CustomProvider } from '../utils/providers';

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-pinned-wiki') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const repoInfo = extractGithubRepo(tab.url);
    if (!repoInfo) return;

    // Resolve pinned provider with fallback (matches content script logic)
    let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
    let enabledMap: Record<string, boolean> = {};
    let customList: CustomProvider[] = [];
    try {
      const result = await browser.storage.sync.get(['pinnedProvider', 'enabledProviders', 'customProviders']);
      if (typeof result.pinnedProvider === 'string') {
        pinnedId = result.pinnedProvider;
      }
      const stored = result.enabledProviders;
      if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
        enabledMap = stored as Record<string, boolean>;
      }
      if (Array.isArray(result.customProviders)) {
        customList = result.customProviders as CustomProvider[];
      }
    } catch {
      // Fall back to defaults
    }

    const allProviders = mergeCustomProviders(customList);

    const isEnabled = (id: string, defaultVal: boolean) =>
      id in enabledMap ? enabledMap[id] : defaultVal;

    // If pinned provider is disabled, fall back to first enabled provider
    let provider = allProviders.find(p => p.id === pinnedId);
    if (!provider || !isEnabled(provider.id, provider.enabledByDefault)) {
      provider = allProviders.find(p => isEnabled(p.id, p.enabledByDefault));
    }
    if (!provider) return;

    const url = provider.transform(repoInfo.owner, repoInfo.repo);
    await browser.tabs.create({ url });
  });
});
