# RepoWiki Pin & UI Redesign Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Three changes in one spec:

1. **All providers enabled by default** — `enabledByDefault: true` for all four providers.
2. **Pin feature** — one provider can be pinned. On GitHub repo pages the pinned provider is exposed as a direct button (left half of a split button group); the remaining enabled providers are in the dropdown (right half). In the popup the pinned provider is shown as a large tap-target button.
3. **Popup UI redesign** — Design C (minimal modern): remove the open-links section, add a pinned-provider button, keep a compact provider list with enable toggle + pin radio per row.

---

## Storage

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `enabledProviders` | `Record<string, boolean>` | all `true` | unchanged from current |
| `pinnedProvider` | `string` | `'deepwiki'` | ID of the pinned provider |

First read: if `pinnedProvider` key is absent, fall back to the provider with `pinnedByDefault: true` (DeepWiki).

---

## `utils/providers.ts` Changes

Add `pinnedByDefault: boolean` to `WikiProvider` interface. Set `enabledByDefault: true` on all four providers. Set `pinnedByDefault: true` on DeepWiki only.

```typescript
export interface WikiProvider {
  id: string;
  name: string;
  transform: (owner: string, repo: string) => string;
  enabledByDefault: boolean;
  pinnedByDefault: boolean;
}

export const PROVIDERS: readonly WikiProvider[] = [
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    transform: (owner, repo) => `https://deepwiki.com/${owner}/${repo}`,
    enabledByDefault: true,
    pinnedByDefault: true,
  },
  {
    id: 'codewiki',
    name: 'CodeWiki',
    transform: (owner, repo) => `https://codewiki.google/github.com/${owner}/${repo}`,
    enabledByDefault: true,
    pinnedByDefault: false,
  },
  {
    id: 'zread',
    name: 'Zread',
    transform: (owner, repo) => `https://zread.ai/${owner}/${repo}`,
    enabledByDefault: true,
    pinnedByDefault: false,
  },
  {
    id: 'readmex',
    name: 'Readmex',
    transform: (owner, repo) => {
      const prefix = navigator.language.startsWith('zh') ? '' : 'en-US/';
      return `https://readmex.com/${prefix}${owner}/${repo}`;
    },
    enabledByDefault: true,
    pinnedByDefault: false,
  },
];
```

`extractGithubRepo` is unchanged.

---

## Content Script (`entrypoints/content.ts`)

### Storage read

Read `enabledProviders` and `pinnedProvider` in a single `browser.storage.sync.get(['enabledProviders', 'pinnedProvider'])` call. Fall back to defaults on failure.

Resolve the effective pinned provider:

```
pinnedId = stored pinnedProvider ?? PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id
```

### Split-button injection

Build a `<li data-repowiki-btn>` containing a `<div class="repowiki-group">` with:

**Case A — pinned provider is enabled AND other enabled providers exist:**
```
[<button class="repowiki-primary">DeepWiki ↗</button>][<button class="repowiki-chevron">▾</button>]
```
- Left button: clicking opens pinned provider URL directly in new tab
- Right button: clicking toggles the dropdown (same UL as before, but only non-pinned enabled providers)

**Case B — pinned provider is enabled AND no other enabled providers:**
```
[<button class="repowiki-primary">DeepWiki ↗</button>]
```
No chevron button. No dropdown.

**Case C — pinned provider is disabled, but other providers are enabled:**
```
[<button class="repowiki-chevron-only">Wiki ▾</button>]
```
Falls back to the plain dropdown with all enabled providers (no split). This is a degraded but graceful state.

**Case D — no providers enabled:** skip injection entirely.

### Styling

Injected via `<style id="repowiki-styles">` once. Match GitHub's `.btn.btn-sm` appearance.

```css
.repowiki-group {
  display: inline-flex;
  border: 1px solid rgba(31,35,40,.15);
  border-radius: 6px;
  overflow: hidden;
}
.repowiki-primary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: #f6f8fa;
  border: none;
  border-right: 1px solid rgba(31,35,40,.15);
  font-size: 12px;
  color: #24292f;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  line-height: 20px;
}
.repowiki-primary:hover { background: #e8ecf0; }
.repowiki-chevron {
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  background: #f6f8fa;
  border: none;
  font-size: 10px;
  color: #24292f;
  cursor: pointer;
  line-height: 20px;
}
.repowiki-chevron:hover { background: #e8ecf0; }
.repowiki-chevron-only {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: #f6f8fa;
  border: none;
  font-size: 12px;
  color: #24292f;
  cursor: pointer;
  font-family: inherit;
  line-height: 20px;
}
.repowiki-chevron-only:hover { background: #e8ecf0; }
/* dropdown styles unchanged from current */
```

### Behavior preservation

- Duplicate guard: `[data-repowiki-btn]` on the `<li>` — unchanged
- SPA navigation: `history.pushState` patch + `popstate` + `MutationObserver` — unchanged
- `ctx.onInvalidated`: restore `pushState`, disconnect observer, remove `#repowiki-styles` — unchanged
- `closeDropdown`: scoped `querySelector('[data-repowiki-btn] .repowiki-dropdown')` — unchanged

---

## Popup (`entrypoints/popup/`)

### `index.html` Structure

Remove: `#links-section`, `#not-repo-msg`, `#all-disabled-msg`, `<hr>`.

New structure:

```html
<body>
  <!-- Header -->
  <div id="header">
    <div class="title-row">
      <div class="logo">R</div>
      <span class="title">RepoWiki</span>
    </div>
    <span id="repo-chip"></span>  <!-- populated by JS; hidden if not on repo page -->
  </div>

  <!-- Pinned button -->
  <div id="pinned-btn">
    <!-- populated by JS -->
    <!-- dimmed (pointer-events: none, opacity: 0.3) when not on a repo page -->
  </div>

  <div class="divider"></div>

  <!-- Provider list -->
  <div id="providers-section"></div>

  <script type="module" src="./main.ts"></script>
</body>
```

Width: 280px.

### `main.ts` Behavior

1. Load `enabledProviders` + `pinnedProvider` from `browser.storage.sync` (single `.get` call), fall back to defaults on failure.
2. Resolve `pinnedId` from storage (fall back to `PROVIDERS.find(p => p.pinnedByDefault)?.id`).
3. Query active tab URL, call `extractGithubRepo`.
4. Render `#repo-chip`: show `owner/repo` if on a repo page; hide chip otherwise.
5. Render `#pinned-btn`:
   - Find the pinned provider object from `PROVIDERS`
   - Show provider name + "Pinned · tap to open" subtext + ↗ icon
   - If on a repo page: clicking calls `browser.tabs.create` with the provider URL, then `window.close()`; wrap in try/catch (stay open on failure)
   - If not on a repo page: dim the button (`opacity: 0.3`, `pointer-events: none`), show "Open a GitHub repo to use" subtext instead
6. Render `#providers-section`: one row per provider from `PROVIDERS`:
   - Provider name
   - Pin button (📍): clicking sets `pinnedProvider` in storage, updates `pinnedId`, re-renders `#pinned-btn` and re-renders all pin buttons to reflect new state
   - Enable toggle: same logic as current (write-then-mutate pattern with checkbox revert on failure)
7. A `renderPinnedBtn(repoInfo)` helper encapsulates step 5 so pin-button clicks can call it to re-render.

### Storage writes

- **Toggle change**: `browser.storage.sync.set({ enabledProviders: { ...enabledMap, [id]: newVal } })`, update `enabledMap` only on success, revert checkbox on failure — same as current.
- **Pin change**: `browser.storage.sync.set({ pinnedProvider: id })`, update `pinnedId` only on success. No revert UI needed (radio — the button just stays as it was if write fails).

---

## `wxt.config.ts`

No changes.

---

## File Changes Summary

| File | Action |
|------|--------|
| `utils/providers.ts` | Add `pinnedByDefault` field; set all `enabledByDefault: true` |
| `entrypoints/content.ts` | Replace single-button with split-button group; read `pinnedProvider` from storage |
| `entrypoints/popup/index.html` | Full redesign (Design C) |
| `entrypoints/popup/main.ts` | Add pin logic, remove links section, render pinned button |

---

## Error Handling

- Storage read failure: fall back to all-enabled defaults + DeepWiki pinned
- Storage write failure (pin): no revert, pin button stays as it was
- Storage write failure (toggle): revert checkbox, same as current
- `browser.tabs.create` failure in popup: stay open (same as current)
- `.pagehead-actions` not found: silent skip (same as current)

---

## Out of Scope

- Keyboard shortcuts
- Per-provider icons / favicons
- Custom provider URLs
- Reordering providers
- Live content-script update when popup toggles a provider
