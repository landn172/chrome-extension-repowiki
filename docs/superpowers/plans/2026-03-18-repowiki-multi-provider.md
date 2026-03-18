# RepoWiki Multi-Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the extension to "RepoWiki" and replace the single DeepWiki button with a multi-provider "Wiki ▾" dropdown backed by a provider registry.

**Architecture:** Delete `utils/deepwiki.ts` and replace it with `utils/providers.ts` (provider registry + GitHub URL parser). The content script reads enabled providers from `browser.storage.sync` and injects a dropdown. The popup shows per-provider open links and toggle checkboxes.

**Tech Stack:** WXT 0.20.20, TypeScript 5.9.3, `browser.storage.sync`, vanilla DOM — no test framework (verify via `npm run build`).

---

### Task 1: Provider registry (`utils/providers.ts`)

**Files:**
- Create: `utils/providers.ts`

> Note: `utils/deepwiki.ts` is deleted in Task 3 (same commit that updates all its importers), to keep every commit buildable.

- [ ] **Step 1: Create `utils/providers.ts`**

```typescript
export interface WikiProvider {
  id: string;
  name: string;
  transform: (owner: string, repo: string) => string;
  enabledByDefault: boolean;
}

export const PROVIDERS: WikiProvider[] = [
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    transform: (owner, repo) => `https://deepwiki.com/${owner}/${repo}`,
    enabledByDefault: true,
  },
  {
    id: 'codewiki',
    name: 'CodeWiki',
    transform: (owner, repo) => `https://codewiki.google/github.com/${owner}/${repo}`,
    enabledByDefault: false,
  },
  {
    id: 'zread',
    name: 'Zread',
    transform: (owner, repo) => `https://zread.ai/${owner}/${repo}`,
    enabledByDefault: false,
  },
  {
    id: 'readmex',
    name: 'Readmex',
    transform: (owner, repo) => {
      const prefix = navigator.language.startsWith('zh') ? '' : 'en-US/';
      return `https://readmex.com/${prefix}${owner}/${repo}`;
    },
    enabledByDefault: false,
  },
];

/**
 * Extracts owner and repo from a GitHub URL.
 * Returns null for non-repo GitHub URLs or non-GitHub URLs.
 * Sub-paths, query strings, and hash fragments are ignored —
 * `[^/?#]+` stops at `/`, `?`, and `#` so no extra sanitization needed.
 *
 * @example
 * extractGithubRepo('https://github.com/facebook/react/issues/42?q=bug')
 * // → { owner: 'facebook', repo: 'react' }
 */
export function extractGithubRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
```

- [ ] **Step 2: Commit**

```bash
git add utils/providers.ts
git commit -m "feat: add provider registry (utils/providers.ts)"
```

---

### Task 2: Update `wxt.config.ts`

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: Update manifest**

Replace the entire file content:

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'RepoWiki',
    description: 'Open any GitHub repo in DeepWiki, CodeWiki, and more',
    permissions: ['activeTab', 'storage'],
    action: {
      default_title: 'RepoWiki',
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add wxt.config.ts
git commit -m "feat: rename extension to RepoWiki, add storage permission"
```

---

### Task 3: Refactor `entrypoints/content.ts` + delete `utils/deepwiki.ts`

**Files:**
- Modify: `entrypoints/content.ts`
- Delete: `utils/deepwiki.ts`

**Behavior:**
1. Reads `enabledProviders` from `browser.storage.sync` (falls back to `enabledByDefault` on failure)
2. Filters `PROVIDERS` to only enabled ones
3. If no providers enabled, skips injection silently
4. Injects `<li data-repowiki-btn>` as first child of `.pagehead-actions`
5. Inside the `<li>`: a "Wiki ▾" `<button>` + a hidden `<ul>` dropdown
6. Button click: toggle dropdown
7. Dropdown items: one `<a>` per enabled provider, opens URL in new tab, closes dropdown
8. Click outside: close dropdown
9. Duplicate guard: `[data-repowiki-btn]` on the `<li>`
10. Injects a `<style>` tag into `document.head` once (checked by `document.getElementById('repowiki-styles')`)

- [ ] **Step 1: Replace `entrypoints/content.ts`**

