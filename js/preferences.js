// Preferências visuais e gerais: leitura, controles e aplicação no DOM.
import { appStorage } from './release-config.js?v=20261004-470';

export function readVisualPreferences() {
  const position = appStorage.getItem('vs_paginationPosition');
  return {
    paginationPosition: ['fixed', 'bottom', 'top'].includes(position) ? position : 'fixed',
    footerFixed: appStorage.getItem('vs_footerFixed') !== 'false',
    commentMode: appStorage.getItem('vs_commentMode') || 'all',
    persistManualOpen: appStorage.getItem('vs_persistManualOpen') === 'true',
    vfStacked: appStorage.getItem('vs_vfStacked') === 'true',
    mqRenderMode: appStorage.getItem('vs_mqRenderMode') || 'arrows',
    mqAlignColumns: appStorage.getItem('vs_mqAlignColumns') === 'true',
    showPartialScore: appStorage.getItem('vs_showPartialScore') !== 'false',
    fontSize: parseInt(appStorage.getItem('vs_fontSize')) || 16,
    quizWidth: parseInt(appStorage.getItem('vs_quizWidth'), 10) || 900,
    darkMode: appStorage.getItem('vs_darkMode')
  };
}

export function readGeneralPreferences() {
  return {
    showDisregardCorrect: appStorage.getItem('gs_showDisregardCorrect') !== 'false',
    simpleMvfCorrection: appStorage.getItem('gs_simpleMvfCorrection') === 'true'
  };
}

export class Preferences {
  constructor({ elements, onExpandComments, onMqModeChange, onPartialScoreChange, onGeneralChange, onPaginationPositionChange }) {
    this.elements = elements;
    this.onExpandComments = onExpandComments;
    this.onMqModeChange = onMqModeChange;
    this.onPartialScoreChange = onPartialScoreChange;
    this.onGeneralChange = onGeneralChange;
    this.onPaginationPositionChange = onPaginationPositionChange;
    this._listeners = [];
    this._dragCleanups = [];
    this._quizWidth = 900;
  }

