/**
 * Калькулятор смет — бэкенд на Google Apps Script.
 * Скрипт привязан к таблице ПРОЕКТОВ (Расширения → Apps Script).
 * Ставки и услуги читаются из отдельной таблицы СТАВОК.
 */

const CONFIG = {
  // ID таблицы со ставками: часть ссылки между /d/ и /edit
  SOURCE_SPREADSHEET_ID: 'ВСТАВЬТЕ_СЮДА_ID_ТАБЛИЦЫ_СО_СТАВКАМИ',
  RATES_SHEET: 'Гонорары',   // колонки: Позиция | Цена | Примечание
  SERVICES_SHEET: 'Услуги'   // колонки: Услуга | Тип | Позиция | Количество | Сумма | Описание
};

const SHEET_PROJECTS = 'Проекты';
const SHEET_FOLDERS = 'Папки';
const P_HEAD = ['ID', 'Название', 'Дата сметы', 'Папка', 'В корзине', 'Прямые расходы, ₽', 'Итого для клиента, ₽', 'Обновлён', 'Данные (не редактировать вручную)', 'Статус', 'В архиве', 'Сводка (служебное)'];
const COL_JSON = 9, COL_SUM = 12;          // большие данные сметы и короткая сводка для списка
const SCHEMA_VERSION = '5';                // меняется, когда в таблицах появляются новые колонки
const SRC_CACHE_SEC = 600;                 // ставки и шаблоны кэшируются на 10 минут
const STATUS_NAMES = { draft: 'Черновик', sent: 'Отправлена', approved: 'Согласована', work: 'В работе', rejected: 'Отклонена' };
const F_HEAD = ['ID', 'Название', 'Родитель', 'В архиве'];

/* ---------- Запустить один раз из редактора ---------- */
function setup() {
  ensureSheets_();
  PropertiesService.getScriptProperties().setProperty('SCHEMA', SCHEMA_VERSION);
  dropSourceCache_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_KEY')) {
    props.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  }
  const src = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  const rates = readRates_(src);
  const services = readServices_(src, rates);
  Logger.log('Ставок найдено: ' + rates.length + ', услуг: ' + services.length);
  Logger.log('API_KEY (вставьте во фронтенд): ' + props.getProperty('API_KEY'));
}

/* ---------- HTTP ---------- */
function doGet(e) {
  return respond_(() => {
    const p = (e && e.parameter) || {};
    auth_(p.key);
    switch (p.action) {
      case 'bootstrap': return bootstrap_();
      case 'project': return { project: getProject_(p.id) };
      case 'ping': return {};
      default: throw new Error('Неизвестное действие: ' + p.action);
    }
  });
}

function doPost(e) {
  return respond_(() => {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    auth_(b.key);
    if (b.action === 'presence') return presence_(b); // без общей блокировки — быстрый запрос
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (b.action) {
        case 'saveProject': return saveProject_(b.project, b.base, b.force);
        case 'patchProject': return patchProject_(b.id, b.fields || {});
        case 'saveFolder': return saveFolder_(b.folder);
        case 'saveFolders': return saveFolders_(b.folders || []);
        case 'patchMany': return patchMany_(b.ids || [], b.fields || {});
        case 'deleteFolder': return deleteFolder_(b.id, b.mode);
        case 'saveTemplate': return saveTemplate_(b.template);
        case 'deleteTemplate': return deleteTemplate_(b.name);
        case 'deleteProject': return deleteProject_(b.id);
        default: throw new Error('Неизвестное действие: ' + b.action);
      }
    } finally {
      lock.releaseLock();
    }
  });
}

