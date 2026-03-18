# DeepWiki Chrome Extension — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

A Chrome extension that adds one-click navigation from any GitHub repository page to its equivalent DeepWiki page.

**URL transform:** `https://github.com/owner/repo/...` → `https://deepwiki.com/owner/repo` (always the repo root — sub-paths are not supported by DeepWiki)

DeepWiki (deepwiki.com) is built by the Devin AI team. It auto-indexes public GitHub repos and generates interactive wiki documentation with AI chat support.

---

## Architecture

Manifest V3 extension with 3 components:

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest; declares content script and popup |
| `content.js` | Injected into GitHub pages; adds DeepWiki button |
| `popup.html` + `popup.js` | Toolbar popup with DeepWiki link for current tab |

No background service worker, no options page, no external API calls.

---

## URL Matching & Transform

- **Match pattern:** `https://github.com/*/*`
- Requires at least `owner/repo` — ignores GitHub root, profile pages, org pages
- **Always transforms to the repo root** — sub-paths are stripped because DeepWiki only supports `deepwiki.com/owner/repo`
- Examples:
  - `github.com/facebook/react` → `deepwiki.com/facebook/react`
  - `github.com/facebook/react/issues/1234` → `deepwiki.com/facebook/react`
  - `github.com/facebook/react/blob/main/README.md` → `deepwiki.com/facebook/react`

---

## Content Script (`content.js`)

**Behavior:**
- Runs on page load on all `github.com/*/*` pages
- Finds GitHub's action button group (the area containing Star, Fork, Watch buttons)
- Inserts a "DeepWiki" button styled to match GitHub's native button group
- Button opens the deepwiki.com equivalent URL in a **new tab**

**SPA Navigation Handling:**
- GitHub is a single-page app; full page reloads don't always occur on navigation
- Uses a `MutationObserver` scoped to the repository header container (not `document.body`) to avoid performance issues from observing all DOM mutations
- The observer disconnects itself once the button is successfully injected
- URL changes are detected by polling `location.href` or listening for `popstate`/`pushState` to re-enable the observer on navigation
- Duplicate injection is prevented by checking for a `data-deepwiki-btn` attribute on an existing button in the DOM — this is always tied to live DOM state rather than a stale boolean flag, so it correctly resets after SPA navigation destroys the old DOM

**Button Styling:**
- Matches GitHub's button group: same height, border-radius, font, border color
- Label: "DeepWiki"
- Opens in new tab (`target="_blank"`, `rel="noopener noreferrer"`)

---

## Popup (`popup.html` + `popup.js`)

**Behavior:**
- On open, queries the active tab URL via `chrome.tabs.query({active: true, currentWindow: true})`
- The popup script runs as the user gesture context (triggered by clicking the toolbar icon), so `activeTab` permission is sufficient — no `tabs` permission needed
- If URL matches `github.com/*/*`: shows transformed deepwiki.com URL + enabled "Open DeepWiki" button
- If URL does not match: shows a disabled state with message "Not a GitHub repo page"
- Button opens the deepwiki.com URL in a new tab

**UI:**
- Minimal: URL display + one action button
- No settings or configuration needed

---

## Manifest (`manifest.json`)

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

---

## Error Handling

- If the GitHub button group cannot be found (DOM structure changes), the content script silently skips injection — no errors thrown
- Popup gracefully handles non-GitHub tabs with a disabled state
- No network requests made by the extension itself

---

## Out of Scope

- No options page
- No sync or storage
- No analytics or telemetry
- No background service worker
- No support for GitHub Enterprise URLs (only `github.com`)
