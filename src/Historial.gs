/**
 * Historial.gs — Auditoría de operaciones (pedidos, rutas, usuarios, productos y configuración).
 * Las entradas se escriben por lotes y nunca se modifican desde la aplicación.
 */

function auditValue_(v, max) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > (max || 2000) ? s.slice(0, (max || 2000) - 1) + '…' : s;
}

/** entries: [{entidad, entidad_id, accion, anterior, nuevo, observacion, fecha?}] */
function logHistory_(entries, user) {
  if (!entries || !entries.length) return;
  const now = now_();
  appendRows_('Historial', entries.map(function (e) {
    return {
      historial_id: uuid_(),
      entidad: e.entidad,
      entidad_id: e.entidad_id,
      accion: e.accion,
      valor_anterior: auditValue_(e.anterior),
      valor_nuevo: auditValue_(e.nuevo),
      fecha_evento: e.fecha || now,
      usuario: e.usuario || (user && user.correo) || 'sistema',
      observacion: auditValue_(e.observacion, 1000)
    };
  }));
}

function historyFor_(entidad, id) {
  return readTable_('Historial')
    .filter(function (h) { return h.entidad === entidad && h.entidad_id === id; })
    .map(clean_)
    .sort(function (a, b) { return a.fecha_evento < b.fecha_evento ? -1 : a.fecha_evento > b.fecha_evento ? 1 : 0; });
}

function listHistorial_(p) {
  const desde = vDate_(p.desde, 'Desde', false);
  const hasta = vDate_(p.hasta, 'Hasta', false);
  const entidad = vStr_(p.entidad, 'Entidad', { max: 40 });
  const q = vStr_(p.q, 'Búsqueda', { max: 100 }).toLowerCase();
  const pageSize = Math.min(CONFIG.MAX_PAGE_SIZE, Math.max(5, Number(p.pageSize) || 25));
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const pedidos = indexBy_(readTable_('Pedidos'), 'pedido_id');

  let rows = readTable_('Historial').filter(function (h) {
    const d = h.fecha_evento.slice(0, 10);
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    if (entidad && h.entidad !== entidad) return false;
    if (q) {
      const ref = h.entidad === 'Pedido' && pedidos[h.entidad_id] ? pedidos[h.entidad_id].numero_pedido : h.entidad_id;
      const hay = [ref, h.accion, h.usuario, h.observacion].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  rows.sort(function (a, b) { return a.fecha_evento > b.fecha_evento ? -1 : a.fecha_evento < b.fecha_evento ? 1 : 0; });
  const total = rows.length;
  rows = rows.slice((page - 1) * pageSize, page * pageSize).map(function (h) {
    const o = clean_(h);
    o.referencia = h.entidad === 'Pedido' && pedidos[h.entidad_id] ? pedidos[h.entidad_id].numero_pedido : h.entidad_id;
    return o;
  });
  return { items: rows, total: total, page: page, pageSize: pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
