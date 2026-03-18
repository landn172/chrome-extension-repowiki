import { PROVIDERS, extractGithubRepo } from '../../utils/providers';

async function main(): Promise<void> {
  // Load enabled state from storage, fall back to defaults
  let enabledMap: Record<string, boolean> = {};
  try {
    const result = await browser.storage.sync.get('enabledProviders');
    enabledMap = (result.enabledProviders as Record<string, boolean>) ?? {};
  } catch {
    // Fall back to defaults
  }

  function isEnabled(id: string, defaultVal: boolean): boolean {
    return id in enabledMap ? enabledMap[id] : defaultVal;
  }

  // Render settings checkboxes (always visible)
  const settingsSection = document.getElementById('settings-section') as HTMLDivElement;
  for (const provider of PROVIDERS) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('data-provider-id', provider.id);
    checkbox.checked = isEnabled(provider.id, provider.enabledByDefault);
    checkbox.addEventListener('change', async () => {
      enabledMap[provider.id] = checkbox.checked;
      try {
        await browser.storage.sync.set({ enabledProviders: enabledMap });
      } catch {
        // Ignore storage write failures
      }
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(provider.name));
    settingsSection.appendChild(label);
  }

  // Query active tab
  const linksSection = document.getElementById('links-section') as HTMLDivElement;
  const notRepoMsg = document.getElementById('not-repo-msg') as HTMLParagraphElement;
  const allDisabledMsg = document.getElementById('all-disabled-msg') as HTMLParagraphElement;

  let tab: browser.tabs.Tab | undefined;
  try {
    [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  } catch {
    notRepoMsg.style.display = 'block';
    return;
  }

  const repoInfo = tab?.url ? extractGithubRepo(tab.url) : null;

  if (!repoInfo) {
    notRepoMsg.style.display = 'block';
    return;
  }

  const enabledProviders = PROVIDERS.filter(p => isEnabled(p.id, p.enabledByDefault));

  if (enabledProviders.length === 0) {
    allDisabledMsg.style.display = 'block';
    return;
  }

  for (const provider of enabledProviders) {
    const row = document.createElement('div');
    row.className = 'provider-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'provider-name';
    nameSpan.textContent = provider.name;

    const link = document.createElement('a');
    link.className = 'open-link';
    link.href = provider.transform(repoInfo.owner, repoInfo.repo);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open ↗';

    row.appendChild(nameSpan);
    row.appendChild(link);
    linksSection.appendChild(row);
  }
}

main();
