# RepoWiki Pin & UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned-provider feature (pin lives in the GitHub page dropdown; SVG icon via DOM API; writes to `storage.sync`) and redesign the popup to Design C (pinned button + provider list with enable toggles only).

**Architecture:** Four files change: `utils/providers.ts` adds `pinnedByDefault`; `entrypoints/content.ts` replaces the single dropdown button with a split-button group and adds per-row SVG pin buttons inside the dropdown; `entrypoints/popup/index.html` is fully replaced with the Design C layout; `entrypoints/popup/main.ts` is rewritten to render a pinned-provider button and toggle-only provider rows. Both surfaces share the `pinnedProvider` key in `browser.storage.sync`.

**Tech Stack:** WXT 0.20.20, TypeScript 5.9.3, Manifest V3, `browser.storage.sync`, SVG created via `createElementNS` (no innerHTML).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `utils/providers.ts` | Modify | Add `pinnedByDefault` field; set all `enabledByDefault: true` |
| `entrypoints/content.ts` | Rewrite | Split-button injection (Cases A/B/C/D) + dropdown with SVG pin icons |
| `entrypoints/popup/index.html` | Rewrite | Design C HTML/CSS skeleton |
| `entrypoints/popup/main.ts` | Rewrite | Pinned button render + toggle-only provider rows |

---

## Context for Implementers

### WXT auto-globals
In WXT entrypoint files (`entrypoints/`), `browser` and `defineContentScript` are auto-imported globals — no import needed. In `utils/` files, they are plain TypeScript.

### Storage shape
```
enabledProviders: Record<string, boolean>   // e.g. { deepwiki: true, zread: false }
pinnedProvider:   string                    // e.g. 'deepwiki'
```
Default pinnedProvider fallback: `PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id`.

### Build command
```bash
cd /Users/jy/github-landn172/chrome-extension-deepwiki
npm run build
```
Expected: exits 0, outputs to `.output/chrome-mv3/`.

### DOM safety rule
Never use `innerHTML` or `outerHTML`. Use `textContent` for text, `createElementNS` for SVG, and `replaceChildren()` or `removeChild` loops for clearing containers.

---

## Task 1: Update `utils/providers.ts`

**Files:**
- Modify: `utils/providers.ts`

- [ ] **Step 1: Open the file**

Read `utils/providers.ts`. Current state: `WikiProvider` interface has `id`, `name`, `transform`, `enabledByDefault`. All providers exist; only `deepwiki` has `enabledByDefault: true`.

- [ ] **Step 2: Replace the file content**

Replace the entire file with:

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

/**
 * Extracts the first two path segments (owner, repo) from a GitHub URL.
 * Returns null for non-GitHub URLs or URLs with fewer than two path segments.
 * Sub-paths, query strings, and hash fragments are ignored —
 * `[^/?#]+` stops at `/`, `?`, and `#` so no extra sanitization needed.
 *
 * Note: does not validate that the path is a real repository (e.g. github.com/marketplace/actions
 * would match). Callers rely on the content script's `matches` pattern to gate non-repo pages.
 *
 * @example
 * extractGithubRepo('https://github.com/facebook/react/issues/42?q=bug')
 * // → { owner: 'facebook', repo: 'react' }
 */
export function extractGithubRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/jy/github-landn172/chrome-extension-deepwiki && npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add utils/providers.ts
git commit -m "feat: add pinnedByDefault field; all providers enabled by default"
```

---

## Task 2: Rewrite `entrypoints/content.ts`

**Files:**
- Modify: `entrypoints/content.ts`

### What changes
The current script injects a single "Wiki ▾" button with a plain dropdown. The new version:

1. Reads `enabledProviders` **and** `pinnedProvider` in one storage call.
2. Resolves `pinnedId` with fallback to `pinnedByDefault`.
3. Injects a split-button group (Cases A/B/C/D).
4. Dropdown rows: provider name (click → open) + SVG pin icon button (click → write storage → re-inject).
5. New CSS replaces `repowiki-wrapper` with `repowiki-group` and adds pin button styles.
6. All SVG created with `createElementNS` — no `innerHTML`.

### Cases
- **A**: pinned enabled AND other enabled providers exist → `[PinnedName ↗][▾]`; dropdown shows ALL enabled with pin icons
- **B**: pinned enabled AND no others → `[PinnedName ↗]` only (no chevron, no dropdown)
- **C**: pinned disabled AND other providers enabled → `[Wiki ▾]`; dropdown shows all enabled with pin icons
- **D**: no providers enabled → skip injection

### SVG pin icon (createElementNS — no innerHTML)

```typescript
function createPinSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M17 4v7l2 3H5l2-3V4h10zm-5 16c-1.1 0-2-.9-2-2h4a2 2 0 01-2 2zM7 2h10v2H7V2z');
  svg.appendChild(path);
  return svg;
}
```

- [ ] **Step 1: Replace `entrypoints/content.ts` entirely**

```typescript
import { PROVIDERS, extractGithubRepo } from '../utils/providers';

