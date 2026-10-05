/* Configurações acessíveis das laterais e dos espaços entre questões. */
export class SettingsShortcuts {
  constructor({ shell, visualPanel, generalPanel, fullscreenButton, fullscreenStatus, onOpenQuestionMap }) {
    this.shell = shell;
    this.panels = { visual: visualPanel, general: generalPanel };
    this.fullscreenButton = fullscreenButton;
    this.fullscreenStatus = fullscreenStatus;
    this.onOpenQuestionMap = onOpenQuestionMap;
    this.fullscreenButtons = [fullscreenButton, document.getElementById('btnQuickFullscreen')].filter(Boolean);
    this.fullscreenStatuses = [fullscreenStatus, document.getElementById('quickFullscreenStatus')].filter(Boolean);
    this.pointers = new Map();
    this.lastTap = null;
    this.mountedPanel = null;
    this.frame = null;
    this.quizContainer = document.getElementById('quizContainer');
    this.gapElements = new Map();
    this.gapLayout = [];
    this.gapLayoutDirty = true;

    this.dialog = document.getElementById('settingsShortcutDialog');
    this.title = document.getElementById('settingsShortcutTitle');
    this.home = document.getElementById('settingsShortcutHome');
    this.host = document.getElementById('settingsShortcutContent');
    this.back = document.getElementById('settingsShortcutBack');
    this.gutters = Array.from(document.querySelectorAll('.settings-shortcut-gutter'));

    this.home.querySelectorAll('[data-settings-section]').forEach((button) => {
      button.addEventListener('click', () => this.showSection(button.dataset.settingsSection));
    });
    this.back.addEventListener('click', () => this.showSection(null));
    document.getElementById('settingsShortcutClose').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => {
      this.restorePanel();
      document.documentElement.classList.remove('settings-shortcuts-open');
      this.restoreAnchor();
      this.anchor = null;
      this.scheduleGutters();
      if (this.mapAfterClose) {
        this.mapAfterClose = false;
        // Abrir só depois dos frames de restauração da leitura e do fechamento do diálogo.
        requestAnimationFrame(() => this.onOpenQuestionMap?.());
      }
    });
    const mapButton = document.getElementById('btnQuickQuestionMap');
    mapButton?.addEventListener('click', () => {
      if (mapButton.disabled || !this.onOpenQuestionMap || !this.dialog.open) return;
      this.mapAfterClose = true;
      this.dialog.close();
    });
    // Só fecha no fundo se tanto a pressão como a soltura ocorrerem fora do painel.
    this.dialog.addEventListener('pointerdown', (event) => {
      const rect = this.dialog.getBoundingClientRect();
      this.backdropPressed = event.target === this.dialog &&
        (event.clientX < rect.left || event.clientX > rect.right ||
         event.clientY < rect.top || event.clientY > rect.bottom);
    });
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog && this.backdropPressed) this.dialog.close();
      this.backdropPressed = false;
    });
    // Alterar fonte, largura ou modo MQ pode reconstruir a lista. Mantém a questão visível.
    ['input', 'change'].forEach((type) => {
      this.dialog.addEventListener(type, () => this.restoreAnchor(), { capture: true });
    });
    this.dialog.addEventListener('click', () => this.restoreAnchor());

    document.addEventListener('pointerdown', (event) => this.onPointerDown(event), { capture: true, passive: true });
    document.addEventListener('pointermove', (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) {
        pointer.moved = true;
        this.lastTap = null;
      }
    }, { capture: true, passive: true });
    document.addEventListener('pointerup', (event) => this.onPointerUp(event), { capture: true });
    document.addEventListener('pointercancel', (event) => {
      this.pointers.delete(event.pointerId);
      this.lastTap = null;
    }, { capture: true, passive: true });
    document.addEventListener('contextmenu', (event) => {
      if (!this.getRegion(event)) return;
      // Long press touch mantém o comportamento nativo; mouse Bluetooth usa este atalho.
      if ((event.pointerType || this.lastPointerType) !== 'mouse' || this.pointers.size) return;
      event.preventDefault();
      this.open();
    });
    window.addEventListener('scroll', () => {
      this.lastTap = null;
      this.pointers.forEach((pointer) => { pointer.moved = true; });
      this.scheduleGutters();
    }, { passive: true });
    window.addEventListener('resize', () => this.scheduleGutters(true), { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleGutters(true));
      this.resizeObserver.observe(shell);
      const controls = document.querySelector('.controls-card');
      if (controls) this.resizeObserver.observe(controls);
    }
    if (typeof MutationObserver !== 'undefined') {
      this.contentObserver = new MutationObserver(() => this.scheduleGutters(true));
      this.contentObserver.observe(this.quizContainer, {
        childList: true, subtree: true, attributes: true, characterData: true
      });
    }
    this.fullscreenButtons.forEach((button) => {
      button.addEventListener('click', () => this.toggleFullscreen());
    });
    ['fullscreenchange', 'webkitfullscreenchange'].forEach((type) => {
      document.addEventListener(type, () => {
        this.updateFullscreen();
        if (this.dialog.open || this.fullscreenAnchor) {
          this.restoreAnchor(this.fullscreenAnchor || this.anchor);
        }
        this.fullscreenAnchor = null;
        this.scheduleGutters(true);
      });
    });
    this.updateFullscreen();
    this.scheduleGutters();
  }

  getRegion(event) {
    if (this.dialog.open || !this.shell.querySelector('.question-card')) return null;
    // Só superfícies vazias; padding e espaços internos de um cartão não são atalhos.
    if (!event.target.closest('.settings-shortcut-gutter, .settings-shortcut-gap, .quiz-resize-handle') &&
        event.target !== document.body && event.target !== document.documentElement &&
        event.target !== this.shell && event.target !== this.quizContainer &&
        !event.target.matches('.container, .question-group')) return null;
    const rect = this.shell.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom) return null;
    if (event.clientX < rect.left) return 'left';
    if (event.clientX > rect.right) return 'right';
    // Confere a geometria atual, mesmo se uma reconstrução acabou de ocorrer.
    const y = event.clientY + window.scrollY;
    return this.readGapLayout().find((gap) =>
      event.clientX >= gap.left && event.clientX <= gap.right && y > gap.top && y < gap.bottom
    )?.region || null;
  }

  onPointerDown(event) {
    this.lastPointerType = event.pointerType;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      this.lastTap = null;
      return;
    }
    const region = this.getRegion(event);
    this.pointers.set(event.pointerId, {
      region, x: event.clientX, y: event.clientY,
      time: performance.now(), scrollY: window.scrollY, moved: !region || !event.isPrimary
    });
    if (this.pointers.size > 1) {
      this.pointers.forEach((pointer) => { pointer.moved = true; });
      this.lastTap = null;
    }
  }

  onPointerUp(event) {
    const pointer = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (!pointer) return;
    const now = performance.now();
    if (pointer.moved || !pointer.region || this.pointers.size ||
        now - pointer.time > 300 || Math.abs(window.scrollY - pointer.scrollY) > 3 ||
        Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) {
      this.lastTap = null;
      return;
    }
    const previous = this.lastTap;
    if (previous && previous.region === pointer.region && now - previous.time <= 350 &&
        Math.hypot(pointer.x - previous.x, pointer.y - previous.y) <= 24) {
      this.lastTap = null;
      if (event.cancelable) event.preventDefault();
      this.open();
    } else {
      this.lastTap = { ...pointer, time: now };
    }
  }

  readGapLayout() {
    // Textos-base interrompem a sequência para que o atalho não cubra um grupo.
    const blocks = Array.from(this.quizContainer.querySelectorAll('.question-card, .group-container'));
    const gaps = [];
    for (let index = 1; index < blocks.length; index++) {
      const previous = blocks[index - 1];
      const current = blocks[index];
      if (!previous.matches('.question-card') || !current.matches('.question-card')) continue;
      const before = previous.getBoundingClientRect();
      const after = current.getBoundingClientRect();
      const left = Math.max(before.left, after.left);
      const right = Math.min(before.right, after.right);
      if (after.top <= before.bottom || right <= left) continue;
      gaps.push({
        region: `gap:${previous.dataset.originalIdx}:${current.dataset.originalIdx}`,
        left, right, top: before.bottom + window.scrollY, bottom: after.top + window.scrollY
      });
    }
    return gaps;
  }

  updateGapElements(shellRect, visible) {
    if (this.gapLayoutDirty) {
      this.gapLayout = this.readGapLayout();
      this.gapLayoutDirty = false;
    }
    const active = new Set();
    const shellTop = shellRect.top + window.scrollY;
    for (const gap of this.gapLayout) {
      if (!visible || gap.bottom <= window.scrollY || gap.top >= window.scrollY + window.innerHeight) continue;
      active.add(gap.region);
      let element = this.gapElements.get(gap.region);
      if (!element) {
        element = document.createElement('div');
        element.classList.add('settings-shortcut-gap');
        element.dataset.settingsGap = gap.region;
        element.setAttribute('aria-hidden', 'true');
        this.shell.appendChild(element);
        this.gapElements.set(gap.region, element);
      }
      // Elementos absolutos e transparentes preservam o espaçamento existente.
      element.style.left = `${gap.left - shellRect.left}px`;
      element.style.top = `${gap.top - shellTop}px`;
      element.style.width = `${gap.right - gap.left}px`;
      element.style.height = `${gap.bottom - gap.top}px`;
    }
    this.gapElements.forEach((element, region) => {
      if (!active.has(region)) {
        element.remove();
        this.gapElements.delete(region);
      }
    });
  }

  scheduleGutters(refreshGaps = false) {
    if (refreshGaps) this.gapLayoutDirty = true;
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const rect = this.shell.getBoundingClientRect();
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      const visible = !this.dialog.open && !!this.shell.querySelector('.question-card') && bottom > top;
      this.gutters.forEach((gutter, index) => {
        const width = index === 0 ? Math.max(0, rect.left) : Math.max(0, window.innerWidth - rect.right);
        gutter.hidden = !visible || width === 0;
        gutter.style.width = `${width}px`;
        gutter.style.top = `${top}px`;
        gutter.style.height = `${Math.max(0, bottom - top)}px`;
      });
      this.updateGapElements(rect, visible);
    });
  }

  captureAnchor() {
    const card = Array.from(this.shell.querySelectorAll('.question-card')).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    return {
      index: card ? card.dataset.originalIdx : null,
      top: card ? card.getBoundingClientRect().top : 0,
      scrollY: window.scrollY
    };
  }

  restoreAnchor(anchor = this.anchor) {
    if (!anchor) return;
    requestAnimationFrame(() => {
      const card = Array.from(this.shell.querySelectorAll('.question-card')).find(
        (element) => element.dataset.originalIdx === anchor.index
      );
      window.scrollTo({
        top: card ? window.scrollY + card.getBoundingClientRect().top - anchor.top : anchor.scrollY,
        behavior: 'instant'
      });
    });
  }

  open() {
    if (this.dialog.open) return;
    this.anchor = this.captureAnchor();
    this.showSection(null);
    this.dialog.showModal();
    document.documentElement.classList.add('settings-shortcuts-open');
    this.restoreAnchor();
    this.scheduleGutters();
  }

  restorePanel() {
    if (!this.mountedPanel) return;
    const { panel, placeholder, hidden } = this.mountedPanel;
    panel.classList.toggle('hidden', hidden);
    placeholder.replaceWith(panel);
    this.mountedPanel = null;
  }

  showSection(section) {
    this.restorePanel();
    this.home.classList.toggle('hidden', !!section);
    this.back.classList.toggle('hidden', !section);
    this.host.classList.toggle('hidden', !section);
    this.title.textContent = section === 'visual' ? 'Configurações visuais' :
      section === 'general' ? 'Configurações gerais' : 'Configurações';
    if (section) {
      const panel = this.panels[section];
      const placeholder = document.createElement('div');
      const hidden = panel.classList.contains('hidden');
      // Mantém a altura do topo quando um painel já estava expandido.
      if (!hidden) placeholder.style.height = `${panel.getBoundingClientRect().height}px`;
      else placeholder.hidden = true;
      panel.replaceWith(placeholder);
      this.mountedPanel = { panel, placeholder, hidden };
      this.host.appendChild(panel);
      panel.classList.remove('hidden');
    }
    this.dialog.scrollTop = 0;
    if (this.dialog.open) {
      this.title.focus({ preventScroll: true });
      this.restoreAnchor();
    }
  }

  fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  updateFullscreen() {
    const active = !!this.fullscreenElement();
    const root = document.documentElement;
    const supported = (typeof root.requestFullscreen === 'function' && document.fullscreenEnabled !== false) ||
      (typeof root.webkitRequestFullscreen === 'function' && document.webkitFullscreenEnabled !== false);
    this.fullscreenButtons.forEach((button) => {
      button.disabled = this.fullscreenBusy || (!active && !supported);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '⛶ Sair da tela cheia' : '⛶ Entrar em tela cheia';
    });
    if (!active && !supported) {
      this.setFullscreenStatus('Tela cheia indisponível neste navegador.');
    }
  }

  setFullscreenStatus(message) {
    this.fullscreenStatuses.forEach((status) => { status.textContent = message; });
  }

  async toggleFullscreen() {
    if (this.fullscreenBusy) return;
    const anchor = this.dialog.open ? this.anchor : this.captureAnchor();
    this.fullscreenAnchor = anchor;
    this.fullscreenBusy = true;
    this.setFullscreenStatus('');
    this.updateFullscreen();
    try {
      if (this.fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit.call(document);
      } else {
        const root = document.documentElement;
        const request = (document.fullscreenEnabled !== false && root.requestFullscreen) || root.webkitRequestFullscreen;
        // A chamada ocorre diretamente no clique, enquanto a ativação está válida.
        await request.call(root, { navigationUI: 'hide' });
      }
    } catch {
      this.fullscreenAnchor = null;
      this.setFullscreenStatus('Não foi possível alterar a tela cheia neste navegador.');
    } finally {
      this.fullscreenBusy = false;
      this.updateFullscreen();
      this.restoreAnchor(anchor);
    }
  }
}
