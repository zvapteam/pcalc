(function () {
  'use strict';

  /* ================= НАСТРОЙКИ =================
     Не меняйте здесь: адрес и ключ задаются в блоке «Блок 1 — настройки»
     через window.PCALC_CONFIG. Без них калькулятор работает в демо-режиме. */
  var CONFIG = Object.assign({
    API_URL: '',
    API_KEY: '',
    DEFAULT_MARGIN: 70,
    DEFAULT_TAX: 9,
    DEFAULT_CONT: 20
  }, window.PCALC_CONFIG || {}); // настройки задаются в отдельном блоке Tilda «Блок 1 — настройки»
  const APP_VERSION = '4.8';
  /* ============================================== */

  const root = document.getElementById('pcalc');
  if (!root) return;
  const REMOTE = !!CONFIG.API_URL;

  /* ---------- демо-данные (ставки из вашей таблицы, услуги — примеры) ---------- */
  const DEMO_RATES = [
    ['ИИ Артист', 1370, 'За секунду генерации'], ['Креативный директор', 4000, 'За час'], ['Арт директор', 3000, 'За час'],
    ['Монтаж', 1500, 'За час'], ['Колорист', 17000, 'За час'], ['Композитор', 110000, 'За ролик 15 сек'],
    ['Звукорежиссёр', 1500, 'За час'], ['Дизайнер', 2166.67, 'За час'], ['Моушн дизайнер', 2500, 'За час'],
    ['VFX', 0, ''], ['Диктор', 1000, 'За ролик 15 сек']
  ].map(r => ({ name: r[0], rate: r[1], note: r[2], unit: unitFromNote(r[2]) }));
  const S_ = (name, qty) => ({ kind: 'spec', name, qty });
  const E_ = (name, amount) => ({ kind: 'expense', name, amount });
  const DEMO_SERVICES = [
    { name: 'Раскадровка', lines: [S_('Креативный директор', 4), S_('Арт директор', 6), S_('Дизайнер', 16)] },
    { name: 'Фотостиль', lines: [S_('Арт директор', 8), S_('Дизайнер', 12), E_('Генерации изображений', 5000)] },
    { name: 'OLV 15 сек', lines: [S_('Креативный директор', 10), S_('ИИ Артист', 15), S_('Монтаж', 12), S_('Колорист', 2), S_('Композитор', 1), S_('Звукорежиссёр', 4), S_('Диктор', 1), E_('Кредиты на генерации', 15000)] },
    { name: 'Моушн-графика', lines: [S_('Арт директор', 4), S_('Моушн дизайнер', 24)] },
    { name: 'Озвучка', lines: [S_('Диктор', 1), S_('Звукорежиссёр', 3)] }
  ];

  const UNITS = ['ч', 'сек', 'ролик', 'день', 'шт', 'проект'];
  const HUES = [226, 14, 158, 272, 38, 192, 336, 96, 250, 0, 60, 300];
  const STATUSES = [
    { k: 'draft', n: 'Черновик', c: '#9a958a' },
    { k: 'sent', n: 'Отправлена', c: '#2a78d6' },
    { k: 'approved', n: 'Согласована', c: '#1baf7a' },
    { k: 'work', n: 'В работе', c: '#8e5bd6' },
    { k: 'rejected', n: 'Отклонена', c: '#d0453a' }
  ];
  const stOf = k => STATUSES.find(s => s.k === k) || STATUSES[0];

  /* ---------- утилиты ---------- */
  function unitFromNote(note) {
    const n = String(note || '').toLowerCase();
    if (n.includes('секунд')) return 'сек';
    if (n.includes('ролик') || n.includes('реклам')) return 'ролик';
    if (n.includes('час')) return 'ч';
    if (n.includes('день') || n.includes('смен')) return 'день';
    if (n.includes('проект')) return 'проект';
    if (n.includes('фото')) return 'шт';
    return 'ч';
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const fmtN = n => Math.round(n || 0).toLocaleString('ru-RU');
  const fmt = n => fmtN(n) + ' ₽';
  const fmtQ = n => (Math.round((n || 0) * 100) / 100).toLocaleString('ru-RU');
  const fmtP = n => (Math.round((n || 0) * 10) / 10).toLocaleString('ru-RU') + '%';
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtDate = iso => { if (!iso) return '—'; const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] : iso; };
  const nameKey = n => String(n || '').trim().toLowerCase();
  const svg = (d, s) => `<svg viewBox="0 0 24 24" width="${s || 15}" height="${s || 15}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    chev: svg('<path d="M9 6l6 6-6 6"/>', 13),
    openTabs: svg('<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M8 5v4"/>'),
    folderIn: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13h6M13 11l2 2-2 2"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    chevDown: svg('<path d="M6 9l6 6 6-6"/>', 12),
    restore: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/>'),
    down: svg('<path d="M12 4v12M6 10l6 6 6-6M5 20h14"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 14),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
    split: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
    folderPlus: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>', 17),
    archive: svg('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>'),
    sidebar: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
    search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>', 14),
    save: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
    compare: svg('<path d="M8 4v16M16 4v16M3 9h5M16 15h5"/>')
  };

  /* ---------- расчёты ---------- */
  const lineCost = l => l.kind === 'expense' ? num(l.amount) : num(l.rate) * num(l.qty);
  const svcCost = s => s.lines.reduce((a, l) => a + lineCost(l), 0);
  const projDirect = p => p.services.reduce((a, s) => a + svcCost(s), 0);
  const marginShare = p => Math.min(95, Math.max(0, num(p.marginPct))) / 100;
  /* Непредвиденные = % от прямых.
     Цена без налога = (прямые + непредвиденные) / (1 − маржа): при 70% делим на 0,3.
     Скидка задаётся от цены для клиента (в % или ₽) и целиком уменьшает маржу.
     Налог начисляется сверху на цену без налога после скидки.
     part — прямые расходы одной услуги: скидка в ₽ делится пропорционально. */
  function finOf(p, part) {
    const D = projDirect(p);
    const d = part == null ? D : part;
    const k = num(p.contPct) / 100, ms = marginShare(p), tx = num(p.taxPct) / 100;
    const c = d * k;
    const pre = (d + c) / (1 - ms);
    const marginFull = pre - d - c;
    const preAll = (D + D * k) / (1 - ms);
    const discAll = p.discMode === 'rub' ? Math.min(num(p.discount) / (1 + tx), preAll) : preAll * Math.min(100, num(p.discount)) / 100;
    const disc = part == null ? discAll : (D > 0 ? discAll * d / D : 0);
    const net = pre - disc;
    const t = net * tx;
    return { direct: d, cont: c, marginFull, margin: marginFull - disc, disc, pre, net, tax: t, total: net + t, gross: pre * (1 + tx) };
  }

  /* ---------- API ---------- */
  const DEMO_KEY = 'pcalc-demo-v1';
  const demo = {
    data: null,
    load() {
      if (this.data) return;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { }
      this.data = saved || { folders: [], projects: {} };
      if (!this.data.templates) this.data.templates = clone(DEMO_SERVICES);
    },
    persist() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.data)); } catch (e) { } }
  };
  const summary = p => ({
    id: p.id, name: p.name, date: p.date, createdAt: p.createdAt || '', version: p.version || 1, family: p.family || p.id,
    status: p.status || 'draft', updatedBy: p.updatedBy || '', folderId: p.folderId || '', trashed: !!p.trashed, archived: !!p.archived, total: (p.totals && p.totals.client) || 0, updatedAt: p.updatedAt || ''
  });

  async function apiGet(action, params) {
    const u = new URL(CONFIG.API_URL);
    u.searchParams.set('action', action);
    u.searchParams.set('key', CONFIG.API_KEY);
    Object.keys(params || {}).forEach(k => u.searchParams.set(k, params[k]));
    const r = await fetch(u.toString());
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Ошибка сервера');
    return j;
  }
  async function apiPost(action, payload) {
    const r = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, key: CONFIG.API_KEY }, payload)) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Ошибка сервера');
    return j;
  }
  const api = {
    async bootstrap() {
      if (REMOTE) return apiGet('bootstrap');
      demo.load();
      return { rates: DEMO_RATES, services: demo.data.templates, folders: demo.data.folders, projects: Object.values(demo.data.projects).map(summary) };
    },
    async getProject(id) {
      if (REMOTE) return (await apiGet('project', { id })).project;
      return clone(demo.data.projects[id]);
    },
    async saveProject(p, base, force) {
      if (REMOTE) return apiPost('saveProject', { project: p, base: base || '', force: !!force });
      p.updatedAt = new Date().toISOString();
      demo.data.projects[p.id] = clone(p); demo.persist();
      return { updatedAt: p.updatedAt };
    },
    async patchProject(id, fields) {
      if (REMOTE) return apiPost('patchProject', { id, fields });
      if (demo.data.projects[id]) Object.assign(demo.data.projects[id], fields);
      demo.persist(); return {};
    },
    async deleteProject(id) {
      if (REMOTE) return apiPost('deleteProject', { id });
      delete demo.data.projects[id]; demo.persist(); return {};
    },
    async saveFolders(list) {
      if (REMOTE) return apiPost('saveFolders', { folders: list });
      demo.data.folders = clone(list); demo.persist(); return {};
    },
    async patchMany(ids, fields) {
      if (REMOTE) return apiPost('patchMany', { ids, fields });
      ids.forEach(id => { if (demo.data.projects[id]) Object.assign(demo.data.projects[id], fields); });
      demo.persist(); return {};
    },
    async saveTemplate(t) {
      if (REMOTE) return apiPost('saveTemplate', { template: t });
      const i = demo.data.templates.findIndex(x => nameKey(x.name) === nameKey(t.name));
      if (i >= 0) demo.data.templates[i] = clone(t); else demo.data.templates.push(clone(t));
      demo.persist(); return {};
    },
    async deleteTemplate(name) {
      if (REMOTE) return apiPost('deleteTemplate', { name });
      demo.data.templates = demo.data.templates.filter(x => nameKey(x.name) !== nameKey(name));
      demo.persist(); return {};
    }
  };

  /* ---------- состояние ---------- */
  const S = {
    loading: true, error: '',
    rates: [], templates: [], folders: [], list: [], cache: {},
    panes: [{ tabs: [], active: null, view: 'compose', exportOpen: false }], focus: 0, current: null,
    showTrash: false, showArchive: false, open: {}, sel: new Set(), selMode: false, anchor: null, visible: [],
    q: '', stFilter: '', menu: null, renaming: null, renameFocus: false,
    dirty: new Set(), saveState: {}, saveTimer: null, chain: Promise.resolve(),
    hist: {}, cmpMode: 'client', modalHTML: ''
  };
  const UI_KEY = 'pcalc-ui-v1';
  const ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (e) { return {}; } })();
  const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { } };
  S.sideW = Math.min(480, Math.max(240, ui.sideW || 300));
  S.sideCollapsed = !!ui.collapsed; S.sideOpen = false;
  S.me = ui.name || '';
  S.presence = {}; S.base = {};
  const SESSION = uid();
  const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;
  let RP = null; // проект, который сейчас рисуется (для второго окна)
  const cp = () => RP || S.current;
  const rateBy = name => S.rates.find(r => r.name.toLowerCase() === String(name).toLowerCase());
  const findSvc = id => S.current && S.current.services.find(s => s.id === id);
  const hueOf = id => { const p = cp(); return HUES[Math.max(0, p ? p.services.findIndex(s => s.id === id) : 0) % HUES.length]; };
  const lineLight = i => 46 + (i % 5) * 8;
  const segColor = (h, i) => `hsl(${h} 58% ${lineLight(i)}%)`;
  const famOf = x => x.family || x.id;
  function displayName(s, p) {
    p = p || cp();
    const same = p ? p.services.filter(x => nameKey(x.name) === nameKey(s.name)) : [s];
    return same.length > 1 ? `${s.name} ${same.indexOf(s) + 1}` : s.name;
  }
  function makeLine(src) {
    if (src.kind === 'expense') return { id: uid(), kind: 'expense', name: src.name, amount: num(src.amount) };
    const r = rateBy(src.name);
    return { id: uid(), kind: 'spec', name: src.name, unit: src.unit || (r ? r.unit : 'ч'), rate: src.rate != null && src.rate !== '' ? num(src.rate) : (r ? r.rate : 0), qty: num(src.qty) };
  }
  function normalize(p) {
    p.services = p.services || [];
    if (p.marginPct == null) p.marginPct = CONFIG.DEFAULT_MARGIN;
    if (p.taxPct == null) p.taxPct = CONFIG.DEFAULT_TAX;
    if (p.contPct == null) p.contPct = CONFIG.DEFAULT_CONT;
    if (!p.status) p.status = 'draft';
    if (p.discount == null) p.discount = 0;
    if (!p.discMode) p.discMode = 'pct';
    if (!p.version) p.version = 1;
    if (!p.family) p.family = p.id;
    return p;
  }

  /* ---------- окна и вкладки ---------- */
  const pane = i => S.panes[i == null ? S.focus : i];
  function paneProj(i) {
    const k = pane(i) && pane(i).active;
    return k && k.startsWith('p:') ? S.cache[k.slice(2)] || null : null;
  }
  function setFocus(i) {
    if (i == null || !S.panes[i]) return;
    S.focus = i;
    S.current = paneProj(i);
  }
  const paneEl = i => root.querySelector(`[data-pane="${i == null ? S.focus : i}"]`);
  /* ---------- локальный кэш: список и сметы открываются сразу, сервер догоняет в фоне ---------- */
  const LC = {
    get(k) { try { return JSON.parse(localStorage.getItem('pcalc-' + k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('pcalc-' + k, JSON.stringify(v)); } catch (e) { LC.trim(); } },
    trim() { try { Object.keys(localStorage).filter(k => k.startsWith('pcalc-p-')).forEach(k => localStorage.removeItem(k)); } catch (e) { } }
  };
  const cacheProject = p => { if (REMOTE && p && p.updatedAt) LC.set('p-' + p.id, p); };
  let bootTimer = null;
  // снимок списка для мгновенного старта — обновляется после любых изменений
  function persistBoot() {
    if (!REMOTE || S.loading) return;
    clearTimeout(bootTimer);
    bootTimer = setTimeout(() => LC.set('boot', { rates: S.rates, services: S.templates, folders: S.folders, projects: S.list }), 800);
  }
  async function load(id) {
    if (!S.cache[id]) {
      const sum = S.list.find(x => x.id === id), saved = REMOTE ? LC.get('p-' + id) : null;
      // локальная копия годится, только если она той же редакции, что и на сервере
      const p = saved && sum && sum.updatedAt && saved.updatedAt === sum.updatedAt ? saved : await api.getProject(id);
      S.cache[id] = normalize(p); S.base[id] = S.cache[id].updatedAt || '';
      cacheProject(S.cache[id]);
    }
    ensureHist(S.cache[id]);
    return S.cache[id];
  }
  async function openIn(id, pi) {
    pi = pi == null ? S.focus : pi;
    try { await load(id); } catch (e) { toast('Не удалось открыть смету: ' + e.message); return; }
    const pn = pane(pi), key = 'p:' + id;
    if (!pn.tabs.includes(key)) pn.tabs.push(key);
    pn.active = key; pn.exportOpen = false;
    if (isNarrow()) S.sideOpen = false;
    setFocus(pi); render(); heartbeatSoon();
  }
  function closeTab(pi, key) {
    const pn = pane(pi);
    const i = pn.tabs.indexOf(key);
    if (i < 0) return;
    pn.tabs.splice(i, 1);
    if (pn.active === key) pn.active = pn.tabs[Math.min(i, pn.tabs.length - 1)] || null;
    setFocus(S.focus); render(); heartbeatSoon();
  }
  function closeEverywhere(id) {
    S.panes.forEach(pn => {
      pn.tabs = pn.tabs.filter(k => k !== 'p:' + id && !(k.startsWith('c:') && k.slice(2).split(',').includes(id)));
      if (!pn.tabs.includes(pn.active)) pn.active = pn.tabs[0] || null;
    });
    setFocus(S.focus);
  }
  function splitOpen() {
    if (S.panes.length < 2) S.panes.push({ tabs: [], active: null, view: 'compose', exportOpen: false });
    setFocus(1); render();
  }
  function closePane(i) {
    if (S.panes.length < 2) return;
    S.panes.splice(i, 1);
    setFocus(0); render();
  }
  async function openCompare(ids) {
    ids = ids.slice(0, 4);
    if (ids.length < 2) { toast('Выберите от 2 до 4 смет для сравнения'); return; }
    try { for (const id of ids) await load(id); } catch (e) { toast('Не удалось загрузить: ' + e.message); return; }
    const key = 'c:' + ids.join(','), pn = pane();
    if (!pn.tabs.includes(key)) pn.tabs.push(key);
    pn.active = key; setFocus(S.focus); render();
  }

  /* ---------- история (отмена / повтор) ---------- */
  const snap = p => JSON.stringify(p, (k, v) => (k === 'updatedAt' || k === 'totals') ? undefined : v);
  function ensureHist(p) {
    if (!S.hist[p.id]) S.hist[p.id] = { u: [], r: [], last: snap(p), t: 0 };
    return S.hist[p.id];
  }
  function recordHistory(p) {
    const h = ensureHist(p), now = snap(p);
    if (now === h.last) return;
    if (!h.u.length || Date.now() - h.t > 700) { h.u.push(h.last); if (h.u.length > 80) h.u.shift(); }
    h.t = Date.now(); h.last = now; h.r = [];
  }
  function applySnap(p, json) {
    const o = JSON.parse(json);
    Object.keys(p).forEach(k => { if (!['id', 'updatedAt', 'totals'].includes(k)) delete p[k]; });
    Object.assign(p, o);
  }
  function undoRedo(dir) {
    const p = S.current;
    if (!p) return;
    const h = ensureHist(p);
    const from = dir < 0 ? h.u : h.r, to = dir < 0 ? h.r : h.u;
    if (!from.length) { toast(dir < 0 ? 'Нечего отменять' : 'Нечего повторять'); return; }
    to.push(h.last);
    const s = from.pop();
    applySnap(p, s); h.last = s; h.t = 0;
    commit(p, false); render();
  }

  /* ---------- сохранение ---------- */
  const SAVE_TEXT = { idle: '', pending: 'Есть изменения…', saving: 'Сохранение…', saved: 'Сохранено', error: 'Не сохранено — повторить', conflict: 'Конфликт правок' };
  function setSave(id, st) {
    S.saveState[id] = st;
    root.querySelectorAll(`[data-status="${id}"]`).forEach(el => {
      el.textContent = SAVE_TEXT[st] || '';
      el.className = 'pc-status' + (st === 'error' ? ' is-error' : '');
    });
  }
  function syncSummary(p) {
    const f = finOf(p);
    p.totals = { direct: Math.round(f.direct), client: Math.round(f.total) };
    const s = summary(p);
    const i = S.list.findIndex(x => x.id === p.id);
    if (i >= 0) S.list[i] = s; else S.list.push(s);
    persistBoot();
  }
  function commit(p, hist) {
    if (!p) return;
    if (hist !== false) recordHistory(p);
    syncSummary(p);
    S.dirty.add(p.id); setSave(p.id, 'pending');
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(saveAll, 900);
  }
  const markDirty = () => commit(S.current);
  function saveAll() {
    clearTimeout(S.saveTimer);
    const ids = Array.from(S.dirty); S.dirty.clear();
    ids.forEach(id => {
      const p = S.cache[id];
      if (!p) return;
      if (S.conflict && S.conflict[id]) return; // ждём решения пользователя
      p.updatedBy = S.me || '';
      syncSummary(p);
      const copy = clone(p), force = !!(S.force && S.force[id]);
      if (S.force) delete S.force[id];
      setSave(id, 'saving');
      S.chain = S.chain.catch(() => { }).then(() => api.saveProject(copy, S.base[id], force)).then(res => {
        if (res && res.conflict) { onConflict(id, res.theirs); return; }
        if (res && res.updatedAt) { p.updatedAt = res.updatedAt; S.base[id] = res.updatedAt; syncSummary(p); cacheProject(p); }
        if (!S.dirty.has(id)) setSave(id, 'saved');
      }, e => { S.dirty.add(id); setSave(id, 'error'); toast('Не удалось сохранить: ' + e.message); });
    });
    return S.chain;
  }
  async function flush() { if (S.dirty.size) saveAll(); await S.chain.catch(() => { }); }

  /* ---------- совместная работа: кто открыл смету и конфликт правок ---------- */
  S.conflict = {}; S.force = {};
  async function onConflict(id, theirs) {
    const p = S.cache[id];
    if (!p || !theirs) return;
    S.conflict[id] = true; setSave(id, 'conflict');
    const who = theirs.updatedBy ? `«${theirs.updatedBy}»` : 'другой пользователь';
    const c = await modal(`Смету «${p.name}» уже изменил ${who}`, [], '', {
      text: `Их версия сохранена ${fmtAgo(theirs.updatedAt)}. Ваши последние правки ещё не записаны. Выберите, какую версию оставить.`,
      buttons: [{ v: 'mine', label: 'Сохранить мою версию поверх', kind: 'danger' }, { v: 'theirs', label: 'Загрузить их версию (мои правки можно вернуть отменой)', kind: 'primary' }]
    });
    delete S.conflict[id];
    if (c && c.__btn === 'theirs') {
      recordHistory(p);
      applySnap(p, JSON.stringify(normalize(theirs)));
      p.updatedAt = theirs.updatedAt; S.base[id] = theirs.updatedAt;
      const h = ensureHist(p); h.u.push(h.last); h.last = snap(p); h.r = [];
      syncSummary(p); setSave(id, 'saved'); render();
      toast('Загружена их версия. Ctrl+Z вернёт ваши правки.');
    } else if (c && c.__btn === 'mine') {
      S.force[id] = true; S.dirty.add(id); saveAll();
    } else { setSave(id, 'error'); toast('Правки не сохранены — нажмите «Не сохранено», чтобы решить позже'); }
  }
  const openIds = () => Array.from(new Set([].concat(...S.panes.map(pn => pn.tabs.filter(k => k.startsWith('p:')).map(k => k.slice(2))))));
  let hbTimer = null;
  function heartbeatSoon() { clearTimeout(hbTimer); hbTimer = setTimeout(heartbeat, 600); }
  async function heartbeat() {
    clearTimeout(hbTimer);
    if (!REMOTE) return;
    try {
      const r = await apiPost('presence', { sid: SESSION, user: S.me || 'Без имени', ids: openIds(), editing: S.current ? S.current.id : '' });
      const next = JSON.stringify(r.presence || {});
      if (next !== JSON.stringify(S.presence)) {
        S.presence = r.presence || {};
        if (!drag && !dndPayload && !S.modalHTML && !S.renaming && !S.menu) render();
      }
    } catch (e) { }
    hbTimer = setTimeout(heartbeat, 25000);
  }
  function leavePresence() {
    if (!REMOTE || !navigator.sendBeacon) return;
    try { navigator.sendBeacon(CONFIG.API_URL, JSON.stringify({ action: 'presence', key: CONFIG.API_KEY, sid: SESSION, user: S.me, ids: [] })); } catch (e) { }
  }
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = n => `hsl(${[...String(n)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360} 55% 45%)`;
  function avatars(id, small) {
    const ps = S.presence[id] || [];
    if (!ps.length) return '';
    const names = ps.map(x => x.user + (x.editing ? ' (редактирует)' : ' (открыта)')).join(', ');
    return `<span class="pc-avatars${small ? ' is-sm' : ''}" title="Сейчас: ${esc(names)}">${ps.slice(0, 3).map(x => `<i style="background:${avatarColor(x.user)}"${x.editing ? ' class="is-edit"' : ''}>${esc(initials(x.user))}</i>`).join('')}</span>`;
  }
  function fmtAgo(iso) {
    if (!iso) return '';
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(d)) return '';
    if (d < 60) return 'только что';
    if (d < 3600) return Math.round(d / 60) + ' мин назад';
    if (d < 86400) return Math.round(d / 3600) + ' ч назад';
    if (d < 86400 * 7) return Math.round(d / 86400) + ' дн назад';
    return fmtDate(new Date(iso).toISOString().slice(0, 10));
  }

  /* ---------- рендер ---------- */
  let renderQueued = false;
  function render() {
    const ae = document.activeElement;
    let focus = null;
    if (ae && root.contains(ae) && ae.getAttribute('data-key')) {
      focus = { key: ae.getAttribute('data-key') };
      try { focus.a = ae.selectionStart; focus.b = ae.selectionEnd; } catch (e) { }
    }
    S.visible = [];
    root.innerHTML = renderSide() + renderMain() + renderMenu() + (S.modalHTML || '');
    if (S.renaming && S.renameFocus) {
      S.renameFocus = false;
      const el = root.querySelector('[data-inline]');
      if (el) { el.focus(); el.select(); }
    } else if (focus) {
      const el = root.querySelector(`[data-key="${CSS.escape(focus.key)}"]`);
      if (el) { el.focus(); try { if (focus.a != null) el.setSelectionRange(focus.a, focus.b); } catch (e) { } }
    }
    Object.keys(S.saveState).forEach(id => setSave(id, S.saveState[id]));
    // активная вкладка всегда видна в полосе вкладок
    root.querySelectorAll('.pc-tabs-scroll').forEach(sc => {
      const t = sc.querySelector('.pc-tabx.is-active');
      if (!t) return;
      if (t.offsetLeft < sc.scrollLeft) sc.scrollLeft = t.offsetLeft - 8;
      else if (t.offsetLeft + t.offsetWidth > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = t.offsetLeft + t.offsetWidth - sc.clientWidth + 8;
    });
  }
  function renderSoon() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }

  function sortGrouped(arr) {
    const key = {};
    // группа версий стоит на месте первой версии: новая версия не поднимает всю группу вверх
    arr.forEach(x => {
      const k = String(x.createdAt || x.date || x.updatedAt || '');
      if (!key[famOf(x)] || k < key[famOf(x)]) key[famOf(x)] = k;
    });
    return arr.slice().sort((a, b) => {
      const fa = famOf(a), fb = famOf(b);
      if (fa !== fb) return key[fb].localeCompare(key[fa]) || fb.localeCompare(fa);
      return (b.version || 1) - (a.version || 1);
    });
  }
  const isOpenAnywhere = id => S.panes.some(pn => pn.active === 'p:' + id);
  const matches = pr => (!S.q || nameKey(pr.name).includes(nameKey(S.q))) && (!S.stFilter || (pr.status || 'draft') === S.stFilter);

  function projItem(pr, mode) {
    const trashed = mode === 'trash';
    S.visible.push(pr.id);
    const cls = ['pc-proj'];
    if (isOpenAnywhere(pr.id)) cls.push('is-active');
    if (S.sel.has(pr.id)) cls.push('is-sel');
    const st = stOf(pr.status);
    const showCheck = S.selMode || S.sel.size > 0;
    const name = S.renaming && S.renaming.type === 'proj' && S.renaming.id === pr.id
      ? `<input class="pc-inline" data-inline data-key="inline" value="${esc(pr.name)}">`
      : `<div class="pc-proj-line"><i class="pc-st-dot" style="background:${st.c}" title="Статус: ${st.n}"></i><div class="pc-proj-name" data-name-of="${pr.id}" title="${esc(pr.name)}">${esc(pr.name || 'Без названия')}</div>${avatars(pr.id, true)}</div>`;
    return `<div class="${cls.join(' ')}${showCheck ? ' has-check' : ''}" draggable="${S.renaming ? 'false' : 'true'}" data-pid="${pr.id}" data-act="projClick"${trashed ? ' data-trashed="1"' : ''}${mode === 'archive' ? ' data-archived="1"' : ''}>
      ${showCheck ? `<span class="pc-check${S.sel.has(pr.id) ? ' is-on' : ''}" data-act="toggleSel" data-pid="${pr.id}"></span>` : ''}
      ${name}
      <div class="pc-proj-meta"><span class="pc-ver-tag">v${pr.version || 1}</span><span>${fmtDate(pr.date)} · ${fmt(pr.total)}</span><span class="pc-st-txt">${st.n}</span></div>
      <div class="pc-proj-tools"><button class="pc-icon" data-act="menu" data-type="proj" data-pid="${pr.id}" title="Действия">${IC.more}</button></div></div>`;
  }

  /* ---------- папки: вложенность, порядок, архив ---------- */
  const folderById = id => id ? S.folders.find(f => f.id === id) : null;
  function folderArchived(id) { let f = folderById(id), n = 0; while (f && n++ < 60) { if (f.archived) return true; f = folderById(f.parent); } return false; }
  function descendants(id) { const out = [id]; for (let i = 0; i < out.length; i++) S.folders.forEach(f => { if ((f.parent || '') === out[i] && f.id !== out[i]) out.push(f.id); }); return out; }
  const projFolder = p => folderById(p.folderId) ? p.folderId : '';
  const isArchivedProj = p => !!p.archived || folderArchived(projFolder(p));
  const isLive = p => !p.trashed && !isArchivedProj(p);
  function folderPath(id) { const parts = []; let f = folderById(id), n = 0; while (f && n++ < 60) { parts.unshift(f.name); f = folderById(f.parent); } return parts.join(' / '); }
  const saveFoldersNow = async () => { persistBoot(); try { await api.saveFolders(S.folders); } catch (e) { toast('Папки не сохранились: ' + e.message); } };

  function folderNode(f, pool, mode, filtering) {
    const subs = S.folders.filter(x => (x.parent || '') === f.id && f.id !== '' && (mode === 'archive' || !x.archived));
    const sub = subs.map(x => folderNode(x, pool, mode, filtering));
    const items = pool.filter(p => projFolder(p) === f.id && (mode !== 'archive' || folderArchived(f.id)));
    const count = items.length + sub.reduce((a, x) => a + x.count, 0);
    if (filtering && !count) return { html: '', count: 0 };
    const open = filtering || S.open[f.id] !== false;
    const renaming = S.renaming && S.renaming.type === 'folder' && S.renaming.id === f.id;
    const fname = renaming ? `<input class="pc-inline" data-inline data-key="inline" value="${esc(f.name)}">` : `<span class="pc-folder-name" data-fname="${f.id}">${esc(f.name)}</span>`;
    const tools = f.id ? `<span class="pc-folder-tools"><button class="pc-icon" data-act="menu" data-type="folder" data-fid="${f.id}" title="Действия">${IC.more}</button></span>` : '';
    const html = `<div class="pc-folder${open ? ' is-open' : ''}" data-folder="${f.id}" data-drop-folder="${f.id}">
      <div class="pc-folder-head${mode === 'archive' ? '' : ' pc-zone pc-zone-proj pc-zone-folder'}" data-fhead="${f.id}" ${f.id ? `draggable="${renaming ? 'false' : 'true'}" data-drag-folder="${f.id}"${mode === 'archive' ? ' data-archived="1"' : ''}` : ''} data-act="toggleFolder" data-fid="${f.id}"><span class="pc-chev">${IC.chev}</span>${fname}<span class="pc-count">${count}</span>${tools}</div>
      <div class="pc-folder-items"><div class="pc-folder-inner">${sub.map(x => x.html).join('')}${items.map(p => projItem(p, mode)).join('')}${!sub.length && !items.length ? '<div class="pc-empty-folder">Перетащите сюда смету или папку</div>' : ''}</div></div></div>`;
    return { html, count };
  }

  // панель действий с выбранными сметами — поверх строки поиска, чтобы список не сдвигался
  function renderSelBar() {
    const n = S.sel.size;
    if (!n) { S.selBarShown = false; return ''; }
    const can = n >= 2 && n <= 4, anim = !S.selBarShown;
    S.selBarShown = true;
    return `<div class="pc-selbar2${anim ? ' is-anim' : ''}" role="toolbar">
      <div class="pc-selbar2-top"><b>Выбрано: ${n}</b><button class="pc-link" data-act="clearSel" title="Esc">Снять выделение</button></div>
      <div class="pc-selbar2-btns">
        <button class="pc-btn pc-btn-primary pc-btn-sm" data-act="selCompare"${can ? '' : ' disabled'} title="${can ? 'Сравнить выбранные сметы' : 'Для сравнения выберите от 2 до 4 смет'}">${IC.compare} Сравнить</button>
        <button class="pc-icon pc-btn-icon" data-act="selOpen" title="Открыть во вкладках">${IC.openTabs}</button>
        <button class="pc-icon pc-btn-icon" data-act="selMove" title="Переместить в папку">${IC.folderIn}</button>
        <button class="pc-icon pc-btn-icon" data-act="menu" data-type="selstatus" data-pid="sel" title="Сменить статус">${IC.tag}</button>
        <button class="pc-icon pc-btn-icon" data-act="selArchive" title="В архив">${IC.archive}</button>
        <button class="pc-icon pc-btn-icon pc-danger" data-act="selTrash" title="В корзину">${IC.trash}</button>
      </div></div>`;
  }

  function renderSide() {
    const filtering = !!(S.q || S.stFilter);
    const live = sortGrouped(S.list.filter(p => isLive(p) && matches(p)));
    const trash = sortGrouped(S.list.filter(p => p.trashed));
    const archPool = sortGrouped(S.list.filter(p => !p.trashed && isArchivedProj(p)));
    const roots = S.folders.filter(f => !f.archived && !folderById(f.parent));
    const tree = [folderNode({ id: '', name: 'Без папки' }, live, 'live', filtering)].concat(roots.map(f => folderNode(f, live, 'live', filtering)))
      .map(x => x.html).join('') || '<div class="pc-empty-folder" style="padding-left:6px">Ничего не найдено</div>';
    const archRoots = S.folders.filter(f => f.archived && !folderArchived(f.parent));
    const looseArch = archPool.filter(p => !folderArchived(projFolder(p)));
    const archCount = archRoots.length + looseArch.length;
    const counts = {};
    S.list.filter(isLive).forEach(p => { counts[p.status || 'draft'] = (counts[p.status || 'draft'] || 0) + 1; });
    const allCount = S.list.filter(isLive).length;
    S.stCounts = Object.assign({ '': allCount }, counts);
    const cur = S.stFilter ? stOf(S.stFilter) : null;
    const stSel = `<button class="pc-stsel" data-act="menu" data-type="stfilter" title="Фильтр по статусу">${cur ? `<i class="pc-st-dot" style="background:${cur.c}"></i><span>${cur.n}</span>` : `<i class="pc-st-dots">${STATUSES.map(st => `<b style="background:${st.c}"></b>`).join('')}</i><span>Все</span>`}<small>${cur ? counts[cur.k] || 0 : allCount}</small>${IC.chevDown}</button>`;
    const n = S.sel.size;
    return `<aside class="pc-side${S.sideOpen ? ' is-open' : ''}"><div class="pc-side-in"><div class="pc-side-top">
      <div class="pc-side-head"><button class="pc-icon pc-side-hide" data-act="hideSidebar" title="Скрыть панель">${IC.sidebar}</button><div class="pc-logo">Сметы <span class="pc-app-ver">v${APP_VERSION}</span></div>
        <div class="pc-side-btns"><button class="pc-icon pc-btn-icon" data-act="newFolder" title="Новая папка">${IC.folderPlus}</button><button class="pc-btn pc-btn-primary" data-act="newProject">+ Смета</button></div></div>
      ${REMOTE ? '' : '<div class="pc-demo">Демо-режим: данные хранятся только в этом браузере. Подключите Google Таблицу в настройках кода.</div>'}
      <div class="pc-searchrow"><label class="pc-search">${IC.search}<input data-f="search" data-key="search" value="${esc(S.q)}" placeholder="Поиск смет"><button class="pc-icon pc-search-x${S.q ? '' : ' is-hidden'}" data-act="clearSearch" title="Очистить">${IC.close}</button></label>${stSel}</div>
      <div class="pc-side-row"><button class="pc-link" data-act="toggleSelMode">${S.selMode ? 'Готово' : 'Выбрать несколько'}</button><span class="pc-hint-sm">Ctrl/⌘ или Shift + клик</span></div>${renderSelBar()}</div>
      <div class="pc-tree" data-tree-empty>${tree}</div>
      <div class="pc-side-foot"><div class="pc-bins">
        <div class="pc-bin pc-zone pc-zone-proj pc-zone-folder" data-drop-archive="1" style="--zone:#8a6d3b">
          <button class="pc-trash-toggle" data-act="toggleArchive">${IC.archive} Архив · ${archCount}<span class="pc-hint-sm">сметы и папки</span></button>
          ${S.showArchive ? `<div class="pc-trash-list">${archRoots.map(f => folderNode(f, archPool, 'archive', false).html).join('')}${looseArch.map(p => projItem(p, 'archive')).join('')}${archCount ? '' : '<div class="pc-empty-folder" style="padding-left:10px">Пусто — перетащите сюда то, что больше не в работе</div>'}</div>` : ''}
        </div>
        <div class="pc-bin pc-zone pc-zone-proj pc-zone-folder" data-drop-trash="1" style="--zone:#c4432c">
          <button class="pc-trash-toggle" data-act="toggleTrash">${IC.trash} Корзина · ${trash.length}</button>
          ${S.showTrash ? `<div class="pc-trash-list">${trash.map(p => projItem(p, 'trash')).join('') || '<div class="pc-empty-folder" style="padding-left:10px">Пусто</div>'}
            ${trash.length ? `<button class="pc-purge-all" data-act="purgeAll">Очистить корзину</button>` : ''}</div>` : ''}
        </div>
      </div>
      <button class="pc-me" data-act="setName" title="Это имя видят коллеги, когда вы открываете смету">${S.me ? `<i style="background:${avatarColor(S.me)}">${esc(initials(S.me))}</i>Вы: ${esc(S.me)}` : 'Указать своё имя'}</button></div>
    </div><div class="pc-resizer" data-resizer title="Потяните, чтобы изменить ширину"></div></aside>
    ${S.sideOpen ? '<div class="pc-scrim" data-act="hideSidebar"></div>' : ''}`;
  }

  function renderMenu() {
    const m = S.menu;
    if (!m) return '';
    let items = '';
    if (m.type === 'tab') {
      const pn = pane(m.pi), i = pn ? pn.tabs.indexOf(m.key) : -1;
      if (i < 0) return '';
      const other = S.panes.length > 1 ? 'Перенести в другое окно' : 'Открыть в соседнем окне';
      items = `<button data-act="tabMenu" data-do="close">Закрыть</button>
        <button data-act="tabMenu" data-do="others"${pn.tabs.length < 2 ? ' disabled' : ''}>Закрыть остальные</button>
        <button data-act="tabMenu" data-do="right"${i === pn.tabs.length - 1 ? ' disabled' : ''}>Закрыть вкладки справа</button>
        <button data-act="tabMenu" data-do="all">Закрыть все</button>
        <div class="pc-menu-sep"></div><button data-act="tabMenu" data-do="move">${other}</button>`;
    } else if (m.type === 'selstatus') {
      items = `<div class="pc-menu-label">Статус для ${S.sel.size} смет</div>` + STATUSES.map(st => `<button data-act="setStatusSel" data-st="${st.k}"><i class="pc-st-dot" style="background:${st.c}"></i>${st.n}</button>`).join('');
    } else if (m.type === 'stfilter') {
      const cnt = S.stCounts || {};
      items = `<button data-act="pickStFilter" data-st=""><i class="pc-st-dots">${STATUSES.map(st => `<b style="background:${st.c}"></b>`).join('')}</i>Все статусы<small class="pc-ctx-cnt">${cnt[''] || 0}</small>${!S.stFilter ? ' ✓' : ''}</button><div class="pc-menu-sep"></div>`
        + STATUSES.map(st => `<button data-act="pickStFilter" data-st="${st.k}"><i class="pc-st-dot" style="background:${st.c}"></i>${st.n}<small class="pc-ctx-cnt">${cnt[st.k] || 0}</small>${S.stFilter === st.k ? ' ✓' : ''}</button>`).join('');
    } else if (m.type === 'pstatus') {
      const p = S.cache[m.id];
      items = STATUSES.map(st => `<button data-act="pickPStatus" data-pid="${m.id}" data-st="${st.k}"><i class="pc-st-dot" style="background:${st.c}"></i>${st.n}${p && p.status === st.k ? ' ✓' : ''}</button>`).join('');
    } else if (m.type === 'proj') {
      const pr = S.list.find(x => x.id === m.id);
      if (!pr) return '';
      if (pr.trashed) {
        items = `<button data-act="restore" data-pid="${pr.id}">Вернуть из корзины</button><button class="pc-danger-txt" data-act="purge" data-pid="${pr.id}">Удалить навсегда</button>`;
      } else if (isArchivedProj(pr)) {
        items = `<button data-act="open" data-pid="${pr.id}">Открыть</button>
          <button data-act="unarchive" data-pid="${pr.id}">Вернуть из архива</button>
          <button class="pc-danger-txt" data-act="trash" data-pid="${pr.id}">В корзину</button>`;
      } else if (S.sel.size > 1 && S.sel.has(pr.id)) {
        const n = S.sel.size, can = n >= 2 && n <= 4;
        items = `<div class="pc-menu-label">Выбрано: ${n}</div>
          <button data-act="selCompare"${can ? '' : ' disabled'}>${IC.compare} Сравнить${can ? '' : ' (от 2 до 4)'}</button>
          <button data-act="selOpen">${IC.openTabs} Открыть во вкладках</button>
          <button data-act="selMove">${IC.folderIn} Переместить в папку…</button>
          <div class="pc-menu-sep"></div><div class="pc-menu-label">Статус для всех</div>
          ${STATUSES.map(st => `<button data-act="setStatusSel" data-st="${st.k}"><i class="pc-st-dot" style="background:${st.c}"></i>${st.n}</button>`).join('')}
          <div class="pc-menu-sep"></div>
          <button data-act="selArchive">${IC.archive} В архив</button>
          <button class="pc-danger-txt" data-act="selTrash">${IC.trash} В корзину</button>
          <div class="pc-menu-sep"></div>
          <button data-act="clearSel">Снять выделение</button>`;
      } else {
        items = `<button data-act="toggleSel" data-pid="${pr.id}">${S.sel.has(pr.id) ? 'Снять выбор' : 'Выбрать'}</button>
          <div class="pc-menu-sep"></div>
          <button data-act="open" data-pid="${pr.id}">Открыть</button>
          <button data-act="openSide" data-pid="${pr.id}">Открыть в соседнем окне</button>
          <button data-act="renameProj" data-pid="${pr.id}">Переименовать</button>
          <button data-act="dup" data-pid="${pr.id}">Новая версия</button>
          <div class="pc-menu-sep"></div><div class="pc-menu-label">Статус</div>
          ${STATUSES.map(st => `<button data-act="setStatus" data-pid="${pr.id}" data-st="${st.k}"><i class="pc-st-dot" style="background:${st.c}"></i>${st.n}${(pr.status || 'draft') === st.k ? ' ✓' : ''}</button>`).join('')}
          <div class="pc-menu-sep"></div>
          <button data-act="moveOne" data-pid="${pr.id}">Переместить в папку…</button>
          <button data-act="archive" data-pid="${pr.id}">В архив</button>
          <button class="pc-danger-txt" data-act="trash" data-pid="${pr.id}">В корзину</button>`;
      }
    } else {
      const arch = folderArchived(m.id);
      items = `<button data-act="renameFolder" data-fid="${m.id}">Переименовать</button>
        ${arch ? `<button data-act="unarchiveFolder" data-fid="${m.id}">Вернуть из архива</button>`
        : `<button data-act="newSubfolder" data-fid="${m.id}">Новая папка внутри</button><button data-act="archiveFolder" data-fid="${m.id}">В архив</button>`}
        <button class="pc-danger-txt" data-act="deleteFolder" data-fid="${m.id}">Удалить папку…</button>`;
    }
    const x = Math.min(m.x, window.innerWidth - 250), y = Math.min(m.y, window.innerHeight - 380);
    return `<div class="pc-ctx" style="left:${Math.max(8, x)}px;top:${Math.max(8, y)}px">${items}</div>`;
  }

  function tabTitle(key) {
    if (key.startsWith('c:')) return `${IC.compare}<span>Сравнение · ${key.slice(2).split(',').length}</span>`;
    const pr = S.list.find(x => x.id === key.slice(2));
    return `<span>${esc(pr ? pr.name : 'Смета')}</span><small>v${pr ? pr.version || 1 : 1}</small>`;
  }
  function renderMain() {
    if (S.loading) return `<main class="pc-main"><div class="pc-blank"><div class="pc-spinner"></div>Загрузка…</div></main>`;
    if (S.error) return `<main class="pc-main"><div class="pc-blank"><h2>Не удалось загрузить данные</h2><div>${esc(S.error)}</div><button class="pc-btn pc-btn-primary" data-act="reload">Попробовать ещё раз</button></div></main>`;
    const splitZone = S.panes.length < 2 ? `<div class="pc-split-zone pc-zone pc-zone-proj pc-zone-tab" data-drop-split="1"><span>${IC.split} Открыть в соседнем окне</span></div>` : '';
    return `<main class="pc-main${S.panes.length > 1 ? ' is-split' : ''}">${S.panes.map((pn, i) => renderPane(pn, i)).join('')}${splitZone}</main>`;
  }
  function renderPane(pn, i) {
    const frozen = S.tabFreeze && S.tabFreeze[i];
    const tabs = pn.tabs.map(k => `<div class="pc-tabx${pn.active === k ? ' is-active' : ''}"${frozen ? ` style="flex:0 0 ${frozen}px"` : ''} draggable="true" data-tab="${esc(k)}" data-tab-pane="${i}" data-act="tabOpen">${tabTitle(k)}${k.startsWith('p:') ? avatars(k.slice(2), true) : ''}<button class="pc-tabx-close" data-act="tabClose" data-tab="${esc(k)}" data-tab-pane="${i}" title="Закрыть">${IC.close}</button></div>`).join('');
    const side = S.panes.length < 2
      ? `<button class="pc-icon pc-tabbar-btn" data-act="split" title="Открыть соседнее окно">${IC.split}</button>`
      : `<button class="pc-icon pc-tabbar-btn" data-act="closePane" data-pi="${i}" title="Закрыть это окно">${IC.close}</button>`;
    let body;
    const k = pn.active;
    if (!k) {
      body = (i > 0 ? `<div class="pc-blank-drop pc-drophint">Перетащите сюда смету из списка или вкладку из соседнего окна — или выберите ниже</div>` : '') + renderRecent();
    } else if (k.startsWith('c:')) {
      body = renderCompare(k.slice(2).split(','));
    } else {
      const p = S.cache[k.slice(2)];
      RP = p;
      body = p ? renderProject(p, pn, i) : '';
      RP = null;
    }
    return `<section class="pc-pane${S.focus === i && S.panes.length > 1 ? ' is-focus' : ''}" data-pane="${i}">
      <div class="pc-tabbar pc-zone pc-zone-tab" data-drop-pane="${i}">${i === 0 ? `<button class="pc-icon pc-tabbar-btn pc-burger" data-act="showSidebar" title="Показать список смет">${IC.sidebar}</button>` : ''}<div class="pc-tabs-scroll">${tabs}</div>${side}</div>
      <div class="pc-pane-body pc-zone pc-zone-proj pc-zone-tab${k && k.startsWith('p:') ? ' pc-zone-seg' : ''}" data-drop-pane="${i}">${body}</div></section>`;
  }

  function renderRecent() {
    const items = S.list.filter(isLive).slice().sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, 8);
    const fname = id => folderPath(id);
    const cards = items.map(pr => {
      const st = stOf(pr.status);
      return `<button class="pc-rcard" data-act="open" data-pid="${pr.id}">
        <div class="pc-rcard-top"><span class="pc-st"><i style="background:${st.c}"></i>${st.n}</span>${avatars(pr.id)}</div>
        <b class="pc-rcard-name">${esc(pr.name)}</b>
        <div class="pc-rcard-meta"><span class="pc-ver-tag">v${pr.version || 1}</span>${fmtDate(pr.date)}${fname(pr.folderId) ? ' · ' + esc(fname(pr.folderId)) : ''}</div>
        <div class="pc-rcard-sum">${fmt(pr.total)}</div>
        <div class="pc-rcard-foot">${pr.updatedAt ? 'Изменена ' + fmtAgo(pr.updatedAt) + (pr.updatedBy ? ' · ' + esc(pr.updatedBy) : '') : 'Новая'}</div></button>`;
    }).join('');
    return `<div class="pc-recent"><div class="pc-row-between"><h2 class="pc-h2">${items.length ? 'Последние сметы' : 'Смет пока нет'}</h2><button class="pc-btn pc-btn-primary" data-act="newProject">+ Новая смета</button></div>
      ${items.length ? `<div class="pc-rgrid">${cards}</div>` : '<div class="pc-note">Создайте первую смету — она появится здесь и в списке слева.</div>'}</div>`;
  }

  function renderProject(p, pn, pi) {
    const folderOpts = folderOptions().map(o => `<option value="${o[0]}"${projFolder(p) === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('');
    const stOpts = STATUSES.map(s => `<option value="${s.k}"${p.status === s.k ? ' selected' : ''}>${s.n}</option>`).join('');
    const h = ensureHist(p);
    const head = `<div class="pc-head">
      <input class="pc-title" data-f="projName" data-key="projName-${pi}" value="${esc(p.name)}" placeholder="Название сметы (обязательно)" required>
      <div class="pc-head-tools">
        <span class="pc-status" data-status="${p.id}" data-act="retrySave"></span>
        <button class="pc-icon" data-act="undo" title="Отменить (Ctrl+Z)"${h.u.length ? '' : ' disabled'}>${IC.undo}</button>
        <button class="pc-icon" data-act="redo" title="Повторить (Ctrl+Shift+Z)"${h.r.length ? '' : ' disabled'}>${IC.redo}</button>
      </div></div>
      <div class="pc-head pc-head2">
      <label class="pc-field">Статус <button class="pc-stbtn" data-act="menu" data-type="pstatus" data-pid="${p.id}"><i class="pc-st-dot" style="background:${stOf(p.status).c}"></i>${stOf(p.status).n}${IC.chevDown}</button></label>
      <label class="pc-field">Версия <input type="number" min="1" step="1" style="width:60px" data-f="projVersion" data-key="projVersion-${pi}" value="${p.version || 1}"></label>
      <label class="pc-field">Дата <input type="date" data-f="projDate" data-key="projDate-${pi}" value="${esc(p.date)}"></label>
      <label class="pc-field">Папка <select data-f="projFolder">${folderOpts}</select></label>
      <span class="pc-grow"></span>
      <button class="pc-btn pc-btn-ghost" data-act="dup" data-pid="${p.id}" title="Копия сметы с сегодняшней датой и следующим номером версии">${IC.copy} Новая версия</button>
      <div class="pc-export"><button class="pc-btn pc-btn-primary" data-act="toggleExport">${IC.down} Выгрузить</button>
        ${pn.exportOpen ? `<div class="pc-menu">
          <button data-act="export" data-kind="pdf-client">PDF — смета для клиента</button>
          <button data-act="export" data-kind="pdf-internal">PDF — внутренняя смета</button>
          <div class="pc-menu-sep"></div>
          <button data-act="export" data-kind="xlsx-client">Excel — смета для клиента</button>
          <button data-act="export" data-kind="xlsx-internal">Excel — внутренняя смета</button></div>` : ''}
      </div></div>
      <nav class="pc-tabs"><button class="pc-tab${pn.view === 'compose' ? ' is-active' : ''}" data-act="view" data-view="compose">Состав работ</button><button class="pc-tab${pn.view === 'finance' ? ' is-active' : ''}" data-act="view" data-view="finance">Финансы</button></nav>`;
    const others = S.presence[p.id] || [];
    const banner = others.length ? `<div class="pc-presence">${avatars(p.id)}<span>Сейчас открыта также у ${others.map(x => `<b>${esc(x.user)}</b>${x.editing ? ' (редактирует)' : ''}`).join(', ')}. Если вы оба что-то измените, калькулятор спросит, чью версию оставить.</span></div>` : '';
    return head + banner + (pn.view === 'compose' ? renderCompose(p, pi) : renderFinance(p));
  }

  function renderCompose(p, pi) {
    const chips = S.templates.map((t, i) => `<span class="pc-chip pc-tplchip" draggable="true" data-tpl="${i}" data-act="addTpl" title="${esc(t.desc || 'Перетащите на шкалу проекта или нажмите')}">${esc(t.name)}<button class="pc-chip-x" data-act="delTpl" data-tpl="${i}" title="Удалить шаблон">${IC.close}</button></span>`).join('');
    const total = projDirect(p);
    const segs = p.services.map(s => {
      const c = svcCost(s);
      return `<button class="pc-seg" draggable="true" data-act="gotoSvc" data-sid="${s.id}" data-projseg="${s.id}" style="flex-grow:${total > 0 ? c : 1};background:hsl(${hueOf(s.id)} 56% 46%)" title="${esc(displayName(s))} — ${fmt(c)}. Перетащите, чтобы поменять порядок"><span>${esc(displayName(s))}</span><small data-live="projseg-${s.id}">${fmt(c)}</small></button>`;
    }).join('');
    return `<section class="pc-card">
        <div class="pc-label">Услуги и шаблоны — перетащите на шкалу проекта или нажмите</div>
        <div class="pc-chips">${chips || '<span class="pc-note" style="margin:0">Шаблонов пока нет — добавьте свою услугу</span>'}<button class="pc-chip pc-chip-add" data-act="customSvc">${IC.plus} Своя услуга</button></div>
      </section>
      <section class="pc-card">
        <div class="pc-row-between"><div class="pc-label">Шкала проекта <span class="pc-hint">— сегменты можно перетаскивать, меняя порядок</span></div><div class="pc-total">Прямые расходы: <b data-live="projtotal">${fmt(total)}</b></div></div>
        <div class="pc-projbar pc-zone pc-zone-tpl${p.services.length ? '' : ' is-empty'}" data-drop="project">${segs || 'Перетащите сюда услугу'}</div>
      </section>
      ${p.services.map(s => renderSvc(s, pi)).join('')}`;
  }

  function renderSvc(s, pi) {
    const h = hueOf(s.id);
    const c = svcCost(s);
    const segs = s.lines.map((l, i) => {
      const lc = lineCost(l);
      const off = l.kind === 'spec' && !(num(l.rate) > 0);
      const val = l.kind === 'spec' ? `${fmtQ(l.qty)} ${esc(l.unit)} · ${fmt(lc)}` : fmt(lc);
      return `<div class="pc-lseg${lineLight(i) >= 62 ? ' is-light' : ''}" draggable="true" data-lseg="${s.id}" data-lid="${l.id}" style="flex-grow:${c > 0 ? lc : 1};background:${segColor(h, i)}" title="${esc(l.name)}">
        <span>${esc(l.name)}</span><small data-live="segval-${l.id}">${val}</small>
        <span class="pc-handle${off ? ' is-off' : ''}" data-sid="${s.id}" data-lid="${l.id}" title="${off ? 'Сначала укажите ставку' : 'Потяните, чтобы изменить'}"></span></div>`;
    }).join('');
    const grip = l => `<td class="pc-td-grip"><span class="pc-grip" draggable="true" data-grip-sid="${s.id}" data-grip-lid="${l.id}" title="Перетащите, чтобы поменять порядок">⋮⋮</span></td>`;
    const rows = s.lines.map(l => {
      const k = `${pi}-${s.id}-${l.id}`;
      const nameCell = tag => `<td class="pc-td-name"><div class="pc-namecell"><input data-f="lineName" data-key="n-${k}" data-sid="${s.id}" data-lid="${l.id}" value="${esc(l.name)}" title="${esc(l.name)}">${tag || ''}</div></td>`;
      const del = `<td class="pc-td-del"><button class="pc-icon pc-danger" data-act="removeLine" data-sid="${s.id}" data-lid="${l.id}" title="Убрать">${IC.close}</button></td>`;
      if (l.kind === 'expense') {
        return `<tr data-row="${l.id}" data-row-of="${s.id}">${grip(l)}${nameCell('<span class="pc-tag">расход</span>')}
          <td class="pc-num pc-unit">—</td>
          <td><div class="pc-qty"><input type="number" min="0" step="1000" data-f="lineAmount" data-key="a-${k}" data-sid="${s.id}" data-lid="${l.id}" data-live="qty-${l.id}" value="${num(l.amount)}"><span class="pc-unit pc-unit-rub">₽</span></div></td>
          <td class="pc-num" data-live="sum-${l.id}">${fmt(lineCost(l))}</td>${del}</tr>`;
      }
      const unitOpts = UNITS.concat(UNITS.includes(l.unit) ? [] : [l.unit]).map(u => `<option${u === l.unit ? ' selected' : ''}>${esc(u)}</option>`).join('');
      return `<tr data-row="${l.id}" data-row-of="${s.id}">${grip(l)}${nameCell()}
        <td><div class="pc-qty"><input type="number" min="0" step="any" data-f="lineRate" data-key="r-${k}" data-sid="${s.id}" data-lid="${l.id}" value="${num(l.rate)}"><span class="pc-unit pc-unit-wide">₽/</span><span class="pc-unit pc-unit-txt">₽/${esc(l.unit)}</span><select class="pc-input pc-unit-sel" data-f="lineUnit" data-sid="${s.id}" data-lid="${l.id}">${unitOpts}</select></div></td>
        <td><div class="pc-qty"><input type="number" min="0" step="1" data-f="lineQty" data-key="q-${k}" data-sid="${s.id}" data-lid="${l.id}" data-live="qty-${l.id}" value="${num(l.qty)}"><span class="pc-unit">${esc(l.unit)}</span></div></td>
        <td class="pc-num" data-live="sum-${l.id}">${fmt(lineCost(l))}</td>${del}</tr>`;
    }).join('');
    const used = new Set(s.lines.filter(l => l.kind === 'spec').map(l => l.name.toLowerCase()));
    const posChips = S.rates.filter(r => !used.has(r.name.toLowerCase())).map(r => `<button class="pc-chip pc-chip-sm" data-act="addPos" data-sid="${s.id}" data-pos="${esc(r.name)}" title="${r.rate ? fmt(r.rate) + ' / ' + r.unit : 'ставка не указана'}">${IC.plus}${esc(r.name)}</button>`).join('');
    const dn = displayName(s);
    return `<section class="pc-card pc-svc pc-zone pc-zone-line" id="pc-svc-${pi}-${s.id}" data-svc="${s.id}">
      <div class="pc-svc-head"><span class="pc-dot" style="background:hsl(${h} 56% 46%)"></span>
        <input class="pc-svc-name" data-f="svcName" data-key="svc-${pi}-${s.id}" data-sid="${s.id}" value="${esc(s.name)}">${dn !== s.name ? `<span class="pc-svc-num">№ ${dn.slice(s.name.length + 1)}</span>` : ''}
        <div class="pc-svc-total" data-live="svctotal-${s.id}">${fmt(c)}</div>
        <button class="pc-icon" data-act="saveTpl" data-sid="${s.id}" title="Сохранить как шаблон услуги">${IC.save}</button>
        <button class="pc-icon pc-danger" data-act="removeSvc" data-sid="${s.id}" title="Убрать услугу из проекта">${IC.trash}</button></div>
      <div class="pc-svcbar${s.lines.length ? '' : ' is-empty'}" data-svcbar="${s.id}">${segs || 'Добавьте специалистов или расходы ниже'}</div>
      ${s.lines.length ? `<div class="pc-lines-wrap"><table class="pc-lines"><colgroup><col class="c-grip"><col><col class="c-rate"><col class="c-qty"><col class="c-sum"><col class="c-del"></colgroup><thead><tr><th></th><th>Позиция</th><th>Ставка</th><th>Объём</th><th class="pc-num">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      <div class="pc-add"><span class="pc-add-label">Добавить:</span>${posChips}
        <button class="pc-chip pc-chip-sm pc-chip-add" data-act="customSpec" data-sid="${s.id}">${IC.plus}Свой специалист</button>
        <button class="pc-chip pc-chip-sm pc-chip-add" data-act="addExpense" data-sid="${s.id}">${IC.plus}Расход</button></div>
    </section>`;
  }

  const svcFin = (p, s) => finOf(p, svcCost(s));
  const C = { direct: '#2a78d6', cont: '#eb6834', margin: '#1baf7a', tax: '#eda100' };
  const HATCH = `repeating-linear-gradient(135deg, ${C.margin} 0 3px, rgba(27,175,122,.18) 3px 7px)`;

  function finChart(f) {
    if (!(f.total > 0 || f.disc > 0)) return '';
    const parts = [
      { k: 'direct', n: 'Прямые расходы', v: f.direct, bg: C.direct },
      { k: 'cont', n: 'Непредвиденные', v: f.cont, bg: C.cont },
      { k: 'margin', n: f.disc > 0 ? 'Маржа после скидки' : 'Маржа', v: Math.max(0, f.margin), bg: C.margin },
      { k: 'disc', n: 'Скидка (из маржи)', v: f.disc, bg: HATCH, hatch: true },
      { k: 'tax', n: 'Налог', v: f.tax, bg: C.tax }
    ];
    const scale = parts.reduce((a, x) => a + x.v, 0);
    const shown = parts.filter(x => x.v > 0 && (x.k !== 'disc' || f.disc > 0));
    const pctT = v => f.total > 0 ? fmtP(v / f.total * 100) : '—';
    const bar = shown.map(x => `<div class="pc-fbar-seg${x.hatch ? ' is-hatch' : ''}" style="flex-grow:${x.v};background:${x.bg}" data-tip="${esc(x.n)}: ${x.k === 'disc' ? '−' : ''}${fmt(x.v)}${x.k === 'disc' ? ` · ${fmtP(f.marginFull > 0 ? x.v / f.marginFull * 100 : 0)} маржи` : ' · ' + pctT(x.v) + ' цены'}"></div>`).join('');
    const legend = parts.filter(x => x.k !== 'disc' || f.disc > 0).map(x => `<div class="pc-leg"><span class="pc-leg-sw${x.hatch ? ' is-hatch' : ''}" style="background:${x.bg}"></span><span class="pc-leg-name">${x.n}</span><b>${x.k === 'disc' ? '−' : ''}${fmt(x.v)}</b><span class="pc-leg-pct">${x.k === 'disc' ? fmtP(f.marginFull > 0 ? x.v / f.marginFull * 100 : 0) + ' маржи' : pctT(x.v)}</span></div>`).join('');
    const warn = f.margin < 0 ? `<div class="pc-warn">Скидка больше маржи: смета уходит в минус на ${fmt(-f.margin)}.</div>` : '';
    return `<section class="pc-card pc-fchart"><div class="pc-row-between"><div class="pc-label">Из чего складывается цена</div><div class="pc-total">Итого для клиента: <b>${fmt(f.total)}</b></div></div>
      <div class="pc-fbar" role="img" aria-label="${parts.map(x => x.n + ' ' + fmt(x.v)).join(', ')}" style="${scale > 0 ? '' : 'display:none'}">${bar}</div>
      ${f.disc > 0 ? `<div class="pc-fbar-note">Заштрихованная часть — скидка: клиент её не платит, она вычитается из маржи.</div>` : ''}
      <div class="pc-legend">${legend}</div>${warn}<div class="pc-tip" hidden></div></section>`;
  }

  function renderFinance(p) {
    const f = finOf(p);
    const rows = p.services.map(s => {
      const x = svcFin(p, s);
      return `<tr><td><span class="pc-dot" style="display:inline-block;margin-right:8px;vertical-align:-1px;background:hsl(${hueOf(s.id)} 56% 46%)"></span>${esc(displayName(s))}</td><td>${fmt(x.direct)}</td><td>${fmt(x.cont)}</td><td>${fmt(x.margin)}</td>${f.disc > 0 ? `<td>−${fmt(x.disc)}</td>` : ''}<td>${fmt(x.tax)}</td><td><b>${fmt(x.total)}</b></td></tr>`;
    }).join('');
    const kpi = (label, v, cls) => `<div class="pc-kpi${cls ? ' ' + cls : ''}"><div>${label}</div><b>${v}</b></div>`;
    return `<section class="pc-card"><div class="pc-fin-controls">
        <label class="pc-field">Непредвиденные <input class="pc-input" type="number" min="0" step="1" data-f="contPct" data-key="contPct" value="${num(p.contPct)}"> % от прямых</label>
        <label class="pc-field">Маржа <input class="pc-input" type="number" min="0" max="95" step="1" data-f="marginPct" data-key="marginPct" value="${num(p.marginPct)}"> % · расходы ÷ ${fmtQ(1 - marginShare(p))}</label>
        <label class="pc-field">Налог <input class="pc-input" type="number" min="0" step="0.5" data-f="taxPct" data-key="taxPct" value="${num(p.taxPct)}"> % сверху</label>
        <label class="pc-field">Скидка <input class="pc-input" type="number" min="0" step="any" data-f="discount" data-key="discount" value="${num(p.discount)}">
          <select class="pc-input" data-f="discMode"><option value="pct"${p.discMode !== 'rub' ? ' selected' : ''}>% от цены</option><option value="rub"${p.discMode === 'rub' ? ' selected' : ''}>₽ от цены</option></select></label>
      </div></section>
      <div class="pc-cards">
        ${kpi('Прямые расходы', fmt(f.direct))}
        ${kpi(`Непредвиденные ${fmtQ(p.contPct)}%`, fmt(f.cont))}
        ${kpi(f.disc > 0 ? `Маржа после скидки <s>${fmt(f.marginFull)}</s>` : `Маржа ${fmtQ(p.marginPct)}%`, fmt(f.margin), f.margin < 0 ? 'is-bad' : '')}
        ${f.disc > 0 ? kpi('Скидка', '−' + fmt(f.disc)) : ''}
        ${kpi(`Налог ${fmtQ(p.taxPct)}%`, fmt(f.tax))}
        ${kpi(f.disc > 0 ? `Итого для клиента <s>${fmt(f.gross)}</s>` : 'Итого для клиента', fmt(f.total), 'is-main')}
      </div>
      ${finChart(f)}
      <section class="pc-card">${p.services.length ? `<div class="pc-lines-wrap"><table class="pc-fin-table"><thead><tr><th>Услуга</th><th>Прямые</th><th>Непредв.</th><th>Маржа</th>${f.disc > 0 ? '<th>Скидка</th>' : ''}<th>Налог</th><th>Для клиента</th></tr></thead>
        <tbody>${rows}</tbody><tfoot><tr><td>Итого</td><td>${fmt(f.direct)}</td><td>${fmt(f.cont)}</td><td>${fmt(f.margin)}</td>${f.disc > 0 ? `<td>−${fmt(f.disc)}</td>` : ''}<td>${fmt(f.tax)}</td><td>${fmt(f.total)}</td></tr></tfoot></table></div>
        <div class="pc-note">Непредвиденные = ${fmtQ(p.contPct)}% от прямых. Цена без налога = (прямые + непредвиденные) ÷ ${fmtQ(1 - marginShare(p))}, маржа — разница. Скидка считается от цены для клиента и уменьшает маржу. Налог ${fmtQ(p.taxPct)}% начисляется сверху на цену после скидки.</div>`
        : '<div class="pc-note" style="margin:0">Добавьте услуги на вкладке «Состав работ».</div>'}</section>`;
  }

  /* ---------- сравнение смет ---------- */
  function renderCompare(ids) {
    const ps = ids.map(id => S.cache[id]).filter(Boolean);
    if (ps.length < 2) return `<div class="pc-blank"><h2>Недостаточно смет для сравнения</h2></div>`;
    const fs = ps.map(p => finOf(p));
    const mode = S.cmpMode;
    const maxT = Math.max(...fs.map(f => f.total), 1);
    const delta = (v, base) => {
      const d = v - base;
      if (Math.abs(d) < 0.5) return '<small class="pc-delta">=</small>';
      return `<small class="pc-delta ${d > 0 ? 'is-up' : 'is-down'}">${d > 0 ? '+' : '−'}${fmtN(Math.abs(d))}${base > 0 ? ` (${d > 0 ? '+' : '−'}${fmtP(Math.abs(d) / base * 100)})` : ''}</small>`;
    };
    const row = (label, vals, opts) => `<tr${opts && opts.cls ? ` class="${opts.cls}"` : ''}><th>${label}</th>${vals.map((v, j) => `<td>${v == null ? '<span class="pc-muted">—</span>' : fmt(v)}${j > 0 && v != null && vals[0] != null ? delta(v, vals[0]) : ''}${j > 0 && v != null && vals[0] == null ? '<small class="pc-delta is-new">новая</small>' : ''}</td>`).join('')}</tr>`;
    const head = ps.map((p, j) => {
      const st = stOf(p.status);
      return `<th><div class="pc-cmp-h"><b title="${esc(p.name)}">${esc(p.name)}</b><span><span class="pc-ver-tag">v${p.version || 1}</span>${fmtDate(p.date)}</span>
        <span class="pc-st"><i style="background:${st.c}"></i>${st.n}</span>
        <div class="pc-cmp-bar"><i style="width:${fs[j].total / maxT * 100}%"></i></div>
        <button class="pc-link" data-act="open" data-pid="${p.id}">Открыть</button></div></th>`;
    }).join('');
    // услуги сопоставляются по названию (с номером для дубликатов)
    const keys = [];
    ps.forEach(p => p.services.forEach(s => { const k = nameKey(displayName(s, p)); if (!keys.find(x => x.k === k)) keys.push({ k, n: displayName(s, p) }); }));
    const svcRows = keys.map(key => row(esc(key.n), ps.map(p => {
      const s = p.services.find(x => nameKey(displayName(x, p)) === key.k);
      if (!s) return null;
      return mode === 'client' ? svcFin(p, s).total : svcCost(s);
    }))).join('');
    return `<div class="pc-head"><h2 class="pc-h2">Сравнение смет</h2><span class="pc-grow"></span>
        <div class="pc-seg-toggle"><button class="${mode === 'client' ? 'is-on' : ''}" data-act="cmpMode" data-mode="client">Цены для клиента</button><button class="${mode === 'direct' ? 'is-on' : ''}" data-act="cmpMode" data-mode="direct">Прямые расходы</button></div></div>
      <section class="pc-card"><div class="pc-lines-wrap"><table class="pc-cmp"><thead><tr><th></th>${head}</tr></thead><tbody>
        ${row('<b>Итого для клиента</b>', fs.map(f => f.total), { cls: 'is-total' })}
        ${row('Прямые расходы', fs.map(f => f.direct))}
        ${row('Непредвиденные', fs.map(f => f.cont))}
        ${row('Маржа', fs.map(f => f.margin))}
        ${fs.some(f => f.disc > 0) ? row('Скидка', fs.map(f => f.disc)) : ''}
        ${row('Налог', fs.map(f => f.tax))}
        <tr class="pc-cmp-sep"><th colspan="${ps.length + 1}">Услуги · ${mode === 'client' ? 'цена для клиента' : 'прямые расходы'}</th></tr>
        ${svcRows}
      </tbody></table></div>
      <div class="pc-note">Разница считается относительно первой сметы. Услуги сопоставляются по названию.</div></section>`;
  }

  /* ---------- модальное окно / тост ---------- */
  let modalResolve = null;
  function modal(title, fields, okText, opts) {
    opts = opts || {};
    const body = fields.map(f => {
      if (f.type === 'select') {
        const options = f.options.map(o => Array.isArray(o) ? o : [o, o]);
        return `<label>${esc(f.label)}<select name="${f.name}">${options.map(o => `<option value="${esc(o[0])}"${o[0] === f.value ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
      }
      return `<label>${esc(f.label)}<input name="${f.name}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" min="0"' : ''} ${f.required ? 'data-required="1"' : ''} value="${esc(f.value == null ? '' : f.value)}" placeholder="${esc(f.placeholder || '')}"><span class="pc-err">Обязательное поле</span></label>`;
    }).join('');
    const btns = opts.buttons
      ? opts.buttons.map(b => `<button type="button" class="pc-btn ${b.kind === 'danger' ? 'pc-btn-danger' : b.kind === 'ghost' ? 'pc-btn-ghost' : 'pc-btn-primary'}" data-act="modalOk" data-v="${esc(b.v)}">${esc(b.label)}</button>`).join('')
      : `<button type="button" class="pc-btn ${okText === 'Удалить' || okText === 'Убрать' ? 'pc-btn-danger' : 'pc-btn-primary'}" data-act="modalOk">${esc(okText || 'Готово')}</button>`;
    S.modalHTML = `<div class="pc-overlay" data-act="modalCancel"><div class="pc-modal${opts.buttons ? ' is-wide' : ''}" data-modal role="dialog"><h3>${esc(title)}</h3>${opts.text ? `<p class="pc-modal-text">${esc(opts.text)}</p>` : ''}${body}
      <div class="pc-modal-btns${opts.buttons ? ' is-col' : ''}"><button type="button" class="pc-btn pc-btn-ghost" data-act="modalCancel">Отмена</button>${btns}</div></div></div>`;
    render();
    const first = root.querySelector('.pc-modal input, .pc-modal select');
    if (first) { first.focus(); if (first.select) first.select(); }
    return new Promise(res => { modalResolve = res; });
  }
  const confirmModal = (title, okText, text) => modal(title, [], okText, { text }).then(v => !!v);
  function modalValues(btn) {
    const v = {};
    let ok = true;
    root.querySelectorAll('.pc-modal [name]').forEach(el => {
      v[el.name] = String(el.value);
      if (el.dataset.required && !el.value.trim()) { ok = false; el.closest('label').classList.add('is-invalid'); }
    });
    if (!ok) { const bad = root.querySelector('.pc-modal .is-invalid input'); if (bad) bad.focus(); return null; }
    if (btn && btn.dataset.v) v.__btn = btn.dataset.v;
    return v;
  }
  function closeModal(values) {
    S.modalHTML = '';
    const r = modalResolve; modalResolve = null;
    render();
    if (r) r(values);
  }
  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('pcalc-toast');
    if (!el) { el = document.createElement('div'); el.id = 'pcalc-toast'; document.body.appendChild(el); }
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1d1c1a;color:#fff;padding:10px 16px;border-radius:10px;font:13px Manrope,system-ui,sans-serif;z-index:100000;box-shadow:0 8px 24px rgba(0,0,0,.2);max-width:90vw';
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 3500);
  }

  /* ---------- операции со сметами ---------- */
  const folderOptions = () => [['', 'Без папки']].concat(S.folders.filter(f => !folderArchived(f.id)).map(f => [f.id, folderPath(f.id)]));
  async function newProject() {
    const curFolder = S.current ? S.current.folderId || '' : '';
    const v = await modal('Новая смета', [
      { name: 'name', label: 'Название сметы', placeholder: 'Например, Бренд — OLV весна', required: true },
      { name: 'folder', label: 'Папка', type: 'select', options: folderOptions(), value: curFolder }], 'Создать');
    if (!v) return;
    const name = v.name.trim();
    const same = sortGrouped(S.list.filter(x => !x.trashed && nameKey(x.name) === nameKey(name)));
    if (same.length) {
      const c = await modal(`Смета «${same[0].name}» уже есть`, [], '', {
        text: `Последняя версия — v${same[0].version || 1} от ${fmtDate(same[0].date)}. Можно продолжить её новой версией или завести отдельную смету.`,
        buttons: [{ v: 'version', label: `Создать v${(same[0].version || 1) + 1} на основе последней` }, { v: 'separate', label: 'Отдельная смета', kind: 'ghost' }]
      });
      if (!c) return;
      if (c.__btn === 'version') { await duplicate(same[0].id); return; }
    }
    await flush();
    const p = normalize({ id: uid(), name, folderId: v.folder || '', services: [], date: today(), createdAt: new Date().toISOString(), status: 'draft' });
    p.family = p.id; p.version = 1;
    S.cache[p.id] = p; ensureHist(p);
    if (p.folderId) S.open[p.folderId] = true;
    syncSummary(p); S.dirty.add(p.id); saveAll();
    pane().view = 'compose';
    await openIn(p.id);
  }
  async function duplicate(id) {
    await flush();
    let src;
    try { src = await load(id); } catch (e) { toast(e.message); return; }
    const p = clone(src);
    p.id = uid(); p.date = today(); p.trashed = false; p.createdAt = new Date().toISOString(); p.status = 'draft';
    p.family = src.family || src.id;
    p.version = S.list.filter(x => famOf(x) === p.family).reduce((mx, x) => Math.max(mx, x.version || 1), 1) + 1;
    delete p.updatedAt;
    S.cache[p.id] = p; ensureHist(p);
    syncSummary(p); S.dirty.add(p.id); saveAll();
    await openIn(p.id);
    toast(`Создана версия ${p.version} от ${fmtDate(p.date)}`);
  }
  // переименованная копия становится отдельной сметой с версией 1
  function renameRule(target) {
    const others = S.list.filter(x => x.id !== target.id && famOf(x) === famOf(target));
    if ((target.version || 1) > 1 && others.length && others.every(x => nameKey(x.name) !== nameKey(target.name))) {
      toast('Смета переименована и стала отдельной — версия 1');
      return { family: target.id, version: 1 };
    }
    return null;
  }
  async function renameProject(id, name) {
    name = String(name || '').trim();
    if (!name) { toast('Название сметы обязательно'); return false; }
    const p = S.cache[id];
    if (p) {
      p.name = name;
      Object.assign(p, renameRule(p) || {});
      commit(p); render(); return true;
    }
    const s = S.list.find(x => x.id === id);
    const fields = Object.assign({ name }, renameRule(Object.assign({}, s, { name })) || {});
    await patch([id], fields); return true;
  }
  async function patch(ids, fields) {
    ids = [].concat(ids);
    persistBoot();
    ids.forEach(id => {
      const s = S.list.find(x => x.id === id); if (s) Object.assign(s, fields);
      const p = S.cache[id]; if (p) { Object.assign(p, fields); recordHistory(p); }
      if (fields.trashed) { closeEverywhere(id); S.sel.delete(id); }
    });
    render();
    const rest = [];
    ids.forEach(id => { if (S.cache[id] && !fields.trashed) commit(S.cache[id], false); else rest.push(id); });
    if (rest.length) { try { await api.patchMany(rest, fields); } catch (e) { toast('Не удалось сохранить: ' + e.message); } }
  }
  async function purgeIds(ids) {
    for (const id of ids) {
      try { await api.deleteProject(id); }
      catch (e) { toast('Не удалось удалить: ' + e.message); break; }
      S.list = S.list.filter(x => x.id !== id); delete S.cache[id]; delete S.hist[id];
      closeEverywhere(id); S.sel.delete(id);
    }
    render();
  }
  async function deleteFolderFlow(fid) {
    const f = folderById(fid);
    if (!f) return;
    const ds = descendants(fid);
    const projs = S.list.filter(p => !p.trashed && ds.includes(projFolder(p)));
    const subs = ds.length - 1;
    let mode = 'ungroup';
    if (projs.length || subs) {
      const parts = [];
      if (projs.length) parts.push(`${projs.length} ${projs.length === 1 ? 'смета' : projs.length < 5 ? 'сметы' : 'смет'}`);
      if (subs) parts.push(`${subs} ${subs === 1 ? 'папка' : subs < 5 ? 'папки' : 'папок'}`);
      const c = await modal(`Удалить папку «${f.name}»?`, [], '', {
        text: `Внутри: ${parts.join(' и ')}.`,
        buttons: [{ v: 'ungroup', label: 'Удалить только папку — содержимое переместится уровнем выше', kind: 'ghost' }, { v: 'trash', label: 'Удалить вместе с содержимым (сметы — в корзину)', kind: 'danger' }]
      });
      if (!c) return;
      mode = c.__btn;
    } else if (!await confirmModal(`Удалить пустую папку «${f.name}»?`, 'Удалить')) return;
    if (mode === 'ungroup') {
      S.folders.forEach(x => { if ((x.parent || '') === fid) x.parent = f.parent || ''; });
      S.folders = S.folders.filter(x => x.id !== fid);
      const direct = S.list.filter(p => !p.trashed && projFolder(p) === fid).map(p => p.id);
      saveFoldersNow();
      if (direct.length) await patch(direct, { folderId: f.parent || '' }); else render();
    } else {
      S.folders = S.folders.filter(x => !ds.includes(x.id));
      saveFoldersNow();
      if (projs.length) await patch(projs.map(p => p.id), { trashed: true, folderId: '' }); else render();
    }
  }
  function moveFolder(id, tid, side) {
    const f = folderById(id);
    if (!f || id === tid) return;
    if (tid && descendants(id).includes(tid)) { toast('Нельзя переместить папку внутрь неё самой'); return; }
    S.folders = S.folders.filter(x => x.id !== id);
    if (side === 'inside') { f.parent = tid || ''; S.folders.push(f); if (tid) S.open[tid] = true; }
    else { const t = folderById(tid); f.parent = t.parent || ''; let at = S.folders.indexOf(t); if (side === 'after') at++; S.folders.splice(at, 0, f); }
    if (!folderArchived(f.parent)) f.archived = false; // вытащили из архива в рабочий список
    render(); saveFoldersNow();
  }
  function setFolderArchived(id, v) {
    const f = folderById(id);
    if (!f) return;
    f.archived = v;
    if (!v && folderArchived(f.parent)) f.parent = ''; // родитель в архиве — достаём на верхний уровень
    if (v) { S.showArchive = S.showArchive; toast(`Папка «${f.name}» перенесена в архив`); }
    render(); saveFoldersNow();
  }
  async function moveToFolderDialog(ids) {
    const v = await modal(ids.length > 1 ? `Переместить ${ids.length} смет` : 'Переместить смету', [{ name: 'folder', label: 'Папка', type: 'select', options: folderOptions(), value: '' }], 'Переместить');
    if (!v) return;
    S.open[v.folder] = true;
    await patch(ids, { folderId: v.folder });
  }
  function addTemplate(i) {
    const t = S.templates[i];
    if (!t || !S.current) return;
    const s = { id: uid(), name: t.name, lines: t.lines.map(makeLine) };
    S.current.services.push(s);
    render(); markDirty();
    flashSvc(s.id, false);
  }
  function flashSvc(id, scroll) {
    const el = root.querySelector(`#pc-svc-${S.focus}-${id}`);
    if (!el) return;
    if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 900);
  }
  function selectRange(id) {
    const order = S.visible;
    const a = order.indexOf(S.anchor), b = order.indexOf(id);
    if (a < 0 || b < 0) { S.sel.add(id); return; }
    order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => S.sel.add(x));
  }

  async function createFolder(parent) {
    const pf = folderById(parent);
    const v = await modal(pf ? `Новая папка в «${pf.name}»` : 'Новая папка', [{ name: 'name', label: 'Название', placeholder: 'Например, клиент или год', required: true }], 'Создать');
    if (!v) return;
    const f = { id: uid(), name: v.name.trim(), parent: parent || '', archived: false };
    S.folders.push(f); S.open[f.id] = true; if (parent) S.open[parent] = true;
    render(); saveFoldersNow();
  }
  let fTimer = null, fTimerId = null;
  function toggleFolderDom(id) {
    const w = root.querySelector(`.pc-folder[data-folder="${CSS.escape(id)}"]`);
    const open = w ? !w.classList.contains('is-open') : S.open[id] === false;
    S.open[id] = open;
    if (w) w.classList.toggle('is-open', open); else render();
  }
  // своё определение двойного клика: после первого клика список перерисовывается
  let lastClick = { k: '', t: 0 };
  function isDouble(k) {
    const now = Date.now(), dbl = lastClick.k === k && now - lastClick.t < 450;
    lastClick = dbl ? { k: '', t: 0 } : { k, t: now };
    return dbl;
  }

  const actions = {
    reload: () => boot(),
    showSidebar: () => { if (isNarrow()) S.sideOpen = true; else { S.sideCollapsed = false; ui.collapsed = false; saveUI(); } applySide(); render(); },
    hideSidebar: () => { if (isNarrow()) S.sideOpen = false; else { S.sideCollapsed = true; ui.collapsed = true; saveUI(); } applySide(); render(); },
    setName: () => askName(),
    newProject: () => newProject(),
    projClick: (el, e) => {
      const id = el.dataset.pid;
      if (S.renaming) return;
      if (isDouble('p' + id) && !el.dataset.trashed && e.target.closest('.pc-proj-name')) { S.renaming = { type: 'proj', id }; S.renameFocus = true; render(); return; }
      if (e.shiftKey && S.anchor) { selectRange(id); render(); return; }
      if (e.ctrlKey || e.metaKey || S.selMode || S.sel.size) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); S.anchor = id; render(); return; }
      if (el.dataset.trashed) { S.menu = null; return; }
      S.sel.clear(); S.anchor = id;
      openIn(id);
    },
    setStatusSel: el => { S.menu = null; patch(Array.from(S.sel), { status: el.dataset.st }); },
    toggleSel: el => { S.menu = null; const id = el.dataset.pid; S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); S.anchor = id; render(); },
    toggleSelMode: () => { S.selMode = !S.selMode; if (!S.selMode) S.sel.clear(); render(); },
    clearSel: () => { S.menu = null; S.sel.clear(); S.selMode = false; render(); },
    selCompare: () => { S.menu = null; openCompare(Array.from(S.sel)); },
    selOpen: async () => { S.menu = null; for (const id of S.sel) await openIn(id); },
    selMove: () => { S.menu = null; moveToFolderDialog(Array.from(S.sel)); },
    selStatus: async () => { S.menu = null;
      const v = await modal(`Статус для ${S.sel.size} смет`, [{ name: 'st', label: 'Статус', type: 'select', options: STATUSES.map(s => [s.k, s.n]), value: 'sent' }], 'Применить');
      if (v) patch(Array.from(S.sel), { status: v.st });
    },
    selTrash: () => { S.menu = null; patch(Array.from(S.sel), { trashed: true }); },
    open: el => { S.menu = null; openIn(el.dataset.pid); },
    openSide: el => { S.menu = null; if (S.panes.length < 2) S.panes.push({ tabs: [], active: null, view: 'compose', exportOpen: false }); openIn(el.dataset.pid, 1); },
    menu: (el, e) => {
      e.stopPropagation();
      const id = el.dataset.pid || el.dataset.fid;
      if (S.menu && S.menu.type === el.dataset.type && S.menu.id === id) { S.menu = null; render(); return; } // повторный клик закрывает
      const r = el.getBoundingClientRect();
      S.menu = { type: el.dataset.type, id, x: r.left, y: r.bottom + 4 };
      render();
    },
    tabMenu: (el) => {
      const m = S.menu; S.menu = null;
      const pn = pane(m.pi), k = m.key, i = pn.tabs.indexOf(k);
      S.tabFreeze = {};
      if (el.dataset.do === 'close') { closeTab(m.pi, k); return; }
      if (el.dataset.do === 'others') pn.tabs = [k];
      if (el.dataset.do === 'right') pn.tabs = pn.tabs.slice(0, i + 1);
      if (el.dataset.do === 'all') pn.tabs = [];
      if (el.dataset.do === 'move') {
        if (S.panes.length < 2) S.panes.push({ tabs: [], active: null, view: 'compose', exportOpen: false });
        const to = m.pi === 0 ? 1 : 0, dest = pane(to);
        pn.tabs = pn.tabs.filter(x => x !== k);
        if (!dest.tabs.includes(k)) dest.tabs.push(k);
        dest.active = k;
        if (pn.active === k) pn.active = pn.tabs[Math.max(0, i - 1)] || null;
        setFocus(to); render(); heartbeatSoon(); return;
      }
      if (!pn.tabs.includes(pn.active)) pn.active = pn.tabs.includes(k) ? k : pn.tabs[pn.tabs.length - 1] || null;
      setFocus(S.focus); render(); heartbeatSoon();
    },
    renameProj: el => { S.menu = null; S.renaming = { type: 'proj', id: el.dataset.pid }; S.renameFocus = true; render(); },
    renameFolder: el => { S.menu = null; S.renaming = { type: 'folder', id: el.dataset.fid }; S.renameFocus = true; render(); },
    setStatus: el => { S.menu = null; patch([el.dataset.pid], { status: el.dataset.st }); },
    pickStFilter: el => { S.menu = null; S.stFilter = el.dataset.st; render(); },
    pickPStatus: el => { S.menu = null; const p = S.cache[el.dataset.pid]; if (p) { p.status = el.dataset.st; commit(p); } render(); },
    moveOne: el => { S.menu = null; moveToFolderDialog([el.dataset.pid]); },
    dup: el => { S.menu = null; duplicate(el.dataset.pid); },
    trash: el => { S.menu = null; patch([el.dataset.pid], { trashed: true }); },
    restore: el => { S.menu = null; patch([el.dataset.pid], { trashed: false }); },
    purge: async el => {
      S.menu = null;
      const pr = S.list.find(x => x.id === el.dataset.pid);
      if (!await confirmModal(`Удалить «${pr.name}» (v${pr.version || 1}) навсегда?`, 'Удалить', 'Восстановить будет нельзя.')) return;
      await purgeIds([pr.id]);
    },
    purgeAll: async () => {
      const ids = S.list.filter(x => x.trashed).map(x => x.id);
      if (!await confirmModal(`Очистить корзину (${ids.length})?`, 'Удалить', 'Сметы будут удалены навсегда.')) return;
      await purgeIds(ids);
    },
    toggleTrash: () => { S.showTrash = !S.showTrash; render(); },
    toggleFolder: (el, e) => {
      if (e.target.closest('[data-inline]')) return;
      const id = el.dataset.fid;
      // небольшая пауза: второй клик по названию — переименование, а не сворачивание
      if (fTimer && fTimerId === id) {
        clearTimeout(fTimer); fTimer = null;
        if (id && e.target.closest('[data-fname]')) { S.renaming = { type: 'folder', id }; S.renameFocus = true; render(); }
        return;
      }
      clearTimeout(fTimer); fTimerId = id;
      fTimer = setTimeout(() => { fTimer = null; toggleFolderDom(id); }, 190);
    },
    toggleArchive: () => { S.showArchive = !S.showArchive; render(); },
    archive: el => { S.menu = null; patch([el.dataset.pid], { archived: true }); toast('Смета перенесена в архив'); },
    unarchive: el => {
      S.menu = null;
      const pr = S.list.find(x => x.id === el.dataset.pid);
      patch([pr.id], Object.assign({ archived: false }, folderArchived(projFolder(pr)) ? { folderId: '' } : {}));
    },
    selArchive: () => { S.menu = null; const ids = Array.from(S.sel); S.sel.clear(); patch(ids, { archived: true }); toast(`В архив: ${ids.length}`); },
    archiveFolder: el => { S.menu = null; setFolderArchived(el.dataset.fid, true); },
    unarchiveFolder: el => { S.menu = null; setFolderArchived(el.dataset.fid, false); },
    newSubfolder: el => { S.menu = null; createFolder(el.dataset.fid); },
    clearSearch: () => { S.q = ''; render(); },
    newFolder: () => createFolder(''),
    deleteFolder: el => { S.menu = null; deleteFolderFlow(el.dataset.fid); },
    tabOpen: (el, e) => {
      if (e.target.closest('.pc-tabx-close')) return;
      const pi = +el.dataset.tabPane;
      pane(pi).active = el.dataset.tab; pane(pi).exportOpen = false;
      setFocus(pi); render();
    },
    tabClose: el => {
      // как в Chrome: пока курсор над вкладками, их ширина не меняется — следующий крестик под курсором
      const pi = +el.dataset.tabPane, tab = el.closest('.pc-tabx');
      S.tabFreeze = S.tabFreeze || {};
      if (tab) S.tabFreeze[pi] = tab.getBoundingClientRect().width;
      closeTab(pi, el.dataset.tab);
    },
    split: () => splitOpen(),
    closePane: el => closePane(+el.dataset.pi),
    view: el => { pane().view = el.dataset.view; pane().exportOpen = false; render(); },
    toggleExport: () => { pane().exportOpen = !pane().exportOpen; render(); },
    export: el => { pane().exportOpen = false; render(); doExport(el.dataset.kind); },
    retrySave: () => { if (S.current && S.saveState[S.current.id] === 'error') { S.dirty.add(S.current.id); saveAll(); } },
    undo: () => undoRedo(-1),
    redo: () => undoRedo(1),
    cmpMode: el => { S.cmpMode = el.dataset.mode; render(); },
    addTpl: (el, e) => { if (e.target.closest('.pc-chip-x')) return; addTemplate(+el.dataset.tpl); },
    delTpl: async el => {
      const t = S.templates[+el.dataset.tpl];
      if (!await confirmModal(`Удалить шаблон «${t.name}»?`, 'Удалить', 'Сметы, где эта услуга уже добавлена, не изменятся.')) return;
      S.templates = S.templates.filter(x => x !== t); render();
      try { await api.deleteTemplate(t.name); } catch (e) { toast('Не удалось удалить шаблон: ' + e.message); }
    },
    saveTpl: async el => {
      const s = findSvc(el.dataset.sid);
      const v = await modal('Сохранить как шаблон', [{ name: 'name', label: 'Название шаблона', value: s.name, required: true }, { name: 'desc', label: 'Подсказка (необязательно)', placeholder: 'Например, ролик 15 сек без съёмки' }], 'Сохранить');
      if (!v) return;
      const name = v.name.trim();
      const exists = S.templates.find(x => nameKey(x.name) === nameKey(name));
      if (exists && !await confirmModal(`Шаблон «${name}» уже есть. Заменить?`, 'Заменить')) return;
      const t = {
        name, desc: v.desc.trim(),
        lines: s.lines.map(l => {
          if (l.kind === 'expense') return { kind: 'expense', name: l.name, amount: num(l.amount) };
          const r = rateBy(l.name);
          const o = { kind: 'spec', name: l.name, qty: num(l.qty) };
          if (!r || r.rate !== num(l.rate)) o.rate = num(l.rate); // своя ставка сохраняется в шаблоне
          if (!r || r.unit !== l.unit) o.unit = l.unit;
          return o;
        })
      };
      if (exists) S.templates[S.templates.indexOf(exists)] = t; else S.templates.push(t);
      render();
      try { await api.saveTemplate(t); toast(`Шаблон «${name}» сохранён`); } catch (e) { toast('Шаблон не сохранился: ' + e.message); }
    },
    gotoSvc: el => flashSvc(el.dataset.sid, true),
    customSvc: async () => {
      const v = await modal('Своя услуга', [{ name: 'name', label: 'Название услуги', placeholder: 'Например, 3D-упаковка', required: true }], 'Добавить');
      if (!v) return;
      const s = { id: uid(), name: v.name.trim(), custom: true, lines: [] };
      S.current.services.push(s); render(); markDirty(); flashSvc(s.id, true);
    },
    removeSvc: async el => {
      const s = findSvc(el.dataset.sid);
      if (s.lines.length && !await confirmModal(`Убрать услугу «${displayName(s)}» из сметы?`, 'Убрать', 'Это можно отменить кнопкой «Отменить».')) return;
      S.current.services = S.current.services.filter(x => x.id !== s.id); render(); markDirty();
    },
    addPos: el => { const s = findSvc(el.dataset.sid); s.lines.push(makeLine({ kind: 'spec', name: el.dataset.pos, qty: 1 })); render(); markDirty(); },
    customSpec: async el => {
      const v = await modal('Свой специалист', [
        { name: 'name', label: 'Позиция', placeholder: 'Например, 3D-художник', required: true },
        { name: 'rate', label: 'Ставка, ₽', type: 'number', value: '' },
        { name: 'unit', label: 'За что ставка', type: 'select', options: UNITS, value: 'ч' },
        { name: 'qty', label: 'Объём', type: 'number', value: 1 }], 'Добавить');
      if (!v) return;
      findSvc(el.dataset.sid).lines.push(makeLine({ kind: 'spec', name: v.name.trim(), rate: num(v.rate), unit: v.unit, qty: num(v.qty) }));
      render(); markDirty();
    },
    addExpense: async el => {
      const v = await modal('Расход', [{ name: 'name', label: 'Статья расхода', placeholder: 'Например, кредиты на генерации', required: true }, { name: 'amount', label: 'Сумма, ₽', type: 'number' }], 'Добавить');
      if (!v) return;
      findSvc(el.dataset.sid).lines.push(makeLine({ kind: 'expense', name: v.name.trim(), amount: num(v.amount) }));
      render(); markDirty();
    },
    removeLine: el => { const s = findSvc(el.dataset.sid); s.lines = s.lines.filter(l => l.id !== el.dataset.lid); render(); markDirty(); },
    modalCancel: (el, e) => { if (e.target === el || el.tagName === 'BUTTON') closeModal(null); },
    modalOk: el => { const v = modalValues(el); if (v) closeModal(v); }
  };

  // фокус окна: события внутри окна делают его активным
  function focusFromEvent(e) {
    const pe = e.target.closest && e.target.closest('[data-pane]');
    if (pe && +pe.dataset.pane !== S.focus) setFocus(+pe.dataset.pane);
  }
  root.addEventListener('click', e => {
    focusFromEvent(e);
    const el = e.target.closest('[data-act]');
    const inMenu = e.target.closest('.pc-ctx');
    if (S.menu && !inMenu && !(el && el.dataset.act === 'menu')) { S.menu = null; if (!el) { render(); return; } }
    if (!el || !root.contains(el)) {
      let changed = false;
      if (pane() && pane().exportOpen && !e.target.closest('.pc-export')) { pane().exportOpen = false; changed = true; }
      // клик по пустому месту снимает выделение смет
      if ((S.sel.size || S.selMode) && !e.target.closest('.pc-proj,.pc-selpop,.pc-modal,.pc-ctx,input,select,textarea,label')) { S.sel.clear(); S.selMode = false; changed = true; }
      if (changed) render();
      return;
    }
    if (pane() && pane().exportOpen && !el.closest('.pc-export')) pane().exportOpen = false;
    if (el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  root.addEventListener('contextmenu', e => {
    const tb = e.target.closest('[data-tab]');
    if (tb) { e.preventDefault(); S.menu = { type: 'tab', key: tb.dataset.tab, pi: +tb.dataset.tabPane, x: e.clientX, y: e.clientY }; render(); return; }
    const pr = e.target.closest('.pc-proj'), fh = e.target.closest('[data-drag-folder]');
    if (!pr && !fh) return;
    e.preventDefault();
    S.menu = pr ? { type: 'proj', id: pr.dataset.pid, x: e.clientX, y: e.clientY } : { type: 'folder', id: fh.dataset.dragFolder, x: e.clientX, y: e.clientY };
    render();
  });
  async function commitRename(cancel) {
    const r = S.renaming; if (!r) return;
    const el = root.querySelector('[data-inline]');
    const val = el ? el.value.trim() : '';
    S.renaming = null;
    if (cancel || !el) { render(); return; }
    if (r.type === 'folder') {
      const f = S.folders.find(x => x.id === r.id);
      if (!val) { toast('Название папки не может быть пустым'); render(); return; }
      f.name = val; render(); saveFoldersNow();
    } else {
      if (!await renameProject(r.id, val)) render();
    }
  }
  root.addEventListener('focusout', e => { if (e.target.matches && e.target.matches('[data-inline]') && S.renaming) setTimeout(() => { if (S.renaming) commitRename(false); }, 0); });
  root.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('[data-inline]')) {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(false); }
      if (e.key === 'Escape') { e.preventDefault(); commitRename(true); }
      return;
    }
    if (e.key === 'Enter' && S.modalHTML && e.target.closest('.pc-modal')) {
      e.preventDefault();
      const only = root.querySelectorAll('.pc-modal [data-act="modalOk"]');
      const v = modalValues(only.length === 1 ? only[0] : null);
      if (v && only.length === 1) closeModal(v);
      return;
    }
    if (e.key === 'Enter' && e.target.matches('input[data-f]') && e.target.dataset.f !== 'search') e.target.blur();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && root.isConnected && !e.defaultPrevented) {
      if (S.modalHTML) { closeModal(null); return; }
      if (S.menu) { S.menu = null; render(); return; }
      if (S.sel.size || S.selMode) { S.sel.clear(); S.selMode = false; render(); }
      return;
    }
    if (!root.isConnected || S.modalHTML) return;
    const k = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || (k !== 'z' && k !== 'y' && k !== 'я' && k !== 'н')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; // в полях — обычная отмена ввода
    if (!S.current) return;
    e.preventDefault();
    undoRedo((k === 'y' || k === 'н' || e.shiftKey) ? 1 : -1);
  });
  root.addEventListener('mousedown', focusFromEvent);
  // ширина вкладок «размораживается», когда курсор ушёл из полосы вкладок
  document.addEventListener('mousemove', e => {
    if (!S.tabFreeze || !Object.keys(S.tabFreeze).length) return;
    Object.keys(S.tabFreeze).forEach(pi => {
      const pe = paneEl(+pi), bar = pe && pe.querySelector('.pc-tabbar');
      const r = bar ? bar.getBoundingClientRect() : null;
      if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) return;
      delete S.tabFreeze[pi];
      if (pe) pe.querySelectorAll('.pc-tabx').forEach(x => { x.style.flex = ''; });
    });
  });
  root.addEventListener('focusin', e => {
    focusFromEvent(e);
    if (e.target.dataset && e.target.dataset.f === 'projName') S.nameBefore = e.target.value;
  });

  // ввод без перерисовки
  root.addEventListener('input', e => {
    const el = e.target, f = el.dataset.f;
    if (f === 'search') { S.q = el.value; render(); return; }
    const p = S.current;
    if (!f || !p) return;
    if (f === 'projName' && el.value.trim()) {
      p.name = el.value; syncSummary(p);
      root.querySelectorAll(`[data-name-of="${p.id}"]`).forEach(n => { n.textContent = el.value; });
      commit(p);
    }
  });
  // изменения с перерисовкой
  root.addEventListener('change', e => {
    const el = e.target, f = el.dataset.f, p = S.current;
    if (f === 'stFilter') { S.stFilter = el.value; render(); return; }
    if (!f || !p || f === 'search') return;
    const s = el.dataset.sid ? findSvc(el.dataset.sid) : null;
    const l = s && el.dataset.lid ? s.lines.find(x => x.id === el.dataset.lid) : null;
    switch (f) {
      case 'projName': {
        const v = el.value.trim();
        if (!v) { p.name = S.nameBefore || p.name || 'Смета'; toast('Название сметы обязательно'); break; }
        p.name = v; Object.assign(p, renameRule(p) || {}); break;
      }
      case 'projDate': p.date = el.value || today(); break;
      case 'projVersion': p.version = Math.max(1, Math.round(num(el.value)) || 1); break;
      case 'projFolder': p.folderId = el.value; S.open[el.value] = true; break;
      case 'projStatus': p.status = el.value; break;
      case 'svcName': s.name = el.value.trim() || s.name; break;
      case 'lineName': l.name = el.value.trim() || l.name; break;
      case 'lineRate': l.rate = Math.max(0, num(el.value)); break;
      case 'lineUnit': l.unit = el.value; break;
      case 'lineQty': l.qty = Math.max(0, Math.round(num(el.value))); break;
      case 'lineAmount': l.amount = Math.max(0, num(el.value)); break;
      case 'marginPct': p.marginPct = Math.min(95, Math.max(0, num(el.value))); break;
      case 'contPct': p.contPct = Math.max(0, num(el.value)); break;
      case 'taxPct': p.taxPct = Math.max(0, num(el.value)); break;
      case 'discount': p.discount = Math.max(0, num(el.value)); break;
      case 'discMode': p.discMode = el.value; break;
      default: return;
    }
    commit(p);
    renderSoon();
  });

  /* ---------- перетаскивание ---------- */
  let dndPayload = null, tabDrag = null;
  const markSrcPane = () => { const pe = paneEl(); if (pe) pe.classList.add('is-drag-src'); };
  // подсказка у курсора: что произойдёт при сбросе в соседнее окно
  function copyHint(e, text) {
    let h = document.getElementById('pcalc-copyhint');
    if (!text) { if (h) h.remove(); return; }
    if (!h) { h = document.createElement('div'); h.id = 'pcalc-copyhint'; document.body.appendChild(h); }
    h.style.cssText = `position:fixed;left:${e.clientX + 16}px;top:${e.clientY + 18}px;z-index:100001;pointer-events:none;background:#1d1c1a;color:#fff;font:600 12.5px Manrope,system-ui,sans-serif;padding:7px 10px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.2);white-space:nowrap`;
    h.textContent = text;
  }
  const otherPaneProj = el => { const pe = el && el.closest('[data-pane]'); if (!pe || +pe.dataset.pane === S.focus) return null; return paneProj(+pe.dataset.pane); };
  // вкладки расступаются, когда перетаскиваемая прошла половину соседней
  function tabPreview(x) {
    const d = tabDrag; if (!d) return;
    const others = d.rects.map((r, i) => i).filter(i => i !== d.src);
    let ni = 0;
    others.forEach(i => { const r = d.rects[i]; if (x > r.left + r.width / 2) ni++; });
    if (d.on && ni === d.idx) return;
    d.idx = ni; d.on = true;
    d.sc.classList.add('is-sorting');
    const order = others.slice(); order.splice(ni, 0, d.src);
    const gap = d.rects.length > 1 ? d.rects[1].left - d.rects[0].right : 2;
    let pos = d.rects[0].left;
    order.forEach(i => { const dx = pos - d.rects[i].left; d.els[i].style.transform = Math.abs(dx) > 0.5 ? `translateX(${dx}px)` : ''; pos += d.rects[i].width + gap; });
  }
  function tabPreviewReset() {
    const d = tabDrag; if (!d || !d.on) return;
    d.on = false; d.idx = d.src;
    d.els.forEach(x => { x.style.transform = ''; });
  }
  root.addEventListener('dragstart', e => {
    focusFromEvent(e);
    const t = e.target.closest ? e.target : e.target.parentElement;
    const set = (pl, effect) => {
      dndPayload = pl;
      root.classList.add('pc-dnd', 'pc-dnd-' + pl.type);
      e.dataTransfer.effectAllowed = effect || 'move';
      try { e.dataTransfer.setData('text/plain', pl.type); } catch (err) { }
    };
    const lseg = t.closest('[data-lseg]') || t.closest('[data-grip-lid]');
    if (lseg) {
      if (drag) { e.preventDefault(); return; }
      const sid = lseg.dataset.lseg || lseg.dataset.gripSid, lid = lseg.dataset.lid || lseg.dataset.gripLid;
      set({ type: 'line', sid, lid, pane: S.focus }, 'copyMove');
      markSrcPane();
      paneEl().querySelectorAll(`[data-lseg][data-lid="${lid}"],tr[data-row="${lid}"]`).forEach(x => x.classList.add('is-dragged'));
      return;
    }
    const seg = t.closest('[data-projseg]');
    if (seg) { set({ type: 'seg', sid: seg.dataset.projseg, pane: S.focus }, 'copyMove'); seg.classList.add('is-dragged'); markSrcPane(); return; }
    const tpl = t.closest('[data-tpl]');
    if (tpl) { set({ type: 'tpl', i: +tpl.dataset.tpl }, 'copy'); return; }
    const tab = t.closest('[data-tab]');
    if (tab) {
      set({ type: 'tab', key: tab.dataset.tab, from: +tab.dataset.tabPane });
      const sc = tab.closest('.pc-tabs-scroll'), els = Array.from(sc.querySelectorAll('.pc-tabx'));
      tabDrag = { sc, els, rects: els.map(x => x.getBoundingClientRect()), src: els.indexOf(tab), idx: els.indexOf(tab), on: false };
      requestAnimationFrame(() => { tab.classList.add('is-dragged'); const pe = tab.closest('.pc-pane'); if (pe) pe.classList.add('is-drag-src'); });
      return;
    }
    const proj = t.closest('.pc-proj');
    if (proj) {
      if (S.renaming) { e.preventDefault(); return; }
      const id = proj.dataset.pid;
      const ids = S.sel.has(id) ? Array.from(S.sel) : [id];
      set({ type: 'proj', ids, trashed: !!proj.dataset.trashed, archived: !!proj.dataset.archived }, 'copyMove');
      ids.forEach(x => root.querySelectorAll(`.pc-proj[data-pid="${x}"]`).forEach(n => n.classList.add('is-dragged')));
      return;
    }
    const fh = t.closest('[data-drag-folder]');
    if (fh) { set({ type: 'folder', id: fh.dataset.dragFolder, archived: !!fh.dataset.archived }); fh.classList.add('is-dragged'); return; }
  });
  const clearDnd = () => root.querySelectorAll('.is-over,.is-before,.is-after,.is-inside,.is-dragged,.gap-before,.gap-after').forEach(x => x.classList.remove('is-over', 'is-before', 'is-after', 'is-inside', 'is-dragged', 'gap-before', 'gap-after'));
  const clearZones = () => root.classList.remove('pc-dnd', 'pc-dnd-tpl', 'pc-dnd-seg', 'pc-dnd-line', 'pc-dnd-tab', 'pc-dnd-proj', 'pc-dnd-folder');
  root.addEventListener('dragend', () => { copyHint(null, ''); root.querySelectorAll('.is-drag-src').forEach(x => x.classList.remove('is-drag-src')); dndPayload = null; tabPreviewReset(); if (tabDrag) tabDrag.sc.classList.remove('is-sorting'); tabDrag = null; clearDnd(); clearZones(); });
  function segSide(e, el) {
    const r = el.getBoundingClientRect();
    if (el.tagName === 'TR') return e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    return e.clientX < r.left + r.width / 2 ? 'before' : 'after';
  }
  // элемент, который подсвечивается как зона сброса
  function zoneOf(t) {
    if (t.dataset.dropFolder != null) return t.querySelector(':scope > .pc-folder-head') || t;
    if (t.dataset.dropPane != null && dndPayload && dndPayload.type === 'proj') return t.closest('.pc-pane').querySelector('.pc-pane-body');
    return t;
  }
  function folderSide(e, t) {
    if (t.dataset.fhead === '') return 'inside';
    const r = t.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
  }
  const isReorder = (pl, t) => pl && (pl.type === 'seg' || pl.type === 'line' || (pl.type === 'tab' && t && t.dataset.tab != null));
  function dropTarget(e) {
    const pl = dndPayload;
    if (!pl) return null;
    const c = sel => e.target.closest(sel);
    const inFocusPane = el => el && el.closest('[data-pane]') && +el.closest('[data-pane]').dataset.pane === S.focus;
    if (pl.type === 'tpl') { const t = c('[data-drop="project"]'); return inFocusPane(t) ? t : null; }
    if (pl.type === 'seg') {
      const body = c('.pc-pane-body');
      if (body && otherPaneProj(body)) return body; // копия услуги в смету соседнего окна
      const t = c('[data-projseg]'); return inFocusPane(t) && t.dataset.projseg !== pl.sid ? t : null;
    }
    if (pl.type === 'line') {
      const card = c('[data-svc]');
      if (card && otherPaneProj(card)) return card; // копия позиции в услугу соседнего окна
      const t = c(`[data-lseg="${pl.sid}"]`) || c(`tr[data-row-of="${pl.sid}"]`);
      return inFocusPane(t) && (t.dataset.lid || t.dataset.row) !== pl.lid ? t : null;
    }
    if (pl.type === 'proj') {
      if (pl.trashed) return c('[data-drop-folder]') || null; // из корзины — только вернуть в папку
      if (c('[data-drop-archive]')) return pl.archived ? null : c('[data-drop-archive]');
      return c('[data-drop-trash]') || c('[data-drop-folder]') || c('[data-drop-split]') || c('[data-drop-pane]');
    }
    if (pl.type === 'folder') {
      if (c('[data-drop-archive]')) return pl.archived ? null : c('[data-drop-archive]');
      if (c('[data-drop-trash]')) return c('[data-drop-trash]');
      const h = c('[data-fhead]');
      return h && h.dataset.fhead !== pl.id ? h : null;
    }
    if (pl.type === 'tab') {
      if (c('[data-drop-split]')) return c('[data-drop-split]');
      const bar = c('.pc-tabbar');
      if (bar && +bar.dataset.dropPane === pl.from) return bar; // своя полоса — живая перестановка
      const tab = c('[data-tab]');
      if (tab) return tab.dataset.tab === pl.key && +tab.dataset.tabPane === pl.from ? null : tab;
      const t = c('[data-drop-pane]'); return t && +t.dataset.dropPane !== pl.from ? t : null;
    }
    return null;
  }
  root.addEventListener('dragover', e => {
    const t = dropTarget(e);
    root.querySelectorAll('.is-over,.is-before,.is-after').forEach(x => { if (x !== t) x.classList.remove('is-over', 'is-before', 'is-after'); });
    if (dndPayload && dndPayload.type === 'tab') {
      if (t && t.classList.contains('pc-tabbar') && +t.dataset.dropPane === dndPayload.from) { e.preventDefault(); tabPreview(e.clientX); return; }
      tabPreviewReset();
    }
    const isCopy = t && dndPayload && (dndPayload.type === 'seg' || dndPayload.type === 'line') && !!otherPaneProj(t);
    if (isCopy) {
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { }
      root.querySelectorAll('.pc-zone.is-over').forEach(x => { if (x !== t) x.classList.remove('is-over'); });
      t.classList.add('is-over');
      const tp = otherPaneProj(t);
      if (dndPayload.type === 'seg') copyHint(e, `+ Услуга скопируется в «${tp.name}»`);
      else { const ts = tp.services.find(x => x.id === t.dataset.svc); copyHint(e, `+ Позиция скопируется в «${ts ? displayName(ts, tp) : 'услугу'}»`); }
      return;
    }
    copyHint(e, '');
    if (!t) return;
    e.preventDefault();
    if (dndPayload.type === 'folder' && t.dataset.fhead != null) {
      const side = folderSide(e, t), w = t.parentElement;
      root.querySelectorAll('.gap-before,.gap-after').forEach(x => { if (x !== w) x.classList.remove('gap-before', 'gap-after'); });
      t.classList.toggle('is-inside', side === 'inside');
      w.classList.toggle('gap-before', side === 'before');
      w.classList.toggle('gap-after', side === 'after');
    } else if (isReorder(dndPayload, t)) { const side = segSide(e, t); t.classList.toggle('is-before', side === 'before'); t.classList.toggle('is-after', side === 'after'); }
    else { const h = zoneOf(t); root.querySelectorAll('.pc-zone.is-over').forEach(x => { if (x !== h) x.classList.remove('is-over'); }); h.classList.add('is-over'); }
  });
  root.addEventListener('drop', async e => {
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    const pl = dndPayload; dndPayload = null;
    const side = pl.type === 'folder' && t.dataset.fhead != null ? folderSide(e, t) : isReorder(pl, t) ? segSide(e, t) : null;
    clearDnd(); clearZones(); copyHint(e, '');
    const target = (pl.type === 'seg' || pl.type === 'line') ? otherPaneProj(t) : null;
    if (target) {
      const src = paneProj(pl.pane);
      const svc = src && src.services.find(x => x.id === pl.sid);
      if (!svc) return;
      if (pl.type === 'seg') {
        const copy = clone(svc); copy.id = uid(); copy.lines.forEach(l => { l.id = uid(); });
        target.services.push(copy);
        toast(`Услуга «${displayName(svc, src)}» скопирована в «${target.name}»`);
      } else {
        const line = svc.lines.find(x => x.id === pl.lid), ts = target.services.find(x => x.id === t.dataset.svc);
        if (!line || !ts) return;
        const copy = clone(line); copy.id = uid(); ts.lines.push(copy);
        toast(`«${line.name}» скопирован в «${displayName(ts, target)}»`);
      }
      commit(target); render();
      return;
    }
    if (t.dataset.dropSplit) {
      S.panes.push({ tabs: [], active: null, view: 'compose', exportOpen: false });
      if (pl.type === 'tab') {
        const from = pane(pl.from); from.tabs = from.tabs.filter(k => k !== pl.key);
        if (from.active === pl.key) from.active = from.tabs[from.tabs.length - 1] || null;
        pane(1).tabs.push(pl.key); pane(1).active = pl.key; setFocus(1); render();
      } else if (pl.type === 'proj') { for (const id of pl.ids) await openIn(id, 1); }
      return;
    }
    if (pl.type === 'seg') {
      const list = S.current.services;
      const moving = list.splice(list.findIndex(x => x.id === pl.sid), 1)[0];
      let to = list.findIndex(x => x.id === t.dataset.projseg);
      if (side === 'after') to++;
      list.splice(to, 0, moving);
      render(); markDirty();
    } else if (pl.type === 'line') {
      const svc = findSvc(pl.sid);
      const moving = svc.lines.splice(svc.lines.findIndex(x => x.id === pl.lid), 1)[0];
      let to = svc.lines.findIndex(x => x.id === (t.dataset.lid || t.dataset.row));
      if (side === 'after') to++;
      svc.lines.splice(to, 0, moving);
      render(); markDirty();
    } else if (pl.type === 'tpl') addTemplate(pl.i);
    else if (pl.type === 'tab' && t.classList.contains('pc-tabbar') && +t.dataset.dropPane === pl.from) {
      const pn = pane(pl.from), at = tabDrag ? tabDrag.idx : pn.tabs.length - 1;
      pn.tabs = pn.tabs.filter(k => k !== pl.key); pn.tabs.splice(at, 0, pl.key);
      pn.active = pl.key; tabDrag = null; setFocus(pl.from); render();
    } else if (pl.type === 'tab') {
      const to = t.dataset.tab != null ? +t.dataset.tabPane : +t.dataset.dropPane, from = pane(pl.from), dest = pane(to);
      from.tabs = from.tabs.filter(k => k !== pl.key);
      if (from.active === pl.key && from !== dest) from.active = from.tabs[0] || null;
      dest.tabs = dest.tabs.filter(k => k !== pl.key);
      let at = dest.tabs.length;
      if (t.dataset.tab != null) { at = dest.tabs.indexOf(t.dataset.tab); if (side === 'after') at++; }
      dest.tabs.splice(at, 0, pl.key);
      dest.active = pl.key; setFocus(to); render();
    } else if (pl.type === 'folder') {
      if (t.dataset.dropTrash) deleteFolderFlow(pl.id);
      else if (t.dataset.dropArchive) setFolderArchived(pl.id, true);
      else moveFolder(pl.id, t.dataset.fhead, side);
    } else if (pl.type === 'proj') {
      if (t.dataset.dropTrash) { patch(pl.ids, { trashed: true }); toast(pl.ids.length > 1 ? `Перемещено в корзину: ${pl.ids.length}` : 'Смета перемещена в корзину'); }
      else if (t.dataset.dropArchive) { patch(pl.ids, { archived: true }); toast(pl.ids.length > 1 ? `В архив: ${pl.ids.length}` : 'Смета перенесена в архив'); }
      else if (t.dataset.dropFolder != null) { const fid = t.dataset.dropFolder; S.open[fid] = true; patch(pl.ids, { folderId: fid, trashed: false, archived: false }); }
      else if (t.dataset.dropPane != null) { for (const id of pl.ids) await openIn(id, +t.dataset.dropPane); }
    }
  });

  root.addEventListener('mousemove', e => {
    const seg = e.target.closest('[data-tip]');
    root.querySelectorAll('.pc-tip').forEach(tp => { if (!seg || !tp.parentElement.contains(seg)) tp.hidden = true; });
    if (!seg) return;
    const card = seg.closest('.pc-fchart'), tip = card.querySelector('.pc-tip');
    const box = card.getBoundingClientRect();
    tip.textContent = seg.dataset.tip; tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(e.clientX - box.left + 12, box.width - tip.offsetWidth - 8)) + 'px';
    tip.style.top = (e.clientY - box.top - 40) + 'px';
  });

  /* ---------- ширина и видимость боковой панели ---------- */
  function applySide() {
    root.style.setProperty('--side-w', S.sideW + 'px');
    root.classList.toggle('is-side-collapsed', !!S.sideCollapsed);
  }
  let sideDrag = null;
  root.addEventListener('pointerdown', e => {
    const r = e.target.closest('[data-resizer]');
    if (!r) return;
    e.preventDefault();
    sideDrag = { x: e.clientX, w: S.sideW };
    try { r.setPointerCapture(e.pointerId); } catch (err) { }
    root.classList.add('pc-resizing');
  });
  root.addEventListener('pointermove', e => {
    if (!sideDrag) return;
    S.sideW = Math.min(480, Math.max(220, sideDrag.w + e.clientX - sideDrag.x));
    applySide();
  });
  const endSide = () => { if (!sideDrag) return; sideDrag = null; root.classList.remove('pc-resizing'); ui.sideW = S.sideW; saveUI(); };
  root.addEventListener('pointerup', endSide);
  root.addEventListener('pointercancel', endSide);
  root.addEventListener('dblclick', e => { if (e.target.closest('[data-resizer]')) { S.sideW = 300; ui.sideW = 300; saveUI(); applySide(); } });

  async function askName(first) {
    const v = await modal(first ? 'Как вас подписывать?' : 'Ваше имя', [{ name: 'name', label: 'Имя', value: S.me, placeholder: 'Например, Евгений', required: true }], 'Сохранить',
      { text: 'Коллеги увидят его рядом со сметой, которую вы открыли, и в истории изменений.' });
    if (!v) return;
    S.me = v.name.trim().slice(0, 40); ui.name = S.me; saveUI(); render(); heartbeatSoon();
  }

  /* ---------- перетаскивание границ специалистов ---------- */
  let drag = null;
  const MINW = 48;
  root.addEventListener('pointerdown', e => {
    const h = e.target.closest('.pc-handle');
    if (!h) return;
    focusFromEvent(e);
    e.preventDefault();
    const s = findSvc(h.dataset.sid), l = s && s.lines.find(x => x.id === h.dataset.lid);
    if (!l) return;
    if (l.kind === 'spec' && !(num(l.rate) > 0)) { toast('Сначала укажите ставку для «' + l.name + '»'); return; }
    const bar = h.closest('[data-svcbar]');
    const segs = Array.from(bar.querySelectorAll('.pc-lseg'));
    const T = svcCost(s);
    let wPos = 0;
    segs.forEach(sg => { const x = s.lines.find(q => q.id === sg.dataset.lid); if (x && lineCost(x) > 0) wPos += sg.getBoundingClientRect().width; });
    const unitCost = l.kind === 'spec' ? num(l.rate) : 1000;
    const rubPerPx = T > 0 && wPos > 0 ? T / wPos : unitCost / 40;
    drag = { s, l, segs, rubPerPx, startCost: lineCost(l), startX: e.clientX, pe: paneEl() };
    try { h.setPointerCapture(e.pointerId); } catch (err) { }
    h.classList.add('is-active');
    root.classList.add('pc-dragging');
  });
  root.addEventListener('pointermove', e => {
    if (!drag) return;
    const { l } = drag;
    const c = Math.max(0, drag.startCost + (e.clientX - drag.startX) * drag.rubPerPx);
    if (l.kind === 'spec') l.qty = Math.max(0, Math.round(c / num(l.rate)));
    else l.amount = Math.max(0, Math.round(c / 1000) * 1000);
    liveLayout(drag);
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    root.classList.remove('pc-dragging');
    render(); markDirty();
  }
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  function liveLayout(d) {
    const { s, segs, rubPerPx, pe } = d;
    segs.forEach(sg => {
      const x = s.lines.find(q => q.id === sg.dataset.lid);
      if (x) sg.style.flex = `0 0 ${Math.max(MINW, lineCost(x) / rubPerPx)}px`;
    });
    const l = d.l, set = (k, v, prop) => { const el = pe.querySelector(`[data-live="${k}"]`); if (el) el[prop || 'textContent'] = v; };
    set('segval-' + l.id, l.kind === 'spec' ? `${fmtQ(l.qty)} ${l.unit} · ${fmt(lineCost(l))}` : fmt(lineCost(l)));
    set('qty-' + l.id, l.kind === 'spec' ? l.qty : l.amount, 'value');
    set('sum-' + l.id, fmt(lineCost(l)));
    set('svctotal-' + s.id, fmt(svcCost(s)));
    set('projseg-' + s.id, fmt(svcCost(s)));
    const total = projDirect(S.current);
    set('projtotal', fmt(total));
    S.current.services.forEach(x => { const el = pe.querySelector(`[data-projseg="${x.id}"]`); if (el) el.style.flexGrow = total > 0 ? svcCost(x) : 1; });
  }

  /* ---------- выгрузка ---------- */
  const safeName = s => String(s || 'Смета').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const fileName = (p, internal) => `${safeName(p.name)} — смета v${p.version || 1}${internal ? ' (внутр.)' : ''} ${fmtDate(p.date)}`;
  const verLine = p => `Смета от ${fmtDate(p.date)} · версия ${p.version || 1}`;
  const finRowsInternal = (p, f) => [
    ['Прямые расходы', f.direct],
    [`Непредвиденные ${fmtQ(p.contPct)}% от прямых`, f.cont],
    [`Маржа ${fmtQ(p.marginPct)}% (расходы ÷ ${fmtQ(1 - marginShare(p))})`, f.marginFull]
  ].concat(f.disc > 0 ? [['Скидка (из маржи)', -f.disc], ['Маржа после скидки', f.margin]] : [])
    .concat([[`Налог ${fmtQ(p.taxPct)}% сверху`, f.tax]]);
  // клиентская смета: услуги по полной цене, скидка отдельной строкой
  const clientRows = (p, f) => {
    const tx = 1 + num(p.taxPct) / 100;
    return { rows: p.services.map(s => [displayName(s, p), finOf(p, svcCost(s)).pre * tx]), disc: f.disc * tx };
  };

  async function doExport(kind) {
    const p = S.current; if (!p) return;
    if (!p.services.length) { toast('В смете пока нет услуг'); return; }
    const internal = kind.endsWith('internal');
    try {
      if (kind.startsWith('pdf')) {
        toast('Готовлю PDF…');
        let lib = true;
        try { await loadPdfMake(); } catch (e) { lib = false; }
        if (lib) window.pdfMake.createPdf(pdfDoc(p, internal)).download(fileName(p, internal) + '.pdf');
        else printHTML(estimateHTML(p, internal), fileName(p, internal));
      } else await exportXLSX(p, internal);
    } catch (e) { toast('Не удалось выгрузить: ' + e.message); }
  }

  function estimateHTML(p, internal) {
    const f = finOf(p);
    let body;
    if (!internal) {
      const cr = clientRows(p, f);
      body = `<table><thead><tr><th class="n">№</th><th>Услуга</th><th class="r">Стоимость, ₽</th></tr></thead><tbody>
        ${cr.rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r[0])}</td><td class="r">${fmtN(r[1])}</td></tr>`).join('')}
        </tbody><tfoot>${f.disc > 0 ? `<tr class="sub"><td></td><td>Скидка</td><td class="r">−${fmtN(cr.disc)}</td></tr>` : ''}<tr><td></td><td>Итого</td><td class="r">${fmtN(f.total)}</td></tr>
        <tr class="sub"><td></td><td>в т.ч. налог ${fmtQ(p.taxPct)}%</td><td class="r">${fmtN(f.tax)}</td></tr></tfoot></table>`;
    } else {
      body = p.services.map(s => `<h2>${esc(displayName(s, p))}</h2><table class="lines"><thead><tr><th>Позиция</th><th class="r">Ставка, ₽</th><th class="r">Объём</th><th class="r">Сумма, ₽</th></tr></thead><tbody>
        ${s.lines.map(l => l.kind === 'expense'
        ? `<tr><td>${esc(l.name)} <i>(расход)</i></td><td class="r">—</td><td class="r">—</td><td class="r">${fmtN(lineCost(l))}</td></tr>`
        : `<tr><td>${esc(l.name)}</td><td class="r">${fmtN(l.rate)} / ${esc(l.unit)}</td><td class="r">${fmtQ(l.qty)} ${esc(l.unit)}</td><td class="r">${fmtN(lineCost(l))}</td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="3">Итого по услуге</td><td class="r">${fmtN(svcCost(s))}</td></tr></tfoot></table>`).join('')
        + `<h2>Финансы</h2><table class="fin"><tbody>${finRowsInternal(p, f).map(r => `<tr><td>${esc(r[0])}</td><td class="r">${r[1] < 0 ? '−' : ''}${fmtN(Math.abs(r[1]))}</td></tr>`).join('')}
        </tbody><tfoot><tr><td>Итого для клиента</td><td class="r">${fmtN(f.total)}</td></tr></tfoot></table>`;
    }
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(fileName(p, internal))}</title><style>
      @page{size:A4;margin:16mm 14mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#1d1c1a;font-size:10.5pt;margin:0}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d1c1a;padding-bottom:10px;margin-bottom:18px}
      .studio{font-weight:700;font-size:13pt}.meta{text-align:right;color:#555;font-size:9.5pt}
      h1{font-size:18pt;margin:0 0 4px}h2{font-size:12pt;margin:18px 0 6px}
      .kind{color:#777;font-size:9.5pt;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:6px}
      th{font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;color:#777;text-align:left;border-bottom:1px solid #bbb;padding:6px}
      td{padding:6px;border-bottom:1px solid #e3e0d8;vertical-align:top}
      .r{text-align:right;white-space:nowrap}.n{width:28px;color:#777}
      tfoot td{font-weight:700;border-bottom:0;border-top:1.5px solid #1d1c1a}
      tfoot tr.sub td{font-weight:400;color:#555;border-top:0}
      .fin tfoot td{font-size:12pt}
      table.lines{table-layout:fixed}table.lines th:nth-child(2),table.lines th:nth-child(3){width:20%}table.lines th:nth-child(4){width:16%}
      i{color:#888;font-style:normal;font-size:9pt}
    </style></head><body>
      <div class="top"><div class="studio">Название студии</div><div class="meta">${verLine(p)}</div></div>
      <h1>${esc(p.name)}</h1><div class="kind">${internal ? 'Внутренняя смета — не для передачи клиенту' : 'Коммерческое предложение'}</div>
      ${body}</body></html>`;
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('не загрузилась библиотека'));
      document.head.appendChild(s);
    });
  }
  async function loadPdfMake() {
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/';
    if (!window.pdfMake) await loadScript(base + 'pdfmake.min.js');
    if (!window.pdfMake.vfs || !Object.keys(window.pdfMake.vfs).length) await loadScript(base + 'vfs_fonts.js');
  }
  function pdfDoc(p, internal) {
    const f = finOf(p), R_ = { alignment: 'right' };
    const H = t => ({ text: t.toUpperCase(), style: 'th' });
    const content = [
      { columns: [{ text: 'Название студии', bold: true, fontSize: 13 }, { text: verLine(p), alignment: 'right', color: '#555', fontSize: 9 }] },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 1.5 }], margin: [0, 0, 0, 14] },
      { text: p.name, fontSize: 18, bold: true },
      { text: internal ? 'Внутренняя смета — не для передачи клиенту' : 'Коммерческое предложение', color: '#777', fontSize: 9, margin: [0, 2, 0, 14] }
    ];
    const layout = { hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => '#d9d5cc', paddingTop: () => 5, paddingBottom: () => 5 };
    if (!internal) {
      const cr = clientRows(p, f);
      const body = [[H('№'), H('Услуга'), Object.assign(H('Стоимость, ₽'), R_)]]
        .concat(cr.rows.map((r, i) => [{ text: String(i + 1), color: '#777' }, r[0], Object.assign({ text: fmtN(r[1]) }, R_)]))
        .concat(f.disc > 0 ? [['', { text: 'Скидка', color: '#555' }, Object.assign({ text: '−' + fmtN(cr.disc), color: '#555' }, R_)]] : [])
        .concat([['', { text: 'Итого', bold: true }, Object.assign({ text: fmtN(f.total), bold: true }, R_)],
          ['', { text: `в т.ч. налог ${fmtQ(p.taxPct)}%`, color: '#555' }, Object.assign({ text: fmtN(f.tax), color: '#555' }, R_)]]);
      content.push({ table: { headerRows: 1, widths: [24, '*', 110], body }, layout });
    } else {
      p.services.forEach(s => {
        content.push({ text: displayName(s, p), bold: true, fontSize: 12, margin: [0, 12, 0, 4] });
        const body = [[H('Позиция'), Object.assign(H('Ставка, ₽'), R_), Object.assign(H('Объём'), R_), Object.assign(H('Сумма, ₽'), R_)]]
          .concat(s.lines.map(l => l.kind === 'expense'
            ? [{ text: [l.name, { text: '  расход', color: '#888', fontSize: 8 }] }, Object.assign({ text: '—' }, R_), Object.assign({ text: '—' }, R_), Object.assign({ text: fmtN(lineCost(l)) }, R_)]
            : [l.name, Object.assign({ text: `${fmtN(l.rate)} / ${l.unit}` }, R_), Object.assign({ text: `${fmtQ(l.qty)} ${l.unit}` }, R_), Object.assign({ text: fmtN(lineCost(l)) }, R_)]))
          .concat([[{ text: 'Итого по услуге', bold: true, colSpan: 3 }, '', '', Object.assign({ text: fmtN(svcCost(s)), bold: true }, R_)]]);
        content.push({ table: { headerRows: 1, widths: ['*', 95, 80, 80], body }, layout });
      });
      content.push({ text: 'Финансы', bold: true, fontSize: 12, margin: [0, 16, 0, 4] });
      const fin = finRowsInternal(p, f).map(r => [r[0], Object.assign({ text: (r[1] < 0 ? '−' : '') + fmtN(Math.abs(r[1])) }, R_)])
        .concat([[{ text: 'Итого для клиента', bold: true, fontSize: 12 }, Object.assign({ text: fmtN(f.total), bold: true, fontSize: 12 }, R_)]]);
      content.push({ table: { widths: ['*', 110], body: fin }, layout });
    }
    return { pageSize: 'A4', pageMargins: [40, 40, 40, 40], content, defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1d1c1a' },
      styles: { th: { fontSize: 7.5, color: '#777', bold: true } }, info: { title: fileName(p, internal) } };
  }
  function printHTML(html, title) {
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    const d = fr.contentWindow.document;
    d.open(); d.write(html); d.close();
    const oldTitle = document.title;
    setTimeout(() => {
      document.title = title;
      fr.contentWindow.focus();
      fr.contentWindow.print();
      setTimeout(() => { document.title = oldTitle; }, 1000);
      setTimeout(() => fr.remove(), 60000);
    }, 250);
  }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }
  function sheetFrom(aoa, widths) {
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    Object.keys(ws).forEach(k => { if (k[0] !== '!' && typeof ws[k].v === 'number') ws[k].z = '#,##0'; });
    ws['!cols'] = widths.map(w => ({ wch: w }));
    return ws;
  }
  async function exportXLSX(p, internal) {
    await loadXLSX();
    const X = window.XLSX, f = finOf(p), cr = clientRows(p, f);
    const wb = X.utils.book_new();
    const client = [[p.name], [verLine(p)], [], ['№', 'Услуга', 'Стоимость, ₽']]
      .concat(cr.rows.map((r, i) => [i + 1, r[0], Math.round(r[1])]))
      .concat([[]])
      .concat(f.disc > 0 ? [['', 'Скидка', -Math.round(cr.disc)]] : [])
      .concat([['', 'Итого', Math.round(f.total)], ['', `в т.ч. налог ${fmtQ(p.taxPct)}%`, Math.round(f.tax)]]);
    if (internal) {
      const rows = [[p.name], ['Внутренняя. ' + verLine(p)], [], ['Услуга / позиция', 'Тип', 'Ставка, ₽', 'Ед.', 'Объём', 'Сумма, ₽']];
      p.services.forEach(s => {
        rows.push([displayName(s, p), '', '', '', '', Math.round(svcCost(s))]);
        s.lines.forEach(l => rows.push(l.kind === 'expense'
          ? ['   ' + l.name, 'расход', '', '', '', Math.round(lineCost(l))]
          : ['   ' + l.name, 'специалист', num(l.rate), l.unit, num(l.qty), Math.round(lineCost(l))]));
      });
      rows.push([]);
      finRowsInternal(p, f).forEach(r => rows.push([r[0], '', '', '', '', Math.round(r[1])]));
      rows.push(['Итого для клиента', '', '', '', '', Math.round(f.total)]);
      X.utils.book_append_sheet(wb, sheetFrom(rows, [42, 12, 12, 8, 10, 16]), 'Внутренняя');
    }
    X.utils.book_append_sheet(wb, sheetFrom(client, [6, 46, 18]), 'Для клиента');
    X.writeFile(wb, fileName(p, internal) + '.xlsx');
  }

  /* ---------- старт ---------- */
  function applyBoot(d) {
    S.rates = (d.rates || []).map(r => Object.assign({}, r, { unit: r.unit || unitFromNote(r.note) }));
    S.templates = d.services || [];
    S.folders = (d.folders || []).map(f => ({ id: String(f.id), name: f.name, parent: f.parent || '', archived: !!f.archived }));
    const local = {};
    Object.values(S.cache).forEach(p => { local[p.id] = summary(p); }); // открытые сметы могут быть новее
    S.list = (d.projects || []).map(x => Object.assign({ status: 'draft' }, local[x.id] && S.dirty.has(x.id) ? local[x.id] : x));
    Object.keys(local).forEach(id => { if (!S.list.find(x => x.id === id)) S.list.push(local[id]); });
  }
  async function boot() {
    S.error = '';
    const cached = REMOTE ? LC.get('boot') : null;
    if (cached) { applyBoot(cached); S.loading = false; applySide(); render(); } // сразу показываем то, что было в прошлый раз
    else { S.loading = true; render(); }
    try {
      const d = await api.bootstrap();
      applyBoot(d);
      if (REMOTE) LC.set('boot', { rates: d.rates, services: d.services, folders: d.folders, projects: d.projects });
      S.loading = false;
      applySide();
      if (!drag && !dndPayload && !S.renaming) render();
      if (REMOTE) { heartbeat(); if (!S.me) askName(true); }
    } catch (e) {
      if (cached) { toast('Нет связи с таблицей — показаны данные с прошлого открытия'); return; }
      S.loading = false; S.error = e.message || String(e); render();
    }
  }
  window.addEventListener('beforeunload', e => { if (S.dirty.size) { saveAll(); e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', leavePresence);
  boot();
})();