export default defineContentScript({
  matches: ['https://github.com/*/*'],

  async main(ctx) {
    const BUTTON_ATTR = 'data-repowiki-btn';

    // Load enabledProviders and pinnedProvider in a single call
    let enabledMap: Record<string, boolean> = {};
    let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
    try {
      const result = await browser.storage.sync.get(['enabledProviders', 'pinnedProvider']);
      const stored = result.enabledProviders;
      if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
        enabledMap = stored as Record<string, boolean>;
      }
      if (typeof result.pinnedProvider === 'string') {
        pinnedId = result.pinnedProvider;
      }
    } catch {
      // Fall back to defaults
    }

    function isEnabled(id: string, defaultVal: boolean): boolean {
      return id in enabledMap ? enabledMap[id] : defaultVal;
    }

    function injectStyles(): void {
      if (document.getElementById('repowiki-styles')) return;
      const style = document.createElement('style');
      style.id = 'repowiki-styles';
      style.textContent = `
        .repowiki-group {
          display: inline-flex;
          position: relative;
          border: 1px solid rgba(31,35,40,.15);
          border-radius: 6px;
          overflow: visible;
        }
        .repowiki-primary {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px;
          background: #f6f8fa;
          border: none; border-right: 1px solid rgba(31,35,40,.15);
          border-radius: 5px 0 0 5px;
          font-size: 12px; color: #24292f; cursor: pointer;
          font-family: inherit; white-space: nowrap; line-height: 20px;
        }
        .repowiki-primary:hover { background: #e8ecf0; }
        .repowiki-chevron {
          display: inline-flex; align-items: center;
          padding: 3px 7px;
          background: #f6f8fa;
          border: none; border-radius: 0 5px 5px 0;
          font-size: 10px; color: #24292f; cursor: pointer; line-height: 20px;
        }
        .repowiki-chevron:hover { background: #e8ecf0; }
        .repowiki-chevron-only {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px;
          background: #f6f8fa;
          border: none; border-radius: 5px;
          font-size: 12px; color: #24292f; cursor: pointer;
          font-family: inherit; line-height: 20px;
        }
        .repowiki-chevron-only:hover { background: #e8ecf0; }
        .repowiki-dropdown {
          position: absolute;
          top: calc(100% + 4px); left: 0;
          z-index: 1000;
          background: #fff;
          border: 1px solid #d0d7de;
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(140,149,159,.2);
          min-width: 160px; padding: 4px 0;
          margin: 0; list-style: none;
        }
        .repowiki-dropdown-item {
          display: flex; align-items: center;
          padding: 6px 12px; gap: 8px;
        }
        .repowiki-dropdown-item:hover { background: #f6f8fa; }
        .repowiki-item-name {
          font-size: 13px; color: #24292f; flex: 1;
          white-space: nowrap; cursor: pointer;
        }
        .repowiki-pin-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px;
          border-radius: 4px; border: 1px solid transparent;
          background: transparent; cursor: pointer;
          color: #9ca3af; padding: 0; flex-shrink: 0;
        }
        .repowiki-pin-btn:hover { background: #f0f2f5; color: #374151; border-color: #e2e8f0; }
        .repowiki-pin-btn.active { color: #24292f; background: #f1f5f9; border-color: #e2e8f0; }
      `;
      document.head.appendChild(style);
    }

    function createPinSvg(): SVGSVGElement {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '12');
      svg.setAttribute('height', '12');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'currentColor');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M17 4v7l2 3H5l2-3V4h10zm-5 16c-1.1 0-2-.9-2-2h4a2 2 0 01-2 2zM7 2h10v2H7V2z'
      );
      svg.appendChild(path);
      return svg;
    }

    function buildDropdown(
      providers: readonly (typeof PROVIDERS)[number][],
      repoInfo: { owner: string; repo: string }
    ): HTMLUListElement {
      const dropdown = document.createElement('ul');
      dropdown.className = 'repowiki-dropdown';
      dropdown.style.display = 'none';

      for (const provider of providers) {
        const item = document.createElement('li');
        item.className = 'repowiki-dropdown-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'repowiki-item-name';
        nameSpan.textContent = provider.name;
        nameSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(
            provider.transform(repoInfo.owner, repoInfo.repo),
            '_blank',
            'noopener,noreferrer'
          );
          dropdown.style.display = 'none';
        });

        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'repowiki-pin-btn' + (provider.id === pinnedId ? ' active' : '');
        pinBtn.appendChild(createPinSvg());
        pinBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (provider.id === pinnedId) return;
          try {
            await browser.storage.sync.set({ pinnedProvider: provider.id });
            pinnedId = provider.id;
            reInjectButton();
          } catch {
            // no revert
          }
        });

        item.appendChild(nameSpan);
        item.appendChild(pinBtn);
        dropdown.appendChild(item);
      }

      return dropdown;
    }

    function reInjectButton(): void {
      document.querySelector(`[${BUTTON_ATTR}]`)?.remove();
      injectButton();
    }

    function injectButton(): void {
      if (document.querySelector(`[${BUTTON_ATTR}]`)) return;

      const repoInfo = extractGithubRepo(location.href);
      if (!repoInfo) return;

      const actionsContainer = document.querySelector('.pagehead-actions');
      if (!actionsContainer) return;

      const enabledProviders = PROVIDERS.filter(p => isEnabled(p.id, p.enabledByDefault));
      if (enabledProviders.length === 0) return; // Case D

      injectStyles();

      const pinnedProvider = PROVIDERS.find(p => p.id === pinnedId);
      const pinnedIsEnabled = pinnedProvider
        ? isEnabled(pinnedProvider.id, pinnedProvider.enabledByDefault)
        : false;
      const othersExist = enabledProviders.some(p => p.id !== pinnedId);

      const li = document.createElement('li');
      li.setAttribute(BUTTON_ATTR, '1');

      const group = document.createElement('div');
      group.className = 'repowiki-group';

      if (pinnedIsEnabled && othersExist) {
        // Case A: split button
        const primaryBtn = document.createElement('button');
        primaryBtn.type = 'button';
        primaryBtn.className = 'repowiki-primary';
        primaryBtn.textContent = `${pinnedProvider!.name} ↗`;
        primaryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(
            pinnedProvider!.transform(repoInfo.owner, repoInfo.repo),
            '_blank',
            'noopener,noreferrer'
          );
        });

        const chevronBtn = document.createElement('button');
        chevronBtn.type = 'button';
        chevronBtn.className = 'repowiki-chevron';
        chevronBtn.textContent = '▾';

        const dropdown = buildDropdown(enabledProviders, repoInfo);
        chevronBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        group.appendChild(primaryBtn);
        group.appendChild(chevronBtn);
        group.appendChild(dropdown);
      } else if (pinnedIsEnabled && !othersExist) {
        // Case B: primary only — override border-right/radius since no chevron follows
        const primaryBtn = document.createElement('button');
        primaryBtn.type = 'button';
        primaryBtn.className = 'repowiki-primary';
        primaryBtn.style.borderRight = 'none';
        primaryBtn.style.borderRadius = '5px';
        primaryBtn.textContent = `${pinnedProvider!.name} ↗`;
        primaryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(
            pinnedProvider!.transform(repoInfo.owner, repoInfo.repo),
            '_blank',
            'noopener,noreferrer'
          );
        });

        group.appendChild(primaryBtn);
      } else {
        // Case C: chevron-only (pinned is disabled, others exist)
        const chevronOnlyBtn = document.createElement('button');
        chevronOnlyBtn.type = 'button';
        chevronOnlyBtn.className = 'repowiki-chevron-only';
        chevronOnlyBtn.textContent = 'Wiki ▾';

        const dropdown = buildDropdown(enabledProviders, repoInfo);
        chevronOnlyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        group.appendChild(chevronOnlyBtn);
        group.appendChild(dropdown);
      }

      li.appendChild(group);
      actionsContainer.insertBefore(li, actionsContainer.firstChild);
    }

    const closeDropdown = () => {
      document.querySelector<HTMLUListElement>(`[${BUTTON_ATTR}] .repowiki-dropdown`)
        ?.style.setProperty('display', 'none');
    };
    document.addEventListener('click', closeDropdown);

    function observeAndInject(): MutationObserver {
      injectButton();

      const header = document.querySelector('header') ?? document.body;
      let observer: MutationObserver;
      observer = new MutationObserver(() => {
        if (!document.querySelector(`[${BUTTON_ATTR}]`)) {
          observer.disconnect();
          try {
            injectButton();
          } finally {
            observer.observe(header, { childList: true, subtree: true });
          }
        }
      });

      observer.observe(header, { childList: true, subtree: true });
      return observer;
    }

    let currentUrl = location.href;
    let activeObserver = observeAndInject();

    function onUrlChange(): void {
      if (location.href === currentUrl) return;
      currentUrl = location.href;
      activeObserver.disconnect();
      activeObserver = observeAndInject();
    }

    const origPushState = history.pushState.bind(history);
    history.pushState = function (
      ...args: Parameters<typeof history.pushState>
    ): void {
      origPushState(...args);
      onUrlChange();
    };

    ctx.addEventListener(window, 'popstate', onUrlChange);
    ctx.onInvalidated(() => {
      history.pushState = origPushState;
      activeObserver.disconnect();
      document.removeEventListener('click', closeDropdown);
      document.getElementById('repowiki-styles')?.remove();
    });
  },
});
```

- [ ] **Step 2: Build to verify TypeScript**

```bash
cd /Users/jy/github-landn172/chrome-extension-deepwiki && npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat: split-button injection with dropdown pin (SVG icon, createElementNS)"
```

---

## Task 3: Rewrite `entrypoints/popup/index.html`

**Files:**
- Rewrite: `entrypoints/popup/index.html`

Remove the old design (links-section, not-repo-msg, all-disabled-msg, hr, settings-section). Replace with Design C.

- [ ] **Step 1: Replace `entrypoints/popup/index.html` entirely**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RepoWiki</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      width: 280px;
      background: #fff;
    }
    #header {
      padding: 14px 16px 12px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .title-row { display: flex; align-items: center; gap: 7px; }
    .logo {
      width: 22px; height: 22px;
      background: #0f172a; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: white; font-weight: 700; flex-shrink: 0;
    }
    .title { font-size: 14px; font-weight: 700; color: #0f172a; }
    #repo-chip {
      font-size: 10px; color: #64748b;
      background: #f1f5f9; border-radius: 20px;
      padding: 3px 8px; border: 1px solid #e2e8f0;
      max-width: 110px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    #pinned-btn {
      margin: 0 12px 14px;
      display: flex; align-items: center; gap: 10px;
      background: #0f172a; border-radius: 10px;
      padding: 12px 14px; cursor: pointer;
    }
    .pinned-name { font-size: 13px; font-weight: 600; color: white; flex: 1; }
    .pinned-sub { font-size: 11px; color: rgba(255,255,255,.45); margin-top: 1px; }
    .open-icon { font-size: 15px; color: rgba(255,255,255,.6); }
    .divider { height: 1px; background: #f1f5f9; margin: 0 12px 10px; }
    #providers-section { padding: 0 12px 14px; }
    .section-label {
      font-size: 10px; font-weight: 600; color: #94a3b8;
      text-transform: uppercase; letter-spacing: .07em; margin-bottom: 6px;
    }
    .provider-row {
      display: flex; align-items: center;
      padding: 5px 6px; border-radius: 7px; gap: 8px;
    }
    .provider-row:hover { background: #f8fafc; }
    .p-name { font-size: 12px; color: #374151; flex: 1; font-weight: 500; }
    .toggle {
      width: 28px; height: 16px;
      background: #e2e8f0; border-radius: 8px;
      position: relative; cursor: pointer; flex-shrink: 0;
    }
    .toggle.on { background: #0f172a; }
    .toggle::after {
      content: '';
      position: absolute; top: 2px; left: 2px;
      width: 12px; height: 12px;
      background: white; border-radius: 50%;
      transition: left .15s;
    }
    .toggle.on::after { left: 14px; }
  </style>
</head>
<body>
  <div id="header">
    <div class="title-row">
      <div class="logo">R</div>
      <span class="title">RepoWiki</span>
    </div>
    <span id="repo-chip" style="display:none"></span>
  </div>

  <div id="pinned-btn"></div>

  <div class="divider"></div>

  <div id="providers-section"></div>

  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/jy/github-landn172/chrome-extension-deepwiki && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/popup/index.html
git commit -m "feat: popup Design C HTML/CSS skeleton"
```

