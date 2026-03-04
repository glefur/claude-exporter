const exportBtn = document.getElementById('exportBtn');
const statusEl  = document.getElementById('status');

const BTN_HTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M7.5 1.5V10.5M7.5 10.5L4.5 7.5M7.5 10.5L10.5 7.5M2 12.5H13" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg> Télécharger .md`;

function showStatus(type, message) {
  statusEl.className = 'status ' + type;
  statusEl.textContent = message;
}

function resetBtn() {
  exportBtn.disabled = false;
  exportBtn.innerHTML = BTN_HTML;
}

function sanitize(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80)
    .trim() || 'conversation_claude';
}

exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  exportBtn.innerHTML = '<span class="spinner"></span> Extraction…';
  showStatus('loading', 'Scan de la conversation (scroll en cours)…');

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('claude.ai')) {
      showStatus('error', 'Ouvrez d\'abord une conversation sur claude.ai.');
      resetBtn();
      return;
    }

    // On essaie d'envoyer un message au content script déjà injecté par le manifest.
    // En cas d'échec (page rechargée, script non encore prêt), on l'injecte une fois.
    let response;
    try {
      response = await browser.tabs.sendMessage(tab.id, { action: 'extract' });
    } catch (_) {
      try {
        await browser.tabs.executeScript(tab.id, { file: 'content.js' });
        response = await browser.tabs.sendMessage(tab.id, { action: 'extract' });
      } catch (injectErr) {
        showStatus('error', 'Impossible d\'injecter le script : ' + injectErr.message);
        resetBtn();
        return;
      }
    }

    if (!response) {
      showStatus('error', 'Pas de réponse du script de page.');
      resetBtn();
      return;
    }

    if (!response.success) {
      let msg = response.error || 'Impossible d\'extraire la conversation.';
      if (response.debugIds && response.debugIds.length) {
        msg += '\n\ndata-testid présents :\n' + response.debugIds.join(', ');
      }
      showStatus('error', msg);
      resetBtn();
      return;
    }

    const filename = sanitize(response.title);
    const blob     = new Blob([response.markdown], { type: 'text/markdown;charset=utf-8' });
    const url      = URL.createObjectURL(blob);

    await browser.downloads.download({ url, filename: filename + '.md', saveAs: false });

    showStatus('success', '✓ ' + response.count + ' messages → "' + filename + '.md"');
    resetBtn();
    setTimeout(() => URL.revokeObjectURL(url), 15000);

  } catch (err) {
    console.error('[Claude Export]', err);
    showStatus('error', 'Erreur : ' + err.message);
    resetBtn();
  }
});
