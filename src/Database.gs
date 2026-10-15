/**
 * Database.gs — Acceso a Google Sheets: lecturas/escrituras por lotes, caché de datos de referencia,
 * bloqueo (LockService) e idempotencia de solicitudes.
 *
 * Google Sheets NO ofrece transacciones, índices ni concurrencia de una base relacional.
 * Mitigaciones: todas las escrituras se serializan con un bloqueo de script, se releen los datos dentro
 * del bloqueo, cada actualización verifica que la fila siga conteniendo el mismo identificador y los
 * pedidos usan un campo "version" (concurrencia optimista).
 */

const _memo = {};
const REF_TABLES = ['Usuarios', 'Productos', 'Rutas', 'Configuracion'];

function ss_() {
  if (!_memo.__ss) {
    try {
      _memo.__ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (e) {
      console.error('No se pudo abrir la hoja de cálculo: ' + e.message);
      throw appError_('DB_NO_DISPONIBLE', 'No fue posible abrir la hoja de datos. Verifique la configuración y los permisos del proyecto.');
    }
  }
  return _memo.__ss;
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw appError_('DB_ESTRUCTURA', 'La hoja "' + name + '" no existe. Un administrador debe ejecutar setupDatabase().');
  return sh;
}

function headerInfo_(name) {
  const key = 'h_' + name;
  if (_memo[key]) return _memo[key];
  const sh = sheet_(name);
  const width = sh.getLastColumn();
  if (width < 1) throw appError_('DB_ESTRUCTURA', 'La hoja "' + name + '" no tiene encabezados. Ejecute setupDatabase().');
  const hdr = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  const map = {};
  hdr.forEach(function (h, i) { if (h && !(h in map)) map[h] = i; });
  const missing = SCHEMA[name].filter(function (h) { return !(h in map); });
  if (missing.length) {
    throw appError_('DB_ESTRUCTURA', 'La hoja "' + name + '" no tiene la estructura esperada (faltan: ' + missing.join(', ') + '). Ejecute setupDatabase().');
  }
  _memo[key] = { sh: sh, map: map, width: width };
  return _memo[key];
}

function cellToString_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const s = fmtDT_(v);
    return s.slice(11) === '00:00:00' ? s.slice(0, 10) : s;
  }
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  return String(v);
}

/** Lee una hoja completa como objetos (una sola llamada getValues). */
function readTable_(name) {
  const key = 't_' + name;
  if (_memo[key]) return _memo[key];
  const isRef = REF_TABLES.indexOf(name) >= 0;
  if (isRef && !_memo.__fresh) {
    const cached = refCacheGet_(name);
    if (cached) { _memo[key] = cached; return cached; }
  }
  const info = headerInfo_(name);
  const last = info.sh.getLastRow();
  const cols = SCHEMA[name];
  const idKey = cols[0];
  let rows = [];
  if (last >= 2) {
    const vals = info.sh.getRange(2, 1, last - 1, info.width).getValues();
    rows = vals.map(function (r, i) {
      const o = { _row: i + 2 };
      cols.forEach(function (h) { o[h] = cellToString_(r[info.map[h]]); });
      return o;
    }).filter(function (o) { return o[idKey] !== ''; });
  }
  _memo[key] = rows;
  if (isRef) refCachePut_(name, rows);
  return rows;
}

function rowFrom_(name, obj, base) {
  const info = headerInfo_(name);
  const row = base ? base.slice() : new Array(info.width).fill('');
  SCHEMA[name].forEach(function (h) {
    if (h in obj) row[info.map[h]] = safeCell_(obj[h]);
  });
  return row;
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  const info = headerInfo_(name);
  const rows = objs.map(function (o) { return rowFrom_(name, o); });
  const start = info.sh.getLastRow() + 1;
  // Sheets no permite escribir fuera de la cuadrícula: se agregan filas cuando se agota (por defecto hay 1 000).
  const faltan = start + rows.length - 1 - info.sh.getMaxRows();
  if (faltan > 0) info.sh.insertRowsAfter(info.sh.getMaxRows(), faltan + 500);
  info.sh.getRange(start, 1, rows.length, info.width).setNumberFormat('@').setValues(rows);
  invalidate_(name);
}