---

## Task 4: Rewrite `entrypoints/popup/main.ts`

**Files:**
- Rewrite: `entrypoints/popup/main.ts`

### What changes
- Load `enabledProviders` + `pinnedProvider` in a single `browser.storage.sync.get` call
- `defaultPinnedId` at **module scope** (needed by the `.catch` handler outside `main()`)
- Module-level `renderDimmedPinnedBtn()` for the catch fallback — renders the pinned button in dimmed/inactive state
- `renderPinnedBtn(repoInfo, pinnedId)` defined inside `main()` — renders active or dimmed state; uses `replaceChildren()` to clear previous content (no innerHTML)
- Provider rows: provider name + toggle div only — **no pin button**
- Toggle write-then-mutate: write → update `enabledMap` → flip toggle class on success; on failure `enabledMap` unchanged so `isEnabled` returns the old value, and the toggle class is reverted manually

- [ ] **Step 1: Replace `entrypoints/popup/main.ts` entirely**

```typescript
import { PROVIDERS, extractGithubRepo } from '../../utils/providers';

const defaultPinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;

function renderDimmedPinnedBtn(): void {
  const container = document.getElementById('pinned-btn') as HTMLDivElement | null;
  if (!container) return;

  const provider = PROVIDERS.find(p => p.id === defaultPinnedId);

  const inner = document.createElement('div');
  inner.style.flex = '1';

  const nameEl = document.createElement('div');
  nameEl.className = 'pinned-name';
  nameEl.textContent = provider?.name ?? '';

  const subEl = document.createElement('div');
  subEl.className = 'pinned-sub';
  subEl.textContent = 'Open a GitHub repo to use';

  inner.appendChild(nameEl);
  inner.appendChild(subEl);

  const icon = document.createElement('span');
  icon.className = 'open-icon';
  icon.textContent = '↗';

  container.replaceChildren(inner, icon);
  container.style.opacity = '0.3';
  container.style.pointerEvents = 'none';
}

async function main(): Promise<void> {
  let enabledMap: Record<string, boolean> = {};
  let pinnedId: string = defaultPinnedId;

  try {
    const result = await browser.storage.sync.get(['enabledProviders', 'pinnedProvider']);
    const stored = result.enabledProviders;
    if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
      enabledMap = stored as Record<string, boolean>;
    }
    if (typeof result.pinnedProvider === 'string') {
      pinnedId = result.pinnedProvider;
    }
  } catch {
    // Fall back to defaults
  }

  function isEnabled(id: string): boolean {
    const provider = PROVIDERS.find(p => p.id === id);
    return id in enabledMap ? enabledMap[id] : (provider?.enabledByDefault ?? false);
  }

  // Query active tab
  let repoInfo: { owner: string; repo: string } | null = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    repoInfo = tab?.url ? extractGithubRepo(tab.url) : null;
  } catch {
    // repoInfo stays null
  }

  // Render repo chip
  const repoChip = document.getElementById('repo-chip') as HTMLSpanElement;
  if (repoInfo) {
    repoChip.textContent = `${repoInfo.owner}/${repoInfo.repo}`;
    repoChip.style.display = 'inline';
  }

  function renderPinnedBtn(
    info: { owner: string; repo: string } | null,
    id: string
  ): void {
    const container = document.getElementById('pinned-btn') as HTMLDivElement;

    // Reset inline styles from previous render
    container.style.opacity = '';
    container.style.pointerEvents = '';
    // Remove all previous click listeners by replacing the node with a clone
    const fresh = container.cloneNode(false) as HTMLDivElement;
    container.parentNode!.replaceChild(fresh, container);

    const provider = PROVIDERS.find(p => p.id === id);
    const isActive = !!info && !!provider && isEnabled(id);

    const inner = document.createElement('div');
    inner.style.flex = '1';

    const nameEl = document.createElement('div');
    nameEl.className = 'pinned-name';
    nameEl.textContent = provider?.name ?? '';

    const subEl = document.createElement('div');
    subEl.className = 'pinned-sub';
    if (!info) {
      subEl.textContent = 'Open a GitHub repo to use';
    } else if (!isEnabled(id)) {
      subEl.textContent = 'Pinned provider is disabled';
    } else {
      subEl.textContent = 'Pinned · tap to open';
    }

    inner.appendChild(nameEl);
    inner.appendChild(subEl);

    const icon = document.createElement('span');
    icon.className = 'open-icon';
    icon.textContent = '↗';

    fresh.appendChild(inner);
    fresh.appendChild(icon);

    if (isActive && info && provider) {
      const url = provider.transform(info.owner, info.repo);
      fresh.addEventListener('click', async () => {
        try {
          await browser.tabs.create({ url });
          window.close();
        } catch {
          // stay open on failure
        }
      });
    } else {
      fresh.style.opacity = '0.3';
      fresh.style.pointerEvents = 'none';
    }
  }

  renderPinnedBtn(repoInfo, pinnedId);

  // Render providers section
  const section = document.getElementById('providers-section') as HTMLDivElement;

  const labelEl = document.createElement('div');
  labelEl.className = 'section-label';
  labelEl.textContent = 'Providers';
  section.appendChild(labelEl);

  for (const provider of PROVIDERS) {
    const row = document.createElement('div');
    row.className = 'provider-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'p-name';
    nameSpan.textContent = provider.name;

    const toggle = document.createElement('div');
    toggle.className = 'toggle' + (isEnabled(provider.id) ? ' on' : '');
    toggle.addEventListener('click', async () => {
      const newValue = !isEnabled(provider.id);
      try {
        await browser.storage.sync.set({
          enabledProviders: { ...enabledMap, [provider.id]: newValue },
        });
        enabledMap[provider.id] = newValue;
        toggle.classList.toggle('on', newValue);
      } catch {
        // Write failed — revert toggle visual (enabledMap unchanged)
        toggle.classList.toggle('on', !newValue);
      }
      renderPinnedBtn(repoInfo, pinnedId);
    });

    row.appendChild(nameSpan);
    row.appendChild(toggle);
    section.appendChild(row);
  }
}

main().catch(renderDimmedPinnedBtn);
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/jy/github-landn172/chrome-extension-deepwiki && npm run build
```

