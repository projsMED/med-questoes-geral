// Filtros do quiz: esquema, seleção por grupos, contagens e controles em duas etapas.
import { difficultyMap, questionTypeMap, questionTypes } from './utils.js?v=20261002-450b5';

export function createFilterState() {
  return {
    tags: [],
    excludedTags: [],
    diffs: [],
    types: [...questionTypes],
    folders: [],
    allTags: [],
    allDiffs: [],
    allTypes: [...questionTypes],
    allFolders: [],
    counts: { tags: {}, diffs: {}, types: {}, folders: {} },
    folderDescriptions: {},
    step: 1
  };
}

export function ensureFilterState(state) {
  if (!state.filters) {
    state.filters = createFilterState();
  }

  if (!Array.isArray(state.filters.tags)) state.filters.tags = [];
  if (!Array.isArray(state.filters.excludedTags)) {
    state.filters.excludedTags = [];
  }
  const excludedTagSet = new Set(state.filters.excludedTags);
  state.filters.tags = state.filters.tags.filter(
    (tag) => !excludedTagSet.has(tag)
  );
  if (!Array.isArray(state.filters.diffs)) state.filters.diffs = [];
  if (!Array.isArray(state.filters.types)) {
    state.filters.types = [...questionTypes];
  } else {
    state.filters.types = state.filters.types.map((t) => {
      if (t === 'ME-CH') return 'MEM';
      if (t === 'CH') return 'MVF';
      return t;
    });
  }
  state.filters.types = [...new Set(state.filters.types.filter((type) =>
    questionTypes.includes(type)
  ))];
  state.filters.allTypes = [...questionTypes];

  if (!state.filters.counts) state.filters.counts = {};
  if (!state.filters.counts.tags) state.filters.counts.tags = {};
  if (!state.filters.counts.diffs) state.filters.counts.diffs = {};
  if (!state.filters.counts.types) state.filters.counts.types = {};
  if (!state.filters.counts.folders) state.filters.counts.folders = {};

  if (!state.filters.folderDescriptions) {
    state.filters.folderDescriptions = {};
  }
}

export function selectQuestionGroups(state) {
  const deletedSet = new Set(state.deletedIndices || []);
  let strictPassIndices = new Set();
  const activeGroupIds = new Set();

  if (state.retryMode) {
    // No modo retry, só as questões salvas em retryIndices entram como "estritas"
    state.retryIndices.forEach((idx) => {
      if (deletedSet.has(idx)) return;
      strictPassIndices.add(idx);
      const q = state.questions[idx];
      if (q._groupData) {
        activeGroupIds.add(q._groupData.id);
      }
    });
  } else {
    // Modo normal: aplica filtros de pasta, tags, dificuldade e tipo.
    const includedTags = new Set(state.filters.tags);
    const excludedTags = new Set(state.filters.excludedTags || []);
    const selDiffs = new Set(state.filters.diffs);
    const rawTypes = state.filters.types || questionTypes;
    const selTypes = new Set(rawTypes.map((t) => {
      const up = String(t || '').toUpperCase();
      if (up === 'ME-CH') return 'MEM';
      if (up === 'CH') return 'MVF';
      return up;
    }));
    const selFolders = new Set(state.filters.folders);

    state.questions.forEach((q, idx) => {
      if (deletedSet.has(idx)) return;
      const qPathStr = q._path.join(' > ');
      if (!selFolders.has(qPathStr)) return;

      const qTags = q.tags && q.tags.length > 0 ? q.tags : ['__NO_TAG__'];
      const hasIncludedTag = qTags.some((tag) => includedTags.has(tag));
      const hasExcludedTag = qTags.some((tag) => excludedTags.has(tag));

      let hasDiff = false;
      const qDiff =
        q.dificuldade !== undefined && q.dificuldade !== null
          ? q.dificuldade
          : '__NO_DIFF__';
      hasDiff = selDiffs.has(qDiff);

      let type = (q.tipo || '').toUpperCase();
      if (type === 'ME-CH') type = 'MEM';
      if (type === 'CH') type = 'MVF';
      const hasType = selTypes.has(type);

      if (hasIncludedTag && !hasExcludedTag && hasDiff && hasType) {
        strictPassIndices.add(idx);
        if (q._groupData) {
          activeGroupIds.add(q._groupData.id);
        }
      }
    });
  }

  let finalIndices = [];
  const forcedIndices = [];
  let processedIndices = new Set();
  const selectedFolders = new Set(state.filters.folders);

  state.questions.forEach((q, idx) => {
    if (processedIndices.has(idx)) return;
    if (deletedSet.has(idx)) return;

    // No modo normal, respeita filtro de pasta aqui também
    if (!state.retryMode) {
      const qPathStr = q._path.join(' > ');
      if (!selectedFolders.has(qPathStr)) return;
    }

    if (q._groupData) {
      const groupId = q._groupData.id;
      if (activeGroupIds.has(groupId)) {
        const groupIndices = [];

        state.questions.forEach((innerQ, innerIdx) => {
          if (deletedSet.has(innerIdx)) return;
          if (innerQ._groupData && innerQ._groupData.id === groupId) {
            let allowedByFolder = true;
            if (!state.retryMode) {
              allowedByFolder = selectedFolders.has(innerQ._path.join(' > '));
            }

            if (allowedByFolder) {
              groupIndices.push(innerIdx);
              processedIndices.add(innerIdx);

              // Se não está na lista estrita, é questão "forçada" (contexto)
              if (!strictPassIndices.has(innerIdx)) {
                forcedIndices.push(innerIdx);
              }
            }
          }
        });

        if (groupIndices.length > 0) {
          finalIndices.push(groupIndices);
        }
      }
    } else {
      if (strictPassIndices.has(idx)) {
        finalIndices.push([idx]);
        processedIndices.add(idx);
      }
    }
  });
  return { groups: finalIndices, forcedIndices };
}

