// Marca-texto: seleção híbrida, destaques, menus e ciclo de vida.

const HIGHLIGHT_COLORS = [
  { key: 'yellow', label: 'Amarelo' },
  { key: 'orange', label: 'Laranja' },
  { key: 'red', label: 'Vermelho' },
  { key: 'pink', label: 'Rosa' },
  { key: 'purple', label: 'Roxo' },
  { key: 'violet', label: 'Violeta' },
  { key: 'blue', label: 'Azul' },
  { key: 'cyan', label: 'Ciano' },
  { key: 'green', label: 'Verde' },
  { key: 'lime', label: 'Lima' },
  { key: 'brown', label: 'Marrom' },
  { key: 'gray', label: 'Cinza' }
];

const HIGHLIGHT_COLOR_KEYS = new Set(HIGHLIGHT_COLORS.map((item) => item.key));

export class TextHighlighter {
  constructor({ container, getState, callbacks = {}, onBeforePopover = () => {} }) {
    this.container = container;
    this.getState = getState;
    this.callbacks = callbacks;
    this.onBeforePopover = onBeforePopover;
    this._highlightPopover = null;
    this._highlightPopoverCloser = null;
    this._highlightPopoverTimer = null;
    this._activeHighlightTargetKey = null;
    this._highlightTargets = new Map();
    this._hiddenHighlightTargets = new Set();
    this._touchHighlightGesture = null;
    this._lastHighlightPointerType = null;
    this._mouseHighlightEntry = null;
    this._touchHighlightPreviewLayer = null;
    this._touchHighlightPreviewFrame = null;
    this._touchHighlightAutoScrollFrame = null;
    this._suppressHighlightTapUntil = 0;
    this._supportsDirectTouchHighlight =
      'PointerEvent' in window &&
      !!(document.caretPositionFromPoint || document.caretRangeFromPoint);
    this._timers = new Set();
    this._disposed = false;
    this._highlightToast = null;
    this._onMouseUp = () => {
      const entry = this._mouseHighlightEntry;
      this._mouseHighlightEntry = null;
      if (entry) this._scheduleSelectionCapture(entry, 0);
    };
    this._onKeyDown = (event) => {
      if (event.key === 'Escape') this._hideHighlightPopover();
    };
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('keydown', this._onKeyDown);
  }

  // O estado persistente continua pertencendo ao controlador. Este componente
  // mantém somente interação/DOM e comunica alterações pelos callbacks.
  get _state() { return this.getState(); }

  beginRender() {
    this._mouseHighlightEntry = null;
    this._cancelTouchHighlightGesture();
    this._hideHighlightPopover();
    this._highlightTargets.forEach((entry) => this._releaseTarget(entry));
    this._highlightTargets.clear();
  }

  finishRender() {
    if (this._activeHighlightTargetKey && !this._highlightTargets.has(this._activeHighlightTargetKey)) {
      this._activeHighlightTargetKey = null;
    }
  }

  dispose() {
    this.beginRender();
    this.finishRender();
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('keydown', this._onKeyDown);
    this._timers.forEach((timer) => clearTimeout(timer));
    this._timers.clear();
    if (this._highlightToast) this._highlightToast.remove();
    this._highlightToast = null;
    this._hiddenHighlightTargets.clear();
    this._disposed = true;
  }