function respond_(fn) {
  let out;
  try {
    out = Object.assign({ ok: true }, fn() || {});
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function auth_(key) {
  const k = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!k) throw new Error('Сначала запустите функцию setup() в редакторе скрипта');
  if (key !== k) throw new Error('Неверный ключ доступа');
}

/* ---------- Чтение ---------- */
function bootstrap_() {
  ensureSchema_();
  const src = sourceData_();
  return {
    rates: src.rates,
    services: src.services,
    folders: readFolders_(),
    projects: readIndex_().map(r => r.sum).filter(Boolean)
  };
}

/* Ставки и шаблоны из таблицы ставок — с кэшем, чтобы не открывать её на каждый запрос */
function sourceData_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('src');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const src = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  const rates = readRates_(src);
  const data = { rates: rates, services: readServices_(src, rates) };
  try { cache.put('src', JSON.stringify(data), SRC_CACHE_SEC); } catch (e) {}
  return data;
}
function dropSourceCache_() { CacheService.getScriptCache().remove('src'); }

/* Если ставки поменяли вручную и нужно сразу увидеть их в калькуляторе — запустите эту функцию */
function resetCache() { dropSourceCache_(); Logger.log('Кэш ставок и шаблонов сброшен'); }

function readRates_(src) {
  const sh = src.getSheetByName(CONFIG.RATES_SHEET);
  if (!sh) throw new Error('В таблице ставок нет листа «' + CONFIG.RATES_SHEET + '»');
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const ix = headerIndex_(v[0], { name: 'Позиция', rate: 'Цена', note: 'Примечание' });
  if (ix.name < 0 || ix.rate < 0) throw new Error('На листе «' + CONFIG.RATES_SHEET + '» нужны колонки «Позиция» и «Цена»');
  return v.slice(1)
    .filter(r => String(r[ix.name]).trim())
    .map(r => {
      const note = ix.note >= 0 ? String(r[ix.note] || '').trim() : '';
      return { name: String(r[ix.name]).trim(), rate: round2_(toNum_(r[ix.rate])), note: note, unit: unitFromNote_(note) };
    });
}

function readServices_(src, rates) {
  const sh = src.getSheetByName(CONFIG.SERVICES_SHEET);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const ix = headerIndex_(v[0], { service: 'Услуга', type: 'Тип', pos: 'Позиция', qty: 'Количество', sum: 'Сумма', desc: 'Описание', rate: 'Ставка', unit: 'Ед.' });
  if (ix.service < 0 || ix.pos < 0) throw new Error('На листе «' + CONFIG.SERVICES_SHEET + '» нужны колонки «Услуга» и «Позиция»');
  const out = [];
  const byName = {};
  let current = '';
  v.slice(1).forEach(r => {
    const svcName = String(r[ix.service] || '').trim();
    if (svcName) current = svcName;           // пустая ячейка = та же услуга, что выше
    const pos = String(r[ix.pos] || '').trim();
    if (!current) return;
    if (!byName[current]) {
      byName[current] = { name: current, desc: '', lines: [] };
      out.push(byName[current]);
    }
    const svc = byName[current];
    if (ix.desc >= 0 && r[ix.desc] && !svc.desc) svc.desc = String(r[ix.desc]).trim();
    if (!pos) return;
    const type = ix.type >= 0 ? String(r[ix.type] || '').trim().toLowerCase() : '';
    if (type.indexOf('расход') === 0) {
      svc.lines.push({ kind: 'expense', name: pos, amount: toNum_(ix.sum >= 0 ? r[ix.sum] : 0) });
    } else {
      const line = { kind: 'spec', name: pos, qty: toNum_(ix.qty >= 0 ? r[ix.qty] : 0) };
      if (ix.rate >= 0 && String(r[ix.rate]).trim() !== '') line.rate = toNum_(r[ix.rate]); // своя ставка шаблона
      if (ix.unit >= 0 && String(r[ix.unit]).trim() !== '') line.unit = String(r[ix.unit]).trim();
      svc.lines.push(line);
    }
  });
  return out;
}

function readFolders_() {
  const sh = sheet_(SHEET_FOLDERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, F_HEAD.length).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({ id: String(r[0]), name: String(r[1]), parent: String(r[2] || ''), archived: String(r[3]).toLowerCase() === 'да' }));
}