export class QuizFilters {
  constructor({ elements, getState, onChange, onGenerate, onInfo }) {
    this.elements = elements;
    this.getState = getState;
    this.onChange = onChange;
    this.onGenerate = onGenerate;
    this.onInfo = onInfo;
    this._listeners = new Map();
  }

  get state() { return this.getState(); }

  _listen(group, target, type, listener) {
    target.addEventListener(type, listener);
    if (!this._listeners.has(group)) this._listeners.set(group, []);
    this._listeners.get(group).push(() => target.removeEventListener(type, listener));
  }

  _clearListeners(group) {
    this._listeners.get(group)?.forEach((cleanup) => cleanup());
    this._listeners.delete(group);
  }

  clear() {
    this._clearListeners('options');
    this._clearListeners('folders');
  }

  dispose() {
    this.clear();
    this._clearListeners('controls');
  }

  init() {
    this.dispose();
    // Filtro em etapas
    this._listen('controls', this.elements.btnGoToStep2, 'click', () => {
      this.state.filters.step = 2;
      this.prepareStep2();
      this.onChange?.();
    });

    this._listen('controls', this.elements.btnBackToStep1, 'click', () => {
      this.state.filters.step = 1;
      this.showStep1();
      this.onChange?.();
    });

    this._listen('controls', this.elements.btnToggleAllIncludedTags, 'click', () =>
      this.toggleAllIncludedTags()
    );
    this._listen('controls', this.elements.btnToggleAllExcludedTags, 'click', () =>
      this.toggleAllExcludedTags()
    );
    this._listen('controls', this.elements.btnExcludeNotIncludedTags, 'click', () =>
      this.excludeAllTagsNotIncluded()
    );

    // IMPORTANTE: ao gerar pelo filtro, sai do modo retry
    this._listen('controls', this.elements.btnGenerate, 'click', () => {
      this.onGenerate?.();
    });
  }

  renderFilterDescription() {
    if (!this.state.quizJson) return;
    const desc = this.state.quizJson.descricao || '';
    const el = this.elements.filterDescription;
    if (desc.trim()) {
      el.innerHTML = `<strong>Sobre este Quiz:</strong><br>${desc.replace(
        /\n/g,
        '<br>'
      )}`;
      el.style.display = 'block';
    } else {
      el.innerHTML = '';
      el.style.display = 'none';
    }
  }

