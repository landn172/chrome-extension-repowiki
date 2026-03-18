(function () {
  const BUTTON_ATTR = 'data-deepwiki-btn';
  const GITHUB_REPO_RE = /^https:\/\/github\.com\/([^\/]+\/[^\/]+)/;

  function getDeepWikiUrl(githubUrl) {
    const match = githubUrl.match(GITHUB_REPO_RE);
    if (!match) return null;
    return `https://deepwiki.com/${match[1]}`;
  }

  function injectButton() {
    // Skip if already injected (DOM-based guard, survives SPA navigation correctly)
    if (document.querySelector(`[${BUTTON_ATTR}]`)) return;

    const deepWikiUrl = getDeepWikiUrl(location.href);
    if (!deepWikiUrl) return;

    // Find GitHub's repo action button group (Watch/Fork/Star area)
    const actionsContainer = document.querySelector('.pagehead-actions');
    if (!actionsContainer) return;

    // Build a <li> wrapper to match GitHub's list structure
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = deepWikiUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'DeepWiki';
    a.setAttribute(BUTTON_ATTR, '1');
    // Match GitHub's button styling
    a.className = 'btn btn-sm';
    a.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';

    li.appendChild(a);
    // Insert as the first item in the actions list
    actionsContainer.insertBefore(li, actionsContainer.firstChild);
  }

  function observeAndInject() {
    injectButton();

    // Watch for DOM changes in case the header re-renders
    const observer = new MutationObserver(() => {
      if (!document.querySelector(`[${BUTTON_ATTR}]`)) {
        injectButton();
      }
    });

    // Observe the header area only — not document.body (too noisy)
    const header = document.querySelector('header') || document.body;
    observer.observe(header, { childList: true, subtree: true });

    return observer;
  }

  // Handle GitHub SPA navigation by patching pushState and listening to popstate
  let currentUrl = location.href;
  let activeObserver = observeAndInject();

  function onUrlChange() {
    if (location.href === currentUrl) return;
    currentUrl = location.href;

    // Disconnect old observer, re-run on new page
    if (activeObserver) activeObserver.disconnect();
    activeObserver = observeAndInject();
  }

  // Patch pushState to detect SPA navigations
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    onUrlChange();
  };

  window.addEventListener('popstate', onUrlChange);
})();