Expected: exits 0, no TypeScript errors. Check `.output/chrome-mv3/` exists.

- [ ] **Step 3: Confirm output**

```bash
ls -lh /Users/jy/github-landn172/chrome-extension-deepwiki/.output/chrome-mv3/
```

Expected: content script JS and popup JS both present.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup/main.ts
git commit -m "feat: popup main.ts — pinned button, toggle-only rows, no popup pin"
```

---

## Verification Checklist

After all four tasks are committed:

- [ ] `npm run build` exits 0
- [ ] `.output/chrome-mv3/manifest.json` — `permissions` includes `storage`
- [ ] **GitHub page Case A**: `[DeepWiki ↗][▾]` split button visible; click `▾` → dropdown shows all 4 providers, each with thumbtack SVG icon; click a non-active thumbtack → left button text updates to that provider name; click the active provider name in dropdown → opens URL in new tab
- [ ] **GitHub page Case B**: disable all but one provider in popup → single `[ProviderName ↗]` button, no `▾`
- [ ] **GitHub page Case C**: disable DeepWiki toggle in popup → single `[Wiki ▾]` button
- [ ] **GitHub page Case D**: disable all providers → button disappears entirely
- [ ] **Popup on repo page**: black `#pinned-btn` is clickable (not dimmed); repo chip shows `owner/repo`; provider rows show name + toggle only (no pin icon)
- [ ] **Popup not on repo page**: `#pinned-btn` is dimmed (opacity 0.3); repo chip hidden; toggles still work
- [ ] **Popup toggle off a provider**: toggle class flips immediately; `renderPinnedBtn` re-evaluates and dims if pinned provider was just disabled