  extractFiltersData() {
    if (!this.state.filters) {
      this.state.filters = createFilterState();
    }

    this.state.filters.counts = { tags: {}, diffs: {}, types: {}, folders: {} };

    const tagsSet = new Set();
    const diffsSet = new Set();

    this.state.questions.forEach((q) => {
      // tags
      if (q.tags && q.tags.length > 0) {
        q.tags.forEach((t) => {
          tagsSet.add(t);
          this.state.filters.counts.tags[t] =
            (this.state.filters.counts.tags[t] || 0) + 1;
        });
      } else {
        const noTagLabel = '__NO_TAG__';
        tagsSet.add(noTagLabel);
        this.state.filters.counts.tags[noTagLabel] =
          (this.state.filters.counts.tags[noTagLabel] || 0) + 1;
      }

      // diffs
      if (q.dificuldade !== undefined && q.dificuldade !== null) {
        const d = q.dificuldade;
        diffsSet.add(d);
        this.state.filters.counts.diffs[d] =
          (this.state.filters.counts.diffs[d] || 0) + 1;
      } else {
        const noDiffLabel = '__NO_DIFF__';
        diffsSet.add(noDiffLabel);
        this.state.filters.counts.diffs[noDiffLabel] =
          (this.state.filters.counts.diffs[noDiffLabel] || 0) + 1;
      }

      let type = (q.tipo || '').toUpperCase();
      if (type === 'ME-CH') type = 'MEM';
      if (type === 'CH') type = 'MVF';
      if (questionTypes.includes(type)) {
        this.state.filters.counts.types[type] =
          (this.state.filters.counts.types[type] || 0) + 1;
      }
    });

    this.state.filters.allTags = Array.from(tagsSet).sort();
    this.state.filters.allDiffs = Array.from(diffsSet).sort();
    this.state.filters.allTypes = [...questionTypes];

    if (!this.state.filters.tags || this.state.filters.tags.length === 0) {
      this.state.filters.tags = [...this.state.filters.allTags];
    }
    if (!Array.isArray(this.state.filters.excludedTags)) {
      this.state.filters.excludedTags = [];
    }
    if (!this.state.filters.diffs || this.state.filters.diffs.length === 0) {
      this.state.filters.diffs = [...this.state.filters.allDiffs];
    }
    if (!Array.isArray(this.state.filters.types)) {
      this.state.filters.types = [...this.state.filters.allTypes];
    }
  }

