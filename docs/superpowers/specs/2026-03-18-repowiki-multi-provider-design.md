# RepoWiki Multi-Provider Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Rename the extension from "DeepWiki" to "RepoWiki" and refactor the architecture to support multiple wiki providers (DeepWiki, CodeWiki, and future additions). Users can enable/disable individual providers via the popup. On GitHub repo pages, a "Wiki ▾" dropdown button replaces the single "DeepWiki" button, showing all enabled providers.

---

## Providers

| Provider | URL Format |
|----------|-----------|
| DeepWiki | `https://deepwiki.com/{owner}/{repo}` |
| CodeWiki | `https://codewiki.google/github.com/{owner}/{repo}` |

Both enabled by default.

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
| `wxt.config.ts` | Update | Rename to "RepoWiki" |

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
    enabledByDefault: true,
  },
];

/**
 * Extracts owner and repo from a GitHub URL.
 * Returns null for non-repo GitHub URLs or non-GitHub URLs.
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

- On first install / first read: if key is absent, default values are derived from `provider.enabledByDefault`
- Toggle changes in popup write immediately, no save button needed
- Content script reads storage on each injection to filter enabled providers

---

## Content Script (`entrypoints/content.ts`)

### Behavior

- Reads `enabledProviders` from `browser.storage.sync`
- If no providers are enabled, skips injection silently
- Injects a `<li>` containing a "Wiki ▾" button into `.pagehead-actions`
- Button click toggles a dropdown `<ul>` listing each enabled provider as a `<a>` link
- Clicking a provider link opens the wiki URL in a new tab and closes the dropdown
- Clicking outside the dropdown closes it
- Duplicate guard: `data-repowiki-btn` attribute on the injected `<li>` (DOM-based, survives SPA navigation)
- SPA navigation: existing `pushState` patching + `popstate` + `MutationObserver` pattern preserved
- `ctx.onInvalidated` restores `history.pushState` and disconnects observer (WXT cleanup)

### Dropdown Styling

- White background, 1px border (`#d0d7de`), box-shadow, border-radius 6px
- Each row: padding, hover highlight, cursor pointer
- Positioned absolutely below the "Wiki ▾" button
- No external CSS dependencies — inline styles or a `<style>` tag injected once

### Button Attribute Change

`data-deepwiki-btn` → `data-repowiki-btn`

---

## Popup (`entrypoints/popup/`)

### Layout

```
┌─────────────────────────────┐
│ RepoWiki                    │
├─────────────────────────────┤
│ [Provider links section]    │
│  DeepWiki  [Open ↗]        │
│  CodeWiki  [Open ↗]        │
│ — or —                      │
│  Not a GitHub repo page.    │
├─────────────────────────────┤
│ Settings                    │
│  ☑ DeepWiki                │
│  ☑ CodeWiki                │
└─────────────────────────────┘
```

### Behavior

- Queries active tab URL, calls `extractGithubRepo`
- If valid repo: shows one row per provider with name + "Open" button
  - Disabled providers are shown in settings but not in the links section
- If not a repo: hides links section, shows "Not a GitHub repo page"
- Settings toggles: `<input type="checkbox">` per provider, state from `browser.storage.sync`
- Toggle change handler writes to storage immediately

---

## `wxt.config.ts` Changes

```typescript
manifest: {
  name: 'RepoWiki',
  description: 'Open any GitHub repo in DeepWiki, CodeWiki, and more',
  // ...
}
```

---

## Error Handling

- Storage read failures: fall back to `enabledByDefault` values, no error thrown
- `.pagehead-actions` not found: silent skip (existing behavior preserved)
- TypeScript: all DOM casts and storage reads are typed

---

## Out of Scope

- Per-provider icons
- Custom provider URLs (user-defined)
- Keyboard shortcuts
- Non-GitHub source hosts (GitLab, Bitbucket)
