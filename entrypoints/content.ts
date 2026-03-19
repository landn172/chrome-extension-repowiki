import { PROVIDERS, extractGithubRepo, mergeCustomProviders, type WikiProvider, type CustomProvider } from '../utils/providers';

export default defineContentScript({
  matches: ['https://github.com/*/*'],

  async main(ctx) {
    const BUTTON_ATTR = 'data-repowiki-btn';

    // Load enabledProviders and pinnedProvider in a single call
    let enabledMap: Record<string, boolean> = {};
    let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
    let customList: CustomProvider[] = [];
    try {
      const result = await browser.storage.sync.get(['enabledProviders', 'pinnedProvider', 'customProviders']);
      const stored = result.enabledProviders;
      if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
        enabledMap = stored as Record<string, boolean>;
      }
      if (typeof result.pinnedProvider === 'string') {
        pinnedId = result.pinnedProvider;
      }
      if (Array.isArray(result.customProviders)) {
        customList = result.customProviders as CustomProvider[];
      }
    } catch {
      // Fall back to defaults
    }

    let allProviders: WikiProvider[] = mergeCustomProviders(customList);

    function isEnabled(id: string, defaultVal: boolean): boolean {
      return id in enabledMap ? enabledMap[id] : defaultVal;
    }

    function injectStyles(): void {
      if (document.getElementById('repowiki-styles')) return;
      const style = document.createElement('style');
      style.id = 'repowiki-styles';
      style.textContent = `
        /* Light mode tokens */
        :root {
          --rw-btn-bg: #f6f8fa;
          --rw-btn-hover: #e8ecf0;
          --rw-btn-text: #24292f;
          --rw-btn-border: rgba(31,35,40,.15);
          --rw-dropdown-bg: #fff;
          --rw-dropdown-border: #d0d7de;
          --rw-dropdown-shadow: rgba(140,149,159,.2);
          --rw-item-hover: #f6f8fa;
          --rw-item-text: #24292f;
          --rw-pin-color: #9ca3af;
          --rw-pin-hover-bg: #f0f2f5;
          --rw-pin-hover-text: #374151;
          --rw-pin-hover-border: #e2e8f0;
          --rw-pin-active-text: #24292f;
          --rw-pin-active-bg: #f1f5f9;
          --rw-pin-active-border: #e2e8f0;
        }
        /* Dark mode tokens — OS preference */
        @media (prefers-color-scheme: dark) {
          :root {
            --rw-btn-bg: #21262d;
            --rw-btn-hover: #30363d;
            --rw-btn-text: #c9d1d9;
            --rw-btn-border: rgba(240,246,252,.1);
            --rw-dropdown-bg: #161b22;
            --rw-dropdown-border: #30363d;
            --rw-dropdown-shadow: rgba(1,4,9,.4);
            --rw-item-hover: #21262d;
            --rw-item-text: #c9d1d9;
            --rw-pin-color: #6e7681;
            --rw-pin-hover-bg: #30363d;
            --rw-pin-hover-text: #c9d1d9;
            --rw-pin-hover-border: #6e7681;
            --rw-pin-active-text: #c9d1d9;
            --rw-pin-active-bg: #30363d;
            --rw-pin-active-border: #6e7681;
          }
        }
        /* Dark mode tokens — GitHub explicit dark (overrides OS preference) */
        html[data-color-mode="dark"] {
          --rw-btn-bg: #21262d;
          --rw-btn-hover: #30363d;
          --rw-btn-text: #c9d1d9;
          --rw-btn-border: rgba(240,246,252,.1);
          --rw-dropdown-bg: #161b22;
          --rw-dropdown-border: #30363d;
          --rw-dropdown-shadow: rgba(1,4,9,.4);
          --rw-item-hover: #21262d;
          --rw-item-text: #c9d1d9;
          --rw-pin-color: #6e7681;
          --rw-pin-hover-bg: #30363d;
          --rw-pin-hover-text: #c9d1d9;
          --rw-pin-hover-border: #6e7681;
          --rw-pin-active-text: #c9d1d9;
          --rw-pin-active-bg: #30363d;
          --rw-pin-active-border: #6e7681;
        }
        @property --rw-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes rw-rainbow-spin {
          to { --rw-angle: 360deg; }
        }
        .repowiki-group {
          display: inline-flex;
          position: relative;
          z-index: 0;
          border: 1px solid var(--rw-btn-border);
          border-radius: 6px;
          overflow: visible;
          transition: border-color 0.2s;
        }
        .repowiki-group::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: 7px;
          background: conic-gradient(
            from var(--rw-angle),
            #6366f1, #a855f7, #ec4899, #f97316, #eab308, #22c55e, #06b6d4, #6366f1
          );
          z-index: -1;
          opacity: 0;
          transition: opacity 0.25s ease;
          animation: rw-rainbow-spin 4s linear infinite;
        }
        .repowiki-group:hover::before { opacity: 1; }
        .repowiki-group:hover { border-color: transparent; }
        .repowiki-primary {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px;
          background: var(--rw-btn-bg);
          border: none; border-right: 1px solid var(--rw-btn-border);
          border-radius: 5px 0 0 5px;
          font-size: 12px; color: var(--rw-btn-text); cursor: pointer;
          font-family: inherit; white-space: nowrap; line-height: 20px;
        }
        .repowiki-primary:hover { background: var(--rw-btn-hover); }
        .repowiki-chevron {
          display: inline-flex; align-items: center;
          padding: 3px 4px;
          background: var(--rw-btn-bg);
          border: none; border-radius: 0 5px 5px 0;
          color: var(--rw-btn-text); cursor: pointer; line-height: 20px;
        }
        .repowiki-chevron:hover { background: var(--rw-btn-hover); }
        .repowiki-chevron-only {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px;
          background: var(--rw-btn-bg);
          border: none; border-radius: 5px;
          font-size: 12px; color: var(--rw-btn-text); cursor: pointer;
          font-family: inherit; line-height: 20px;
        }
        .repowiki-chevron-only:hover { background: var(--rw-btn-hover); }
        .repowiki-dropdown {
          position: absolute;
          top: calc(100% + 4px); left: 0;
          z-index: 1000;
          background: var(--rw-dropdown-bg);
          border: 1px solid var(--rw-dropdown-border);
          border-radius: 6px;
          box-shadow: 0 8px 24px var(--rw-dropdown-shadow);
          min-width: 160px; padding: 4px 0;
          margin: 0; list-style: none;
        }
        .repowiki-dropdown-item {
          display: flex; align-items: center;
          padding: 6px 12px; gap: 8px;
        }
        .repowiki-dropdown-item:hover { background: var(--rw-item-hover); }
        .repowiki-item-name {
          font-size: 13px; color: var(--rw-item-text); flex: 1;
          white-space: nowrap; cursor: pointer;
        }
        .repowiki-pin-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px;
          border-radius: 4px; border: 1px solid transparent;
          background: transparent; cursor: pointer;
          color: var(--rw-pin-color); padding: 0; flex-shrink: 0;
        }
        .repowiki-pin-btn:hover {
          background: var(--rw-pin-hover-bg);
          color: var(--rw-pin-hover-text);
          border-color: var(--rw-pin-hover-border);
        }
        .repowiki-pin-btn.active {
          color: var(--rw-pin-active-text);
          background: var(--rw-pin-active-bg);
          border-color: var(--rw-pin-active-border);
        }
      `;
      document.head.appendChild(style);
    }

    function createChevronSvg(): SVGSVGElement {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'currentColor');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z'
      );
      svg.appendChild(path);
      return svg;
    }

    function createPinSvg(): SVGSVGElement {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '12');
      svg.setAttribute('height', '12');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'currentColor');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M17 4v7l2 3H5l2-3V4h10zm-5 16c-1.1 0-2-.9-2-2h4a2 2 0 01-2 2zM7 2h10v2H7V2z'
      );
      svg.appendChild(path);
      return svg;
    }

    function buildDropdown(
      providers: readonly WikiProvider[],
      repoInfo: { owner: string; repo: string }
    ): HTMLUListElement {
      const dropdown = document.createElement('ul');
      dropdown.className = 'repowiki-dropdown';
      dropdown.style.display = 'none';

      for (const provider of providers) {
        const item = document.createElement('li');
        item.className = 'repowiki-dropdown-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'repowiki-item-name';
        nameSpan.textContent = provider.name;
        nameSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(
            provider.transform(repoInfo.owner, repoInfo.repo),
            '_blank',
            'noopener,noreferrer'
          );
          dropdown.style.display = 'none';
        });

        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'repowiki-pin-btn' + (provider.id === pinnedId ? ' active' : '');
        pinBtn.appendChild(createPinSvg());
        pinBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (provider.id === pinnedId) return;
          try {
            await browser.storage.sync.set({ pinnedProvider: provider.id });
            pinnedId = provider.id;
            reInjectButton();
          } catch {
            // no revert
          }
        });

        item.appendChild(nameSpan);
        item.appendChild(pinBtn);
        dropdown.appendChild(item);
      }

      return dropdown;
    }

    function reInjectButton(): void {
      document.querySelector(`[${BUTTON_ATTR}]`)?.remove();
      injectButton();
    }

    function injectButton(): void {
      if (document.querySelector(`[${BUTTON_ATTR}]`)) return;

      const repoInfo = extractGithubRepo(location.href);
      if (!repoInfo) return;

      const actionsContainer = document.querySelector('.pagehead-actions');
      if (!actionsContainer) return;

      const enabledProviders = allProviders.filter(p => isEnabled(p.id, p.enabledByDefault));
      if (enabledProviders.length === 0) return; // Case D

      injectStyles();

      const pinnedProvider = allProviders.find(p => p.id === pinnedId);
      const pinnedIsEnabled = pinnedProvider
        ? isEnabled(pinnedProvider.id, pinnedProvider.enabledByDefault)
        : false;
      const othersExist = enabledProviders.some(p => p.id !== pinnedId);

      const li = document.createElement('li');
      li.setAttribute(BUTTON_ATTR, '1');

      const group = document.createElement('div');
      group.className = 'repowiki-group';

      if (pinnedIsEnabled && othersExist) {
        // Case A: split button
        const primaryBtn = document.createElement('button');
        primaryBtn.type = 'button';
        primaryBtn.className = 'repowiki-primary';
        primaryBtn.textContent = `${pinnedProvider!.name} ↗`;
        primaryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(
            pinnedProvider!.transform(repoInfo.owner, repoInfo.repo),
            '_blank',
            'noopener,noreferrer'
          );
        });

        const chevronBtn = document.createElement('button');
        chevronBtn.type = 'button';
        chevronBtn.className = 'repowiki-chevron';
        chevronBtn.appendChild(createChevronSvg());

        const dropdown = buildDropdown(enabledProviders, repoInfo);
        chevronBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        group.appendChild(primaryBtn);
        group.appendChild(chevronBtn);
        group.appendChild(dropdown);
      } else if (pinnedIsEnabled && !othersExist) {
        // Case B: primary only — override border-right/radius since no chevron follows
        const primaryBtn = document.createElement('button');
        primaryBtn.type = 'button';
        primaryBtn.className = 'repowiki-primary';
        primaryBtn.style.borderRight = 'none';
        primaryBtn.style.borderRadius = '5px';
        primaryBtn.textContent = `${pinnedProvider!.name} ↗`;
        primaryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(
            pinnedProvider!.transform(repoInfo.owner, repoInfo.repo),
            '_blank',
            'noopener,noreferrer'
          );
        });

        group.appendChild(primaryBtn);
      } else {
        // Case C: chevron-only (pinned is disabled, others exist)
        const chevronOnlyBtn = document.createElement('button');
        chevronOnlyBtn.type = 'button';
        chevronOnlyBtn.className = 'repowiki-chevron-only';
        chevronOnlyBtn.appendChild(document.createTextNode('Wiki\u00a0'));
        chevronOnlyBtn.appendChild(createChevronSvg());

        const dropdown = buildDropdown(enabledProviders, repoInfo);
        chevronOnlyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        group.appendChild(chevronOnlyBtn);
        group.appendChild(dropdown);
      }

      li.appendChild(group);
      actionsContainer.insertBefore(li, actionsContainer.firstChild);
    }

    const closeDropdown = () => {
      document.querySelector<HTMLUListElement>(`[${BUTTON_ATTR}] .repowiki-dropdown`)
        ?.style.setProperty('display', 'none');
    };
    document.addEventListener('click', closeDropdown);

    function observeAndInject(): MutationObserver {
      injectButton();

      const header = document.querySelector('header') ?? document.body;
      let observer: MutationObserver;
      observer = new MutationObserver(() => {
        if (!document.querySelector(`[${BUTTON_ATTR}]`)) {
          observer.disconnect();
          try {
            injectButton();
          } finally {
            observer.observe(header, { childList: true, subtree: true });
          }
        }
      });

      observer.observe(header, { childList: true, subtree: true });
      return observer;
    }

    let currentUrl = location.href;
    let activeObserver = observeAndInject();

    function onUrlChange(): void {
      if (location.href === currentUrl) return;
      currentUrl = location.href;
      activeObserver.disconnect();
      activeObserver = observeAndInject();
    }

    const origPushState = history.pushState.bind(history);
    history.pushState = function (
      ...args: Parameters<typeof history.pushState>
    ): void {
      origPushState(...args);
      onUrlChange();
    };

    ctx.addEventListener(window, 'popstate', onUrlChange);

    // Live sync: re-inject when popup changes enabledProviders or pinnedProvider
    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown }>,
      area: string
    ) => {
      if (area !== 'sync') return;
      if ('enabledProviders' in changes) {
        const v = changes.enabledProviders.newValue;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          enabledMap = v as Record<string, boolean>;
        }
      }
      if ('pinnedProvider' in changes) {
        const v = changes.pinnedProvider.newValue;
        if (typeof v === 'string') pinnedId = v;
      }
      if ('customProviders' in changes) {
        const v = changes.customProviders.newValue;
        if (Array.isArray(v)) {
          customList = v as CustomProvider[];
        } else {
          customList = [];
        }
        allProviders = mergeCustomProviders(customList);
      }
      reInjectButton();
    };
    browser.storage.onChanged.addListener(onStorageChanged);

    ctx.onInvalidated(() => {
      history.pushState = origPushState;
      activeObserver.disconnect();
      document.removeEventListener('click', closeDropdown);
      browser.storage.onChanged.removeListener(onStorageChanged);
      document.getElementById('repowiki-styles')?.remove();
    });
  },
});
