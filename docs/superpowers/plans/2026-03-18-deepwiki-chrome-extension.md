# DeepWiki Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that adds a "DeepWiki" button to GitHub repo pages and a toolbar popup, both redirecting to `deepwiki.com/owner/repo`.

**Architecture:** Three files — `manifest.json` (MV3 config), `content.js` (injects button into GitHub's action bar), `popup.html` + `popup.js` (toolbar popup). URL transform always strips sub-paths and produces `deepwiki.com/owner/repo`. SPA navigation is handled via `pushState` patching + `popstate` listener + a DOM-based duplicate guard.

**Tech Stack:** Vanilla JS, Chrome Extensions Manifest V3, no build step, no dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `manifest.json` | Create | MV3 manifest — declares popup, content script, permissions |
| `content.js` | Create | Injects DeepWiki button into GitHub's repo action bar; handles SPA navigation |
| `popup.html` | Create | Popup UI — shows deepwiki URL + open button |
| `popup.js` | Create | Popup logic — reads active tab URL, transforms it, wires up button |

---

## Task 1: Project Scaffold — `manifest.json`

**Files:**
- Create: `manifest.json`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "DeepWiki",
  "version": "1.0.0",
  "description": "Open any GitHub repo in DeepWiki with one click",
  "permissions": ["activeTab"],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Open in DeepWiki"
  },
  "content_scripts": [
    {
      "matches": ["https://github.com/*/*"],
      "js": ["content.js"]
    }
  ]
}
```

- [ ] **Step 2: Load extension in Chrome to verify manifest is valid**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle, top-right)
3. Click "Load unpacked" → select the repo root directory
4. Extension should appear without errors
5. If errors appear, check the manifest syntax

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add MV3 manifest"
```

---

## Task 2: URL Transform Utility

Both `content.js` and `popup.js` need the same transform logic. Define it as an inline function in each file (they don't share scope in MV3).

**Transform logic:**
```javascript
function getDeepWikiUrl(githubUrl) {
  const match = githubUrl.match(/^https:\/\/github\.com\/([^\/]+\/[^\/]+)/);
  if (!match) return null;
  return `https://deepwiki.com/${match[1]}`;
}
```

**Test cases to verify mentally before continuing:**
- `https://github.com/facebook/react` → `https://deepwiki.com/facebook/react` ✓
- `https://github.com/facebook/react/issues/1234` → `https://deepwiki.com/facebook/react` ✓
- `https://github.com/facebook/react/blob/main/README.md` → `https://deepwiki.com/facebook/react` ✓
- `https://github.com/facebook` → `null` ✓ (no repo segment)
- `https://github.com` → `null` ✓

No file to create yet — this function will be copy-pasted into both files in Tasks 3 and 4.

---

## Task 3: Content Script — `content.js`

**Files:**
- Create: `content.js`

The content script must:
1. Find GitHub's repo action button group (Star/Fork/Watch area)
2. Inject a "DeepWiki" link styled as a button
3. Handle GitHub's SPA navigation so the button re-injects after client-side page changes

**Step 1: Inspect GitHub's DOM to find the button group selector**

- [ ] Open any GitHub repo page (e.g., `https://github.com/facebook/react`)
- [ ] Open DevTools → Elements
- [ ] Find the Star/Fork/Watch buttons container
- [ ] Current selector (as of 2026): look for `<div>` containing `<a>` buttons with classes like `btn-sm`. The Watch/Fork/Star group is typically inside an element with `data-repository-hovercards-enabled` attribute, or within the `<div class="pagehead-actions">` container.
- [ ] Confirm the selector works in the console: `document.querySelector('.pagehead-actions')` or the appropriate selector

> **Note:** GitHub changes their DOM periodically. If the selector doesn't work, inspect the current markup and update the selector in the code below before proceeding.

- [ ] **Step 2: Create `content.js`**

