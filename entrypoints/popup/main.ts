import { PROVIDERS, extractGithubRepo } from '../../utils/providers';

async function main(): Promise<void> {
  // Load enabled state from storage, fall back to defaults
  let enabledMap: Record<string, boolean> = {};
  try {
    const result = await browser.storage.sync.get('enabledProviders');
    const stored = result.enabledProviders;
    if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
      enabledMap = stored as Record<string, boolean>;
    }
  } catch {
    // Fall back to defaults
  }

  function isEnabled(id: string, defaultVal: boolean): boolean {
    return id in enabledMap ? enabledMap[id] : defaultVal;
  }

  const linksSection = document.getElementById('links-section') as HTMLDivElement;
  const notRepoMsg = document.getElementById('not-repo-msg') as HTMLParagraphElement;
  const allDisabledMsg = document.getElementById('all-disabled-msg') as HTMLParagraphElement;
  const settingsSection = document.getElementById('settings-section') as HTMLDivElement;

  // Query active tab
  let repoInfo: { owner: string; repo: string } | null = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    repoInfo = tab?.url ? extractGithubRepo(tab.url) : null;
  } catch {
    notRepoMsg.style.display = 'block';
    // Still render settings below, even on tab query failure
  }

  if (!repoInfo) {
    notRepoMsg.style.display = 'block';
  }

  // Render link rows based on current enabledMap and repoInfo
  function renderLinks(): void {
    // Note: notRepoMsg visibility is managed separately (before renderLinks is ever called).
    // This function only manages linksSection and allDisabledMsg.
    while (linksSection.firstChild) {
      linksSection.removeChild(linksSection.firstChild);
    }
    allDisabledMsg.style.display = 'none';
    linksSection.style.display = 'none';

    if (!repoInfo) return;

    const enabledProviders = PROVIDERS.filter(p => isEnabled(p.id, p.enabledByDefault));

    if (enabledProviders.length === 0) {
      allDisabledMsg.style.display = 'block';
      return;
    }

    linksSection.style.display = 'block';
    for (const provider of enabledProviders) {
      const row = document.createElement('div');
      row.className = 'provider-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'provider-name';
      nameSpan.textContent = provider.name;

      const link = document.createElement('a');
      link.className = 'open-link';
      link.href = provider.transform(repoInfo.owner, repoInfo.repo);
      link.textContent = 'Open ↗';
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await browser.tabs.create({ url: provider.transform(repoInfo!.owner, repoInfo!.repo) });
          window.close();
        } catch {
          // tab creation failed — leave popup open
        }
      });

      row.appendChild(nameSpan);
      row.appendChild(link);
      linksSection.appendChild(row);
    }
  }

  renderLinks();

  // Render settings checkboxes (always visible)
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
      renderLinks();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(provider.name));
    settingsSection.appendChild(label);
  }
}

main().catch(() => {
  const notRepoMsg = document.getElementById('not-repo-msg') as HTMLParagraphElement;
  if (notRepoMsg) notRepoMsg.style.display = 'block';
});
