# Keyboard Shortcut Support

**Date:** 2026-03-19
**Status:** Approved

## Summary

Add a keyboard shortcut (`Alt+W` by default) that opens the current GitHub repo in the user's pinned wiki provider. Users can customize the shortcut via `chrome://extensions/shortcuts`.

## Behavior

1. User presses the shortcut on any page
2. Extension checks if the active tab URL matches a GitHub repo pattern (`github.com/:owner/:repo`)
3. If yes: reads pinned provider from storage, opens the provider URL in a new tab
4. If no: does nothing (no error, no popup)

## Implementation

### 1. Manifest changes (`wxt.config.ts`)

Add `commands` to the manifest config and add `tabs` permission (required to read `tab.url` from a command handler — `activeTab` alone only covers popup/action gestures):

```ts
permissions: ['activeTab', 'storage', 'tabs'],
commands: {
  'open-pinned-wiki': {
    suggested_key: { default: 'Alt+W' },
    description: 'Open repo in pinned wiki provider',
  },
},
```

### 2. Background script (`entrypoints/background.ts`)

New WXT background entrypoint:

```ts
export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-pinned-wiki') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const repoInfo = extractGithubRepo(tab.url);
    if (!repoInfo) return;

    // Fallback: pinnedByDefault → first provider
    const result = await browser.storage.sync.get('pinnedProvider');
    const pinnedId = typeof result.pinnedProvider === 'string'
      ? result.pinnedProvider
      : (PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id);

    const provider = PROVIDERS.find(p => p.id === pinnedId);
    if (!provider) return;

    const url = provider.transform(repoInfo.owner, repoInfo.repo);
    await browser.tabs.create({ url });
  });
});
```

### 3. Readmex `navigator.language` issue

`navigator.language` is **not available** in MV3 service workers. The `readmex` provider's `transform()` calls `navigator.language` which will throw in the background context.

**Fix:** Refactor the readmex transform to accept an optional language parameter, or use a try/catch with a sensible fallback (default to English prefix). This is a localized fix in `utils/providers.ts`.

## Files changed

| File | Change |
|------|--------|
| `wxt.config.ts` | Add `commands` + `tabs` permission |
| `entrypoints/background.ts` | New file — command listener |
| `utils/providers.ts` | Fix readmex transform for service worker context |

## Edge cases

- **Fresh install (no `pinnedProvider` in storage):** Falls back to `pinnedByDefault` provider, matching content script behavior
- **Stored provider ID no longer exists:** `PROVIDERS.find()` returns undefined → early return, no action
- **Non-repo GitHub paths** (e.g. `/settings`, `/marketplace`): `extractGithubRepo` will match any two-segment path. Acceptable — the wiki service will show a 404, same as the content script button. Not worth a denylist for v1.
- **`Alt+W` conflicts:** Users on Linux or apps that use `Alt+W` can remap via `chrome://extensions/shortcuts`

## Non-goals

- No popup or notification on non-repo pages
- No custom shortcut UI in the popup (Chrome handles this natively)
- No shortcut to open a specific (non-pinned) provider
