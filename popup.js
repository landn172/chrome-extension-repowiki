function getDeepWikiUrl(githubUrl) {
  const match = githubUrl.match(/^https:\/\/github\.com\/([^\/]+\/[^\/]+)/);
  if (!match) return null;
  return `https://deepwiki.com/${match[1]}`;
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const urlDisplay = document.getElementById('url-display');
  const openBtn = document.getElementById('open-btn');
  const notRepoMsg = document.getElementById('not-repo-msg');

  const deepWikiUrl = tab?.url ? getDeepWikiUrl(tab.url) : null;

  if (deepWikiUrl) {
    urlDisplay.textContent = deepWikiUrl;
    openBtn.disabled = false;
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: deepWikiUrl });
      window.close();
    });
  } else {
    notRepoMsg.style.display = 'block';
    openBtn.disabled = true;
  }
});