/* Список смет: читаются только колонки ID и короткой сводки, без больших данных */
function readIndex_() {
  const sh = sheet_(SHEET_PROJECTS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  const sums = sh.getRange(2, COL_SUM, last - 1, 1).getValues();
  const out = [], fix = [];
  ids.forEach((r, i) => {
    const id = String(r[0] || '');
    if (!id) return;
    let sum = null;
    try { sum = sums[i][0] ? JSON.parse(sums[i][0]) : null; } catch (e) {}
    if (!sum) fix.push(i);
    out.push({ row: i + 2, id: id, sum: sum });
  });
  // старые строки без сводки: один раз собираем её из полных данных
  if (fix.length) {
    const jsons = sh.getRange(2, COL_JSON, last - 1, 1).getValues();
    fix.forEach(i => {
      const r = out.find(x => x.row === i + 2);
      try { r.sum = summary_(JSON.parse(jsons[i][0])); sh.getRange(i + 2, COL_SUM).setValue(JSON.stringify(r.sum)); } catch (e) {}
    });
  }
  return out;
}
function findRow_(id) { return readIndex_().find(x => x.id === String(id)) || null; }
function readJson_(row) { return JSON.parse(sheet_(SHEET_PROJECTS).getRange(row, COL_JSON).getValue()); }

function getProject_(id) {
  const r = findRow_(id);
  if (!r) throw new Error('Проект не найден');
  return readJson_(r.row);
}

/* ---------- Запись ---------- */
function saveProject_(p, base, force) {
  if (!p || !p.id) throw new Error('Нет данных проекта');
  const ex = findRow_(p.id);
  // кто-то сохранил смету после того, как мы её открыли — спрашиваем пользователя
  if (ex && !force && base && ex.sum && ex.sum.updatedAt && ex.sum.updatedAt !== base) {
    return { conflict: true, theirs: readJson_(ex.row) };
  }
  p.updatedAt = new Date().toISOString();
  writeProject_(p, ex ? ex.row : 0, folderNames_());
  return { updatedAt: p.updatedAt };
}

/* Кто сейчас открыл какие сметы (хранится 5 минут в кэше скрипта) */
function presence_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cache = CacheService.getScriptCache();
    let map = {};
    try { map = JSON.parse(cache.get('presence') || '{}'); } catch (e) {}
    const now = Date.now();
    Object.keys(map).forEach(k => { if (now - map[k].ts > 70000) delete map[k]; });
    const sid = String(b.sid || '');
    if (sid && b.ids && b.ids.length) map[sid] = { user: String(b.user || 'Без имени').slice(0, 40), ids: b.ids.slice(0, 40).map(String), editing: String(b.editing || ''), ts: now };
    else delete map[sid];
    cache.put('presence', JSON.stringify(map), 300);
    const out = {};
    Object.keys(map).forEach(k => {
      if (k === sid) return;
      const e = map[k];
      e.ids.forEach(id => { (out[id] = out[id] || []).push({ user: e.user, editing: e.editing === id }); });
    });
    return { presence: out };
  } finally {
    lock.releaseLock();
  }
}

function patchProject_(id, fields) {
  const r = findRow_(id);
  if (!r) throw new Error('Проект не найден');
  const p = readJson_(r.row);
  applyPatch_(p, fields);
  p.updatedAt = new Date().toISOString();
  writeProject_(p, r.row, folderNames_());
  return { updatedAt: p.updatedAt };
}

const PATCHABLE = ['folderId', 'trashed', 'archived', 'name', 'status', 'family', 'version'];
function applyPatch_(p, fields) { PATCHABLE.forEach(k => { if (k in fields) p[k] = fields[k]; }); }

function patchMany_(ids, fields) {
  const want = {}; ids.forEach(id => { want[String(id)] = true; });
  const fnames = folderNames_();
  const now = new Date().toISOString();
  readIndex_().forEach(r => {
    if (!want[r.id]) return;
    const p = readJson_(r.row);
    applyPatch_(p, fields);
    p.updatedAt = now;
    writeProject_(p, r.row, fnames);
  });
  return { updatedAt: now };
}