/** Actualiza una fila verificando que el identificador siga en la misma posición. */
function updateRow_(name, obj) {
  const info = headerInfo_(name);
  const idKey = SCHEMA[name][0];
  if (!obj._row) throw appError_('INTERNO', 'Registro sin posición.');
  const range = info.sh.getRange(obj._row, 1, 1, info.width);
  const current = range.getValues()[0];
  if (cellToString_(current[info.map[idKey]]) !== obj[idKey]) {
    throw appError_('CONFLICTO', 'El registro fue movido o modificado directamente en la hoja. Recargue e intente de nuevo.');
  }
  range.setNumberFormat('@').setValues([rowFrom_(name, obj, current)]);
  invalidate_(name);
}

function updateRows_(name, objs) { objs.forEach(function (o) { updateRow_(name, o); }); }

/** Elimina filas (de abajo hacia arriba) verificando su identificador. */
function deleteRows_(name, objs) {
  const info = headerInfo_(name);
  const idKey = SCHEMA[name][0];
  objs.slice().sort(function (a, b) { return b._row - a._row; }).forEach(function (o) {
    const v = cellToString_(info.sh.getRange(o._row, info.map[idKey] + 1).getValue());
    if (v !== o[idKey]) throw appError_('CONFLICTO', 'El registro cambió de posición. Recargue e intente de nuevo.');
    info.sh.deleteRow(o._row);
  });
  invalidate_(name);
}

/** Reescribe una hoja conservando solo las filas que cumplan keepFn (uso administrativo: purga de demo). */
function rewriteTable_(name, keepFn) {
  const info = headerInfo_(name);
  const last = info.sh.getLastRow();
  if (last < 2) return 0;
  const range = info.sh.getRange(2, 1, last - 1, info.width);
  const vals = range.getValues();
  const keep = vals.filter(function (r) {
    const o = {};
    SCHEMA[name].forEach(function (h) { o[h] = cellToString_(r[info.map[h]]); });
    return keepFn(o);
  });
  range.clearContent();
  if (keep.length) info.sh.getRange(2, 1, keep.length, info.width).setNumberFormat('@').setValues(keep);
  invalidate_(name);
  return vals.length - keep.length;
}

function invalidate_(name) {
  delete _memo['t_' + name];
  if (REF_TABLES.indexOf(name) >= 0) {
    try { CacheService.getScriptCache().remove('ref_v1_' + name); } catch (e) { /* caché opcional */ }
  }
}

function refCacheGet_(name) {
  try {
    const s = CacheService.getScriptCache().get('ref_v1_' + name);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

function refCachePut_(name, rows) {
  try {
    const s = JSON.stringify(rows);
    if (s.length < 95000) CacheService.getScriptCache().put('ref_v1_' + name, s, CONFIG.REF_CACHE_TTL_S);
  } catch (e) { /* si excede el límite de caché, se lee directamente */ }
}

/** Serializa operaciones de escritura y fuerza lecturas frescas dentro del bloqueo. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw appError_('OCUPADO', 'El sistema está procesando otra operación. Intente nuevamente en unos segundos.');
  }
  try {
    _memo.__fresh = true;
    Object.keys(_memo).forEach(function (k) { if (k.indexOf('t_') === 0 || k.indexOf('h_') === 0) delete _memo[k]; });
    return fn();
  } finally {
    SpreadsheetApp.flush();
    _memo.__fresh = false;
    lock.releaseLock();
  }
}

/** Evita ejecutar dos veces la misma solicitud (doble clic o reintento). Debe llamarse dentro del bloqueo. */
function withIdempotency_(requestId, userEmail, fn) {
  const rid = String(requestId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!rid) return fn();
  const cache = CacheService.getScriptCache();
  const key = 'req_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, userEmail + '|' + rid)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = fn();
  try { cache.put(key, JSON.stringify(res === undefined ? null : res), CONFIG.IDEMPOTENCY_TTL_S); } catch (e) { /* opcional */ }
  return res;
}

/* ===================== Configuración ===================== */

function getConfig_() {
  const m = {};
  readTable_('Configuracion').forEach(function (r) { m[r.clave] = r.valor; });
  DEFAULT_CONFIG.forEach(function (d) { if (!(d[0] in m)) m[d[0]] = d[1]; });
  return m;
}

function cfgNum_(cfg, key, def) {
  const n = Number(cfg[key]);
  return isFinite(n) && String(cfg[key]).trim() !== '' ? n : def;
}