```javascript
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
    // Selector targets the actions list in the repo header
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

    // Disconnect once injected to avoid unnecessary work
    // Re-connect on URL change (SPA navigation)
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
```

- [ ] **Step 3: Reload the extension and test**

1. Go to `chrome://extensions/` → click the reload icon on the DeepWiki extension
2. Navigate to `https://github.com/facebook/react`
3. Verify a "DeepWiki" button appears in the Watch/Fork/Star button area
4. Click it — should open `https://deepwiki.com/facebook/react` in a new tab
5. Navigate to another repo via GitHub's search (SPA navigation) — verify the button re-appears on the new repo page
6. Navigate to a non-repo GitHub page (e.g., `github.com/facebook`) — verify no button is injected

- [ ] **Step 4: If the `.pagehead-actions` selector doesn't match, find the correct one**

If the button doesn't appear in Step 3:
1. DevTools → Elements → find the Star/Fork/Watch button group
2. Identify the parent container's class or attribute
3. Update the selector in `content.js` and reload

- [ ] **Step 5: Commit**

```bash
git add content.js
git commit -m "feat: inject DeepWiki button into GitHub repo action bar"
```

---

## Task 4: Popup — `popup.html` + `popup.js`

**Files:**
- Create: `popup.html`
- Create: `popup.js`

- [ ] **Step 1: Create `popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
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
  <div id="url-display"></div>
  <p id="not-repo-msg">Not a GitHub repo page.</p>
  <button id="open-btn" disabled>Open in DeepWiki</button>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup.js`**

```javascript
function getDeepWikiUrl(githubUrl) {
  const match = githubUrl.match(/^https:\/\/github\.com\/([^\/]+\/[^\/]+)/);
  if (!match) return null;
  return `https://deepwiki.com/${match[1]}`;
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const urlDisplay = document.getElementById('url-display');
  const openBtn = document.getElementById('open-btn');
  const notRepoMsg = document.getElementById('not-repo-msg');

  const deepWikiUrl = tab?.url ? getDeepWikiUrl(tab.url) : null;

  if (deepWikiUrl) {
    urlDisplay.textContent = deepWikiUrl;
    openBtn.disabled = false;
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: deepWikiUrl });
    });
  } else {
    notRepoMsg.style.display = 'block';
    openBtn.disabled = true;
  }
});
```

- [ ] **Step 3: Reload and test the popup**

1. Reload extension at `chrome://extensions/`
2. Navigate to `https://github.com/facebook/react`
3. Click the DeepWiki toolbar icon → popup should show `https://deepwiki.com/facebook/react` and an enabled "Open in DeepWiki" button
4. Click the button → opens `https://deepwiki.com/facebook/react` in a new tab
5. Navigate to `https://github.com/facebook` (org page, no repo)
6. Click toolbar icon → popup should show "Not a GitHub repo page." with a disabled button
7. Navigate to any non-GitHub page
8. Click toolbar icon → popup should show "Not a GitHub repo page." with a disabled button

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add popup with DeepWiki URL display and open button"
```

---

## Task 5: Final End-to-End Verification

- [ ] **Step 1: Full test walkthrough**

| Scenario | Expected result |
|----------|----------------|
| Visiting `github.com/facebook/react` | DeepWiki button appears in action bar |
| Clicking injected button | Opens `deepwiki.com/facebook/react` in new tab |
| Clicking toolbar icon on a repo page | Popup shows deepwiki URL, button enabled |
| Clicking popup button | Opens deepwiki URL in new tab |
| Visiting `github.com/facebook/react/issues/42` | Button appears, clicks open `deepwiki.com/facebook/react` (sub-path stripped) |
| SPA navigation to another repo | Button re-appears on new repo |
| Visiting `github.com/facebook` (org, no repo) | No button injected |
| Toolbar icon on non-GitHub page | Popup shows "Not a GitHub repo page" |

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "feat: DeepWiki Chrome extension complete"
```
