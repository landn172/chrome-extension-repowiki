import { PROVIDERS, extractGithubRepo, mergeCustomProviders, type WikiProvider, type CustomProvider } from '../../utils/providers';

const defaultPinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;

async function loadCustomProviders(): Promise<CustomProvider[]> {
  try {
    const result = await browser.storage.sync.get('customProviders');
    const stored = result.customProviders;
    if (Array.isArray(stored)) return stored as CustomProvider[];
  } catch { /* ignore */ }
  return [];
}

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

  const customProviders: CustomProvider[] = await loadCustomProviders();
  let allProviders: WikiProvider[] = mergeCustomProviders(customProviders);

  function isEnabled(id: string): boolean {
    const provider = allProviders.find(p => p.id === id);
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

    const provider = allProviders.find(p => p.id === id);
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

  function renderProviderList(): void {
    // Clear existing rows (keep label)
    while (section.children.length > 1) {
      section.removeChild(section.lastChild!);
    }

    for (const provider of allProviders) {
      const row = document.createElement('div');
      row.className = 'provider-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'p-name';
      nameSpan.textContent = provider.name;

      // Delete button for custom providers only
      const isCustom = !PROVIDERS.some(p => p.id === provider.id);
      if (isCustom) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '\u00d7';
        deleteBtn.addEventListener('click', async () => {
          const updated = customProviders.filter(cp => cp.id !== provider.id);
          try {
            await browser.storage.sync.set({ customProviders: updated });
            customProviders.length = 0;
            customProviders.push(...updated);
            allProviders = mergeCustomProviders(customProviders);
            renderProviderList();
            renderPinnedBtn(repoInfo, pinnedId);
          } catch { /* ignore */ }
        });
        row.appendChild(nameSpan);
        row.appendChild(deleteBtn);
      } else {
        row.appendChild(nameSpan);
      }

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
          toggle.classList.toggle('on', !newValue);
        }
        renderPinnedBtn(repoInfo, pinnedId);
      });

      row.appendChild(toggle);
      section.appendChild(row);
    }

    // Add the "+" row and form
    renderAddRow();
  }

  function renderAddRow(): void {
    // Remove existing add row/form if any
    section.querySelector('.add-row')?.remove();
    section.querySelector('.add-form')?.remove();

    const addRow = document.createElement('div');
    addRow.className = 'add-row';

    const addIcon = document.createElement('span');
    addIcon.className = 'add-icon';
    addIcon.textContent = '+';
    const addText = document.createElement('span');
    addText.className = 'add-text';
    addText.textContent = 'Add custom provider';
    addRow.appendChild(addIcon);
    addRow.appendChild(addText);

    const form = document.createElement('div');
    form.className = 'add-form';
    form.style.display = 'none';

    addRow.addEventListener('click', () => {
      addRow.style.display = 'none';
      form.style.display = 'block';
      nameInput.focus();
    });

    const label = document.createElement('div');
    label.className = 'add-form-label';
    label.textContent = 'Add Custom Provider';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name (e.g. My Wiki)';
    nameInput.maxLength = 40;

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://wiki.com/{owner}/{repo}';
    urlInput.className = 'mono';

    const errorEl = document.createElement('div');
    errorEl.className = 'add-form-error';

    const actions = document.createElement('div');
    actions.className = 'add-form-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      form.style.display = 'none';
      addRow.style.display = '';
      nameInput.value = '';
      urlInput.value = '';
      errorEl.style.display = 'none';
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();

      // Validate
      if (!name) {
        errorEl.textContent = 'Name is required';
        errorEl.style.display = 'block';
        return;
      }
      if (name.length > 40) {
        errorEl.textContent = 'Name must be 40 characters or less';
        errorEl.style.display = 'block';
        return;
      }
      if (!/^https?:\/\//.test(url)) {
        errorEl.textContent = 'URL must start with https:// or http://';
        errorEl.style.display = 'block';
        return;
      }
      if (!url.includes('{owner}') || !url.includes('{repo}')) {
        errorEl.textContent = 'URL must contain {owner} and {repo}';
        errorEl.style.display = 'block';
        return;
      }

      const newProvider: CustomProvider = {
        id: crypto.randomUUID(),
        name,
        urlTemplate: url,
      };

      const updated = [...customProviders, newProvider];
      try {
        await browser.storage.sync.set({ customProviders: updated });
        customProviders.push(newProvider);
        allProviders = mergeCustomProviders(customProviders);
        nameInput.value = '';
        urlInput.value = '';
        errorEl.style.display = 'none';
        form.style.display = 'none';
        addRow.style.display = '';
        renderProviderList();
        renderPinnedBtn(repoInfo, pinnedId);
      } catch {
        errorEl.textContent = 'Failed to save';
        errorEl.style.display = 'block';
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(addBtn);
    form.appendChild(label);
    form.appendChild(nameInput);
    form.appendChild(urlInput);
    form.appendChild(errorEl);
    form.appendChild(actions);

    section.appendChild(addRow);
    section.appendChild(form);
  }

  renderProviderList();
}

main().catch(renderDimmedPinnedBtn);