  _setTimer(callback, delay) {
    if (this._disposed) return null;
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      callback();
    }, delay);
    this._timers.add(timer);
    return timer;
  }

  _clearTimer(timer) {
    clearTimeout(timer);
    this._timers.delete(timer);
  }

  _listenToTarget(entry, type, listener, options) {
    entry.element.addEventListener(type, listener, options);
    entry.cleanups.push(() => entry.element.removeEventListener(type, listener, options));
  }

  _releaseTarget(entry) {
    if (this._touchHighlightGesture && this._touchHighlightGesture.entry === entry) {
      this._cancelTouchHighlightGesture();
    }
    if (this._mouseHighlightEntry === entry) this._mouseHighlightEntry = null;
    this._clearTimer(entry.captureTimer);
    entry.cleanups.forEach((cleanup) => cleanup());
    entry.cleanups = [];
  }

  _scheduleSelectionCapture(entry, delay) {
    this._clearTimer(entry.captureTimer);
    entry.captureTimer = this._setTimer(() => {
      entry.captureTimer = null;
      this._captureHighlightSelection(entry);
    }, delay);
  }

  // ===================== Marca-texto V3.9 =====================

  _highlightTargetKey(target) {
    return `${target.type}:${String(target.id)}`;
  }

  _getHighlightSettings() {
    const saved = (this._state && this._state.highlightSettings) || {};
    const color = HIGHLIGHT_COLOR_KEYS.has(saved.color) ? saved.color : 'yellow';
    const rawOpacity = Number(saved.opacity);
    const opacity = Number.isFinite(rawOpacity)
      ? Math.min(0.9, Math.max(0.15, rawOpacity))
      : 0.42;
    return { color, opacity };
  }

  _getTextHighlights(target) {
    if (!this._state || !this._state.textHighlights) return [];
    const bucketName = target.type === 'group' ? 'groups' : 'questions';
    const bucket = this._state.textHighlights[bucketName] || {};
    const highlights = bucket[String(target.id)];
    return Array.isArray(highlights) ? highlights : [];
  }

  _setTextHighlights(target, highlights) {
    const clean = Array.isArray(highlights) ? highlights : [];
    if (this.callbacks.onSetTextHighlights) {
      this.callbacks.onSetTextHighlights(target.type, String(target.id), clean);
    }
  }

  createControlsHtml() {
    const settings = this._getHighlightSettings();
    return `
      <button class="btn-highlight-color hidden" type="button" title="Escolher cor e opacidade do marca-texto">
        <span>Cor</span><span class="highlight-color-swatch" data-color="${settings.color}" aria-hidden="true"></span>
      </button>
      <span class="highlighter-button-group">
        <button class="btn-highlighter" type="button" aria-pressed="false" title="Ativar marca-texto neste enunciado">
          🖍️ Marca-texto
        </button>
        <button class="btn-highlighter-settings" type="button" aria-label="Opções do marca-texto" title="Opções do marca-texto">
          ⚙️
        </button>
      </span>
    `;
  }

  setupControls(scope, target) {
    if (!scope) return;
    const targetKey = this._highlightTargetKey(target);
    const highlighterBtn = scope.querySelector('.btn-highlighter');
    const settingsBtn = scope.querySelector('.btn-highlighter-settings');
    const colorBtn = scope.querySelector('.btn-highlight-color');
    if (!highlighterBtn || !settingsBtn || !colorBtn) return;

    highlighterBtn.dataset.highlightTargetKey = targetKey;
    settingsBtn.dataset.highlightTargetKey = targetKey;
    colorBtn.dataset.highlightTargetKey = targetKey;
    const isActive = this._activeHighlightTargetKey === targetKey;
    highlighterBtn.classList.toggle('active', isActive);
    highlighterBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    colorBtn.classList.toggle('hidden', !isActive);

    highlighterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._hideHighlightPopover();
      if (this._activeHighlightTargetKey === targetKey) {
        this.deactivate();
        return;
      }
      this._activateHighlighter(target);
    });

    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showHighlighterToolMenu(settingsBtn, target);
    });

    colorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showHighlightColorMenu(colorBtn.getBoundingClientRect(), target, null);
    });
  }

  _activateHighlighter(target) {
    const targetKey = this._highlightTargetKey(target);
    this._cancelTouchHighlightGesture();
    this.container.classList.remove('selection-mode');
    this.container.querySelectorAll('.btn-selection-mode').forEach((btn) => {
      btn.classList.remove('active');
    });
    this._activeHighlightTargetKey = targetKey;
    this._hiddenHighlightTargets.delete(targetKey);
    this.updateControls();
    const entry = this._highlightTargets.get(targetKey);
    if (entry) entry.element.classList.remove('highlights-hidden');
  }

  deactivate() {
    this._cancelTouchHighlightGesture();
    this._activeHighlightTargetKey = null;
    this._hideHighlightPopover();
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
    this.updateControls();
  }

  updateControls() {
    const settings = this._getHighlightSettings();
    this.container.querySelectorAll('.btn-highlighter').forEach((btn) => {
      const active = btn.dataset.highlightTargetKey === this._activeHighlightTargetKey;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.title = active
        ? 'Desativar marca-texto neste enunciado'
        : 'Ativar marca-texto neste enunciado';
    });
    this.container.querySelectorAll('.btn-highlight-color').forEach((btn) => {
      const active = btn.dataset.highlightTargetKey === this._activeHighlightTargetKey;
      btn.classList.toggle('hidden', !active);
      const swatch = btn.querySelector('.highlight-color-swatch');
      if (swatch) swatch.dataset.color = settings.color;
    });
    this._highlightTargets.forEach((entry, key) => {
      entry.element.classList.toggle('highlighter-active', key === this._activeHighlightTargetKey);
      entry.element.classList.toggle('touch-highlighter-supported', this._supportsDirectTouchHighlight);
      entry.element.classList.toggle('highlights-hidden', this._hiddenHighlightTargets.has(key));
    });
  }

  registerTarget(element, target, sourceIdentity = '') {
    if (!element) return;
    const targetKey = this._highlightTargetKey(target);
    const previous = this._highlightTargets.get(targetKey);
    if (previous) this._releaseTarget(previous);
    const entry = {
      element,
      cleanups: [],
      captureTimer: null,
      target: { type: target.type, id: String(target.id) },
      sourceHtml: element.innerHTML,
      sourceHash: this._hashHighlightSource(String(sourceIdentity || ''))
    };
    element.dataset.highlightTargetKey = targetKey;
    this._highlightTargets.set(targetKey, entry);
    this._renderTextHighlights(entry);

    // Um tablet pode alternar entre dedo, caneta e mouse sem recarregar.
    this._listenToTarget(entry, 'pointerdown', (e) => {
      this._lastHighlightPointerType = e.pointerType;
      if (e.pointerType === 'mouse') this._cancelTouchHighlightGesture();
    }, { capture: true, passive: true });

    this._listenToTarget(entry, 'mousedown', (e) => {
      if (e.button !== 0 || this._touchHighlightGesture) return;
      if (this._activeHighlightTargetKey === targetKey) this._mouseHighlightEntry = entry;
    });

    if (this._supportsDirectTouchHighlight) {
      this._setupTouchHighlighterListeners(element, entry);
    } else {
      this._listenToTarget(entry, 'touchend', () => {
        this._scheduleSelectionCapture(entry, 280);
      }, { passive: true });
    }

    this._listenToTarget(entry, 'contextmenu', (e) => {
      const fragment = e.target.closest && e.target.closest('.text-highlight');
      if (!fragment || !element.contains(fragment)) {
        const touchModeActive =
          this._supportsDirectTouchHighlight &&
          this._activeHighlightTargetKey === targetKey &&
          ['touch', 'pen'].includes(e.pointerType || this._lastHighlightPointerType);
        if (touchModeActive) e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this._showHighlightContextMenu(fragment.getBoundingClientRect(), entry, fragment.dataset.highlightId);
    });

    this._listenToTarget(entry, 'click', (e) => {
      const fragment = e.target.closest && e.target.closest('.text-highlight');
      if (!fragment || !element.contains(fragment)) return;
      const touchLikeClick = ['touch', 'pen'].includes(
        e.pointerType || this._lastHighlightPointerType
      );
      if (!touchLikeClick) return;
      if (Date.now() < this._suppressHighlightTapUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      this._showHighlightContextMenu(fragment.getBoundingClientRect(), entry, fragment.dataset.highlightId);
    });

    this._listenToTarget(entry, 'keydown', (e) => {
      const fragment = e.target.closest && e.target.closest('.text-highlight');
      if (!fragment || !element.contains(fragment)) return;
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10') && e.key !== 'Enter') return;
      e.preventDefault();
      this._showHighlightContextMenu(fragment.getBoundingClientRect(), entry, fragment.dataset.highlightId);
    });

    this.updateControls();
  }

  _setupTouchHighlighterListeners(element, entry) {
    this._listenToTarget(entry, 'pointerdown', (e) => {
      if (!e.isPrimary || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
      if (e.button !== 0) return;
      if (this._activeHighlightTargetKey !== this._highlightTargetKey(entry.target)) return;
      const existingHighlight = e.target.closest && e.target.closest('.text-highlight');
      if (existingHighlight && element.contains(existingHighlight)) return;

      const startOffset = this._getTextOffsetFromPoint(entry.element, e.clientX, e.clientY);
      if (startOffset === null) return;
      const anchorWord = this._getTouchWordBounds(entry.element.textContent || '', startOffset, 0);
      if (!anchorWord) return;

      this._cancelTouchHighlightGesture();
      this._hideHighlightPopover();
      const selection = window.getSelection();
      if (selection) selection.removeAllRanges();

      this._touchHighlightGesture = {
        entry,
        element,
        pointerId: e.pointerId,
        startOffset,
        currentOffset: startOffset,
        anchorWord,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
        autoScrollVelocity: 0,
        settings: this._getHighlightSettings()
      };
      element.classList.add('touch-highlighting');
      try { element.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    this._listenToTarget(entry, 'pointermove', (e) => {
      const gesture = this._touchHighlightGesture;
      if (!gesture || gesture.pointerId !== e.pointerId || gesture.element !== element) return;
      gesture.lastX = e.clientX;
      gesture.lastY = e.clientY;

      if (!gesture.active) {
        const distance = Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY);
        if (distance < 5) {
          e.preventDefault();
          return;
        }
        gesture.active = true;
      }

      const offset = this._getTextOffsetFromPoint(entry.element, e.clientX, e.clientY);
      if (offset !== null) gesture.currentOffset = offset;
      this._updateTouchHighlightAutoScroll(e.clientY);
      this._scheduleTouchHighlightPreview();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    this._listenToTarget(entry, 'pointerup', (e) => {
      this._finishTouchHighlightGesture(e, true);
    }, { passive: false });

    this._listenToTarget(entry, 'pointercancel', (e) => {
      this._finishTouchHighlightGesture(e, false);
    });

    this._listenToTarget(entry, 'lostpointercapture', (e) => {
      const gesture = this._touchHighlightGesture;
      if (gesture && gesture.pointerId === e.pointerId && gesture.element === element) {
        this._finishTouchHighlightGesture(e, false);
      }
    });
  }

  _getTextOffsetFromPoint(root, clientX, clientY) {
    if (!root || !root.isConnected) return null;
    const bounds = root.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;

    const x = Math.max(bounds.left + 1, Math.min(bounds.right - 1, clientX));
    const visibleTop = Math.max(bounds.top + 1, 1);
    const visibleBottom = Math.min(bounds.bottom - 1, window.innerHeight - 1);
    const y = visibleTop <= visibleBottom
      ? Math.max(visibleTop, Math.min(visibleBottom, clientY))
      : Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, clientY));

    let node = null;
    let offset = 0;
    const previewLayer = this._touchHighlightPreviewLayer;
    const previousPreviewVisibility = previewLayer ? previewLayer.style.visibility : '';
    if (previewLayer) previewLayer.style.visibility = 'hidden';
    try {
      if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        if (position) {
          node = position.offsetNode;
          offset = position.offset;
        }
      }
      if (!node && document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range) {
          node = range.startContainer;
          offset = range.startOffset;
        }
      }
    } catch {
      return null;
    } finally {
      if (previewLayer) previewLayer.style.visibility = previousPreviewVisibility;
    }

    if (!node || (node !== root && !root.contains(node))) return null;
    const textLength = (root.textContent || '').length;
    return Math.max(0, Math.min(textLength, this._getTextBoundaryOffset(root, node, offset)));
  }

  _normalizeHighlightOffsets(root, rawStart, rawEnd) {
    const fullText = (root && root.textContent) || '';
    let start = Math.max(0, Math.min(fullText.length, Math.min(rawStart, rawEnd)));
    let end = Math.max(0, Math.min(fullText.length, Math.max(rawStart, rawEnd)));
    while (start < end && /\s/.test(fullText[start])) start++;
    while (end > start && /\s/.test(fullText[end - 1])) end--;
    return end > start ? { start, end } : null;
  }

  _isHighlightWordCoreCharacter(character) {
    return !!character && /[\p{L}\p{N}\p{M}_]/u.test(character);
  }

  _isHighlightWordCharacterAt(text, index) {
    if (!text || index < 0 || index >= text.length) return false;
    if (this._isHighlightWordCoreCharacter(text[index])) return true;
    if (!['-', "'", '’'].includes(text[index])) return false;
    return this._isHighlightWordCoreCharacter(text[index - 1]) &&
      this._isHighlightWordCoreCharacter(text[index + 1]);
  }

  _getTouchWordBounds(text, rawOffset, direction = 0) {
    if (!text) return null;
    const offset = Math.max(0, Math.min(text.length, Number(rawOffset) || 0));
    let index = -1;

    if (offset < text.length && this._isHighlightWordCharacterAt(text, offset)) {
      index = offset;
    } else if (offset > 0 && this._isHighlightWordCharacterAt(text, offset - 1)) {
      index = offset - 1;
    } else if (direction > 0) {
      for (let i = offset; i < text.length; i++) {
        if (this._isHighlightWordCharacterAt(text, i)) {
          index = i;
          break;
        }
      }
    } else if (direction < 0) {
      for (let i = Math.min(text.length - 1, offset - 1); i >= 0; i--) {
        if (this._isHighlightWordCharacterAt(text, i)) {
          index = i;
          break;
        }
      }
    } else {
      let left = offset - 1;
      let right = offset;
      while (left >= 0 || right < text.length) {
        if (left >= 0 && this._isHighlightWordCharacterAt(text, left)) {
          index = left;
          break;
        }
        if (right < text.length && this._isHighlightWordCharacterAt(text, right)) {
          index = right;
          break;
        }
        left--;
        right++;
      }
    }

    if (index < 0) return null;
    let start = index;
    let end = index + 1;
    while (start > 0 && this._isHighlightWordCharacterAt(text, start - 1)) start--;
    while (end < text.length && this._isHighlightWordCharacterAt(text, end)) end++;
    return { start, end };
  }

  _getTouchWordSnappedRange(gesture) {
    if (!gesture || !gesture.entry || !gesture.anchorWord) return null;
    const text = gesture.entry.element.textContent || '';
    let direction = 0;
    if (gesture.currentOffset > gesture.startOffset) {
      direction = 1;
    } else if (gesture.currentOffset < gesture.startOffset) {
      direction = -1;
    } else {
      const dx = gesture.lastX - gesture.startX;
      const dy = gesture.lastY - gesture.startY;
      direction = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? -1 : 1) : (dx < 0 ? -1 : 1);
    }

    const focusWord = this._getTouchWordBounds(text, gesture.currentOffset, direction);
    if (!focusWord) return null;
    return direction < 0
      ? { start: focusWord.start, end: gesture.anchorWord.end, direction }
      : { start: gesture.anchorWord.start, end: focusWord.end, direction };
  }

  _getTouchHighlightRange(gesture) {
    const snapped = this._getTouchWordSnappedRange(gesture);
    if (!snapped) return null;
    const text = gesture.entry.element.textContent || '';
    const current = this._getTextHighlights(gesture.entry.target)
      .map((item) => ({ start: Number(item.start), end: Number(item.end) }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    let { start, end } = snapped;
    if (snapped.direction > 0) {
      for (const item of current) {
        if (item.end <= start || item.start >= end) continue;
        if (item.start <= start) return null;
        const splitsWord = this._isHighlightWordCharacterAt(text, item.start - 1) &&
          this._isHighlightWordCharacterAt(text, item.start);
        const collisionWord = splitsWord
          ? this._getTouchWordBounds(text, item.start, 0)
          : null;
        end = collisionWord ? collisionWord.start : item.start;
        break;
      }
    } else {
      for (let i = current.length - 1; i >= 0; i--) {
        const item = current[i];
        if (item.start >= end || item.end <= start) continue;
        if (item.end >= end) return null;
        const splitsWord = this._isHighlightWordCharacterAt(text, item.end - 1) &&
          this._isHighlightWordCharacterAt(text, item.end);
        const collisionWord = splitsWord
          ? this._getTouchWordBounds(text, item.end, 0)
          : null;
        start = collisionWord ? collisionWord.end : item.end;
        break;
      }
    }
    return this._normalizeHighlightOffsets(gesture.entry.element, start, end);
  }

  _scheduleTouchHighlightPreview() {
    if (this._touchHighlightPreviewFrame !== null) return;
    this._touchHighlightPreviewFrame = requestAnimationFrame(() => {
      this._touchHighlightPreviewFrame = null;
      this._renderTouchHighlightPreview();
    });
  }

  _renderTouchHighlightPreview() {
    const gesture = this._touchHighlightGesture;
    const offsets = this._getTouchHighlightRange(gesture);
    if (!gesture || !gesture.active || !offsets) {
      this._removeTouchHighlightPreview();
      return;
    }
    const range = this._rangeFromHighlightOffsets(gesture.entry.element, offsets.start, offsets.end);
    if (!range) {
      this._removeTouchHighlightPreview();
      return;
    }

    const rawRects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
      .map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      }));
    const rects = [];
    rawRects.forEach((rect) => {
      const previous = rects[rects.length - 1];
      if (
        previous &&
        Math.abs(previous.top - rect.top) <= 2 &&
        Math.abs(previous.bottom - rect.bottom) <= 2 &&
        rect.left <= previous.right + 2
      ) {
        previous.right = Math.max(previous.right, rect.right);
        previous.top = Math.min(previous.top, rect.top);
        previous.bottom = Math.max(previous.bottom, rect.bottom);
      } else {
        rects.push({ ...rect });
      }
    });

    if (!this._touchHighlightPreviewLayer) {
      this._touchHighlightPreviewLayer = document.createElement('div');
      this._touchHighlightPreviewLayer.className = 'touch-highlight-preview-layer';
      document.body.appendChild(this._touchHighlightPreviewLayer);
    }

    const fragment = document.createDocumentFragment();
    rects.forEach((rect) => {
      const segment = document.createElement('div');
      segment.className = 'text-highlight touch-highlight-preview-segment';
      segment.dataset.color = gesture.settings.color;
      segment.style.setProperty('--highlight-opacity', String(gesture.settings.opacity));
      segment.style.left = `${rect.left - 1}px`;
      segment.style.top = `${rect.top + 1}px`;
      segment.style.width = `${Math.max(1, rect.right - rect.left + 2)}px`;
      segment.style.height = `${Math.max(1, rect.bottom - rect.top)}px`;
      fragment.appendChild(segment);
    });
    this._touchHighlightPreviewLayer.replaceChildren(fragment);
  }

  _removeTouchHighlightPreview() {
    if (this._touchHighlightPreviewLayer) {
      this._touchHighlightPreviewLayer.remove();
      this._touchHighlightPreviewLayer = null;
    }
  }

  _updateTouchHighlightAutoScroll(clientY) {
    const gesture = this._touchHighlightGesture;
    if (!gesture || !gesture.active) return;
    const edge = Math.min(80, Math.max(48, window.innerHeight * 0.12));
    let velocity = 0;
    if (clientY < edge) {
      velocity = -Math.ceil(12 * Math.min(1, (edge - clientY) / edge));
    } else if (clientY > window.innerHeight - edge) {
      velocity = Math.ceil(12 * Math.min(1, (clientY - (window.innerHeight - edge)) / edge));
    }
    gesture.autoScrollVelocity = velocity;
    if (velocity !== 0 && this._touchHighlightAutoScrollFrame === null) {
      this._touchHighlightAutoScrollFrame = requestAnimationFrame(() => this._runTouchHighlightAutoScroll());
    }
  }

  _runTouchHighlightAutoScroll() {
    this._touchHighlightAutoScrollFrame = null;
    const gesture = this._touchHighlightGesture;
    if (!gesture || !gesture.active || gesture.autoScrollVelocity === 0) return;
    const before = window.scrollY || window.pageYOffset || 0;
    window.scrollBy(0, gesture.autoScrollVelocity);
    const after = window.scrollY || window.pageYOffset || 0;
    if (after === before) {
      gesture.autoScrollVelocity = 0;
      return;
    }
    const offset = this._getTextOffsetFromPoint(gesture.entry.element, gesture.lastX, gesture.lastY);
    if (offset !== null) gesture.currentOffset = offset;
    this._scheduleTouchHighlightPreview();
    this._touchHighlightAutoScrollFrame = requestAnimationFrame(() => this._runTouchHighlightAutoScroll());
  }

  _finishTouchHighlightGesture(e, shouldCommit) {
    const gesture = this._touchHighlightGesture;
    if (!gesture || (e && gesture.pointerId !== e.pointerId)) return;
    if (e) {
      const offset = this._getTextOffsetFromPoint(gesture.entry.element, e.clientX, e.clientY);
      if (offset !== null) gesture.currentOffset = offset;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const offsets = shouldCommit && gesture.active
      ? this._getTouchHighlightRange(gesture)
      : null;

    this._touchHighlightGesture = null;
    gesture.element.classList.remove('touch-highlighting');
    try {
      if (gesture.element.hasPointerCapture(gesture.pointerId)) {
        gesture.element.releasePointerCapture(gesture.pointerId);
      }
    } catch {}
    if (this._touchHighlightPreviewFrame !== null) {
      cancelAnimationFrame(this._touchHighlightPreviewFrame);
      this._touchHighlightPreviewFrame = null;
    }
    if (this._touchHighlightAutoScrollFrame !== null) {
      cancelAnimationFrame(this._touchHighlightAutoScrollFrame);
      this._touchHighlightAutoScrollFrame = null;
    }
    this._removeTouchHighlightPreview();

    if (gesture.active) this._suppressHighlightTapUntil = Date.now() + 450;
    if (offsets) this._commitTextHighlight(gesture.entry, offsets.start, offsets.end);
  }

  _cancelTouchHighlightGesture() {
    if (this._touchHighlightGesture) {
      this._finishTouchHighlightGesture(null, false);
      return;
    }
    if (this._touchHighlightPreviewFrame !== null) {
      cancelAnimationFrame(this._touchHighlightPreviewFrame);
      this._touchHighlightPreviewFrame = null;
    }
    if (this._touchHighlightAutoScrollFrame !== null) {
      cancelAnimationFrame(this._touchHighlightAutoScrollFrame);
      this._touchHighlightAutoScrollFrame = null;
    }
    this._removeTouchHighlightPreview();
  }

  _captureHighlightSelection(entry) {
    if (!entry || this._activeHighlightTargetKey !== this._highlightTargetKey(entry.target)) return;
    if (!entry.element.isConnected || this._highlightTargets.get(this._highlightTargetKey(entry.target)) !== entry) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!entry.element.contains(range.startContainer) || !entry.element.contains(range.endContainer)) return;

    const start = this._getTextBoundaryOffset(entry.element, range.startContainer, range.startOffset);
    const end = this._getTextBoundaryOffset(entry.element, range.endContainer, range.endOffset);
    this._commitTextHighlight(entry, start, end);
    selection.removeAllRanges();
  }

  _commitTextHighlight(entry, rawStart, rawEnd) {
    if (!entry || !entry.element || !entry.element.isConnected) return false;
    const offsets = this._normalizeHighlightOffsets(entry.element, rawStart, rawEnd);
    if (!offsets) return false;
    const { start, end } = offsets;

    const settings = this._getHighlightSettings();
    const current = this._getTextHighlights(entry.target).map((item) => ({ ...item }));
    const overlaps = current.some((item) => start < Number(item.end) && end > Number(item.start));
    if (overlaps) {
      this._showHighlightToast('Não é possível sobrepor duas marcações.');
      return false;
    }

    const range = this._rangeFromHighlightOffsets(entry.element, start, end);
    const now = new Date().toISOString();
    const highlight = {
      id: this._createHighlightId(),
      start,
      end,
      text: range ? range.toString().trim() : '',
      color: settings.color,
      opacity: settings.opacity,
      sourceHash: entry.sourceHash,
      createdAt: now,
      updatedAt: now
    };
    const merged = this._mergeAdjacentHighlights([...current, highlight], entry);
    this._hiddenHighlightTargets.delete(this._highlightTargetKey(entry.target));
    this._setTextHighlights(entry.target, merged);
    this._refreshHighlightTarget(entry.target);
    return true;
  }

  _getTextBoundaryOffset(root, node, offset) {
    if (!root || !node) return 0;
    let total = 0;

    if (node.nodeType === Node.TEXT_NODE) {
      total = Math.max(0, Math.min(node.textContent.length, offset));
    } else {
      const children = Array.from(node.childNodes || []);
      const limit = Math.max(0, Math.min(children.length, offset));
      for (let i = 0; i < limit; i++) total += this._nodeTextLength(children[i]);
    }

    let current = node;
    while (current && current !== root) {
      let sibling = current.previousSibling;
      while (sibling) {
        total += this._nodeTextLength(sibling);
        sibling = sibling.previousSibling;
      }
      current = current.parentNode;
    }
    return current === root ? total : 0;
  }

  _nodeTextLength(node) {
    return node && node.textContent ? node.textContent.length : 0;
  }

  _collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  _rangeFromHighlightOffsets(root, start, end) {
    const nodes = this._collectTextNodes(root);
    if (nodes.length === 0) return null;
    let cursor = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;

    nodes.forEach((node) => {
      const length = node.textContent.length;
      if (!startNode && start <= cursor + length) {
        startNode = node;
        startOffset = Math.max(0, Math.min(length, start - cursor));
      }
      if (!endNode && end <= cursor + length) {
        endNode = node;
        endOffset = Math.max(0, Math.min(length, end - cursor));
      }
      cursor += length;
    });

    if (!startNode) {
      startNode = nodes[nodes.length - 1];
      startOffset = startNode.textContent.length;
    }
    if (!endNode) {
      endNode = nodes[nodes.length - 1];
      endOffset = endNode.textContent.length;
    }

    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch {
      return null;
    }
  }

  _mergeAdjacentHighlights(highlights, entry, preferredId = null) {
    const sorted = highlights
      .filter((item) => item && Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end)))
      .map((item) => ({ ...item, start: Number(item.start), end: Number(item.end) }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];

    sorted.forEach((item) => {
      const previous = merged[merged.length - 1];
      const sameStyle = previous &&
        previous.color === item.color &&
        Math.abs(Number(previous.opacity) - Number(item.opacity)) < 0.001 &&
        previous.sourceHash === item.sourceHash;
      if (sameStyle && previous.end === item.start) {
        if (preferredId && item.id === preferredId) previous.id = preferredId;
        previous.end = item.end;
        previous.updatedAt = new Date().toISOString();
        const range = this._rangeFromHighlightOffsets(entry.element, previous.start, previous.end);
        previous.text = range ? range.toString().trim() : `${previous.text || ''}${item.text || ''}`;
      } else {
        merged.push(item);
      }
    });
    return merged;
  }

  _renderTextHighlights(entry) {
    if (!entry || !entry.element) return;
    const root = entry.element;
    const rootLength = (root.textContent || '').length;
    const candidateHighlights = this._getTextHighlights(entry.target)
      .filter((item) => {
        const start = Number(item && item.start);
        const end = Number(item && item.end);
        const sourceMatches = !item.sourceHash || item.sourceHash === entry.sourceHash;
        return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= rootLength && sourceMatches;
      })
      .map((item) => ({
        ...item,
        start: Number(item.start),
        end: Number(item.end),
        color: HIGHLIGHT_COLOR_KEYS.has(item.color) ? item.color : 'yellow',
        opacity: Math.min(0.9, Math.max(0.15, Number(item.opacity) || 0.42))
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const highlights = [];
    candidateHighlights.forEach((item) => {
      const previous = highlights[highlights.length - 1];
      if (!previous || item.start >= previous.end) highlights.push(item);
    });

    const textNodes = this._collectTextNodes(root);
    const focusableIds = new Set();
    let globalOffset = 0;

    textNodes.forEach((textNode) => {
      const originalText = textNode.textContent;
      const nodeStart = globalOffset;
      const nodeEnd = nodeStart + originalText.length;
      globalOffset = nodeEnd;
      const intersecting = highlights.filter((item) => item.start < nodeEnd && item.end > nodeStart);
      if (intersecting.length === 0) return;

      const fragment = document.createDocumentFragment();
      let localOffset = 0;
      intersecting.forEach((item) => {
        const markStart = Math.max(0, item.start - nodeStart);
        const markEnd = Math.min(originalText.length, item.end - nodeStart);
        if (markStart > localOffset) {
          fragment.appendChild(document.createTextNode(originalText.slice(localOffset, markStart)));
        }
        if (markEnd > markStart) {
          const span = document.createElement('span');
          span.className = 'text-highlight';
          if (nodeStart + markStart === item.start) {
            span.classList.add('text-highlight-start');
          }
          if (nodeStart + markEnd === item.end) {
            span.classList.add('text-highlight-end');
          }
          span.dataset.highlightId = item.id;
          span.dataset.color = item.color;
          span.style.setProperty('--highlight-opacity', String(item.opacity));
          span.textContent = originalText.slice(markStart, markEnd);
          span.title = 'Botão direito para opções da marcação';
          if (!focusableIds.has(item.id)) {
            span.tabIndex = 0;
            focusableIds.add(item.id);
          }
          fragment.appendChild(span);
        }
        localOffset = Math.max(localOffset, markEnd);
      });
      if (localOffset < originalText.length) {
        fragment.appendChild(document.createTextNode(originalText.slice(localOffset)));
      }
      textNode.parentNode.replaceChild(fragment, textNode);
    });

    const targetKey = this._highlightTargetKey(entry.target);
    root.classList.toggle('highlighter-active', targetKey === this._activeHighlightTargetKey);
    root.classList.toggle('highlights-hidden', this._hiddenHighlightTargets.has(targetKey));
  }

  _refreshHighlightTarget(target) {
    const key = this._highlightTargetKey(target);
    const entry = this._highlightTargets.get(key);
    if (!entry || !entry.element.isConnected) return;
    entry.element.innerHTML = entry.sourceHtml;
    this._renderTextHighlights(entry);
    this.updateControls();
  }

  _refreshAllHighlightTargets() {
    this._highlightTargets.forEach((entry) => {
      if (!entry.element.isConnected) return;
      entry.element.innerHTML = entry.sourceHtml;
      this._renderTextHighlights(entry);
    });
    this.updateControls();
  }

  _createHighlightId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  _hashHighlightSource(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(36)}`;
  }

  _getHighlightCount() {
    if (!this._state || !this._state.textHighlights) return 0;
    const countBucket = (bucket) => Object.values(bucket || {}).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0
    );
    return countBucket(this._state.textHighlights.questions) +
      countBucket(this._state.textHighlights.groups);
  }

  _showHighlighterToolMenu(anchor, target) {
    const targetKey = this._highlightTargetKey(target);
    const count = this._getTextHighlights(target).length;
    const total = this._getHighlightCount();
    const hidden = this._hiddenHighlightTargets.has(targetKey);
    const targetLabel = target.type === 'group' ? 'deste texto-base' : 'desta questão';
    const menu = document.createElement('div');
    menu.className = 'highlight-popover highlight-tool-menu';
    const active = this._activeHighlightTargetKey === targetKey;
    const directTouchMode =
      this._supportsDirectTouchHighlight &&
      ['touch', 'pen'].includes(this._lastHighlightPointerType);
    menu.innerHTML = `
      <div class="highlight-popover-title">Opções do marca-texto</div>
      <button type="button" class="highlight-menu-visibility">
        ${hidden ? '👁️ Mostrar marcações' : '🙈 Ocultar marcações'}
      </button>
      <button type="button" class="highlight-menu-clear-target" ${count === 0 ? 'disabled' : ''}>
        🗑️ Apagar ${targetLabel} (${count})
      </button>
      <button type="button" class="highlight-menu-clear-all danger" ${total === 0 ? 'disabled' : ''}>
        🗑️ Apagar todas da sessão (${total})
      </button>
      <div class="highlight-popover-hint">${active
        ? (directTouchMode
            ? 'Arraste o dedo ou a caneta sobre o texto para marcá-lo.'
            : 'Selecione com o mouse ou arraste o dedo sobre o texto para marcá-lo.')
        : 'Ative o marca-texto para criar novas marcações.'}</div>
    `;

    menu.querySelector('.highlight-menu-visibility').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._hiddenHighlightTargets.has(targetKey)) {
        this._hiddenHighlightTargets.delete(targetKey);
      } else {
        this._hiddenHighlightTargets.add(targetKey);
      }
      const entry = this._highlightTargets.get(targetKey);
      if (entry) entry.element.classList.toggle('highlights-hidden', this._hiddenHighlightTargets.has(targetKey));
      this._showHighlighterToolMenu(anchor, target);
    });

    menu.querySelector('.highlight-menu-clear-target').addEventListener('click', (e) => {
      e.stopPropagation();
      if (count === 0) return;
      if (!confirm(`Apagar ${count} marcação(ões) ${targetLabel}?`)) return;
      this._setTextHighlights(target, []);
      this._refreshHighlightTarget(target);
      this._showHighlighterToolMenu(anchor, target);
    });

    menu.querySelector('.highlight-menu-clear-all').addEventListener('click', (e) => {
      e.stopPropagation();
      if (total === 0) return;
      if (!confirm(`Apagar todas as ${total} marcação(ões) desta sessão?`)) return;
      if (this.callbacks.onClearAllTextHighlights) this.callbacks.onClearAllTextHighlights();
      this._refreshAllHighlightTargets();
      this._showHighlighterToolMenu(anchor, target);
    });

    this._mountHighlightPopover(menu, anchor.getBoundingClientRect());
  }

  _showHighlightContextMenu(rect, entry, highlightId) {
    const highlight = this._getTextHighlights(entry.target).find((item) => item.id === highlightId);
    if (!highlight) return;
    const menu = document.createElement('div');
    menu.className = 'highlight-popover highlight-context-menu';
    menu.innerHTML = `
      <button type="button" class="highlight-context-delete danger">🗑️ Deletar</button>
      <button type="button" class="highlight-context-copy">📋 Copiar</button>
      <button type="button" class="highlight-context-color">🎨 Alterar cor</button>
      <button type="button" class="highlight-context-cancel">Cancelar</button>
    `;

    menu.querySelector('.highlight-context-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      const next = this._getTextHighlights(entry.target).filter((item) => item.id !== highlightId);
      this._setTextHighlights(entry.target, next);
      this._hideHighlightPopover();
      this._refreshHighlightTarget(entry.target);
    });
    menu.querySelector('.highlight-context-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      const text = this._getHighlightText(entry, highlight);
      this._copyPlainText(text);
      this._hideHighlightPopover();
    });
    menu.querySelector('.highlight-context-color').addEventListener('click', (e) => {
      e.stopPropagation();
      const menuRect = menu.getBoundingClientRect();
      this._showHighlightColorMenu(menuRect, entry.target, highlightId);
    });
    menu.querySelector('.highlight-context-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideHighlightPopover();
    });

    this._mountHighlightPopover(menu, rect);
  }

  _showHighlightColorMenu(rect, target, highlightId = null) {
    const existing = highlightId
      ? this._getTextHighlights(target).find((item) => item.id === highlightId)
      : null;
    const settings = existing
      ? {
          color: HIGHLIGHT_COLOR_KEYS.has(existing.color) ? existing.color : 'yellow',
          opacity: Math.min(0.9, Math.max(0.15, Number(existing.opacity) || 0.42))
        }
      : this._getHighlightSettings();
    const menu = document.createElement('div');
    menu.className = 'highlight-popover highlight-color-menu';
    menu.innerHTML = `
      <div class="highlight-popover-title">${existing ? 'Alterar marcação' : 'Próximas marcações'}</div>
      <div class="highlight-color-grid" role="group" aria-label="Cores do marca-texto">
        ${HIGHLIGHT_COLORS.map((item) => `
          <button type="button" class="highlight-color-option${item.key === settings.color ? ' selected' : ''}"
            data-color="${item.key}" title="${item.label}" aria-label="${item.label}"></button>
        `).join('')}
      </div>
      <label class="highlight-opacity-control">
        <span>Opacidade: <strong>${Math.round(settings.opacity * 100)}%</strong></span>
        <input type="range" min="15" max="90" step="5" value="${Math.round(settings.opacity * 100)}">
      </label>
      <button type="button" class="highlight-color-close">Fechar</button>
    `;

    let selectedColor = settings.color;
    let selectedOpacity = settings.opacity;
    const apply = () => {
      if (highlightId) {
        this._updateSingleHighlight(target, highlightId, {
          color: selectedColor,
          opacity: selectedOpacity
        });
      } else if (this.callbacks.onHighlightSettingsChange) {
        this.callbacks.onHighlightSettingsChange({
          color: selectedColor,
          opacity: selectedOpacity
        });
        this.updateControls();
      }
    };

    menu.querySelectorAll('.highlight-color-option').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedColor = button.dataset.color;
        menu.querySelectorAll('.highlight-color-option').forEach((item) => {
          item.classList.toggle('selected', item === button);
        });
        apply();
      });
    });

    const opacityInput = menu.querySelector('input[type="range"]');
    const opacityLabel = menu.querySelector('.highlight-opacity-control strong');
    opacityInput.addEventListener('input', (e) => {
      selectedOpacity = Number(e.target.value) / 100;
      opacityLabel.textContent = `${e.target.value}%`;
    });
    opacityInput.addEventListener('change', (e) => {
      e.stopPropagation();
      selectedOpacity = Number(e.target.value) / 100;
      apply();
    });
    menu.querySelector('.highlight-color-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideHighlightPopover();
    });

    this._mountHighlightPopover(menu, rect);
  }

  _updateSingleHighlight(target, highlightId, patch) {
    const key = this._highlightTargetKey(target);
    const entry = this._highlightTargets.get(key);
    if (!entry) return;
    const now = new Date().toISOString();
    const next = this._getTextHighlights(target).map((item) => (
      item.id === highlightId ? { ...item, ...patch, updatedAt: now } : { ...item }
    ));
    const merged = this._mergeAdjacentHighlights(next, entry, highlightId);
    this._setTextHighlights(target, merged);
    this._refreshHighlightTarget(target);
  }

  _getHighlightText(entry, highlight) {
    if (highlight.text) return highlight.text;
    const range = this._rangeFromHighlightOffsets(entry.element, Number(highlight.start), Number(highlight.end));
    const fromRange = range ? range.toString().trim() : '';
    return fromRange;
  }

  _copyPlainText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => this._copyPlainTextFallback(text));
      return;
    }
    this._copyPlainTextFallback(text);
  }

  _copyPlainTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch {}
    textarea.remove();
  }

  _mountHighlightPopover(menu, anchorRect) {
    this._hideHighlightPopover();
    this.onBeforePopover();
    document.body.appendChild(menu);
    const margin = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - width - margin));
    let top = anchorRect.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, anchorRect.top - height - 6);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    this._highlightPopover = menu;

    this._highlightPopoverCloser = (e) => {
      if (menu.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.btn-highlighter, .btn-highlighter-settings, .btn-highlight-color')) return;
      this._hideHighlightPopover();
    };
    this._highlightPopoverTimer = this._setTimer(() => {
      this._highlightPopoverTimer = null;
      if (this._highlightPopover === menu) {
        document.addEventListener('pointerdown', this._highlightPopoverCloser);
      }
    }, 0);
  }

  _hideHighlightPopover() {
    this._clearTimer(this._highlightPopoverTimer);
    this._highlightPopoverTimer = null;
    if (this._highlightPopoverCloser) {
      document.removeEventListener('pointerdown', this._highlightPopoverCloser);
      this._highlightPopoverCloser = null;
    }
    if (this._highlightPopover) {
      this._highlightPopover.remove();
      this._highlightPopover = null;
    }
  }

  _showHighlightToast(message) {
    const previous = document.querySelector('.highlight-toast');
    if (previous) previous.remove();
    const toast = document.createElement('div');
    this._highlightToast = toast;
    toast.className = 'highlight-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    this._setTimer(() => toast.classList.add('visible'), 10);
    this._setTimer(() => {
      toast.classList.remove('visible');
      this._setTimer(() => toast.remove(), 180);
    }, 2200);
  }

}
