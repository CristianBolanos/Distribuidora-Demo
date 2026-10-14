/* =====================================================================
 * shim.js — Simulación en el navegador de los servicios de Google
 * (SpreadsheetApp, Utilities, Session, CacheService, LockService,
 * PropertiesService y google.script.run) para ejecutar el backend REAL
 * de src/*.gs sin cuenta de Google. Los datos viven en localStorage.
 * ===================================================================== */
(function () {
  const STORE_KEY = 'pedidos_demo_v1';
  const USER_KEY = 'pedidos_demo_usuario';
  const OWNER = 'admin.demo@ejemplo.com';

  /* ---------- Hoja de cálculo en memoria ---------- */
  const blank = (v) => v === '' || v === null || v === undefined;

  class FakeRange {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { s: sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.s.data[this.r - 1 + i] || [];
        out.push(Array.from({ length: this.nc }, (_, j) => (blank(row[this.c - 1 + j]) ? '' : row[this.c - 1 + j])));
      }
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(values) {
      values.forEach((row, i) => {
        const ri = this.r - 1 + i;
        while (this.s.data.length <= ri) this.s.data.push([]);
        const R = this.s.data[ri];
        row.forEach((x, j) => {
          let v = blank(x) ? '' : x;
          if (typeof v === 'string' && v[0] === "'") v = v.slice(1); // igual que Sheets
          R[this.c - 1 + j] = v;
        });
      });
      return this;
    }
    clearContent() {
      for (let i = 0; i < this.nr; i++) {
        const R = this.s.data[this.r - 1 + i];
        if (R) for (let j = 0; j < this.nc; j++) R[this.c - 1 + j] = '';
      }
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
  }

  class FakeSheet {
    constructor(name, data) { this.name = name; this.data = data || []; }
    getName() { return this.name; }
    getLastRow() {
      for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some((v) => !blank(v))) return i + 1;
      return 0;
    }
    getLastColumn() {
      let m = 0;
      this.data.forEach((r) => { for (let j = (r || []).length - 1; j >= 0; j--) if (!blank(r[j])) { m = Math.max(m, j + 1); break; } });
      return m;
    }
    getMaxRows() { return Math.max(1000, this.data.length); }
    getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr, nc); }
    setFrozenRows() { return this; }
    deleteRow(r) { this.data.splice(r - 1, 1); }
  }

  let sheets = [];
  const book = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet: (s) => { sheets = sheets.filter((x) => x !== s); }
  };
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      sheets = JSON.parse(raw).map((s) => new FakeSheet(s.name, s.data));
      return true;
    } catch (e) { return false; }
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(sheets.map((s) => ({ name: s.name, data: s.data })))); } catch (e) { /* sin almacenamiento: la demo funciona en memoria */ }
  }

  /* ---------- Servicios de Apps Script ---------- */
  window.SpreadsheetApp = { openById: () => book, flush: () => {} };

  const pad = (n) => String(n).padStart(2, '0');
  const enc = new TextEncoder();
  const toBin = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return s; };
  window.Utilities = {
    formatDate(d, tz, f) {
      const b = new Date(d.getTime() - 5 * 3600000); // America/Bogota: UTC-5 sin horario de verano
      return f.replace('yyyy', b.getUTCFullYear()).replace('MM', pad(b.getUTCMonth() + 1)).replace('dd', pad(b.getUTCDate()))
        .replace('HH', pad(b.getUTCHours())).replace('mm', pad(b.getUTCMinutes())).replace('ss', pad(b.getUTCSeconds()));
    },
    getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest(alg, s) { // hash FNV-1a (suficiente para claves de idempotencia de la demo)
      let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return Array.from(enc.encode(h.toString(16) + s.length + s.slice(-24)));
    },
    base64EncodeWebSafe: (bytes) => btoa(toBin(bytes)).replace(/\+/g, '-').replace(/\//g, '_'),
    base64Encode: (bytes) => btoa(toBin(bytes)),
    // El "PDF" de la demo es el mismo HTML del informe; el navegador lo imprime o guarda como PDF.
    newBlob: (html) => ({ getAs: () => ({ getBytes: () => enc.encode(html) }) })
  };

  const cache = new Map();
  window.CacheService = { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) };
  window.LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) };
  const props = new Map();
  window.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) };

  let activeEmail = OWNER;
  window.Session = {
    getActiveUser: () => ({ getEmail: () => activeEmail }),
    getEffectiveUser: () => ({ getEmail: () => OWNER })
  };

  /* ---------- google.script.run ---------- */
  function resetMemo() { if (typeof _memo === 'object') Object.keys(_memo).forEach((k) => delete _memo[k]); }
  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return (h) => runner(h, fail);
        if (prop === 'withFailureHandler') return (h) => runner(ok, h);
        return (...args) => {
          setTimeout(() => {
            try {
              resetMemo(); // cada llamada de Apps Script es una ejecución nueva
              // El frontend también define una función global "api": se usan las funciones del backend capturadas al arrancar.
              const fn = backend[prop] || window[prop];
              if (typeof fn !== 'function') throw new Error('Función no disponible: ' + String(prop));
              const res = fn(...JSON.parse(JSON.stringify(args)));
              persist();
              if (ok) ok(res === undefined ? undefined : JSON.parse(JSON.stringify(res)));
            } catch (e) {
              console.error(e);
              if (fail) fail(e);
            }
          }, 120 + Math.random() * 200); // latencia simulada
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null) } };
  const backend = {};

  /* ---------- Arranque de la demo ---------- */
  window.__demo = {
    OWNER,
    boot() {
      backend.api = window.api; // capturado antes de que cargue el frontend
      if (!load() || !book.getSheetByName('Pedidos')) {
        sheets = [];
        activeEmail = OWNER;
        resetMemo(); setupDatabase();
        resetMemo(); seedDemoData();
        resetMemo();
        // Usuario adicional con rol Consulta para probar el acceso de solo lectura.
        appendRows_('Usuarios', [{ usuario_id: Utilities.getUuid(), correo: 'consulta.demo@ejemplo.invalid', nombre: '[DEMO] Sofía Castro',
          rol: 'Consulta', activo: 'SI', fecha_creacion: now_(), es_demo: 'SI' }]);
        const cfg = readTable_('Configuracion').find((r) => r.clave === 'nombre_empresa');
        if (cfg) { cfg.valor = 'Distribuidora Demo S.A.S.'; updateRow_('Configuracion', cfg); }
        persist();
      }
      resetMemo();
      let chosen = OWNER;
      try { chosen = localStorage.getItem(USER_KEY) || OWNER; } catch (e) { /* sin almacenamiento */ }
      const existe = readTable_('Usuarios').some((u) => u.correo === chosen && u.activo === 'SI');
      activeEmail = existe ? chosen : OWNER;
      resetMemo();
    },
    usuarios() { resetMemo(); const u = readTable_('Usuarios').filter((x) => x.activo === 'SI'); resetMemo(); return u; },
    activo: () => activeEmail,
    cambiarUsuario(email) { try { localStorage.setItem(USER_KEY, email); } catch (e) { /* ignorado */ } location.reload(); },
    reiniciar() { try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(USER_KEY); } catch (e) { /* ignorado */ } location.reload(); }
  };
})();
