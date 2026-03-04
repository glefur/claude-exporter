(function () {
  if (window.__claudeExportListener) {
    try { browser.runtime.onMessage.removeListener(window.__claudeExportListener); } catch (_) {}
  }

  var SKIP = new Set(['button','svg','path','script','style','noscript','iframe','img','input','select','textarea']);

  function nodeToMd(node, depth) {
    if (!depth) depth = 0;
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    var tag = node.tagName.toLowerCase();
    if (SKIP.has(tag)) return '';
    if (node.getAttribute('aria-hidden') === 'true') return '';
    var ch = function () {
      return Array.from(node.childNodes).map(function (n) { return nodeToMd(n, depth); }).join('');
    };
    switch (tag) {
      case 'h1': return '# ' + ch() + '\n\n';
      case 'h2': return '## ' + ch() + '\n\n';
      case 'h3': return '### ' + ch() + '\n\n';
      case 'h4': return '#### ' + ch() + '\n\n';
      case 'h5': return '##### ' + ch() + '\n\n';
      case 'h6': return '###### ' + ch() + '\n\n';
      case 'p':  return ch() + '\n\n';
      case 'br': return '\n';
      case 'strong': case 'b': { var t = ch(); return t ? '**' + t + '**' : ''; }
      case 'em': case 'i':     { var t = ch(); return t ? '*' + t + '*' : ''; }
      case 's':  case 'del':   { var t = ch(); return t ? '~~' + t + '~~' : ''; }
      case 'code':
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') return node.textContent;
        return '`' + node.textContent + '`';
      case 'pre': {
        var codeEl = node.querySelector('code');
        var lang = ((codeEl && codeEl.className) || '').match(/language-([^\s"']+)/);
        var code = codeEl ? codeEl.textContent : node.textContent;
        return '```' + (lang ? lang[1] : '') + '\n' + code.trimEnd() + '\n```\n\n';
      }
      case 'ul':
        return Array.from(node.children)
          .filter(function (e) { return e.tagName.toLowerCase() === 'li'; })
          .map(function (li) { return '  '.repeat(depth) + '- ' + nodeToMd(li, depth + 1).trim(); })
          .join('\n') + '\n\n';
      case 'ol':
        return Array.from(node.children)
          .filter(function (e) { return e.tagName.toLowerCase() === 'li'; })
          .map(function (li, i) { return '  '.repeat(depth) + (i + 1) + '. ' + nodeToMd(li, depth + 1).trim(); })
          .join('\n') + '\n\n';
      case 'li': return ch();
      case 'blockquote': return '> ' + ch().trim().replace(/\n/g, '\n> ') + '\n\n';
      case 'a': {
        var href = node.getAttribute('href'), text = ch();
        return (href && !href.startsWith('javascript') && href !== text) ? '[' + text + '](' + href + ')' : text;
      }
      case 'hr': return '---\n\n';
      case 'table': {
        var rows = Array.from(node.querySelectorAll('tr'));
        if (!rows.length) return '';
        var lines = [];
        rows.forEach(function (row, ri) {
          var cells = Array.from(row.querySelectorAll('th,td'));
          var t = cells.map(function (c) { return nodeToMd(c).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' '); });
          lines.push('| ' + t.join(' | ') + ' |');
          if (ri === 0) lines.push('| ' + cells.map(function () { return '---'; }).join(' | ') + ' |');
        });
        return lines.join('\n') + '\n\n';
      }
      default: return ch();
    }
  }

  // ─── Trouver le conteneur de conversation ──────────────────────────────────
  // Structure confirmée :
  //   scroller > div > div.mx-auto > [conversation div, input div]
  // Le conversation div est le frère de [data-chat-input-container]

  function findConversation() {
    var inputContainer = document.querySelector('[data-chat-input-container]');
    if (inputContainer && inputContainer.previousElementSibling) {
      return inputContainer.previousElementSibling;
    }
    return null;
  }

  // ─── Classer un enfant comme humain ou IA ──────────────────────────────────

  function classifyChild(el) {
    // data-testid explicite
    if (el.getAttribute('data-testid') === 'human-turn' ||
        el.querySelector('[data-testid="human-turn"]')) {
      return 'human';
    }

    // Présence de prose / markdown = réponse IA
    if (el.querySelector('[class*="prose"]') || el.querySelector('[class*="markdown"]')) {
      return 'assistant';
    }

    // Contenu formaté (headers, code, listes, tables) = IA
    if (el.querySelector('h1,h2,h3,h4,h5,h6,pre,table,ol,ul')) {
      return 'assistant';
    }

    // whitespace-pre-wrap = message humain
    if (el.querySelector('[class*="whitespace-pre"]')) {
      return 'human';
    }

    // Heuristique : texte court sans formatage = humain
    var text = el.textContent.trim();
    if (text.length < 300 && !el.querySelector('ul,ol,pre,table')) {
      return 'human';
    }

    return 'assistant';
  }

  // ─── Extraire le contenu d'un enfant ───────────────────────────────────────

  function extractContent(el, role) {
    if (role === 'human') {
      var textEl = el.querySelector('[data-testid="human-turn"]') ||
                   el.querySelector('[class*="whitespace-pre"]') ||
                   el.querySelector('p') || el;
      return textEl.textContent.trim();
    }
    var proseEl = el.querySelector('[class*="prose"]') ||
                  el.querySelector('[class*="markdown"]') || el;
    return nodeToMd(proseEl).trim();
  }

  // ─── Point d'entrée ────────────────────────────────────────────────────────

  function extract() {
    var conv = findConversation();
    if (!conv) {
      return {
        success: false,
        error: 'Conteneur de conversation non trouvé ([data-chat-input-container] absent).'
      };
    }

    var children = Array.from(conv.children);
    if (!children.length) {
      return { success: false, error: 'Conteneur vide (0 enfants).' };
    }

    var messages = [];
    children.forEach(function (child) {
      var text = child.textContent.trim();
      if (text.length < 2) return; // sauter les séparateurs vides
      var role = classifyChild(child);
      var content = extractContent(child, role);
      if (content) {
        messages.push({ role: role, content: content });
      }
    });

    if (!messages.length) {
      return { success: false, error: 'Conteneur trouvé avec ' + children.length + ' enfants mais aucun contenu.' };
    }

    var title = document.title
      ? document.title.replace(/\s*[-–|]\s*Claude.*$/i, '').trim()
      : 'Conversation Claude';
    var date = new Date().toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    var out = '# ' + title + '\n\n*Exporté le ' + date + ' depuis Claude.ai*\n\n---\n\n';
    messages.forEach(function (m) {
      var label = m.role === 'human' ? '**Vous**' : '**Claude**';
      out += '## ' + label + '\n\n' + m.content + '\n\n---\n\n';
    });

    return { success: true, markdown: out, title: title, count: messages.length };
  }

  window.__claudeExportListener = function (message) {
    if (message.action === 'extract') {
      try {
        return Promise.resolve(extract());
      } catch (e) {
        return Promise.resolve({ success: false, error: 'Exception : ' + e.message });
      }
    }
  };
  browser.runtime.onMessage.addListener(window.__claudeExportListener);
})();
