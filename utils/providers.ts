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
      let isZh = false;
      try {
        isZh = navigator.language.startsWith('zh');
      } catch {
        // navigator.language unavailable in service worker — default to English
      }
      const prefix = isZh ? '' : 'en-US/';
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
