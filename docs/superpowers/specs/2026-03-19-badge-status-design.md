# Badge Status Display

**Date:** 2026-03-19
**Status:** Approved

## Summary

Show a colored badge on the extension icon when the user is on a GitHub repo page. The badge displays the pinned provider's initials (e.g. "D" for DeepWiki) with a green background. When not on a repo page, the badge is cleared.

## Behavior

1. User navigates to a GitHub repo page → badge shows pinned provider initials on green background
2. User navigates away from a repo page → badge is cleared
3. User switches tabs → badge updates to reflect the active tab
4. User changes pinned provider (via popup) → badge text updates on all active tabs

## Initials Generation

`getProviderInitials(name: string): string`

- Split name by whitespace, filter out empty strings, take first letter of each word, uppercase
- Max 4 characters (Chrome badge limit)
- Empty or whitespace-only input returns empty string
- Examples: "DeepWiki" → "D", "Code Wiki" → "CW", "My Custom Wiki" → "MCW", "Zread" → "Z"

```ts
export function getProviderInitials(name: string): string {
  return name.split(/\s+/).filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 4);
}
```

## Implementation

### utils/providers.ts

Add the `getProviderInitials` function shown above.

### entrypoints/background.ts

Add badge update logic alongside the existing command listener:

1. **Helper function** `updateBadge(tabId: number)`:
   - Query tab URL via `browser.tabs.get(tabId)`
   - Call `extractGithubRepo(url)` — if null, clear badge and return
   - Read `pinnedProvider` and `customProviders` from storage
   - Resolve pinned provider name from merged list (with fallback)
   - Set badge text to `getProviderInitials(name)` and background color to `#22c55e`

2. **Listeners:**
   - `browser.tabs.onUpdated` — filter for `changeInfo.url` only (not `status === 'complete'`, which fires on every page load site-wide). When the URL changes, call `updateBadge(tabId)` for that tab regardless of whether it's the active tab — badge state is per-tab via the `tabId` parameter.
   - `browser.tabs.onActivated` — fires when user switches tabs. Call `updateBadge(activeInfo.tabId)` for the newly active tab.
   - `browser.storage.onChanged` — when `pinnedProvider` or `customProviders` changes, query **all** active tabs across all windows via `browser.tabs.query({ active: true })` and update badge for each. This handles multi-window scenarios correctly.

### Badge API calls

```ts
// Show badge
browser.action.setBadgeText({ text: initials, tabId });
browser.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });

// Clear badge
browser.action.setBadgeText({ text: '', tabId });
```

Using `tabId` parameter ensures badge state is per-tab (Chrome handles this natively).

## Files Changed

| File | Change |
|------|--------|
| `utils/providers.ts` | Add `getProviderInitials` function |
| `entrypoints/background.ts` | Add `updateBadge`, tab listeners, storage listener |

## Edge Cases

- **No pinned provider in storage:** Falls back to `pinnedByDefault` provider (same pattern as existing code)
- **Pinned provider is a deleted custom provider:** Falls back to default — badge shows default provider initials
- **Empty provider name (malformed custom provider):** `getProviderInitials("")` returns `""` → badge shows no text but still has green background. Acceptable degradation.
- **Tab URL not accessible (e.g. chrome:// pages):** `browser.tabs.get` may throw or return tab without URL → wrap in try/catch, clear badge on failure
- **Multiple windows:** `storage.onChanged` queries all active tabs via `browser.tabs.query({ active: true })` — each window's active tab gets updated
- **Rapid navigation:** `tabs.onUpdated` may fire multiple times; each call is idempotent (sets same badge state)
- **Non-repo GitHub paths** (e.g. `github.com/marketplace/actions`): `extractGithubRepo` matches any two-segment GitHub path, so these will show a badge. Accepted limitation — same as the content script button injection. The wiki service shows a 404, which is a clear signal.

## Non-goals

- No badge count (number)
- No custom badge colors per provider
- No CamelCase splitting for initials (too complex for tiny badge text)
