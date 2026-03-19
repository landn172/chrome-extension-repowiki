# Custom Provider Support

**Date:** 2026-03-19
**Status:** Approved

## Summary

Allow users to add custom wiki providers by specifying a name and URL template. Custom providers appear alongside built-in providers in the popup, content script dropdown, and keyboard shortcut handler. Users can enable/disable, pin, and delete custom providers.

## Data Model

### Storage

Custom providers are stored in `chrome.storage.sync` under the key `customProviders`:

```ts
interface CustomProvider {
  id: string;          // crypto.randomUUID()
  name: string;        // user-provided display name, max 40 chars
  urlTemplate: string; // e.g. "https://wiki.com/{owner}/{repo}"
}
```

Storage value: `CustomProvider[]` (array, ordered by creation time).

### Unified Provider Interface

To avoid duplicating logic, custom providers are converted to the same `WikiProvider` shape as built-in providers at load time. Add a helper in `utils/providers.ts`:

```ts
export function buildCustomTransform(urlTemplate: string): (owner: string, repo: string) => string {
  return (owner, repo) => urlTemplate.replace('{owner}', owner).replace('{repo}', repo);
}

export function mergeCustomProviders(customProviders: CustomProvider[]): WikiProvider[] {
  return [
    ...PROVIDERS,
    ...customProviders.map(cp => ({
      id: cp.id,
      name: cp.name,
      transform: buildCustomTransform(cp.urlTemplate),
      enabledByDefault: true,
      pinnedByDefault: false,
    })),
  ];
}
```

**Critical pattern:** Every consumer (popup, content script, background script) must use the merged `allProviders` list — not the bare `PROVIDERS` array — for **all** provider lookups: `isEnabled`, `renderPinnedBtn`, `buildDropdown`, shortcut fallback, etc. Any code path that calls `PROVIDERS.find(...)` must be updated to search `allProviders` instead.

### Security Note

`buildCustomTransform` does naive string replacement of `{owner}` and `{repo}`. This is safe because `extractGithubRepo` uses the regex `[^/?#]+` which prevents `/`, `?`, and `#` injection in owner/repo values. The URL template is also validated to start with `https://` or `http://`, preventing `javascript:` URLs. `http://` is intentionally allowed for self-hosted wiki services.

## Validation

When the user submits the add form:

1. **Name:** must not be empty after trimming whitespace, max 40 characters
2. **URL template:** must start with `https://` or `http://`, must contain both `{owner}` and `{repo}`
3. Show inline error message below the URL field if validation fails

## Popup UI Changes

### Add Button

Below the provider list, add a "+ Add custom provider" row. Same styling as provider rows but with muted color (`#94a3b8`).

### Inline Form

Clicking "+" expands an inline form with:
- Gray background card (`#f8fafc`, 1px `#e2e8f0` border, 8px radius)
- "Add Custom Provider" label
- Name input (placeholder: "Name (e.g. My Wiki)")
- URL input (placeholder: "https://wiki.com/{owner}/{repo}", monospace font)
- Error message area (hidden by default, red text, 11px)
- Cancel / Add buttons (right-aligned)

Cancel collapses the form. Add validates and saves.

### Delete Button

Custom provider rows show a small × button between the name and toggle. Clicking × removes the provider from storage. Built-in providers never show ×.

### Custom Provider Rows

Custom providers render identically to built-in providers (name + toggle), plus the × button. They support the same enable/disable toggle behavior. They appear after built-in providers in the list.

### Merged List Requirement

The popup must use the merged provider list (`allProviders`) for:
- `isEnabled()` — must accept a `defaultVal` parameter (matching content script pattern) since custom providers won't be in `PROVIDERS`
- `renderPinnedBtn()` — must search `allProviders` to find pinned custom providers
- Provider row rendering — iterate `allProviders`, not just `PROVIDERS`

## Content Script Changes

`entrypoints/content.ts` must:

1. Read `customProviders` from storage (add to the existing `storage.sync.get` call)
2. Build a merged `allProviders` list using `mergeCustomProviders()`
3. Use `allProviders` everywhere `PROVIDERS` was previously used: `injectButton`, `buildDropdown`, `isEnabled`
4. Update `buildDropdown` type signature to accept `readonly WikiProvider[]`
5. Listen for `customProviders` storage changes in `onStorageChanged`: update the in-memory custom providers array, rebuild `allProviders`, then call `reInjectButton()`

Custom providers use `buildCustomTransform(urlTemplate)` for their transform function.

## Background Script Changes

`entrypoints/background.ts` must:

1. Read `customProviders` from storage (add to the existing `storage.sync.get` call)
2. Build a merged `allProviders` list using `mergeCustomProviders()`
3. Use `allProviders` for all provider lookups: pinned provider resolution and fallback to first enabled provider

## Files Changed

| File | Change |
|------|--------|
| `utils/providers.ts` | Add `CustomProvider` interface, `buildCustomTransform`, `mergeCustomProviders` |
| `entrypoints/popup/index.html` | Add styles for form, delete button, error message |
| `entrypoints/popup/main.ts` | Add form logic, delete button, read/write `customProviders`, use merged list |
| `entrypoints/content.ts` | Read and merge `customProviders`, update all lookups, handle storage changes |
| `entrypoints/background.ts` | Read and merge `customProviders`, update all lookups |

## Edge Cases

- **Storage empty or missing `customProviders`:** Treat as empty array `[]`
- **Max custom providers:** No hard limit. Chrome sync storage has a per-item 8KB limit — at ~100 bytes per provider, this allows ~80 custom providers, far more than anyone would need.
- **Duplicate names:** Allowed — IDs are unique (`crypto.randomUUID()`)
- **Pinned custom provider is deleted:** Falls back to default pinned provider. The merged list no longer contains the deleted ID, so `allProviders.find()` returns undefined, triggering the existing default fallback logic.
- **URL template missing placeholders:** Blocked by validation — form won't submit
- **Name too long:** Blocked by validation — max 40 characters
- **`onStorageChanged` for `customProviders`:** Must rebuild `allProviders` from the new value before calling `reInjectButton()`, to avoid rendering with a stale merged list

## Non-goals

- No drag-to-reorder custom providers
- No edit/update existing custom providers (delete + re-add)
- No import/export of custom providers
- No icon or description fields
