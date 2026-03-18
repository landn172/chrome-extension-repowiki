# RepoWiki Pin & UI Redesign Spec

**Date:** 2026-03-18
**Status:** Approved (updated 2026-03-18: pin in dropdown only; no popup pin button; SVG icon)

---

## Overview

Three changes in one spec:

1. **All providers enabled by default** — `enabledByDefault: true` for all four providers.
2. **Pin feature** — one provider can be pinned. The pin operation lives **inside the GitHub page dropdown** (SVG pin icon per provider row). On GitHub repo pages the pinned provider is exposed as a direct button (left half of a split button group); the remaining enabled providers are in the dropdown. Both the dropdown pin and the popup show the same `pinnedProvider` storage key.
3. **Popup UI redesign** — Design C (minimal modern): remove the open-links section, add a pinned-provider button, keep a compact provider list with **enable toggle only** (no pin button in popup).

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
- Right button: clicking toggles the dropdown; dropdown contains ALL enabled providers (including pinned), each row has a pin icon on the right

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

**Case D — no providers enabled (includes: pinned disabled AND all others disabled):** skip injection entirely.

### Styling

Injected via `<style id="repowiki-styles">` once. Match GitHub's `.btn.btn-sm` appearance.

`.repowiki-wrapper` is **removed** (was used for dropdown positioning in the old design). `.repowiki-group` replaces it and must include `position: relative` so the absolutely-positioned `.repowiki-dropdown` renders below the group correctly.

```css
.repowiki-group {
  display: inline-flex;
  position: relative;
  border: 1px solid rgba(31,35,40,.15);
  border-radius: 6px;
  overflow: visible; /* allow dropdown to overflow */
}
.repowiki-primary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: #f6f8fa;
  border: none;
  border-right: 1px solid rgba(31,35,40,.15);
  border-radius: 5px 0 0 5px;
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
  border-radius: 0 5px 5px 0;
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
  border-radius: 5px;
  font-size: 12px;
  color: #24292f;
  cursor: pointer;
  font-family: inherit;
  line-height: 20px;
}
.repowiki-chevron-only:hover { background: #e8ecf0; }
/* dropdown styles unchanged from current */
```

### Dropdown with pin icons

The dropdown lists **all enabled providers** (not just non-pinned). Each row is:

```
[provider name (click → open)]  [pin icon button]
```

**Pin icon:** Inline SVG thumbtack, 12×12, `fill="currentColor"`:
```html
<svg class="repowiki-pin-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
  <path d="M17 4v7l2 3H5l2-3V4h10zm-5 16c-1.1 0-2-.9-2-2h4a2 2 0 01-2 2zM7 2h10v2H7V2z"/>
</svg>
```

CSS for pin button in dropdown:
```css
.repowiki-pin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  color: #9ca3af;
  padding: 0;
  flex-shrink: 0;
}
.repowiki-pin-btn:hover { background: #f0f2f5; color: #374151; border-color: #e2e8f0; }
.repowiki-pin-btn.active { color: #24292f; background: #f1f5f9; border-color: #e2e8f0; }
```

**Pin button behavior:**
1. Clicking a non-active pin button → `browser.storage.sync.set({ pinnedProvider: id })`
2. On success: update in-memory `pinnedId`, re-render the entire `[data-repowiki-btn]` li (rebuilds the split button group to reflect the new pinned provider and updates all pin button active states in the open dropdown)
3. On failure: no revert (pin button stays as it was)
4. The dropdown remains open after a pin click (user may want to open the newly pinned provider or close manually)

Re-render: call `injectButton()` logic again — remove the old `[data-repowiki-btn]` li and inject a fresh one with the updated `pinnedId`. Simpler than partial DOM mutation; the dropdown stays open state is reset (acceptable trade-off).

### Behavior preservation

- Duplicate guard: `[data-repowiki-btn]` on the `<li>` — unchanged
- SPA navigation: `history.pushState` patch + `popstate` + `MutationObserver` — unchanged
- `ctx.onInvalidated`: restore `pushState`, disconnect observer, remove `#repowiki-styles` — unchanged
- `closeDropdown`: `document.querySelector<HTMLUListElement>('[data-repowiki-btn] .repowiki-dropdown')?.style.setProperty('display', 'none')` — unchanged

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
    <span id="repo-chip" style="display:none"></span>  <!-- shown by JS only on repo page -->
  </div>

  <!-- Pinned button — always rendered; dimmed when inactive -->
  <div id="pinned-btn"></div>

  <div class="divider"></div>

  <!-- Provider list -->
  <div id="providers-section"></div>

  <script type="module" src="./main.ts"></script>
</body>
```

Width: 280px.

### `main.ts` Behavior

1. Load `enabledProviders` + `pinnedProvider` from `browser.storage.sync` (single `.get` call), fall back to defaults on failure.
2. Resolve `pinnedId: string` (let, mutable) from storage; fall back to `PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id`.
3. Query active tab URL, call `extractGithubRepo`. Store result as `repoInfo`.
4. Render `#repo-chip`: set `display: inline` and `textContent = owner/repo` if on a repo page; leave `display: none` otherwise.
5. Define `renderPinnedBtn(repoInfo: { owner: string; repo: string } | null, pinnedId: string): void`:
   - Clears `#pinned-btn` content
   - Finds `pinnedProvider = PROVIDERS.find(p => p.id === pinnedId)`
   - Determines `isActive`:
     - `false` if `repoInfo` is null (not on a repo page)
     - `false` if `isEnabled(pinnedId, ...)` returns false (pinned provider is disabled)
     - `true` otherwise
   - Renders the button content:
     - Provider name
     - Subtext: `"Pinned · tap to open"` when active; `"Open a GitHub repo to use"` when not on repo page; `"Pinned provider is disabled"` when on repo page but provider is disabled
     - ↗ icon
   - If `isActive`: clicking calls `browser.tabs.create({ url: pinnedProvider.transform(owner, repo) })` then `window.close()`; wrap in async try/catch (stay open on failure)
   - If not active: set `opacity: 0.3` and `pointer-events: none` on the button
6. Call `renderPinnedBtn(repoInfo, pinnedId)` once at startup.
7. Render `#providers-section`: one row per provider from `PROVIDERS`:
   - Provider name
   - Enable toggle: write-then-mutate pattern with checkbox revert on failure. On success: also call `renderPinnedBtn(repoInfo, pinnedId)` to reflect updated active state.
   - **No pin button in popup.** Pin is only controlled from the GitHub page dropdown.
8. `defaultPinnedId` must be declared at **module scope** (outside `main()`), before the `main()` call:
   ```typescript
   const defaultPinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
   ```
   Top-level error handler: `main().catch(() => { renderPinnedBtn(null, defaultPinnedId); })`. This falls back to rendering the pinned button in its dimmed/inactive state so the popup is never blank.

### Storage writes

- **Toggle change**: `browser.storage.sync.set({ enabledProviders: { ...enabledMap, [id]: newVal } })`, update `enabledMap` only on success, revert checkbox on failure. On success also call `renderPinnedBtn(repoInfo, pinnedId)` to update the pinned button's active state.

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
- Storage write failure (pin in dropdown): no revert, dropdown pin button stays as it was
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