  _listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this._listeners.push(() => target.removeEventListener(type, listener, options));
  }

  dispose() {
    this._dragCleanups.forEach((cleanup) => cleanup());
    this._dragCleanups = [];
    this._listeners.forEach((cleanup) => cleanup());
    this._listeners = [];
  }

  init() {
    this.dispose();
    this._media = window.matchMedia('(prefers-color-scheme: dark)');
    const vs = readVisualPreferences();

    // Restaurar UI
    this.elements.chkFooterFixed.checked = vs.footerFixed;
    if (this.elements.paginationPosition) this.elements.paginationPosition.value = vs.paginationPosition;
    this.elements.commentModeCurrent.checked = vs.commentMode === 'current';
    this.elements.commentModeAll.checked = vs.commentMode !== 'current';
    this.elements.commentSubOptions.classList.toggle('hidden', vs.commentMode !== 'current');
    this.elements.chkPersistManualOpen.checked = vs.persistManualOpen;
    this.elements.chkVfStacked.checked = vs.vfStacked;
    if (this.elements.chkMqAlignColumns) this.elements.chkMqAlignColumns.checked = vs.mqAlignColumns;
    if (this.elements.mqModeTable && this.elements.mqModeArrows) {
      this.elements.mqModeTable.checked = vs.mqRenderMode === 'table';
      this.elements.mqModeArrows.checked = vs.mqRenderMode !== 'table';
    }
    if (this.elements.chkShowPartialScore) {
      this.elements.chkShowPartialScore.checked = vs.showPartialScore;
    }
    this.elements.rangeFontSize.value = vs.fontSize;
    this.elements.fontSizeValue.textContent = vs.fontSize + 'px';
    if (this.elements.chkShowDisregardCorrect) {
      this.elements.chkShowDisregardCorrect.checked =
        readGeneralPreferences().showDisregardCorrect;
    }
    this.elements.chkSimpleMvfCorrection.checked =
      readGeneralPreferences().simpleMvfCorrection;

    // Dark mode: null = auto (segue o sistema), 'true'/'false' = manual
    const isDark = vs.darkMode === 'true' ||
      (vs.darkMode === null && this._media.matches);
    this.elements.chkDarkMode.checked = isDark;

    // Aplicar footer, VF stacked, font size e dark mode
    this.applyFooterMode(vs.footerFixed);
    this.applyVfStacked(vs.vfStacked);
    this.applyFontSize(vs.fontSize);
    this.applyQuizWidth(vs.quizWidth, false);
    this.initQuizWidthControls();
    this.applyDarkMode(isDark);

    // Eventos
    this._listen(this.elements.btnVisualSettings, 'click', () => {
      this.elements.visualSettingsPanel.classList.toggle('hidden');
    });

    if (this.elements.btnGeneralSettings && this.elements.generalSettingsPanel) {
      this._listen(this.elements.btnGeneralSettings, 'click', () => {
        this.elements.generalSettingsPanel.classList.toggle('hidden');
      });
    }

    this._listen(this.elements.chkFooterFixed, 'change', (e) => {
      appStorage.setItem('vs_footerFixed', e.target.checked);
      this.applyFooterMode(e.target.checked);
    });

    if (this.elements.paginationPosition) this._listen(this.elements.paginationPosition, 'change', (e) => {
      appStorage.setItem('vs_paginationPosition', e.target.value);
      this.onPaginationPositionChange?.();
    });

    this._listen(this.elements.commentModeAll, 'change', () => {
      appStorage.setItem('vs_commentMode', 'all');
      this.elements.commentSubOptions.classList.add('hidden');
      this.onExpandComments?.();
    });

    this._listen(this.elements.commentModeCurrent, 'change', () => {
      appStorage.setItem('vs_commentMode', 'current');
      this.elements.commentSubOptions.classList.remove('hidden');
    });

    this._listen(this.elements.chkPersistManualOpen, 'change', (e) => {
      appStorage.setItem('vs_persistManualOpen', e.target.checked);
    });

    this._listen(this.elements.chkVfStacked, 'change', (e) => {
      appStorage.setItem('vs_vfStacked', e.target.checked);
      this.applyVfStacked(e.target.checked);
    });

    const handleMqModeChange = (mode) => {
      appStorage.setItem('vs_mqRenderMode', mode);
      this.onMqModeChange?.();
    };
    if (this.elements.chkMqAlignColumns) {
      this._listen(this.elements.chkMqAlignColumns, 'change', (event) => {
        appStorage.setItem('vs_mqAlignColumns', String(event.target.checked));
        this.onMqModeChange?.();
      });
    }
    if (this.elements.mqModeArrows) {
      this._listen(this.elements.mqModeArrows, 'change', () => handleMqModeChange('arrows'));
    }
    if (this.elements.mqModeTable) {
      this._listen(this.elements.mqModeTable, 'change', () => handleMqModeChange('table'));
    }

    if (this.elements.chkShowPartialScore) {
      this._listen(this.elements.chkShowPartialScore, 'change', (e) => {
        appStorage.setItem('vs_showPartialScore', e.target.checked ? 'true' : 'false');
        this.onPartialScoreChange?.();
      });
    }

    this._listen(this.elements.chkDarkMode, 'change', (e) => {
      const enabled = e.target.checked;
      appStorage.setItem('vs_darkMode', enabled);
      this.applyDarkMode(enabled);
    });

    if (this.elements.chkShowDisregardCorrect) {
      this._listen(this.elements.chkShowDisregardCorrect, 'change', (e) => {
        appStorage.setItem('gs_showDisregardCorrect', e.target.checked ? 'true' : 'false');
        this.onGeneralChange?.({
          showDisregardCorrect: e.target.checked,
          applyDisregardedCorrect: e.target.checked
        });
      });
    }

    this._listen(this.elements.chkSimpleMvfCorrection, 'change', (e) => {
      const enabled = e.target.checked;
      appStorage.setItem('gs_simpleMvfCorrection', String(enabled));
      this.onGeneralChange?.({ simpleMvfCorrection: enabled });
    });

    // Ouvir mudanças do tema do sistema (só aplica se o usuário nunca escolheu manualmente)
    this._listen(this._media, 'change', (e) => {
      if (appStorage.getItem('vs_darkMode') === null) {
        this.elements.chkDarkMode.checked = e.matches;
        this.applyDarkMode(e.matches);
      }
    });

    this._listen(this.elements.rangeFontSize, 'input', (e) => {
      const size = parseInt(e.target.value);
      appStorage.setItem('vs_fontSize', size);
      this.elements.fontSizeValue.textContent = size + 'px';
      this.applyFontSize(size);
    });
  }

  applyFooterMode(fixed) {
    if (fixed) {
      this.elements.footerBar.classList.remove('footer-inline');
    } else {
      this.elements.footerBar.classList.add('footer-inline');
    }
  }

  applyVfStacked(stacked) {
    document.getElementById('quizContainer').classList.toggle('ch-vf-stacked', !!stacked);
  }

  applyDarkMode(enabled) {
    document.documentElement.classList.toggle('dark-mode', enabled);
    if (this.elements.darkModeIcon) {
      this.elements.darkModeIcon.textContent = enabled ? '☀️' : '🌙';
    }
  }

  applyFontSize(size) {
    document.body.style.fontSize = size + 'px';
  }

  applyQuizWidth(size, save = true) {
    const width = Math.max(320, Math.min(1800, Math.round(Number(size) || 900)));
    this._quizWidth = width;
    this.elements.quizWidthShell.style.setProperty('--quiz-width', `${width}px`);
    this.elements.rangeQuizWidth.value = width;
    this.elements.quizWidthValue.textContent = `${width}px`;
    this.elements.quizWidthShell.querySelectorAll('.quiz-resize-handle').forEach((handle) => {
      handle.setAttribute('aria-valuenow', String(width));
      handle.setAttribute('aria-valuetext', `${width} pixels`);
    });
    if (save) appStorage.setItem('vs_quizWidth', String(width));
  }

  initQuizWidthControls() {
    const { quizWidthShell, rangeQuizWidth, btnResetQuizWidth } = this.elements;
    this._listen(rangeQuizWidth, 'input', (event) => {
      this.applyQuizWidth(event.target.value);
    });
    this._listen(btnResetQuizWidth, 'click', () => this.applyQuizWidth(900));

    quizWidthShell.querySelectorAll('.quiz-resize-handle').forEach((handle) => {
      let drag = null;
      const finishDrag = (commit = true) => {
        if (!drag) return;
        const finished = drag;
        drag = null;
        if (finished.active) {
          if (commit) appStorage.setItem('vs_quizWidth', String(this._quizWidth));
          else this.applyQuizWidth(finished.preferredWidth, false);
        }
        handle.classList.remove('is-dragging');
        document.body.classList.remove('quiz-width-resizing');
        if (handle.hasPointerCapture(finished.pointerId)) handle.releasePointerCapture(finished.pointerId);
      };
      this._dragCleanups.push(() => finishDrag(false));
      this._listen(handle, 'pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        const side = handle.classList.contains('quiz-resize-left') ? -1 : 1;
        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: quizWidthShell.getBoundingClientRect().width,
          preferredWidth: this._quizWidth,
          side,
          active: false
        };
        handle.setPointerCapture(event.pointerId);
      });
      this._listen(handle, 'pointermove', (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const dx = Math.abs(event.clientX - drag.startX);
        const dy = Math.abs(event.clientY - drag.startY);
        if (!drag.active) {
          if (dy > 8 && dy >= dx) {
            finishDrag(false);
            return;
          }
          if (dx < 8 || dx <= dy) return;
          drag.active = true;
          handle.classList.add('is-dragging');
          document.body.classList.add('quiz-width-resizing');
          const selection = window.getSelection();
          if (selection) selection.removeAllRanges();
        }
        event.preventDefault();
        const viewportWidth = window.innerWidth - (window.innerWidth <= 600 ? 16 : 40);
        const maxWidth = Math.max(1, Math.min(1800, viewportWidth));
        const minWidth = Math.min(320, maxWidth);
        const width = drag.startWidth + 2 * drag.side * (event.clientX - drag.startX);
        this.applyQuizWidth(Math.max(minWidth, Math.min(maxWidth, width)), false);
      });
      this._listen(handle, 'pointerup', () => finishDrag());
      this._listen(handle, 'pointercancel', () => finishDrag(false));
      this._listen(handle, 'lostpointercapture', () => finishDrag(false));
      this._listen(document, 'pointerdown', (event) => {
        if (drag && event.pointerType !== 'mouse' && !event.isPrimary) finishDrag(false);
      }, { capture: true, passive: true });
      this._listen(handle, 'keydown', (event) => {
        const current = this._quizWidth;
        const next = event.key === 'ArrowRight' ? current + 10 :
          event.key === 'ArrowLeft' ? current - 10 :
          event.key === 'Home' ? 320 : event.key === 'End' ? 1800 : null;
        if (next === null) return;
        event.preventDefault();
        this.applyQuizWidth(next);
      });
    });
  }
}
