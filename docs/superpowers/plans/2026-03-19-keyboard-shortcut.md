# Keyboard Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Alt+W` keyboard shortcut to open the current GitHub repo in the pinned wiki provider.

**Architecture:** Background service worker listens for Chrome command events, reads the active tab URL, matches it against the GitHub repo pattern, resolves the pinned provider, and opens the wiki URL in a new tab. Requires fixing `readmex` provider's `navigator.language` usage which is unavailable in service workers.

**Tech Stack:** WXT (Manifest V3), TypeScript, Chrome Commands API, Chrome Tabs API

**Spec:** `docs/superpowers/specs/2026-03-19-keyboard-shortcut-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `utils/providers.ts` | Modify | Fix readmex `navigator.language` for service worker context |
| `wxt.config.ts` | Modify | Add `commands` declaration and `tabs` permission |
| `entrypoints/background.ts` | Create | Command listener → resolve provider → open tab |

---

### Task 1: Fix readmex provider for service worker context

The `readmex` provider calls `navigator.language` which throws in MV3 service workers. Wrap it in a try/catch with English fallback.

**Files:**
- Modify: `utils/providers.ts:33-39`

- [ ] **Step 1: Fix the readmex transform**

Replace the current readmex transform in `utils/providers.ts` (lines 33-39):

```ts
transform: (owner, repo) => {
  let isZh = false;
  try {
    isZh = navigator.language.startsWith('zh');
  } catch {
    // navigator.language unavailable in service worker — default to English
  }
  const prefix = isZh ? '' : 'en-US/';
  return `https://readmex.com/${prefix}${owner}/${repo}`;
},
```

- [ ] **Step 2: Verify the extension still builds**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add utils/providers.ts
git commit -m "fix: handle missing navigator.language in service worker for readmex provider"
```

---

### Task 2: Add manifest commands and tabs permission

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: Add `tabs` permission and `commands` to manifest**

Update `wxt.config.ts` to:

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'RepoWiki',
    description: 'Open any GitHub repo in DeepWiki, CodeWiki, and more',
    permissions: ['activeTab', 'storage', 'tabs'],
    action: {
      default_title: 'RepoWiki',
    },
    commands: {
      'open-pinned-wiki': {
        suggested_key: { default: 'Alt+W' },
        description: 'Open repo in pinned wiki provider',
      },
    },
  },
});
```

- [ ] **Step 2: Verify the extension still builds**

Run: `npm run build`
Expected: Build succeeds. Check `.output/chrome-mv3/manifest.json` contains the `commands` key and `tabs` in permissions.

- [ ] **Step 3: Commit**

```bash
git add wxt.config.ts
git commit -m "feat: add keyboard shortcut command and tabs permission to manifest"
```

---

### Task 3: Create background script with command listener

**Files:**
- Create: `entrypoints/background.ts`

- [ ] **Step 1: Create the background entrypoint**

Create `entrypoints/background.ts`:

```ts
import { PROVIDERS, extractGithubRepo } from '../utils/providers';

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-pinned-wiki') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const repoInfo = extractGithubRepo(tab.url);
    if (!repoInfo) return;

    // Resolve pinned provider with fallback (matches content script logic)
    let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
    try {
      const result = await browser.storage.sync.get('pinnedProvider');
      if (typeof result.pinnedProvider === 'string') {
        pinnedId = result.pinnedProvider;
      }
    } catch {
      // Fall back to default
    }

    const provider = PROVIDERS.find(p => p.id === pinnedId);
    if (!provider) return;

    const url = provider.transform(repoInfo.owner, repoInfo.repo);
    await browser.tabs.create({ url });
  });
});
```

Note: WXT auto-imports `defineBackground` and `browser` — no explicit imports needed for those.

- [ ] **Step 2: Verify the extension builds**

Run: `npm run build`
Expected: Build succeeds. Check `.output/chrome-mv3/manifest.json` contains `"background": { "service_worker": "..." }`.

- [ ] **Step 3: Manual smoke test**

1. Run `npm run dev` to start the dev server
2. Load the extension in Chrome (`chrome://extensions` → Load unpacked → `.output/chrome-mv3`)
3. **Important:** After any code change, click the reload (↻) button on the extension card in `chrome://extensions` — MV3 service workers do not hot-reload automatically
4. Navigate to any GitHub repo (e.g. `github.com/anthropics/claude-code`)
5. Press `Alt+W`
6. Expected: New tab opens with the pinned provider URL (default: DeepWiki)
7. Navigate to a non-repo page (e.g. `github.com/settings`)
8. Press `Alt+W`
9. Expected: Nothing happens

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: add keyboard shortcut to open repo in pinned wiki provider"
```
