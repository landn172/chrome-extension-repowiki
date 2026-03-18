import { getDeepWikiUrl } from '../../utils/deepwiki';

const urlDisplay = document.getElementById('url-display') as HTMLDivElement;
const openBtn = document.getElementById('open-btn') as HTMLButtonElement;
const notRepoMsg = document.getElementById('not-repo-msg') as HTMLParagraphElement;

browser.tabs
  .query({ active: true, currentWindow: true })
  .then(([tab]) => {
    const deepWikiUrl = tab?.url ? getDeepWikiUrl(tab.url) : null;

    if (deepWikiUrl) {
      urlDisplay.textContent = deepWikiUrl;
      openBtn.disabled = false;
      openBtn.addEventListener('click', () => {
        browser.tabs.create({ url: deepWikiUrl });
        window.close();
      });
    } else {
      notRepoMsg.style.display = 'block';
      openBtn.disabled = true;
    }
  })
  .catch(() => {
    notRepoMsg.style.display = 'block';
  });