function writeProject_(p, row, fnames) {
  const json = JSON.stringify(p);
  if (json.length > 49000) throw new Error('Проект слишком большой для одной ячейки (лимит Google Таблиц 50 000 символов)');
  const t = p.totals || {};
  const values = [[p.id, (p.name || '') + ' · v' + (p.version || 1), p.date || '', fnames[p.folderId] || '', p.trashed ? 'да' : '',
    Math.round(t.direct || 0), Math.round(t.client || 0), new Date(), json, STATUS_NAMES[p.status] || STATUS_NAMES.draft, p.archived ? 'да' : '',
    JSON.stringify(summary_(p))]];
  const sh = sheet_(SHEET_PROJECTS);
  sh.getRange(row || sh.getLastRow() + 1, 1, 1, P_HEAD.length).setValues(values);
}

function deleteProject_(id) {
  const r = findRow_(id);
  if (r) sheet_(SHEET_PROJECTS).deleteRow(r.row);
  return {};
}

/* Папки сохраняются целиком: порядок строк = порядок папок в списке */
function saveFolders_(list) {
  const sh = sheet_(SHEET_FOLDERS);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(F_HEAD.length, sh.getLastColumn())).clearContent();
  const rows = list.filter(f => f && f.id).map(f => [String(f.id), String(f.name || 'Папка'), String(f.parent || ''), f.archived ? 'да' : '']);
  if (rows.length) sh.getRange(2, 1, rows.length, F_HEAD.length).setValues(rows);
  refreshFolderColumn_();
  return {};
}

function saveFolder_(f) {
  if (!f || !f.id) throw new Error('Нет данных папки');
  const sh = sheet_(SHEET_FOLDERS);
  const last = sh.getLastRow();
  const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
  const i = ids.indexOf(f.id);
  const row = i >= 0 ? i + 2 : last + 1;
  sh.getRange(row, 1, 1, 4).setValues([[f.id, f.name || 'Папка', f.parent || '', f.archived ? 'да' : '']]);
  refreshFolderColumn_();
  return {};
}

function deleteFolder_(id, mode) {
  const sh = sheet_(SHEET_FOLDERS);
  const last = sh.getLastRow();
  if (last > 1) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    if (i >= 0) sh.deleteRow(i + 2);
  }
  const fnames = folderNames_();
  readIndex_().forEach(r => {
    if (!r.sum || r.sum.folderId !== id) return;
    const p = readJson_(r.row);
    p.folderId = ''; if (mode === 'trash') p.trashed = true;
    writeProject_(p, r.row, fnames);
  });
  return {};
}

/* Колонка «Папка» на листе проектов — одним запросом, а не построчно */
function refreshFolderColumn_() {
  const sh = sheet_(SHEET_PROJECTS);
  const last = sh.getLastRow();
  if (last < 2) return;
  const fnames = folderNames_();
  const byRow = {};
  readIndex_().forEach(r => { byRow[r.row] = r.sum ? (fnames[r.sum.folderId] || '') : ''; });
  const col = [];
  for (let row = 2; row <= last; row++) col.push([byRow[row] != null ? byRow[row] : '']);
  sh.getRange(2, 4, col.length, 1).setValues(col);
}

/* ---------- Шаблоны услуг (лист «Услуги» в таблице ставок) ---------- */
const T_HEAD = ['Услуга', 'Тип', 'Позиция', 'Количество', 'Сумма', 'Описание', 'Ставка', 'Ед.'];

function servicesSheet_() {
  const src = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  let sh = src.getSheetByName(CONFIG.SERVICES_SHEET);
  if (!sh) { sh = src.insertSheet(CONFIG.SERVICES_SHEET); }
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, T_HEAD.length).setValues([T_HEAD]).setFontWeight('bold');
  // добавить недостающие колонки в конец
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(x => String(x).trim().toLowerCase());
  T_HEAD.forEach(h => {
    if (head.indexOf(h.toLowerCase()) < 0) { sh.getRange(1, head.length + 1).setValue(h).setFontWeight('bold'); head.push(h.toLowerCase()); }
  });
  return sh;
}