  renderFilterUI() {
    this._clearListeners('options');
    const createCheckbox = (
      value,
      labelBase,
      container,
      selectedList,
      countDict,
      onChange = null
    ) => {
      const item = document.createElement('label');
      item.className = 'filter-item';

      const count = countDict[value] || 0;
      const labelText = `${labelBase} (${count})`;

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = value;
      chk.checked = selectedList.includes(value);

      this._listen('options', chk, 'change', () => {
        if (onChange) {
          onChange(chk.checked);
        } else {
          if (chk.checked) {
            if (!selectedList.includes(value)) selectedList.push(value);
          } else {
            const idx = selectedList.indexOf(value);
            if (idx > -1) selectedList.splice(idx, 1);
          }
          this.updateGenerateButton();
          this.onChange?.();
        }
      });

      item.appendChild(chk);
      item.appendChild(document.createTextNode(labelText));
      container.appendChild(item);
    };

    this.elements.tagList.innerHTML = '';
    this.state.filters.allTags.forEach((tag) => {
      const label = tag === '__NO_TAG__' ? 'Sem tag' : tag;
      createCheckbox(
        tag,
        label,
        this.elements.tagList,
        this.state.filters.tags,
        this.state.filters.counts.tags,
        (checked) => {
          this.setTagFilterValue('tags', tag, checked);
          if (checked) this.setTagFilterValue('excludedTags', tag, false);
          this.renderFilterUI();
          this.onChange?.();
        }
      );
    });

    this.elements.excludedTagList.innerHTML = '';
    this.state.filters.allTags.forEach((tag) => {
      const label = tag === '__NO_TAG__' ? 'Sem tag' : tag;
      createCheckbox(
        tag,
        label,
        this.elements.excludedTagList,
        this.state.filters.excludedTags,
        this.state.filters.counts.tags,
        (checked) => {
          this.setTagFilterValue('excludedTags', tag, checked);
          if (checked) this.setTagFilterValue('tags', tag, false);
          this.renderFilterUI();
          this.onChange?.();
        }
      );
    });

    this.elements.diffList.innerHTML = '';
    this.state.filters.allDiffs.forEach((diff) => {
      const label =
        diff === '__NO_DIFF__'
          ? 'Sem dificuldade'
          : difficultyMap[diff] || `Nível ${diff}`;
      createCheckbox(
        diff,
        label,
        this.elements.diffList,
        this.state.filters.diffs,
        this.state.filters.counts.diffs
      );
    });

    this.elements.typeList.innerHTML = '';
    this.state.filters.allTypes.forEach((type) => {
      createCheckbox(
        type,
        questionTypeMap[type] || type,
        this.elements.typeList,
        this.state.filters.types,
        this.state.filters.counts.types
      );
    });

    const allIncluded =
      this.state.filters.allTags.length > 0 &&
      this.state.filters.allTags.every((tag) => this.state.filters.tags.includes(tag));
    const allExcluded =
      this.state.filters.allTags.length > 0 &&
      this.state.filters.allTags.every((tag) =>
        this.state.filters.excludedTags.includes(tag)
      );
    this.elements.btnToggleAllIncludedTags.textContent = allIncluded
      ? 'Desselecionar todas'
      : 'Selecionar todas';
    this.elements.btnToggleAllExcludedTags.textContent = allExcluded
      ? 'Desselecionar todas'
      : 'Selecionar todas';
    const noTags = this.state.filters.allTags.length === 0;
    this.elements.btnToggleAllIncludedTags.disabled = noTags;
    this.elements.btnToggleAllExcludedTags.disabled = noTags;
    this.elements.btnExcludeNotIncludedTags.disabled = noTags;

    this.updateGenerateButton();
  }

  setTagFilterValue(filterKey, tag, selected) {
    const list = this.state.filters[filterKey];
    const index = list.indexOf(tag);
    if (selected && index === -1) list.push(tag);
    if (!selected && index !== -1) list.splice(index, 1);
  }

  toggleAllIncludedTags() {
    const allTags = this.state.filters.allTags;
    const allSelected =
      allTags.length > 0 && allTags.every((tag) => this.state.filters.tags.includes(tag));
    this.state.filters.tags = allSelected ? [] : [...allTags];
    if (!allSelected) this.state.filters.excludedTags = [];
    this.renderFilterUI();
    this.onChange?.();
  }

  toggleAllExcludedTags() {
    const allTags = this.state.filters.allTags;
    const allSelected =
      allTags.length > 0 &&
      allTags.every((tag) => this.state.filters.excludedTags.includes(tag));
    this.state.filters.excludedTags = allSelected ? [] : [...allTags];
    if (!allSelected) this.state.filters.tags = [];
    this.renderFilterUI();
    this.onChange?.();
  }

  excludeAllTagsNotIncluded() {
    const included = new Set(this.state.filters.tags);
    this.state.filters.excludedTags = this.state.filters.allTags.filter(
      (tag) => !included.has(tag)
    );
    this.renderFilterUI();
    this.onChange?.();
  }

  updateGenerateButton() {
    if (!this.state.filters || !this.state.filters.allTags) return;

    const allTagsSel =
      this.state.filters.tags.length === this.state.filters.allTags.length;
    const allDiffsSel =
      this.state.filters.diffs.length === this.state.filters.allDiffs.length;
    const allTypesSel =
      this.state.filters.types.length === this.state.filters.allTypes.length;

    this.elements.btnGenerate.textContent =
      !allTagsSel ||
      this.state.filters.excludedTags.length > 0 ||
      !allDiffsSel ||
      !allTypesSel
        ? 'Gerar quiz filtrado'
        : 'Gerar quiz';
  }

