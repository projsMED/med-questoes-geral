/* Configurações acessíveis das laterais, com os mesmos controles do topo. */
export class SettingsShortcuts {
  constructor({ shell, visualPanel, generalPanel, fullscreenButton, fullscreenStatus }) {
    this.shell = shell;
    this.panels = { visual: visualPanel, general: generalPanel };
    this.fullscreenButton = fullscreenButton;
    this.fullscreenStatus = fullscreenStatus;
    this.pointers = new Map();
    this.lastTap = null;
    this.mountedPanel = null;
    this.frame = null;

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
      if (!this.getSide(event)) return;
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
    window.addEventListener('resize', () => this.scheduleGutters(), { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleGutters());
      this.resizeObserver.observe(shell);
    }
    this.fullscreenButton.addEventListener('click', () => this.toggleFullscreen());
    ['fullscreenchange', 'webkitfullscreenchange'].forEach((type) => {
      document.addEventListener(type, () => {
        this.updateFullscreen();
        if (this.dialog.open || this.fullscreenAnchor) {
          this.restoreAnchor(this.fullscreenAnchor || this.anchor);
        }
        this.fullscreenAnchor = null;
        this.scheduleGutters();
      });
    });
    this.updateFullscreen();
    this.scheduleGutters();
  }

  getSide(event) {
    if (this.dialog.open || !this.shell.querySelector('.question-card')) return null;
    // Apenas margens externas e a metade externa das alças; nunca o conteúdo das questões.
    if (!event.target.closest('.settings-shortcut-gutter, .quiz-resize-handle') &&
        event.target !== document.body && event.target !== document.documentElement &&
        event.target !== this.shell && !event.target.matches('.container')) return null;
    const rect = this.shell.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom) return null;
    if (event.clientX < rect.left) return 'left';
    if (event.clientX > rect.right) return 'right';
    return null;
  }

  onPointerDown(event) {
    this.lastPointerType = event.pointerType;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      this.lastTap = null;
      return;
    }
    const side = this.getSide(event);
    this.pointers.set(event.pointerId, {
      side, x: event.clientX, y: event.clientY,
      time: performance.now(), scrollY: window.scrollY, moved: !side || !event.isPrimary
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
    if (pointer.moved || !pointer.side || this.pointers.size ||
        now - pointer.time > 300 || Math.abs(window.scrollY - pointer.scrollY) > 3 ||
        Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) {
      this.lastTap = null;
      return;
    }
    const previous = this.lastTap;
    if (previous && previous.side === pointer.side && now - previous.time <= 350 &&
        Math.hypot(pointer.x - previous.x, pointer.y - previous.y) <= 24) {
      this.lastTap = null;
      if (event.cancelable) event.preventDefault();
      this.open();
    } else {
      this.lastTap = { ...pointer, time: now };
    }
  }

  scheduleGutters() {
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
    this.fullscreenButton.disabled = this.fullscreenBusy || (!active && !supported);
    this.fullscreenButton.setAttribute('aria-pressed', String(active));
    this.fullscreenButton.textContent = active ? '⛶ Sair da tela cheia' : '⛶ Entrar em tela cheia';
    if (!active && !supported) {
      this.fullscreenStatus.textContent = 'Tela cheia indisponível neste navegador.';
    }
  }

  async toggleFullscreen() {
    if (this.fullscreenBusy) return;
    const anchor = this.dialog.open ? this.anchor : this.captureAnchor();
    this.fullscreenAnchor = anchor;
    this.fullscreenBusy = true;
    this.fullscreenStatus.textContent = '';
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
      this.fullscreenStatus.textContent = 'Não foi possível alterar a tela cheia neste navegador.';
    } finally {
      this.fullscreenBusy = false;
      this.updateFullscreen();
      this.restoreAnchor(anchor);
    }
  }
}
