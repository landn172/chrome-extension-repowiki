export interface WikiProvider {
  id: string;
  name: string;
  transform: (owner: string, repo: string) => string;
  enabledByDefault: boolean;
}

export const PROVIDERS: WikiProvider[] = [
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    transform: (owner, repo) => `https://deepwiki.com/${owner}/${repo}`,
    enabledByDefault: true,
  },
  {
    id: 'codewiki',
    name: 'CodeWiki',
    transform: (owner, repo) => `https://codewiki.google/github.com/${owner}/${repo}`,
    enabledByDefault: false,
  },
  {
    id: 'zread',
    name: 'Zread',
    transform: (owner, repo) => `https://zread.ai/${owner}/${repo}`,
    enabledByDefault: false,
  },
  {
    id: 'readmex',
    name: 'Readmex',
    transform: (owner, repo) => {
      const prefix = navigator.language.startsWith('zh') ? '' : 'en-US/';
      return `https://readmex.com/${prefix}${owner}/${repo}`;
    },
    enabledByDefault: false,
  },
];

/**
 * Extracts owner and repo from a GitHub URL.
 * Returns null for non-repo GitHub URLs or non-GitHub URLs.
 * Sub-paths, query strings, and hash fragments are ignored —
 * `[^/?#]+` stops at `/`, `?`, and `#` so no extra sanitization needed.
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