  // ===== Filtro por pasta (Step 1/2) =====
  prepareStep1() {
    this.clear();
    this.elements.filterStep1.classList.remove('hidden');
    this.elements.filterStep2.classList.add('hidden');

    const folderSet = new Set();
    this.state.filters.counts.folders = {};

    this.state.questions.forEach((q) => {
      const pathStr = q._path.join(' > ');
      folderSet.add(pathStr);
      this.state.filters.counts.folders[pathStr] =
        (this.state.filters.counts.folders[pathStr] || 0) + 1;
    });

    this.state.filters.allFolders = Array.from(folderSet).sort();

    if (this.state.filters.folders.length === 0) {
      this.state.filters.folders = [...this.state.filters.allFolders];
    }

    if (
      Object.keys(this.state.filters.folderDescriptions).length === 0 &&
      this.state.quizJson
    ) {
      this.extractFolderDescriptions(this.state.quizJson.conteudo);
    }

    this.renderFolderUI();
  }

  showStep1() {
    this.elements.filterStep1.classList.remove('hidden');
    this.elements.filterStep2.classList.add('hidden');
  }

  prepareStep2() {
    this.elements.filterStep1.classList.add('hidden');
    this.elements.filterStep2.classList.remove('hidden');

    const selFolders = new Set(this.state.filters.folders);
    const tagsSet = new Set();
    const diffsSet = new Set();

    this.state.filters.counts.tags = {};
    this.state.filters.counts.diffs = {};
    this.state.filters.counts.types = {};

    this.state.questions.forEach((q) => {
      const pathStr = q._path.join(' > ');
      if (!selFolders.has(pathStr)) return;

      if (q.tags && q.tags.length > 0) {
        q.tags.forEach((t) => {
          tagsSet.add(t);
          this.state.filters.counts.tags[t] =
            (this.state.filters.counts.tags[t] || 0) + 1;
        });
      } else {
        const noTag = '__NO_TAG__';
        tagsSet.add(noTag);
        this.state.filters.counts.tags[noTag] =
          (this.state.filters.counts.tags[noTag] || 0) + 1;
      }

      if (q.dificuldade !== undefined && q.dificuldade !== null) {
        const d = q.dificuldade;
        diffsSet.add(d);
        this.state.filters.counts.diffs[d] =
          (this.state.filters.counts.diffs[d] || 0) + 1;
      } else {
        const noDiff = '__NO_DIFF__';
        diffsSet.add(noDiff);
        this.state.filters.counts.diffs[noDiff] =
          (this.state.filters.counts.diffs[noDiff] || 0) + 1;
      }

      let type = (q.tipo || '').toUpperCase();
      if (type === 'ME-CH') type = 'MEM';
      if (type === 'CH') type = 'MVF';
      if (questionTypes.includes(type)) {
        this.state.filters.counts.types[type] =
          (this.state.filters.counts.types[type] || 0) + 1;
      }
    });

    this.state.filters.allTags = Array.from(tagsSet).sort();
    this.state.filters.allDiffs = Array.from(diffsSet).sort();
    this.state.filters.allTypes = [...questionTypes];

    this.state.filters.tags = this.state.filters.tags.filter((t) =>
      tagsSet.has(t)
    );
    this.state.filters.excludedTags = this.state.filters.excludedTags.filter((t) =>
      tagsSet.has(t)
    );
    this.state.filters.diffs = this.state.filters.diffs.filter((d) =>
      diffsSet.has(d)
    );
    this.state.filters.types = this.state.filters.types.map((t) => {
      if (t === 'ME-CH') return 'MEM';
      if (t === 'CH') return 'MVF';
      return t;
    });
    this.state.filters.types = [...new Set(this.state.filters.types.filter((type) =>
      questionTypes.includes(type)
    ))];

    if (
      this.state.filters.diffs.length === 0 &&
      this.state.filters.allDiffs.length > 0
    ) {
      this.state.filters.diffs = [...this.state.filters.allDiffs];
    }

    this.renderFilterUI();
  }

