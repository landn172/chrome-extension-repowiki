# Badge Status Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show pinned provider initials as a green badge on the extension icon when on a GitHub repo page.

**Architecture:** Add `getProviderInitials` helper to providers.ts. Background script gets an `updateBadge(tabId)` function and three listeners (tabs.onUpdated, tabs.onActivated, storage.onChanged) that trigger badge updates.

**Tech Stack:** WXT (Manifest V3), TypeScript, Chrome Action Badge API, Chrome Tabs API

**Spec:** `docs/superpowers/specs/2026-03-19-badge-status-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `utils/providers.ts` | Provider types and helpers | Modify — add `getProviderInitials` |
| `entrypoints/background.ts` | Service worker: commands + badge | Modify — add badge logic |

---

### Task 1: Add getProviderInitials to providers.ts

**Files:**
- Modify: `utils/providers.ts`

- [ ] **Step 1: Add the function**

Add at the end of `utils/providers.ts`:

```ts
export function getProviderInitials(name: string): string {
  return name.split(/\s+/).filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 4);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add utils/providers.ts
git commit -m "feat: add getProviderInitials helper for badge display"
```

---

### Task 2: Add badge update logic to background script

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Update imports**

Add `getProviderInitials` to the import line:

```ts
import { PROVIDERS, extractGithubRepo, mergeCustomProviders, getProviderInitials, type CustomProvider } from '../utils/providers';
```

- [ ] **Step 2: Add the updateBadge helper function**

Add inside the `defineBackground(() => { ... })` block, before the existing `browser.commands.onCommand` listener:

```ts
async function updateBadge(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) {
      await browser.action.setBadgeText({ text: '', tabId });
      return;
    }

    const repoInfo = extractGithubRepo(tab.url);
    if (!repoInfo) {
      await browser.action.setBadgeText({ text: '', tabId });
      return;
    }

    // Resolve pinned provider name
    let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
    let customList: CustomProvider[] = [];
    try {
      const result = await browser.storage.sync.get(['pinnedProvider', 'customProviders']);
      if (typeof result.pinnedProvider === 'string') {
        pinnedId = result.pinnedProvider;
      }
      if (Array.isArray(result.customProviders)) {
        customList = result.customProviders as CustomProvider[];
      }
    } catch {
      // Fall back to defaults
    }

    const allProviders = mergeCustomProviders(customList);
    const provider = allProviders.find(p => p.id === pinnedId)
      ?? allProviders.find(p => p.pinnedByDefault)
      ?? allProviders[0];

    const initials = getProviderInitials(provider?.name ?? '');
    await browser.action.setBadgeText({ text: initials, tabId });
    await browser.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
  } catch {
    // Tab may have been closed or URL inaccessible — clear badge silently
    try {
      await browser.action.setBadgeText({ text: '', tabId });
    } catch {
      // Tab no longer exists, nothing to do
    }
  }
}
```

- [ ] **Step 3: Add tab listeners**

Add after the `updateBadge` function, before the `browser.commands.onCommand` listener:

```ts
// Update badge when a tab's URL changes
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    updateBadge(tabId);
  }
});

// Update badge when user switches tabs
browser.tabs.onActivated.addListener((activeInfo) => {
  updateBadge(activeInfo.tabId);
});

// Update badge when pinned provider or custom providers change
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  if (!('pinnedProvider' in changes) && !('customProviders' in changes)) return;

  // Update all active tabs across all windows
  try {
    const tabs = await browser.tabs.query({ active: true });
    for (const tab of tabs) {
      if (tab.id != null) {
        updateBadge(tab.id);
      }
    }
  } catch {
    // Ignore query failures
  }
});
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

1. Run `npm run dev`
2. Load/reload extension in Chrome
3. Navigate to a GitHub repo (e.g. `github.com/facebook/react`)
4. Expected: Extension icon shows green badge with "D" (for DeepWiki, the default pinned provider)
5. Navigate to `google.com`
6. Expected: Badge disappears
7. Open popup, change pinned provider to CodeWiki
8. Navigate back to a GitHub repo
9. Expected: Badge shows "C"
10. Switch between a repo tab and a non-repo tab
11. Expected: Badge appears/disappears accordingly

- [ ] **Step 6: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: show pinned provider badge on GitHub repo pages"
```
