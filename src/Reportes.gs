/**
 * Reportes.gs — Dashboard (indicadores, gráficos, alertas) e informes con exportación CSV y PDF.
 * Todo se calcula en el servidor a partir de la hoja; el navegador solo envía filtros.
 * Los pedidos anulados nunca se cuentan; cada pedido se cuenta una sola vez por indicador.
 */

function pedidosVigentes_(cfg) {
  return readTable_('Pedidos').filter(function (p) {
    return p.anulado !== 'SI' && (cfg.incluir_demo_en_reportes !== 'NO' || p.es_demo !== 'SI');
  });
}

function periodRange_(p) {
  const today = today_();
  const tipo = vEnum_(p.tipo || '7d', ['hoy', '7d', '30d', 'rango'], 'Período');
  if (tipo === 'hoy') return { desde: today, hasta: today, label: 'Hoy' };
  if (tipo === '7d') return { desde: addDays_(today, -6), hasta: today, label: 'Últimos 7 días' };
  if (tipo === '30d') return { desde: addDays_(today, -29), hasta: today, label: 'Últimos 30 días' };
  const desde = vDate_(p.desde, 'Desde', true);
  const hasta = vDate_(p.hasta, 'Hasta', true);
  if (desde > hasta) throw appError_('VALIDACION', 'La fecha inicial no puede ser posterior a la final.');
  if ((parseDT_(hasta) - parseDT_(desde)) / 86400000 > 366) throw appError_('VALIDACION', 'El rango máximo es de 366 días.');
  return { desde: desde, hasta: hasta, label: dmy_(desde) + ' – ' + dmy_(hasta) };
}

function daysBetween_(desde, hasta) {
  const out = [];
  for (let d = desde; d <= hasta; d = addDays_(d, 1)) out.push(d);
  return out;
}

