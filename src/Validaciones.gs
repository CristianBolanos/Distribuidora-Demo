/**
 * Validaciones.gs — Utilidades de fecha/ID, validación y normalización de entradas,
 * y reglas de negocio puras (sin acceso a la hoja, por lo que se pueden probar en Tests.gs).
 */

function appError_(code, message) {
  const e = new Error(message);
  e.appCode = code;
  return e;
}

/* ===================== Fechas (America/Bogota, UTC-5 sin horario de verano) ===================== */

function now_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd'); }
function uuid_() { return Utilities.getUuid(); }
function fmtDT_(d) { return Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'); }

/** Convierte 'yyyy-MM-dd[ HH:mm[:ss]]' en hora de Bogotá a Date. Devuelve null si no es válido. */
function parseDT_(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (+m[4] || 0) + 5, +m[5] || 0, +m[6] || 0));
}

function addDays_(ymd, n) {
  const d = parseDT_(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
}

function addHours_(dt, h) { return fmtDT_(new Date(parseDT_(dt).getTime() + h * 3600000)); }

function hoursSince_(dt, ref) {
  const d = parseDT_(dt);
  return d ? ((ref || new Date()).getTime() - d.getTime()) / 3600000 : 0;
}

/** Fecha para mostrar en informes: DD/MM/AAAA [HH:mm]. */
function dmy_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(s || '');
  return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] + ':' + m[5] : '');
}

/* ===================== Validadores ===================== */

function vStr_(v, label, opt) {
  opt = opt || {};
  const s = (v === null || v === undefined) ? ''
    : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (opt.required && !s) throw appError_('VALIDACION', 'El campo "' + label + '" es obligatorio.');
  const max = opt.max || 255;
  if (s.length > max) throw appError_('VALIDACION', 'El campo "' + label + '" supera ' + max + ' caracteres.');
  return s;
}

function vEmail_(v, label, required) {
  const s = vStr_(v, label, { required: required, max: 120 }).toLowerCase();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw appError_('VALIDACION', 'El campo "' + label + '" no es un correo válido.');
  return s;
}

function vPhone_(v, label, required) {
  const s = vStr_(v, label, { required: required, max: 30 });
  if (s && !/^[+\d][\d\s\-()]{5,29}$/.test(s)) throw appError_('VALIDACION', 'El campo "' + label + '" no es un teléfono válido.');
  return s;
}

function vDate_(v, label, required) {
  const s = vStr_(v, label, { required: required, max: 10 });
  if (!s) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? parseDT_(s) : null;
  if (!d || Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd') !== s) {
    throw appError_('VALIDACION', 'El campo "' + label + '" no contiene una fecha válida.');
  }
  return s;
}

/** Acepta 'yyyy-MM-ddTHH:mm' (input datetime-local) y devuelve 'yyyy-MM-dd HH:mm:ss'. */
function vDateTime_(v, label, required) {
  const s = vStr_(v, label, { required: required, max: 19 }).replace('T', ' ');
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || +m[2] > 23 || +m[3] > 59) throw appError_('VALIDACION', 'El campo "' + label + '" no contiene una fecha y hora válidas.');
  vDate_(m[1], label, true);
  return m[1] + ' ' + m[2] + ':' + m[3] + ':' + (m[4] || '00');
}

function vEnum_(v, list, label, required) {
  const s = vStr_(v, label, { required: required !== false, max: 60 });
  if (s && list.indexOf(s) < 0) throw appError_('VALIDACION', 'El valor de "' + label + '" no es válido.');
  return s;
}

