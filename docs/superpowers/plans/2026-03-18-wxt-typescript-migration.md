# WXT + TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the existing vanilla JS Chrome extension to WXT + TypeScript, gaining type safety, hot reload, and a shared URL utility.

**Architecture:** WXT organizes entry points under `entrypoints/` and handles manifest generation from `wxt.config.ts`. A shared `utils/deepwiki.ts` replaces the duplicated URL transform function. The old flat files (`manifest.json`, `content.js`, `popup.html`, `popup.js`) are deleted and replaced by the WXT structure. Loading the extension for development uses `.output/chrome-mv3/` instead of the repo root.

**Tech Stack:** WXT, TypeScript, Vanilla TS (no UI framework), Chrome MV3.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Create | npm scripts and WXT dev dependency |
| `wxt.config.ts` | Create | Replaces `manifest.json` — WXT config + manifest fields |
| `utils/deepwiki.ts` | Create | Shared, typed `getDeepWikiUrl` utility |
| `entrypoints/content.ts` | Create | Typed content script using `defineContentScript` |
| `entrypoints/popup/index.html` | Create | Popup HTML (module script tag) |
| `entrypoints/popup/main.ts` | Create | Typed popup logic using `browser` global |
| `manifest.json` | Delete | Replaced by `wxt.config.ts` |
| `content.js` | Delete | Replaced by `entrypoints/content.ts` |
| `popup.html` | Delete | Replaced by `entrypoints/popup/index.html` |
| `popup.js` | Delete | Replaced by `entrypoints/popup/main.ts` |

---

## Task 1: WXT Project Initialization

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Delete: `manifest.json`, `content.js`, `popup.html`, `popup.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "chrome-extension-deepwiki",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip"
  },
  "devDependencies": {
    "wxt": "latest"
  }
}
```

- [ ] **Step 2: Install WXT**

```bash
cd /Users/jy/github-landn172/chrome-extension-deepwiki
npm install
```

Expected: `node_modules/` created, `package-lock.json` created.

- [ ] **Step 3: Create `wxt.config.ts`**

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'DeepWiki',
    version: '1.0.0',
    description: 'Open any GitHub repo in DeepWiki with one click',
    permissions: ['activeTab'],
    action: {
      default_title: 'Open in DeepWiki',
    },
  },
});
```

- [ ] **Step 4: Run `wxt prepare` to generate `tsconfig.json` and type declarations**

```bash
npx wxt prepare
```

Expected: `.wxt/` directory created, `tsconfig.json` generated at repo root.

- [ ] **Step 5: Delete the old flat files**

```bash
rm manifest.json content.js popup.html popup.js
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: initialize WXT project, remove old flat files"
```

---

## Task 2: Shared URL Transform Utility

**Files:**
- Create: `utils/deepwiki.ts`

With WXT's bundler, both the content script and popup can import from `utils/`. This eliminates the duplicated regex from the vanilla JS version.

- [ ] **Step 1: Create `utils/deepwiki.ts`**

```typescript
/**
 * Transforms a GitHub repo URL to its DeepWiki equivalent.
 * Always returns the repo root — sub-paths are stripped.
 *
 * @example
 * getDeepWikiUrl('https://github.com/facebook/react/issues/42')
 * // → 'https://deepwiki.com/facebook/react'
 */
export function getDeepWikiUrl(githubUrl: string): string | null {
  const match = githubUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)/);
  if (!match) return null;
  return `https://deepwiki.com/${match[1]}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add utils/deepwiki.ts
git commit -m "feat: add typed getDeepWikiUrl shared utility"
```

---

## Task 3: Content Script

**Files:**
- Create: `entrypoints/content.ts`

WXT content scripts use `defineContentScript` (available as a global — no import needed). The `browser` global (typed WebExtension API) is also available without import.

- [ ] **Step 1: Create `entrypoints/content.ts`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat: migrate content script to WXT + TypeScript"
```

---

## Task 4: Popup

**Files:**
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/main.ts`

WXT popups live in `entrypoints/popup/`. The HTML file must load the script as `<script type="module" src="./main.ts">`. The `browser` global (typed) replaces `chrome` — WXT polyfills this automatically.

- [ ] **Step 1: Create `entrypoints/popup/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DeepWiki</title>
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
    #url-display {
      font-size: 12px;
      color: #57606a;
      word-break: break-all;
      margin-bottom: 12px;
      min-height: 16px;
    }
    #open-btn {
      display: block;
      width: 100%;
      padding: 8px;
      background: #0969da;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      text-align: center;
    }
    #open-btn:disabled {
      background: #8c959f;
      cursor: not-allowed;
    }
    #not-repo-msg {
      font-size: 12px;
      color: #57606a;
      display: none;
    }
  </style>
</head>
<body>
  <h2>DeepWiki</h2>
  <div id="url-display" aria-live="polite"></div>
  <p id="not-repo-msg">Not a GitHub repo page.</p>
  <button id="open-btn" disabled>Open in DeepWiki</button>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create `entrypoints/popup/main.ts`**

```typescript
import { getDeepWikiUrl } from '../../utils/deepwiki';

const urlDisplay = document.getElementById('url-display') as HTMLDivElement;
const openBtn = document.getElementById('open-btn') as HTMLButtonElement;
const notRepoMsg = document.getElementById('not-repo-msg') as HTMLParagraphElement;

browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  const deepWikiUrl = tab?.url ? getDeepWikiUrl(tab.url) : null;

  if (deepWikiUrl) {
    urlDisplay.textContent = deepWikiUrl;
    openBtn.disabled = false;
    openBtn.addEventListener('click', () => {
      browser.tabs.create({ url: deepWikiUrl });
      window.close();
    });
  } else {
    notRepoMsg.style.display = 'block';
    openBtn.disabled = true;
  }
});
```

Note: `browser` is a WXT global (typed via `.wxt/wxt.d.ts`) — no import needed.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup/
git commit -m "feat: migrate popup to WXT + TypeScript"
```

---

## Task 5: Build Verification

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: `.output/chrome-mv3/` directory created containing:
- `manifest.json` (auto-generated by WXT)
- `content-scripts/content.js`
- `popup.html`
- `chunks/` with bundled JS

- [ ] **Step 2: Verify generated `manifest.json` is correct**

```bash
cat .output/chrome-mv3/manifest.json
```

Expected fields:
- `"manifest_version": 3`
- `"name": "DeepWiki"`
- `"permissions": ["activeTab"]`
- `content_scripts` with `"matches": ["https://github.com/*/*"]`
- `"action"` with popup

- [ ] **Step 3: Load the built extension in Chrome**

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" → select `.output/chrome-mv3/`
   - **Important:** Load from `.output/chrome-mv3/`, NOT the repo root (root no longer has a manifest.json)
4. Extension loads without errors

- [ ] **Step 4: Test hot reload during development**

```bash
npm run dev
```

Expected:
- WXT starts a dev server
- `.output/chrome-mv3/` is updated
- Load `.output/chrome-mv3/` in Chrome (if not already loaded)
- Edit `utils/deepwiki.ts` (e.g., add a comment), save
- Extension reloads automatically in Chrome without manual refresh

- [ ] **Step 5: Add `.output/` and `node_modules/` to `.gitignore`**

Create `.gitignore`:
```
node_modules/
.output/
.wxt/tsconfig.json
```

Note: Commit `.wxt/` directory itself (it contains WXT type declarations needed for TypeScript) but ignore `.wxt/tsconfig.json` (regenerated each run).

- [ ] **Step 6: Final commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore for node_modules and build output"
```