function getDashboard_(p) {
  const cfg = getConfig_();
  const today = today_();
  const range = periodRange_(p || {});
  const peds = pedidosVigentes_(cfg);
  const ctx = refCtx_();
  const inR = function (s) { const d = String(s || '').slice(0, 10); return !!d && d >= range.desde && d <= range.hasta; };

  const kpis = { total: peds.length, pendientes: 0, preparacion: 0, despachados: 0, entregados: 0, retrasados: 0, creadosHoy: 0, entregadosHoy: 0 };
  peds.forEach(function (x) {
    if (x.estado === 'Pendiente') kpis.pendientes++;
    else if (x.estado === 'En preparación') kpis.preparacion++;
    else if (x.estado === 'Despachado') kpis.despachados++;
    else if (x.estado === 'Entregado') kpis.entregados++;
    if (isRetrasado_(x, today)) kpis.retrasados++;
    if (x.fecha_creacion.slice(0, 10) === today) kpis.creadosHoy++;
    if (x.estado === 'Entregado' && x.fecha_entrega.slice(0, 10) === today) kpis.entregadosHoy++;
  });

  const periodo = peds.filter(function (x) { return inR(x.fecha_creacion); });
  const dias = daysBetween_(range.desde, range.hasta);
  const idx = {};
  dias.forEach(function (d, i) { idx[d] = i; });
  const creados = dias.map(function () { return 0; });
  const desp = dias.map(function () { return 0; });
  const ent = dias.map(function () { return 0; });
  periodo.forEach(function (x) { creados[idx[x.fecha_creacion.slice(0, 10)]]++; });
  peds.forEach(function (x) {
    if (x.fecha_despacho && inR(x.fecha_despacho)) desp[idx[x.fecha_despacho.slice(0, 10)]]++;
    if (x.estado === 'Entregado' && inR(x.fecha_entrega)) ent[idx[x.fecha_entrega.slice(0, 10)]]++;
  });

  const porRuta = {}, porResp = {};
  periodo.forEach(function (x) {
    if (x.ruta_id) {
      const r = porRuta[x.ruta_id] || (porRuta[x.ruta_id] = { nombre: rutaLabel_(ctx.rutas[x.ruta_id]) || 'Ruta eliminada', total: 0, entregados: 0, aTiempo: 0 });
      r.total++;
      if (x.estado === 'Entregado') { r.entregados++; if (x.fecha_entrega.slice(0, 10) <= x.fecha_estimada_entrega) r.aTiempo++; }
    }
    const key = x.responsable_id || '__none';
    const nombre = x.responsable_id ? (ctx.usuarios[x.responsable_id] ? ctx.usuarios[x.responsable_id].nombre : 'Usuario eliminado') : 'Sin responsable';
    porResp[key] = porResp[key] || { nombre: nombre, total: 0 };
    porResp[key].total++;
  });

  return {
    generado: now_(),
    periodo: range,
    kpis: kpis,
    porEstado: ESTADOS.map(function (e) { return { estado: e, total: periodo.filter(function (x) { return x.estado === e; }).length }; }),
    evolucion: { dias: dias, creados: creados, despachados: desp, entregados: ent },
    rutas: Object.keys(porRuta).map(function (k) { return porRuta[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 12),
    responsables: Object.keys(porResp).map(function (k) { return porResp[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 12),
    alertas: computeAlertas_(peds, cfg, ctx)
  };
}

/** Alertas informativas: nunca cambian el estado de los pedidos. */
function computeAlertas_(peds, cfg, ctx) {
  const ahora = new Date();
  const hPend = cfgNum_(cfg, 'alerta_pendiente_horas', 24);
  const hPrep = cfgNum_(cfg, 'alerta_preparacion_horas', 4);
  const hEnt = cfgNum_(cfg, 'alerta_entrega_horas', 0);
  const item = function (x, detalle) {
    return { pedido_id: x.pedido_id, numero_pedido: x.numero_pedido, cliente_nombre: x.cliente_nombre, prioridad: x.prioridad, detalle: detalle };
  };
  const pend = [], prep = [], venc = [], sinRuta = [], sinResp = [];
  peds.forEach(function (x) {
    if (x.estado === 'Pendiente') {
      const h = hoursSince_(x.fecha_creacion, ahora);
      if (h > hPend) pend.push(item(x, 'Pendiente hace ' + Math.floor(h) + ' h (límite ' + hPend + ' h)'));
    }
    if (x.estado === 'En preparación' && !x.fecha_fin_preparacion && x.fecha_inicio_preparacion) {
      const h = hoursSince_(x.fecha_inicio_preparacion, ahora);
      if (h > hPrep) prep.push(item(x, 'En preparación hace ' + Math.floor(h * 10) / 10 + ' h (límite ' + hPrep + ' h)'));
    }
    if (x.estado === 'Despachado' && x.fecha_estimada_entrega) {
      const limite = parseDT_(x.fecha_estimada_entrega + ' 23:59:59').getTime() + hEnt * 3600000;
      if (ahora.getTime() > limite) venc.push(item(x, 'Entrega estimada el ' + dmy_(x.fecha_estimada_entrega)));
    }
    if (ESTADOS_ASIGNABLES.indexOf(x.estado) >= 0 && !x.ruta_id) sinRuta.push(item(x, x.estado));
    if (x.estado !== 'Entregado' && !x.responsable_id) sinResp.push(item(x, x.estado));
  });
  const grupo = function (clave, titulo, nivel, items) {
    return { clave: clave, titulo: titulo, nivel: nivel, total: items.length, items: items.slice(0, 50) };
  };
  return [
    grupo('pendientes', 'Pendientes durante demasiado tiempo', 'warning', pend),
    grupo('preparacion', 'Preparación por encima del tiempo esperado', 'warning', prep),
    grupo('vencidos', 'Despachados con fecha estimada vencida', 'error', venc),
    grupo('sinRuta', 'Pedidos sin ruta asignada', 'info', sinRuta),
    grupo('sinResponsable', 'Pedidos sin responsable asignado', 'info', sinResp)
  ];
}

/* ===================== Informes ===================== */

const REPORT_TYPES = {
  registrados: 'Pedidos registrados por período',
  estado: 'Pedidos por estado',
  despachados: 'Pedidos despachados',
  entregados: 'Pedidos entregados',
  pendientes: 'Pedidos pendientes',
  retrasados: 'Pedidos retrasados',
  ruta: 'Pedidos por ruta',
  responsable: 'Pedidos por responsable',
  historial: 'Historial de operaciones',
  rendimiento: 'Rendimiento de entregas'
};

function reportFilters_(p) {
  const f = {
    tipo: vEnum_(p.tipo, Object.keys(REPORT_TYPES), 'Tipo de informe'),
    desde: vDate_(p.desde, 'Desde', false),
    hasta: vDate_(p.hasta, 'Hasta', false),
    estado: vEnum_(p.estado, ESTADOS, 'Estado', false),
    ruta_id: vId_(p.ruta_id, 'Ruta', false),
    responsable_id: vId_(p.responsable_id, 'Responsable', false),
    prioridad: vEnum_(p.prioridad, PRIORIDADES, 'Prioridad', false)
  };
  if (f.desde && f.hasta && f.desde > f.hasta) throw appError_('VALIDACION', 'La fecha inicial no puede ser posterior a la final.');
  return f;
}

const LIST_COLS = [
  ['numero_pedido', 'Número de pedido'], ['fecha_creacion', 'Fecha de creación', 'dt'], ['cliente_nombre', 'Cliente'],
  ['ciudad', 'Ciudad'], ['zona', 'Zona'], ['estado', 'Estado'], ['prioridad', 'Prioridad'], ['ruta_nombre', 'Ruta'],
  ['responsable_nombre', 'Responsable'], ['referencias', 'Referencias', 'n'], ['unidades', 'Unidades', 'n'],
  ['fecha_estimada_entrega', 'Fecha estimada de entrega', 'd'], ['fecha_despacho', 'Fecha de despacho', 'dt'],
  ['fecha_entrega', 'Fecha de entrega', 'dt'], ['retrasado', 'Retrasado', 'b']
];

function fmtVal_(v, t) {
  if (t === 'd' || t === 'dt') return dmy_(v);
  if (t === 'b') return v ? 'Sí' : 'No';
  if (t === 'n') return v === null || v === undefined || v === '' ? '' : String(v).replace('.', ',');
  return v === null || v === undefined ? '' : String(v);
}

function listReport_(rows, ctx, today) {
  const sums = rows.map(function (x) { return summarizePedido_(x, ctx, today); });
  return {
    columnas: LIST_COLS.map(function (c) { return c[1]; }),
    filas: sums.sort(function (a, b) { return a.fecha_creacion < b.fecha_creacion ? -1 : 1; })
      .map(function (s) { return LIST_COLS.map(function (c) { return fmtVal_(s[c[0]], c[2]); }); }),
    totales: [
      { label: 'Total de pedidos', valor: String(sums.length) },
      { label: 'Total de unidades', valor: fmtVal_(Math.round(sums.reduce(function (a, s) { return a + s.unidades; }, 0) * 100) / 100, 'n') }
    ]
  };
}

function groupReport_(rows, keyFn, header, today) {
  const g = {};
  rows.forEach(function (x) {
    const k = keyFn(x);
    const o = g[k] || (g[k] = { nombre: k, total: 0, 'Pendiente': 0, 'En preparación': 0, 'Despachado': 0, 'Entregado': 0, retrasados: 0 });
    o.total++;
    o[x.estado]++;
    if (isRetrasado_(x, today)) o.retrasados++;
  });
  const lista = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.total - a.total; });
  const tot = { total: 0, 'Pendiente': 0, 'En preparación': 0, 'Despachado': 0, 'Entregado': 0, retrasados: 0 };
  lista.forEach(function (o) { Object.keys(tot).forEach(function (k) { tot[k] += o[k]; }); });
  const fila = function (o, nombre) { return [nombre, o.total, o['Pendiente'], o['En preparación'], o['Despachado'], o['Entregado'], o.retrasados].map(String); };
  return {
    columnas: [header, 'Total', 'Pendiente', 'En preparación', 'Despachado', 'Entregado', 'Retrasados'],
    filas: lista.map(function (o) { return fila(o, o.nombre); }).concat([fila(tot, 'TOTAL')]),
    totales: [{ label: 'Total de pedidos', valor: String(tot.total) }]
  };
}

function rendimientoReport_(rows, ctx) {
  const g = {};
  const add = function (k, x) {
    const o = g[k] || (g[k] = { nombre: k, n: 0, aTiempo: 0, hCE: 0, hDE: 0, nDE: 0 });
    o.n++;
    if (x.fecha_entrega.slice(0, 10) <= x.fecha_estimada_entrega) o.aTiempo++;
    o.hCE += Math.max(0, (parseDT_(x.fecha_entrega) - parseDT_(x.fecha_creacion)) / 3600000);
    if (x.fecha_despacho) { o.hDE += Math.max(0, (parseDT_(x.fecha_entrega) - parseDT_(x.fecha_despacho)) / 3600000); o.nDE++; }
  };
  rows.forEach(function (x) {
    add(x.ruta_id ? (rutaLabel_(ctx.rutas[x.ruta_id]) || 'Ruta eliminada') : 'Sin ruta', x);
    add('TOTAL', x);
  });
  const r1 = function (n) { return String(Math.round(n * 10) / 10).replace('.', ','); };
  const keys = Object.keys(g).filter(function (k) { return k !== 'TOTAL'; }).sort();
  if (g.TOTAL) keys.push('TOTAL');
  const filas = keys.map(function (k) {
    const o = g[k];
    return [o.nombre, String(o.n), String(o.aTiempo), String(o.n - o.aTiempo), r1(o.aTiempo * 100 / o.n) + ' %',
      r1(o.hCE / o.n), o.nDE ? r1(o.hDE / o.nDE) : ''];
  });
  const t = g.TOTAL || { n: 0, aTiempo: 0 };
  return {
    columnas: ['Ruta', 'Entregados', 'A tiempo', 'Con retraso', '% a tiempo', 'Horas promedio creación→entrega', 'Horas promedio despacho→entrega'],
    filas: filas,
    totales: [{ label: 'Pedidos entregados', valor: String(t.n) }, { label: 'Cumplimiento', valor: t.n ? r1(t.aTiempo * 100 / t.n) + ' %' : '—' }]
  };
}

function historialReport_(f) {
  const pedidos = indexBy_(readTable_('Pedidos'), 'pedido_id');
  const rows = readTable_('Historial').filter(function (h) {
    const d = h.fecha_evento.slice(0, 10);
    return (!f.desde || d >= f.desde) && (!f.hasta || d <= f.hasta);
  }).sort(function (a, b) { return a.fecha_evento < b.fecha_evento ? -1 : 1; });
  return {
    columnas: ['Fecha', 'Entidad', 'Referencia', 'Acción', 'Valor anterior', 'Valor nuevo', 'Usuario', 'Observación'],
    filas: rows.map(function (h) {
      const ref = h.entidad === 'Pedido' && pedidos[h.entidad_id] ? pedidos[h.entidad_id].numero_pedido : h.entidad_id;
      return [dmy_(h.fecha_evento), h.entidad, ref, h.accion, h.valor_anterior, h.valor_nuevo, h.usuario, h.observacion];
    }),
    totales: [{ label: 'Eventos', valor: String(rows.length) }]
  };
}

function generateReport_(p, u) {
  const f = reportFilters_(p);
  if (f.tipo === 'historial') requirePerm_(u, 'historial.ver');
  const cfg = getConfig_();
  const today = today_();
  const ctx = refCtx_();
  const inR = function (s) {
    const d = String(s || '').slice(0, 10);
    return !!d && (!f.desde || d >= f.desde) && (!f.hasta || d <= f.hasta);
  };
  const base = pedidosVigentes_(cfg).filter(function (x) {
    if (f.estado && x.estado !== f.estado) return false;
    if (f.ruta_id && (f.ruta_id === '__none' ? x.ruta_id !== '' : x.ruta_id !== f.ruta_id)) return false;
    if (f.responsable_id && (f.responsable_id === '__none' ? x.responsable_id !== '' : x.responsable_id !== f.responsable_id)) return false;
    if (f.prioridad && x.prioridad !== f.prioridad) return false;
    return true;
  });
  let rep;
  switch (f.tipo) {
    case 'registrados': rep = listReport_(base.filter(function (x) { return inR(x.fecha_creacion); }), ctx, today); break;
    case 'despachados': rep = listReport_(base.filter(function (x) { return x.fecha_despacho && inR(x.fecha_despacho); }), ctx, today); break;
    case 'entregados': rep = listReport_(base.filter(function (x) { return x.estado === 'Entregado' && inR(x.fecha_entrega); }), ctx, today); break;
    case 'pendientes': rep = listReport_(base.filter(function (x) { return x.estado === 'Pendiente' && inR(x.fecha_creacion); }), ctx, today); break;
    case 'retrasados': rep = listReport_(base.filter(function (x) { return isRetrasado_(x, today) && inR(x.fecha_creacion); }), ctx, today); break;
    case 'estado': {
      const rows = base.filter(function (x) { return inR(x.fecha_creacion); });
      rep = {
        columnas: ['Estado', 'Pedidos', 'Porcentaje'],
        filas: ESTADOS.map(function (e) {
          const n = rows.filter(function (x) { return x.estado === e; }).length;
          return [e, String(n), rows.length ? String(Math.round(n * 1000 / rows.length) / 10).replace('.', ',') + ' %' : '0 %'];
        }),
        totales: [{ label: 'Total de pedidos', valor: String(rows.length) }]
      };
      break;
    }
    case 'ruta':
      rep = groupReport_(base.filter(function (x) { return inR(x.fecha_creacion); }), function (x) {
        return x.ruta_id ? (rutaLabel_(ctx.rutas[x.ruta_id]) || 'Ruta eliminada') : 'Sin ruta';
      }, 'Ruta', today);
      break;
    case 'responsable':
      rep = groupReport_(base.filter(function (x) { return inR(x.fecha_creacion); }), function (x) {
        return x.responsable_id ? (ctx.usuarios[x.responsable_id] ? ctx.usuarios[x.responsable_id].nombre : 'Usuario eliminado') : 'Sin responsable';
      }, 'Responsable', today);
      break;
    case 'rendimiento': rep = rendimientoReport_(base.filter(function (x) { return x.estado === 'Entregado' && inR(x.fecha_entrega); }), ctx); break;
    case 'historial': rep = historialReport_(f); break;
  }
  const truncado = rep.filas.length > CONFIG.MAX_REPORT_ROWS;
  if (truncado) rep.filas = rep.filas.slice(0, CONFIG.MAX_REPORT_ROWS);

  const filtros = [];
  if (f.tipo !== 'historial') {
    if (f.estado) filtros.push('Estado: ' + f.estado);
    if (f.ruta_id) filtros.push('Ruta: ' + (f.ruta_id === '__none' ? 'Sin ruta' : rutaLabel_(ctx.rutas[f.ruta_id]) || f.ruta_id));
    if (f.responsable_id) filtros.push('Responsable: ' + (f.responsable_id === '__none' ? 'Sin responsable' : (ctx.usuarios[f.responsable_id] || {}).nombre || f.responsable_id));
    if (f.prioridad) filtros.push('Prioridad: ' + f.prioridad);
    if (cfg.incluir_demo_en_reportes === 'NO') filtros.push('Excluye datos de demostración');
  }
  return Object.assign(rep, {
    titulo: REPORT_TYPES[f.tipo],
    tipo: f.tipo,
    empresa: cfg.nombre_empresa,
    generado: dmy_(now_()),
    generadoPor: u.nombre,
    periodo: (f.desde ? dmy_(f.desde) : 'Inicio') + ' – ' + (f.hasta ? dmy_(f.hasta) : 'Hoy'),
    filtros: filtros.length ? filtros.join(' · ') : 'Sin filtros adicionales',
    truncado: truncado
  });
}

function reportFileName_(rep, ext) {
  const base = rep.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').toLowerCase();
  return base + '_' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyyMMdd_HHmm') + '.' + ext;
}

/** CSV UTF-8 con BOM y separador ";" (compatible con Excel en configuración regional es-CO). */
function exportCsv_(p, u) {
  const rep = generateReport_(p, u);
  const lines = [rep.columnas.map(csvCell_).join(';')].concat(rep.filas.map(function (r) { return r.map(csvCell_).join(';'); }));
  return { filename: reportFileName_(rep, 'csv'), content: '﻿' + lines.join('\r\n') + '\r\n', filas: rep.filas.length };
}

function escHtml_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/**
 * PDF tabular generado en el servidor (HTML → PDF de Apps Script).
 * Limitación: esta conversión no admite contadores CSS de página, por lo que no se numeran las páginas.
 */
function exportPdf_(p, u) {
  const rep = generateReport_(p, u);
  const filas = rep.filas.slice(0, CONFIG.MAX_PDF_ROWS);
  const aviso = rep.filas.length > CONFIG.MAX_PDF_ROWS || rep.truncado
    ? '<p class="warn">El informe se limitó a ' + filas.length + ' filas. Use la exportación CSV o filtros más específicos para ver todos los registros.</p>' : '';
  const html = '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#111827;margin:0}' +
    'h1{font-size:15pt;color:#4F46E5;margin:0 0 4px}h2{font-size:10pt;color:#475569;margin:0 0 10px;font-weight:normal}' +
    '.meta{margin-bottom:10px}.meta td{padding:1px 10px 1px 0;border:none;font-size:8.5pt}.meta td.k{color:#475569}' +
    'table.d{width:100%;border-collapse:collapse}table.d th{background:#F1F5F9;text-align:left;padding:4px;border-bottom:1px solid #CBD5E1;font-size:8pt}' +
    'table.d td{padding:3px 4px;border-bottom:1px solid #E2E8F0;font-size:8pt}thead{display:table-header-group}tr{page-break-inside:avoid}' +
    '.tot{margin-top:10px}.tot td{padding:2px 12px 2px 0;font-weight:bold}.warn{color:#D97706}.foot{margin-top:14px;color:#475569;font-size:7.5pt}' +
    '</style></head><body>' +
    '<h1>' + escHtml_(rep.titulo) + '</h1><h2>' + escHtml_(rep.empresa) + '</h2>' +
    '<table class="meta"><tr><td class="k">Fecha de generación:</td><td>' + escHtml_(rep.generado) + '</td></tr>' +
    '<tr><td class="k">Período consultado:</td><td>' + escHtml_(rep.periodo) + '</td></tr>' +
    '<tr><td class="k">Filtros aplicados:</td><td>' + escHtml_(rep.filtros) + '</td></tr>' +
    '<tr><td class="k">Generado por:</td><td>' + escHtml_(rep.generadoPor) + '</td></tr></table>' + aviso +
    '<table class="d"><thead><tr>' + rep.columnas.map(function (c) { return '<th>' + escHtml_(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (filas.length ? filas.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + escHtml_(c) + '</td>'; }).join('') + '</tr>'; }).join('')
      : '<tr><td colspan="' + rep.columnas.length + '">No hay registros para los filtros seleccionados.</td></tr>') +
    '</tbody></table>' +
    '<table class="tot">' + rep.totales.map(function (t) { return '<tr><td>' + escHtml_(t.label) + ':</td><td>' + escHtml_(t.valor) + '</td></tr>'; }).join('') + '</table>' +
    '<p class="foot">Documento generado automáticamente por ' + escHtml_(CONFIG.APP_TITLE) + '.</p></body></html>';
  let pdf;
  try {
    pdf = Utilities.newBlob(html, 'text/html', 'informe.html').getAs('application/pdf');
  } catch (e) {
    console.error('Error al generar PDF: ' + e.message);
    throw appError_('REPORTE', 'Se produjo un error al generar el informe PDF. Intente con un rango menor.');
  }
  return { filename: reportFileName_(rep, 'pdf'), base64: Utilities.base64Encode(pdf.getBytes()), filas: filas.length };
}
