import { PROVIDERS, extractGithubRepo } from '../utils/providers';

export default defineContentScript({
  matches: ['https://github.com/*/*'],

  async main(ctx) {
    const BUTTON_ATTR = 'data-repowiki-btn';

    // Load enabled state from storage, fall back to defaults on failure
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

    function injectStyles(): void {
      if (document.getElementById('repowiki-styles')) return;
      const style = document.createElement('style');
      style.id = 'repowiki-styles';
      style.textContent = `
        .repowiki-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          z-index: 1000;
          background: #fff;
          border: 1px solid #d0d7de;
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(140,149,159,.2);
          min-width: 120px;
          padding: 4px 0;
          margin: 0;
          list-style: none;
        }
        .repowiki-dropdown a {
          display: block;
          padding: 6px 12px;
          color: #24292f;
          text-decoration: none;
          font-size: 13px;
          white-space: nowrap;
        }
        .repowiki-dropdown a:hover {
          background: #f6f8fa;
        }
        .repowiki-wrapper {
          position: relative;
          display: inline-flex;
        }
      `;
      document.head.appendChild(style);
    }

    let activeDropdown: HTMLUListElement | null = null;

    function injectButton(): void {
      if (document.querySelector(`[${BUTTON_ATTR}]`)) return;

      const repoInfo = extractGithubRepo(location.href);
      if (!repoInfo) return;

      const actionsContainer = document.querySelector('.pagehead-actions');
      if (!actionsContainer) return;

      const enabledProviders = PROVIDERS.filter(p => isEnabled(p.id, p.enabledByDefault));
      if (enabledProviders.length === 0) return;

      injectStyles();

      const li = document.createElement('li');
      li.setAttribute(BUTTON_ATTR, '1');

      const wrapper = document.createElement('div');
      wrapper.className = 'repowiki-wrapper';

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Wiki ▾';
      button.className = 'btn btn-sm';
      button.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';

      const dropdown = document.createElement('ul');
      dropdown.className = 'repowiki-dropdown';
      dropdown.style.display = 'none';
      activeDropdown = dropdown;

      for (const provider of enabledProviders) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = provider.transform(repoInfo.owner, repoInfo.repo);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = provider.name;
        link.addEventListener('click', () => {
          dropdown.style.display = 'none';
        });
        item.appendChild(link);
        dropdown.appendChild(item);
      }

      button.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
      });

      wrapper.appendChild(button);
      wrapper.appendChild(dropdown);
      li.appendChild(wrapper);
      actionsContainer.insertBefore(li, actionsContainer.firstChild);
    }

    const closeDropdown = () => { if (activeDropdown) activeDropdown.style.display = 'none'; };
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
    ctx.onInvalidated(() => {
      history.pushState = origPushState;
      activeObserver.disconnect();
      document.removeEventListener('click', closeDropdown);
      document.getElementById('repowiki-styles')?.remove();
    });
  },
});
