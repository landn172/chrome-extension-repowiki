/**
 * Transforms a GitHub repo URL to its DeepWiki equivalent.
 * Always returns the repo root — sub-paths are stripped.
 *
 * @example
 * getDeepWikiUrl('https://github.com/facebook/react/issues/42')
 * // → 'https://deepwiki.com/facebook/react'
 */
export function getDeepWikiUrl(githubUrl: string): string | null {
  const match = githubUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)/);
  if (!match) return null;
  return `https://deepwiki.com/${match[1]}`;
}
