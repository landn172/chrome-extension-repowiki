import { getDeepWikiUrl } from '../utils/deepwiki';

export default defineContentScript({
  matches: ['https://github.com/*/*'],

  main() {
    const BUTTON_ATTR = 'data-deepwiki-btn';

    function injectButton(): void {
      if (document.querySelector(`[${BUTTON_ATTR}]`)) return;

      const deepWikiUrl = getDeepWikiUrl(location.href);
      if (!deepWikiUrl) return;

      const actionsContainer = document.querySelector('.pagehead-actions');
      if (!actionsContainer) return;

      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = deepWikiUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'DeepWiki';
      a.setAttribute(BUTTON_ATTR, '1');
      a.className = 'btn btn-sm';
      a.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';

      li.appendChild(a);
      actionsContainer.insertBefore(li, actionsContainer.firstChild);
    }

    function observeAndInject(): MutationObserver {
      injectButton();

      const header = document.querySelector('header') ?? document.body;
      const observer = new MutationObserver(() => {
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

    window.addEventListener('popstate', onUrlChange);
  },
});
