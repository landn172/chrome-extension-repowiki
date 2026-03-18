# RepoWiki Multi-Provider Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Rename the extension from "DeepWiki" to "RepoWiki" and refactor the architecture to support multiple wiki providers (DeepWiki, CodeWiki, and future additions). Users can enable/disable individual providers via the popup. On GitHub repo pages, a "Wiki ▾" dropdown button replaces the single "DeepWiki" button, showing all enabled providers.

---

## Providers

| Provider | URL Format | Default |
|----------|-----------|---------|
| DeepWiki | `https://deepwiki.com/{owner}/{repo}` | ✅ enabled |
| CodeWiki | `https://codewiki.google/github.com/{owner}/{repo}` | ❌ disabled |
| Zread | `https://zread.ai/{owner}/{repo}` | ❌ disabled |
| Readmex | `https://readmex.com/en-US/{owner}/{repo}` (default)<br>`https://readmex.com/{owner}/{repo}` (zh) | ❌ disabled |

Readmex URL is locale-aware: reads `navigator.language` at call time inside `transform`. If `navigator.language` starts with `zh`, uses the root path (no locale prefix). All other languages (including en) use the `en-US/` prefix.

---

## Architecture

### File Changes

| File | Action | Notes |
|------|--------|-------|
| `utils/deepwiki.ts` | Delete | Replaced by `utils/providers.ts` |
| `utils/providers.ts` | Create | Provider registry + GitHub URL parser |
| `entrypoints/content.ts` | Refactor | Single button → "Wiki ▾" dropdown |
| `entrypoints/popup/main.ts` | Refactor | Provider links + toggle settings |
| `entrypoints/popup/index.html` | Update | New UI layout |
| `wxt.config.ts` | Update | Rename to "RepoWiki", add `storage` permission |

---

## `utils/providers.ts`

Defines the `WikiProvider` interface, the `PROVIDERS` registry array, and the `extractGithubRepo` utility. This is the single file to edit when adding a new provider.

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
 * `[^/]+` stops at `/`, `?`, and `#` so no extra sanitization needed.
 *
 * @example
 * extractGithubRepo('https://github.com/facebook/react/issues/42?q=bug')
 * // → { owner: 'facebook', repo: 'react' }
 */
export function extractGithubRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
```

---

## Storage

Uses `browser.storage.sync` with key `enabledProviders: Record<string, boolean>`.

- **First read**: if `enabledProviders` key is absent, fall back to each provider's `enabledByDefault` value
- **Toggle change**: writes to storage immediately, no save button
- **Content script**: reads storage once per injection cycle; does **not** listen for `storage.onChanged` — provider visibility updates on next SPA navigation or page reload only
- **Storage read failure**: fall back to `enabledByDefault` values, no error thrown

---

## `wxt.config.ts` Changes

```typescript
manifest: {
  name: 'RepoWiki',
  description: 'Open any GitHub repo in DeepWiki, CodeWiki, and more',
  permissions: ['activeTab', 'storage'],
  action: {
    default_title: 'RepoWiki',
  },
}
```

`storage` permission is required for `browser.storage.sync`. `default_title` updated from "Open in DeepWiki" to "RepoWiki".

---

## Content Script (`entrypoints/content.ts`)

### Behavior

1. Reads `enabledProviders` from `browser.storage.sync` (falls back to `enabledByDefault` on failure)
2. Filters `PROVIDERS` to only enabled ones
3. If no providers are enabled, skips injection silently
4. Injects a `<li data-repowiki-btn>` into `.pagehead-actions` as the first child
5. Inside the `<li>`: a "Wiki ▾" `<button>` + a hidden `<ul>` dropdown
6. Button click: toggle dropdown visibility
7. Dropdown items: one `<a>` per enabled provider, opens wiki URL in new tab on click, closes dropdown
8. Click outside the button/dropdown: close dropdown
9. Duplicate guard: `document.querySelector('[data-repowiki-btn]')` — attribute on the `<li>` element
10. SPA navigation: existing `pushState` patching + `popstate` + `MutationObserver` pattern preserved
11. `ctx.onInvalidated`: restore `history.pushState`, disconnect observer (WXT lifecycle cleanup)

### Dropdown Styling

- White background, 1px border (`#d0d7de`), `box-shadow: 0 8px 24px rgba(140,149,159,.2)`, border-radius 6px
- Each row: `padding: 6px 12px`, hover background `#f6f8fa`, cursor pointer
- Positioned absolutely below the "Wiki ▾" button
- Injected via a `<style>` tag added once to `document.head` (avoids repeated inline style strings)

---

## Popup (`entrypoints/popup/`)

### HTML Structure (`index.html`)

```html
<body>
  <h2>RepoWiki</h2>

  <!-- Links section: shown only when on a GitHub repo page AND at least one provider is enabled -->
  <div id="links-section">
    <!-- Populated dynamically per provider -->
    <!-- One row per enabled provider: <div class="provider-row"> -->
    <!--   <span class="provider-name">DeepWiki</span> -->
    <!--   <a class="open-link" href="..." target="_blank">Open ↗</a> -->
    <!-- </div> -->
  </div>

  <!-- Shown when not on a GitHub repo page -->
  <p id="not-repo-msg" style="display:none">Not a GitHub repo page.</p>

  <!-- Shown when on a repo page but all providers are disabled -->
  <p id="all-disabled-msg" style="display:none">No providers enabled.</p>

  <hr>

  <!-- Settings section: always visible -->
  <div id="settings-section">
    <h3>Settings</h3>
    <!-- One row per provider: <label> <input type="checkbox" data-provider-id="deepwiki"> DeepWiki </label> -->
  </div>

  <script type="module" src="./main.ts"></script>
</body>
```

Key element IDs used by `main.ts`:
- `#links-section` — container for provider open-links (shown/hidden)
- `#not-repo-msg` — shown when active tab is not a GitHub repo
- `#all-disabled-msg` — shown when on a repo page but all providers are disabled
- `#settings-section` — contains dynamically generated checkboxes

### Behavior (`main.ts`)

1. Load `enabledProviders` from storage (fall back to defaults)
2. Query active tab URL, call `extractGithubRepo`
3. **If not a repo**: hide `#links-section`, show `#not-repo-msg`
4. **If a repo AND no providers enabled**: hide `#links-section`, show `#all-disabled-msg`
5. **If a repo AND providers enabled**: show `#links-section` with one row per enabled provider; each row has the provider name and an "Open ↗" anchor
6. Always render settings checkboxes in `#settings-section` — one `<label><input type="checkbox">` per provider from `PROVIDERS`, checked state from storage
7. Checkbox `change` event: update storage immediately

### Popup Width

300px (unchanged).

---

## Error Handling

- Storage read failures: fall back to `enabledByDefault` values
- `.pagehead-actions` not found: silent skip
- TypeScript: all DOM queries typed, storage values validated at read time

---

## Out of Scope

- Per-provider icons
- Custom provider URLs (user-defined)
- Keyboard shortcuts
- Non-GitHub source hosts (GitLab, Bitbucket)
- Live content-script update when popup toggles a provider (only updates on next navigation)
