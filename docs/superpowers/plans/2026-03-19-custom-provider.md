# Custom Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to add, enable/disable, pin, and delete custom wiki providers via URL templates.

**Architecture:** Add `CustomProvider` type and merge helper to `utils/providers.ts`. Each consumer (popup, content script, background script) reads `customProviders` from storage, merges with built-in providers via `mergeCustomProviders()`, and uses the merged list for all lookups. Popup gets an inline add form and delete buttons.

**Tech Stack:** WXT (Manifest V3), TypeScript, Chrome Storage Sync API

**Spec:** `docs/superpowers/specs/2026-03-19-custom-provider-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `utils/providers.ts` | Provider types, built-in list, URL extraction, custom provider helpers | Modify |
| `entrypoints/popup/index.html` | Popup HTML structure and CSS styles | Modify |
| `entrypoints/popup/main.ts` | Popup logic: rendering, form, storage interaction | Modify |
| `entrypoints/content.ts` | GitHub page button injection | Modify |
| `entrypoints/background.ts` | Keyboard shortcut handler | Modify |

---

### Task 1: Add CustomProvider type and merge helper to providers.ts

**Files:**
- Modify: `utils/providers.ts`

- [ ] **Step 1: Add the CustomProvider interface and helper functions**

Add after the `PROVIDERS` array (after line 41):

```ts
export interface CustomProvider {
  id: string;
  name: string;
  urlTemplate: string;
}

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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add utils/providers.ts
git commit -m "feat: add CustomProvider type and mergeCustomProviders helper"
```

---

### Task 2: Add popup styles for form, delete button, and error message

**Files:**
- Modify: `entrypoints/popup/index.html`

- [ ] **Step 1: Add CSS styles**

Add before the closing `</style>` tag (before line 68):

```css
/* Add custom provider row */
.add-row {
  display: flex; align-items: center;
  padding: 5px 6px; border-radius: 7px; gap: 6px;
  cursor: pointer; color: #94a3b8;
}
.add-row:hover { background: #f8fafc; }
.add-icon { font-size: 16px; font-weight: 300; }
.add-text { font-size: 12px; font-weight: 500; }

/* Inline add form */
.add-form {
  margin: 4px 0 0; padding: 10px 12px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
}
.add-form-label {
  font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 8px;
}
.add-form input {
  width: 100%; padding: 6px 8px;
  border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 12px; background: white; outline: none;
  box-sizing: border-box; margin-bottom: 6px;
  font-family: inherit;
}
.add-form input.mono { font-family: monospace; }
.add-form-error {
  font-size: 11px; color: #ef4444; margin-bottom: 6px; display: none;
}
.add-form-actions {
  display: flex; gap: 6px; justify-content: flex-end;
}
.add-form-actions button {
  padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer;
}
.btn-cancel {
  border: 1px solid #e2e8f0; background: white; color: #64748b;
}
.btn-add {
  border: none; background: #0f172a; color: white;
}
.btn-add:disabled {
  opacity: 0.4; cursor: not-allowed;
}

/* Delete button for custom providers */
.delete-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 4px;
  border: none; background: transparent; cursor: pointer;
  color: #94a3b8; font-size: 13px; padding: 0; flex-shrink: 0;
}
.delete-btn:hover { background: #fee2e2; color: #ef4444; }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/popup/index.html
git commit -m "feat: add popup styles for custom provider form and delete button"
```

---

### Task 3: Add custom provider UI to popup main.ts

This is the largest task. The popup must read/write `customProviders`, render custom provider rows with delete buttons, and show an inline add form.

**Files:**
- Modify: `entrypoints/popup/main.ts`

- [ ] **Step 1: Update imports and add storage helpers**

Replace line 1:

```ts
import { PROVIDERS, extractGithubRepo } from '../../utils/providers';
```

With:

```ts
import { PROVIDERS, extractGithubRepo, mergeCustomProviders, type WikiProvider, type CustomProvider } from '../../utils/providers';
```

- [ ] **Step 2: Add helper to read custom providers from storage**

After the `defaultPinnedId` line (line 3), add:

```ts
async function loadCustomProviders(): Promise<CustomProvider[]> {
  try {
    const result = await browser.storage.sync.get('customProviders');
    const stored = result.customProviders;
    if (Array.isArray(stored)) return stored as CustomProvider[];
  } catch { /* ignore */ }
  return [];
}
```

- [ ] **Step 3: Update main() to load and merge custom providers**

Inside `main()`, after reading `enabledMap` and `pinnedId` from storage (after line 49), add:

```ts
const customProviders: CustomProvider[] = await loadCustomProviders();
let allProviders: WikiProvider[] = mergeCustomProviders(customProviders);
```

Note: `customProviders` is `const` but its contents are mutated in-place via `.push()` and `.length = 0` + `.push(...)` by the add/delete handlers. `allProviders` is `let` because it's reassigned after mutations.

- [ ] **Step 4: Update isEnabled to use allProviders**

Replace the existing `isEnabled` function:

```ts
function isEnabled(id: string): boolean {
  const provider = PROVIDERS.find(p => p.id === id);
  return id in enabledMap ? enabledMap[id] : (provider?.enabledByDefault ?? false);
}
```

With:

```ts
function isEnabled(id: string): boolean {
  const provider = allProviders.find(p => p.id === id);
  return id in enabledMap ? enabledMap[id] : (provider?.enabledByDefault ?? false);
}
```

- [ ] **Step 5: Update renderPinnedBtn to use allProviders**

In the `renderPinnedBtn` function, replace:

```ts
const provider = PROVIDERS.find(p => p.id === id);
```

With:

```ts
const provider = allProviders.find(p => p.id === id);
```

- [ ] **Step 6: Update provider list rendering to use allProviders with delete buttons**

Replace the provider list rendering loop (the `for (const provider of PROVIDERS)` block, approximately lines 141-169) with:

```ts
function renderProviderList(): void {
  // Clear existing rows (keep label)
  while (section.children.length > 1) {
    section.removeChild(section.lastChild!);
  }

  for (const provider of allProviders) {
    const row = document.createElement('div');
    row.className = 'provider-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'p-name';
    nameSpan.textContent = provider.name;

    // Delete button for custom providers only
    const isCustom = !PROVIDERS.some(p => p.id === provider.id);
    if (isCustom) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '\u00d7';
      deleteBtn.addEventListener('click', async () => {
        const updated = customProviders.filter(cp => cp.id !== provider.id);
        try {
          await browser.storage.sync.set({ customProviders: updated });
          customProviders.length = 0;
          customProviders.push(...updated);
          allProviders = mergeCustomProviders(customProviders);
          renderProviderList();
          renderPinnedBtn(repoInfo, pinnedId);
        } catch { /* ignore */ }
      });
      row.appendChild(nameSpan);
      row.appendChild(deleteBtn);
    } else {
      row.appendChild(nameSpan);
    }

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
        toggle.classList.toggle('on', !newValue);
      }
      renderPinnedBtn(repoInfo, pinnedId);
    });

    row.appendChild(toggle);
    section.appendChild(row);
  }

  // Add the "+" row and form
  renderAddRow();
}
```

- [ ] **Step 7: Add the inline add form**

After `renderProviderList`, add:

```ts
function renderAddRow(): void {
  // Remove existing add row/form if any
  section.querySelector('.add-row')?.remove();
  section.querySelector('.add-form')?.remove();

  const addRow = document.createElement('div');
  addRow.className = 'add-row';

  const addIcon = document.createElement('span');
  addIcon.className = 'add-icon';
  addIcon.textContent = '+';
  const addText = document.createElement('span');
  addText.className = 'add-text';
  addText.textContent = 'Add custom provider';
  addRow.appendChild(addIcon);
  addRow.appendChild(addText);

  const form = document.createElement('div');
  form.className = 'add-form';
  form.style.display = 'none';

  addRow.addEventListener('click', () => {
    addRow.style.display = 'none';
    form.style.display = 'block';
    nameInput.focus();
  });

  const label = document.createElement('div');
  label.className = 'add-form-label';
  label.textContent = 'Add Custom Provider';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Name (e.g. My Wiki)';
  nameInput.maxLength = 40;

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'https://wiki.com/{owner}/{repo}';
  urlInput.className = 'mono';

  const errorEl = document.createElement('div');
  errorEl.className = 'add-form-error';

  const actions = document.createElement('div');
  actions.className = 'add-form-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    form.style.display = 'none';
    addRow.style.display = '';
    nameInput.value = '';
    urlInput.value = '';
    errorEl.style.display = 'none';
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-add';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();

    // Validate
    if (!name) {
      errorEl.textContent = 'Name is required';
      errorEl.style.display = 'block';
      return;
    }
    if (name.length > 40) {
      errorEl.textContent = 'Name must be 40 characters or less';
      errorEl.style.display = 'block';
      return;
    }
    if (!/^https?:\/\//.test(url)) {
      errorEl.textContent = 'URL must start with https:// or http://';
      errorEl.style.display = 'block';
      return;
    }
    if (!url.includes('{owner}') || !url.includes('{repo}')) {
      errorEl.textContent = 'URL must contain {owner} and {repo}';
      errorEl.style.display = 'block';
      return;
    }

    const newProvider: CustomProvider = {
      id: crypto.randomUUID(),
      name,
      urlTemplate: url,
    };

    const updated = [...customProviders, newProvider];
    try {
      await browser.storage.sync.set({ customProviders: updated });
      customProviders.push(newProvider);
      allProviders = mergeCustomProviders(customProviders);
      nameInput.value = '';
      urlInput.value = '';
      errorEl.style.display = 'none';
      form.style.display = 'none';
      addRow.style.display = '';
      renderProviderList();
      renderPinnedBtn(repoInfo, pinnedId);
    } catch {
      errorEl.textContent = 'Failed to save';
      errorEl.style.display = 'block';
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(addBtn);
  form.appendChild(label);
  form.appendChild(nameInput);
  form.appendChild(urlInput);
  form.appendChild(errorEl);
  form.appendChild(actions);

  section.appendChild(addRow);
  section.appendChild(form);
}
```

- [ ] **Step 8: Wire it all together**

The `renderProviderList` and `renderAddRow` functions defined in Steps 6-7 must be placed after the `section` variable is assigned (line 134 in original: `const section = document.getElementById('providers-section')`). Then replace the old `for (const provider of PROVIDERS)` loop (lines 141-169) with a single call:

```ts
renderProviderList();
```

The old loop and all its contents are replaced — the new `renderProviderList()` handles everything including the add row.

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add entrypoints/popup/main.ts
git commit -m "feat: custom provider UI in popup — add form, delete button, merged list"
```

---

### Task 4: Update content script to support custom providers

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: Update imports**

Replace line 1:

```ts
import { PROVIDERS, extractGithubRepo } from '../utils/providers';
```

With:

```ts
import { PROVIDERS, extractGithubRepo, mergeCustomProviders, type WikiProvider, type CustomProvider } from '../utils/providers';
```

- [ ] **Step 2: Add customProviders loading and merge**

After `pinnedId` initialization (after line 11), add:

```ts
let customList: CustomProvider[] = [];
```

Inside the `try` block that reads storage (around line 13), add `'customProviders'` to the `storage.sync.get` call:

```ts
const result = await browser.storage.sync.get(['enabledProviders', 'pinnedProvider', 'customProviders']);
```

After the `pinnedProvider` handling, add:

```ts
if (Array.isArray(result.customProviders)) {
  customList = result.customProviders as CustomProvider[];
}
```

After the try/catch block, add:

```ts
let allProviders: WikiProvider[] = mergeCustomProviders(customList);
```

- [ ] **Step 3: Replace all PROVIDERS references with allProviders**

In the `injectButton` function, replace every occurrence of `PROVIDERS` with `allProviders`:

1. `PROVIDERS.filter(p => isEnabled(...))` → `allProviders.filter(p => isEnabled(...))`
2. `PROVIDERS.find(p => p.id === pinnedId)` → `allProviders.find(p => p.id === pinnedId)`

In the `buildDropdown` function, update the type signature:

```ts
function buildDropdown(
  providers: readonly WikiProvider[],
  repoInfo: { owner: string; repo: string }
): HTMLUListElement {
```

- [ ] **Step 4: Update onStorageChanged to handle customProviders**

In the `onStorageChanged` handler, add after the `pinnedProvider` handling (but **before** the existing unconditional `reInjectButton()` call at the end of the handler — that call must be preserved):

```ts
if ('customProviders' in changes) {
  const v = changes.customProviders.newValue;
  if (Array.isArray(v)) {
    customList = v as CustomProvider[];
  } else {
    customList = [];
  }
  allProviders = mergeCustomProviders(customList);
}
```

The existing `reInjectButton()` at the bottom of `onStorageChanged` will pick up the new `allProviders` automatically.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat: content script supports custom providers via merged list"
```

---

### Task 5: Update background script to support custom providers

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Update imports**

Replace line 1:

```ts
import { PROVIDERS, extractGithubRepo } from '../utils/providers';
```

With:

```ts
import { PROVIDERS, extractGithubRepo, mergeCustomProviders, type CustomProvider } from '../utils/providers';
```

- [ ] **Step 2: Update storage read and provider resolution**

Replace the storage read block (the `try` block that reads `pinnedProvider` and `enabledProviders`) with:

```ts
let pinnedId = PROVIDERS.find(p => p.pinnedByDefault)?.id ?? PROVIDERS[0].id;
let enabledMap: Record<string, boolean> = {};
let customList: CustomProvider[] = [];
try {
  const result = await browser.storage.sync.get(['pinnedProvider', 'enabledProviders', 'customProviders']);
  if (typeof result.pinnedProvider === 'string') {
    pinnedId = result.pinnedProvider;
  }
  const stored = result.enabledProviders;
  if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
    enabledMap = stored as Record<string, boolean>;
  }
  if (Array.isArray(result.customProviders)) {
    customList = result.customProviders as CustomProvider[];
  }
} catch {
  // Fall back to defaults
}

const allProviders = mergeCustomProviders(customList);

const isEnabled = (id: string, defaultVal: boolean) =>
  id in enabledMap ? enabledMap[id] : defaultVal;

// If pinned provider is disabled, fall back to first enabled provider
let provider = allProviders.find(p => p.id === pinnedId);
if (!provider || !isEnabled(provider.id, provider.enabledByDefault)) {
  provider = allProviders.find(p => isEnabled(p.id, p.enabledByDefault));
}
if (!provider) return;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Manual smoke test**

1. Run `npm run dev`
2. Load extension in Chrome, reload if needed
3. Open popup, click "+ Add custom provider"
4. Enter name: "Test Wiki", URL: `https://example.com/{owner}/{repo}`
5. Click Add — should appear in list with x and toggle
6. Navigate to a GitHub repo — the custom provider should appear in the dropdown
7. Pin the custom provider, press `Alt+W` — should open the custom URL
8. Delete the custom provider via x — should disappear everywhere
9. Verify built-in providers still work normally

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: background script supports custom providers via merged list"
```
