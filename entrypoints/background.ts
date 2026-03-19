import { PROVIDERS, extractGithubRepo, mergeCustomProviders, getProviderInitials, type CustomProvider } from '../utils/providers';

export default defineBackground(() => {
  async function updateBadge(tabId: number): Promise<void> {
    try {
      const tab = await browser.tabs.get(tabId);
      if (!tab.url) {
        await browser.action.setBadgeText({ text: '', tabId });
        return;
      }

      const repoInfo = extractGithubRepo(tab.url);
      if (!repoInfo) {
        await browser.action.setBadgeText({ text: '', tabId });
        return;
      }

      // Resolve pinned provider name
      let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
      let customList: CustomProvider[] = [];
      try {
        const result = await browser.storage.sync.get(['pinnedProvider', 'customProviders']);
        if (typeof result.pinnedProvider === 'string') {
          pinnedId = result.pinnedProvider;
        }
        if (Array.isArray(result.customProviders)) {
          customList = result.customProviders as CustomProvider[];
        }
      } catch {
        // Fall back to defaults
      }

      const allProviders = mergeCustomProviders(customList);
      const provider = allProviders.find(p => p.id === pinnedId)
        ?? allProviders.find(p => p.pinnedByDefault)
        ?? allProviders[0];

      const initials = getProviderInitials(provider?.name ?? '');
      await browser.action.setBadgeText({ text: initials, tabId });
      await browser.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
    } catch {
      // Tab may have been closed or URL inaccessible — clear badge silently
      try {
        await browser.action.setBadgeText({ text: '', tabId });
      } catch {
        // Tab no longer exists, nothing to do
      }
    }
  }

  // Update badge when a tab's URL changes
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      updateBadge(tabId);
    }
  });

  // Update badge when user switches tabs
  browser.tabs.onActivated.addListener((activeInfo) => {
    updateBadge(activeInfo.tabId);
  });

  // Update badge when pinned provider or custom providers change
  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    if (!('pinnedProvider' in changes) && !('customProviders' in changes)) return;

    // Update all active tabs across all windows
    try {
      const tabs = await browser.tabs.query({ active: true });
      for (const tab of tabs) {
        if (tab.id != null) {
          updateBadge(tab.id);
        }
      }
    } catch {
      // Ignore query failures
    }
  });

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