```typescript
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
      button.textContent = 'Wiki ▾';
      button.className = 'btn btn-sm';
      button.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';

      const dropdown = document.createElement('ul');
      dropdown.className = 'repowiki-dropdown';
      dropdown.style.display = 'none';

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

      document.addEventListener('click', () => {
        dropdown.style.display = 'none';
      });

      wrapper.appendChild(button);
      wrapper.appendChild(dropdown);
      li.appendChild(wrapper);
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

    ctx.addEventListener(window, 'popstate', onUrlChange);
    ctx.onInvalidated(() => {
      history.pushState = origPushState;
      activeObserver.disconnect();
    });
  },
});
```

- [ ] **Step 2: Delete `utils/deepwiki.ts`**

```bash
git rm utils/deepwiki.ts
```

- [ ] **Step 3: Build to verify TypeScript**

Run: `npm run build`
Expected: No errors in `entrypoints/content.ts`. (popup/main.ts still imports from deepwiki — may still fail until Task 4 is done.)

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat: inject Wiki dropdown button with multi-provider support, remove deepwiki.ts"
```

---

### Task 4: Refactor popup (`entrypoints/popup/index.html` + `main.ts`)

**Files:**
- Modify: `entrypoints/popup/index.html`
- Modify: `entrypoints/popup/main.ts`

**Behavior:**
- `index.html`: title → "RepoWiki", replace single-button layout with links section + settings section
- `main.ts`: load storage, query active tab, show per-provider links or status messages, render checkboxes

- [ ] **Step 1: Replace `entrypoints/popup/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RepoWiki</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      width: 300px;
      padding: 16px;
      margin: 0;
    }
    h2 {
      font-size: 15px;
      margin: 0 0 12px;
      color: #24292f;
    }
    h3 {
      font-size: 13px;
      margin: 0 0 8px;
      color: #24292f;
    }
    #not-repo-msg,
    #all-disabled-msg {
      font-size: 12px;
      color: #57606a;
      display: none;
    }
    .provider-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .provider-name {
      font-size: 13px;
      color: #24292f;
    }
    .open-link {
      font-size: 12px;
      color: #0969da;
      text-decoration: none;
    }
    .open-link:hover {
      text-decoration: underline;
    }
    hr {
      border: none;
      border-top: 1px solid #d0d7de;
      margin: 12px 0;
    }
    #settings-section label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #24292f;
      margin-bottom: 6px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h2>RepoWiki</h2>

  <div id="links-section"></div>
  <p id="not-repo-msg">Not a GitHub repo page.</p>
  <p id="all-disabled-msg">No providers enabled.</p>

  <hr>

  <div id="settings-section">
    <h3>Settings</h3>
  </div>

  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `entrypoints/popup/main.ts`**

```typescript
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
```

- [ ] **Step 3: Full build verification**

Run: `npm run build`
Expected: Build succeeds with zero TypeScript errors. Output in `.output/chrome-mv3/`.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup/index.html entrypoints/popup/main.ts
git commit -m "feat: refactor popup for multi-provider links and settings"
```

---

### Task 5: Manual smoke test + final check

**Files:** None (verification only)

- [ ] **Step 1: Load unpacked extension**

In Chrome: `chrome://extensions` → "Load unpacked" → select `.output/chrome-mv3/`

- [ ] **Step 2: Verify popup on a GitHub repo page**

Navigate to any public GitHub repo (e.g. `github.com/facebook/react`).
- Open the extension popup
- Expect: "DeepWiki" row with "Open ↗" link pointing to `https://deepwiki.com/facebook/react`
- Expect: Settings section with 4 checkboxes (DeepWiki checked, others unchecked)

- [ ] **Step 3: Verify content script dropdown**

On the same GitHub repo page:
- Expect: "Wiki ▾" button in the `.pagehead-actions` area
- Click it → dropdown with "DeepWiki" link appears
- Click link → opens `https://deepwiki.com/facebook/react` in new tab, dropdown closes
- Click elsewhere → dropdown closes

- [ ] **Step 4: Verify provider toggle**

In the popup, enable "CodeWiki" checkbox.
Reload the GitHub repo page.
- Expect: "Wiki ▾" dropdown now has both "DeepWiki" and "CodeWiki" entries

- [ ] **Step 5: Verify non-repo page behavior**

Open the popup on a non-GitHub page or `github.com` homepage.
- Expect: "Not a GitHub repo page." message shown, links section hidden

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore: post-smoke-test cleanup"
```
