// Descrições pertencem ao caminho completo, inclusive em sessões importadas antigas.
export function collectFolderDescriptions(nodes, path = [], result = {}) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const folder = String(node.tipo || '').toUpperCase() === 'FOLDER';
    const next = folder ? [...path, node.nome || 'Sem Nome'] : path;
    if (folder && typeof node.descricao === 'string' && node.descricao.trim()) {
      result[next.join(' > ')] = node.descricao;
    }
    collectFolderDescriptions(node.conteudo, next, result);
    collectFolderDescriptions(node.questoes, next, result);
  }
  return result;
}

export function descriptionPreview(html) {
  const text = String(html).replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|div|h[1-6]|li|br|tr)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '');
  const decode = document.createElement('textarea');
  decode.innerHTML = text;
  return (decode.value || decode.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

export class FolderDescriptions {
  constructor() { this.quiz = null; this.descriptions = {}; }

  populate(container, path, state) {
    if (this.quiz !== state.quizJson) {
      this.quiz = state.quizJson;
      // O JSON original permite recuperar descrições ausentes nos snapshots antigos.
      this.descriptions = { ...(state.filters?.folderDescriptions || {}),
        ...collectFolderDescriptions(state.quizJson?.conteudo) };
    }
    container.textContent = '📁 ';
    path.forEach((name, index) => {
      if (index) {
        const separator = document.createElement('span');
        separator.textContent = ' › '; separator.setAttribute('aria-hidden', 'true');
        container.appendChild(separator);
      }
      const fullPath = path.slice(0, index + 1).join(' > ');
      const description = this.descriptions[fullPath];
      const item = document.createElement(description ? 'button' : 'span');
      item.textContent = name;
      if (description) {
        item.type = 'button'; item.className = 'folder-description-link';
        item.setAttribute('aria-haspopup', 'dialog');
        item.setAttribute('aria-label', `Ver descrição de ${name}`);
        const preview = descriptionPreview(description);
        item.addEventListener('pointerenter', event => {
          if (event.pointerType === 'mouse' || event.pointerType === 'pen') this.showPreview(item, preview);
        });
        item.addEventListener('pointerleave', () => this.hidePreview());
        item.addEventListener('focus', () => this.showPreview(item, preview));
        item.addEventListener('blur', () => this.hidePreview());
        item.addEventListener('keydown', event => { if (event.key === 'Escape') this.hidePreview(); });
        item.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          this.open(name, fullPath, description, item);
        });
      }
      container.appendChild(item);
    });
  }

  showPreview(trigger, text) {
    if (this.dialog?.open || !text) return;
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.id = 'folder-description-tooltip'; this.tooltip.className = 'folder-description-tooltip hidden';
      this.tooltip.setAttribute('role', 'tooltip');
      document.body.appendChild(this.tooltip);
    }
    this.hidePreview();
    this.previewTrigger = trigger;
    trigger.setAttribute('aria-describedby', this.tooltip.id);
    this.tooltip.textContent = `${text.length > 500 ? text.slice(0, 500) + '…' : text}\nClique para ver a descrição completa.`;
    this.tooltip.classList.remove('hidden');
    const rect = trigger.getBoundingClientRect();
    const width = this.tooltip.getBoundingClientRect().width;
    const height = this.tooltip.getBoundingClientRect().height;
    this.tooltip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    this.tooltip.style.top = `${Math.max(8, rect.bottom + height + 12 > window.innerHeight ? rect.top - height - 8 : rect.bottom + 8)}px`;
    this.hideOnMove ||= () => this.hidePreview();
    window.addEventListener('scroll', this.hideOnMove, true);
    window.addEventListener('resize', this.hideOnMove);
  }

  hidePreview() {
    this.tooltip?.classList.add('hidden');
    this.previewTrigger?.removeAttribute('aria-describedby');
    this.previewTrigger = null;
    if (this.hideOnMove) {
      window.removeEventListener('scroll', this.hideOnMove, true);
      window.removeEventListener('resize', this.hideOnMove);
    }
  }

  open(name, path, description, trigger) {
    this.hidePreview();
    if (!this.dialog) {
      const dialog = document.createElement('dialog');
      dialog.className = 'folder-description-dialog'; dialog.setAttribute('aria-labelledby', 'folder-description-title');
      const header = document.createElement('div'); header.className = 'folder-description-header';
      this.heading = document.createElement('h3'); this.heading.id = 'folder-description-title';
      const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-sm';
      close.textContent = '✕ Fechar'; close.addEventListener('click', () => dialog.close());
      header.appendChild(this.heading); header.appendChild(close);
      this.path = document.createElement('p'); this.path.className = 'folder-description-path';
      this.frame = document.createElement('iframe');
      this.frame.setAttribute('sandbox', ''); // HTML/CSS isolados; nenhuma permissão de scripts ou navegação da página.
      this.frame.setAttribute('referrerpolicy', 'no-referrer');
      dialog.appendChild(header); dialog.appendChild(this.path); dialog.appendChild(this.frame);
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => {
        this.frame.srcdoc = ''; this.trigger?.focus(); this.trigger = null; this.hidePreview();
      });
      document.body.appendChild(dialog); this.dialog = dialog;
    }
    this.trigger = trigger;
    this.heading.textContent = name; this.path.textContent = path;
    this.frame.title = `Descrição de ${name}`;
    const color = getComputedStyle(document.body).color || '#333';
    this.frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{margin:16px;font:16px/1.6 system-ui;color:${color};overflow-wrap:anywhere;white-space:pre-line}img,video{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${description}</body></html>`;
    this.dialog.showModal();
  }

  dismiss() {
    this.hidePreview(); this.trigger = null;
    if (this.dialog?.open) this.dialog.close();
  }
}
