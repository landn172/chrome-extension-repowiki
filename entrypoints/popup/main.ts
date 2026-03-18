import { PROVIDERS, extractGithubRepo } from '../../utils/providers';

const defaultPinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;

function renderDimmedPinnedBtn(): void {
  const container = document.getElementById('pinned-btn') as HTMLDivElement | null;
  if (!container) return;

  const provider = PROVIDERS.find(p => p.id === defaultPinnedId);

  const inner = document.createElement('div');
  inner.style.flex = '1';

  const nameEl = document.createElement('div');
  nameEl.className = 'pinned-name';
  nameEl.textContent = provider?.name ?? '';

  const subEl = document.createElement('div');
  subEl.className = 'pinned-sub';
  subEl.textContent = 'Open a GitHub repo to use';

  inner.appendChild(nameEl);
  inner.appendChild(subEl);

  const icon = document.createElement('span');
  icon.className = 'open-icon';
  icon.textContent = '↗';

  container.replaceChildren(inner, icon);
  container.style.opacity = '0.3';
  container.style.pointerEvents = 'none';
}

async function main(): Promise<void> {
  let enabledMap: Record<string, boolean> = {};
  let pinnedId: string = defaultPinnedId;

  try {
    const result = await browser.storage.sync.get(['enabledProviders', 'pinnedProvider']);
    const stored = result.enabledProviders;
    if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
      enabledMap = stored as Record<string, boolean>;
    }
    if (typeof result.pinnedProvider === 'string') {
      pinnedId = result.pinnedProvider;
    }
  } catch {
    // Fall back to defaults
  }

  function isEnabled(id: string): boolean {
    const provider = PROVIDERS.find(p => p.id === id);
    return id in enabledMap ? enabledMap[id] : (provider?.enabledByDefault ?? false);
  }

  // Query active tab
  let repoInfo: { owner: string; repo: string } | null = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    repoInfo = tab?.url ? extractGithubRepo(tab.url) : null;
  } catch {
    // repoInfo stays null
  }

  // Render repo chip
  const repoChip = document.getElementById('repo-chip') as HTMLSpanElement;
  if (repoInfo) {
    repoChip.textContent = `${repoInfo.owner}/${repoInfo.repo}`;
    repoChip.style.display = 'inline';
  }

  function renderPinnedBtn(
    info: { owner: string; repo: string } | null,
    id: string
  ): void {
    const container = document.getElementById('pinned-btn') as HTMLDivElement;

    // Reset inline styles from previous render
    container.style.opacity = '';
    container.style.pointerEvents = '';
    // Remove all previous click listeners by replacing the node with a clone
    const fresh = container.cloneNode(false) as HTMLDivElement;
    container.parentNode!.replaceChild(fresh, container);

    const provider = PROVIDERS.find(p => p.id === id);
    const isActive = !!info && !!provider && isEnabled(id);

    const inner = document.createElement('div');
    inner.style.flex = '1';

    const nameEl = document.createElement('div');
    nameEl.className = 'pinned-name';
    nameEl.textContent = provider?.name ?? '';

    const subEl = document.createElement('div');
    subEl.className = 'pinned-sub';
    if (!info) {
      subEl.textContent = 'Open a GitHub repo to use';
    } else if (!isEnabled(id)) {
      subEl.textContent = 'Pinned provider is disabled';
    } else {
      subEl.textContent = 'Pinned · tap to open';
    }

    inner.appendChild(nameEl);
    inner.appendChild(subEl);

    const icon = document.createElement('span');
    icon.className = 'open-icon';
    icon.textContent = '↗';

    fresh.appendChild(inner);
    fresh.appendChild(icon);

    if (isActive && info && provider) {
      const url = provider.transform(info.owner, info.repo);
      fresh.addEventListener('click', async () => {
        try {
          await browser.tabs.create({ url });
          window.close();
        } catch {
          // stay open on failure
        }
      });
    } else {
      fresh.style.opacity = '0.3';
      fresh.style.pointerEvents = 'none';
    }
  }

  renderPinnedBtn(repoInfo, pinnedId);

  // Render providers section
  const section = document.getElementById('providers-section') as HTMLDivElement;

  const labelEl = document.createElement('div');
  labelEl.className = 'section-label';
  labelEl.textContent = 'Providers';
  section.appendChild(labelEl);

  for (const provider of PROVIDERS) {
    const row = document.createElement('div');
    row.className = 'provider-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'p-name';
    nameSpan.textContent = provider.name;

    const toggle = document.createElement('div');
    toggle.className = 'toggle' + (isEnabled(provider.id) ? ' on' : '');
    toggle.addEventListener('click', async () => {
      const newValue = !isEnabled(provider.id);
      try {
        await browser.storage.sync.set({
          enabledProviders: { ...enabledMap, [provider.id]: newValue },
        });
        enabledMap[provider.id] = newValue;
        toggle.classList.toggle('on', newValue);
      } catch {
        // Write failed — revert toggle visual (enabledMap unchanged)
        toggle.classList.toggle('on', !newValue);
      }
      renderPinnedBtn(repoInfo, pinnedId);
    });

    row.appendChild(nameSpan);
    row.appendChild(toggle);
    section.appendChild(row);
  }
}

main().catch(renderDimmedPinnedBtn);