function removeTemplateRows_(sh, name) {
  const v = sh.getDataRange().getValues();
  const ix = headerIndex_(v[0], { service: 'Услуга' });
  let current = '';
  const rows = [];
  for (let i = 1; i < v.length; i++) {
    const n = String(v[i][ix.service] || '').trim();
    if (n) current = n;
    if (current.toLowerCase() === String(name).trim().toLowerCase()) rows.push(i + 1);
  }
  rows.reverse().forEach(r => sh.deleteRow(r));
}

function saveTemplate_(t) {
  if (!t || !t.name) throw new Error('Нет названия шаблона');
  const sh = servicesSheet_();
  removeTemplateRows_(sh, t.name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const ix = headerIndex_(head, { service: 'Услуга', type: 'Тип', pos: 'Позиция', qty: 'Количество', sum: 'Сумма', desc: 'Описание', rate: 'Ставка', unit: 'Ед.' });
  const lines = (t.lines && t.lines.length) ? t.lines : [{ kind: 'spec', name: '', qty: '' }];
  const rows = lines.map((l, i) => {
    const r = new Array(head.length).fill('');
    r[ix.service] = t.name;
    r[ix.type] = l.kind === 'expense' ? 'Расход' : 'Специалист';
    r[ix.pos] = l.name || '';
    if (l.kind === 'expense') r[ix.sum] = l.amount || 0; else r[ix.qty] = l.qty || 0;
    if (i === 0 && t.desc) r[ix.desc] = t.desc;
    if (l.rate != null) r[ix.rate] = l.rate;
    if (l.unit) r[ix.unit] = l.unit;
    return r;
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
  dropSourceCache_();
  return {};
}

function deleteTemplate_(name) {
  removeTemplateRows_(servicesSheet_(), name);
  dropSourceCache_();
  return {};
}

/* ---------- Утилиты ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets_() {
  const ss = ss_();
  [[SHEET_PROJECTS, P_HEAD], [SHEET_FOLDERS, F_HEAD]].forEach(([name, head]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      // колонки, добавленные в новых версиях калькулятора
      const cur = sh.getRange(1, 1, 1, head.length).getValues()[0];
      head.forEach((h, i) => { if (!String(cur[i]).trim()) sh.getRange(1, i + 1).setValue(h).setFontWeight('bold'); });
    }
  });
}

function ensureSchema_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA') === SCHEMA_VERSION) return;
  ensureSheets_();
  props.setProperty('SCHEMA', SCHEMA_VERSION);
}

function sheet_(name) {
  let sh = ss_().getSheetByName(name);
  if (!sh) { ensureSheets_(); sh = ss_().getSheetByName(name); }
  return sh;
}

function folderNames_() {
  const m = {};
  readFolders_().forEach(f => { m[f.id] = f.name; });
  return m;
}

function summary_(p) {
  return {
    id: p.id, name: p.name, date: p.date, status: p.status || 'draft', archived: !!p.archived, updatedBy: p.updatedBy || '', createdAt: p.createdAt || '', version: p.version || 1, family: p.family || p.id, folderId: p.folderId || '', trashed: !!p.trashed,
    total: (p.totals && p.totals.client) || 0, updatedAt: p.updatedAt || ''
  };
}

function headerIndex_(row, names) {
  const norm = row.map(v => String(v).trim().toLowerCase());
  const ix = {};
  Object.keys(names).forEach(k => { ix[k] = norm.indexOf(names[k].toLowerCase()); });
  return ix;
}

function toNum_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function round2_(n) { return Math.round(n * 100) / 100; }

function unitFromNote_(note) {
  const n = String(note || '').toLowerCase();
  if (n.indexOf('секунд') >= 0) return 'сек';
  if (n.indexOf('ролик') >= 0 || n.indexOf('реклам') >= 0) return 'ролик';
  if (n.indexOf('час') >= 0) return 'ч';
  if (n.indexOf('день') >= 0 || n.indexOf('смен') >= 0) return 'день';
  if (n.indexOf('проект') >= 0) return 'проект';
  if (n.indexOf('фото') >= 0) return 'шт';
  return 'ч';
}