  renderFolderUI() {
    this._clearListeners('folders');
    const container = this.elements.folderTree;
    container.innerHTML = '';

    const tree = {};

    this.state.filters.allFolders.forEach((pathStr) => {
      const parts = pathStr.split(' > ');
      let current = tree;

      parts.forEach((part, idx) => {
        if (!current[part]) {
          current[part] = {
            name: part,
            fullPath: parts.slice(0, idx + 1).join(' > '),
            children: {},
            count: 0
          };
        }
        if (idx === parts.length - 1) {
          current[part].count =
            this.state.filters.counts.folders[pathStr] || 0;
        }
        current = current[part].children;
      });
    });

    const buildDom = (nodeChildren, parentUl) => {
      Object.keys(nodeChildren)
        .sort()
        .forEach((key) => {
          const node = nodeChildren[key];
          const li = document.createElement('li');
          li.className = 'ft-li';

          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.dataset.path = node.fullPath;

          const relatedPaths = this.state.filters.allFolders.filter((p) =>
            p.startsWith(node.fullPath)
          );
          const allSelected = relatedPaths.every((p) =>
            this.state.filters.folders.includes(p)
          );
          const someSelected = relatedPaths.some((p) =>
            this.state.filters.folders.includes(p)
          );

          chk.checked = allSelected;
          chk.indeterminate = someSelected && !allSelected;

          this._listen('folders', chk, 'change', () => {
            const isChecked = chk.checked;
            const pathsToToggle = this.state.filters.allFolders.filter((p) =>
              p.startsWith(node.fullPath)
            );

            pathsToToggle.forEach((p) => {
              if (isChecked) {
                if (!this.state.filters.folders.includes(p)) {
                  this.state.filters.folders.push(p);
                }
              } else {
                const idx = this.state.filters.folders.indexOf(p);
                if (idx > -1) this.state.filters.folders.splice(idx, 1);
              }
            });

            this.renderFolderUI();
            this.onChange?.();
          });

          const getTotalCount = (n) => {
            let total = n.count;
            Object.values(n.children).forEach((child) => {
              total += getTotalCount(child);
            });
            return total;
          };

          const totalNodeQuestions = getTotalCount(node);

          const label = document.createElement('label');
          label.className = 'ft-label';
          label.appendChild(chk);
          label.appendChild(document.createTextNode(node.name));

          const spanCount = document.createElement('span');
          spanCount.className = 'ft-count';
          spanCount.textContent = totalNodeQuestions;
          label.appendChild(spanCount);

          const desc = this.state.filters.folderDescriptions[node.fullPath];
          if (desc) {
            const btnDesc = document.createElement('span');
            btnDesc.className = 'btn-desc';
            btnDesc.textContent = '📝 Ver descrição';
            btnDesc.title = 'Clique para ver a descrição';

            this._listen('folders', btnDesc, 'click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.onInfo?.(node.name, desc);
            });

            label.appendChild(btnDesc);
          }

          li.appendChild(label);

          if (Object.keys(node.children).length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'ft-ul';
            buildDom(node.children, ul);
            li.appendChild(ul);
          }

          parentUl.appendChild(li);
        });
    };

    const rootUl = document.createElement('ul');
    rootUl.className = 'ft-ul root';
    buildDom(tree, rootUl);
    container.appendChild(rootUl);
  }

  extractFolderDescriptions(nodes, currentPath = []) {
    if (!Array.isArray(nodes)) return;

    nodes.forEach((node) => {
      if (node.tipo && node.tipo.toUpperCase() === 'FOLDER') {
        const folderName = node.nome || 'Sem Nome';
        const newPath = [...currentPath, folderName];
        const pathStr = newPath.join(' > ');

        if (node.descricao) {
          this.state.filters.folderDescriptions[pathStr] = node.descricao;
        }

        this.extractFolderDescriptions(node.conteudo, newPath);
      }
    });
  }
}