function vNumber_(v, label, opt) {
  opt = opt || {};
  if (v === null || v === undefined || String(v).trim() === '') {
    if (opt.required) throw appError_('VALIDACION', 'El campo "' + label + '" es obligatorio.');
    return '';
  }
  const n = Number(String(v).replace(',', '.'));
  if (!isFinite(n)) throw appError_('VALIDACION', 'El campo "' + label + '" debe ser numérico.');
  if (opt.integer && Math.floor(n) !== n) throw appError_('VALIDACION', 'El campo "' + label + '" debe ser un número entero.');
  if (opt.gt0 && !(n > 0)) throw appError_('VALIDACION', 'El campo "' + label + '" debe ser mayor que cero.');
  if (opt.min !== undefined && n < opt.min) throw appError_('VALIDACION', 'El campo "' + label + '" debe ser mayor o igual a ' + opt.min + '.');
  if (opt.max !== undefined && n > opt.max) throw appError_('VALIDACION', 'El campo "' + label + '" debe ser menor o igual a ' + opt.max + '.');
  return Math.round(n * 100) / 100;
}

function vBool_(v) { return v === true || v === 'true' || v === 'SI'; }

function vId_(v, label, required) {
  const s = vStr_(v, label, { required: required, max: 64 });
  if (s && !/^[A-Za-z0-9_-]+$/.test(s)) throw appError_('VALIDACION', 'Identificador de "' + label + '" no válido.');
  return s;
}

function vJustificacion_(v) {
  const s = vStr_(v, 'Justificación', { required: true, max: 500 });
  if (s.length < 10) throw appError_('VALIDACION', 'La justificación debe tener al menos 10 caracteres.');
  return s;
}

/* ===================== Reglas de negocio puras ===================== */

function canTransition_(from, to) { return (TRANSICIONES[from] || []).indexOf(to) >= 0; }

function assertTransition_(ped, to) {
  if (ped.anulado === 'SI') throw appError_('ESTADO_INVALIDO', 'El pedido está anulado y no admite cambios de estado.');
  if (!canTransition_(ped.estado, to)) {
    throw appError_('ESTADO_INVALIDO', 'El estado actual (' + ped.estado + ') no permite pasar a "' + to + '".');
  }
}

/** Retrasado: no anulado, no entregado y con fecha estimada anterior a hoy. */
function isRetrasado_(p, today) {
  return p.anulado !== 'SI' && p.estado !== 'Entregado' && !!p.fecha_estimada_entrega && p.fecha_estimada_entrega < today;
}

/** Evita que Sheets interprete textos como fórmulas al guardarlos. */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** Celda CSV (separador ;) con protección contra inyección de fórmulas. */
function csvCell_(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Valida las líneas de un pedido contra el catálogo (prodMap: producto_id → producto).
 * Conserva una copia del nombre y SKU vigentes al momento del registro.
 */
function validateLineas_(lineas, prodMap) {
  if (!Array.isArray(lineas) || !lineas.length) throw appError_('VALIDACION', 'El pedido debe contener al menos un producto.');
  if (lineas.length > 200) throw appError_('VALIDACION', 'Un pedido no puede superar 200 líneas.');
  return lineas.map(function (l, i) {
    const n = i + 1;
    const pid = vId_(l && l.producto_id, 'Producto (línea ' + n + ')', true);
    const prod = prodMap[pid];
    if (!prod) throw appError_('VALIDACION', 'El producto de la línea ' + n + ' no existe.');
    if (prod.activo !== 'SI') throw appError_('VALIDACION', 'El producto "' + prod.nombre + '" está inactivo.');
    const cantidad = vNumber_(l.cantidad, 'Cantidad (línea ' + n + ')', { required: true, gt0: true, max: 1000000 });
    const precio = vNumber_(l.precio_unitario, 'Precio unitario (línea ' + n + ')', { min: 0, max: 1e10 });
    return {
      producto_id: pid,
      nombre_producto: prod.nombre,
      sku: prod.sku,
      cantidad: cantidad,
      precio_unitario: precio,
      subtotal: precio === '' ? '' : Math.round(precio * cantidad * 100) / 100,
      observaciones: vStr_(l.observaciones, 'Observaciones (línea ' + n + ')', { max: 300 })
    };
  });
}

function indexBy_(arr, key) {
  const m = {};
  arr.forEach(function (x) { m[x[key]] = x; });
  return m;
}

function clean_(o) {
  if (!o) return o;
  const c = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
  return c;
}
