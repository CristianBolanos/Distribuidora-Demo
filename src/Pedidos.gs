/**
 * Pedidos.gs — Registro, consulta, edición, duplicación, anulación y eliminación de pedidos.
 */

const PEDIDO_CAMPOS_BASE = ['cliente_nombre', 'cliente_documento', 'cliente_telefono', 'cliente_correo',
  'direccion_entrega', 'ciudad', 'zona', 'fecha_estimada_entrega', 'prioridad', 'observaciones',
  'observaciones_internas', 'responsable_id'];

/* ===================== Contexto y resumen ===================== */

function refCtx_() {
  const agg = {};
  readTable_('DetallePedidos').forEach(function (d) {
    const a = agg[d.pedido_id] || (agg[d.pedido_id] = { referencias: 0, unidades: 0, total: 0, hayPrecio: false });
    a.referencias++;
    a.unidades += Number(d.cantidad) || 0;
    if (d.subtotal !== '') { a.total += Number(d.subtotal) || 0; a.hayPrecio = true; }
  });
  return {
    agg: agg,
    rutas: indexBy_(readTable_('Rutas'), 'ruta_id'),
    usuarios: indexBy_(readTable_('Usuarios'), 'usuario_id')
  };
}

function rutaLabel_(r) { return r ? r.codigo_ruta + ' · ' + r.nombre_ruta : ''; }

function summarizePedido_(p, ctx, today) {
  const a = ctx.agg[p.pedido_id] || { referencias: 0, unidades: 0, total: 0, hayPrecio: false };
  const r = ctx.rutas[p.ruta_id];
  const resp = ctx.usuarios[p.responsable_id];
  return {
    pedido_id: p.pedido_id,
    numero_pedido: p.numero_pedido,
    fecha_creacion: p.fecha_creacion,
    cliente_nombre: p.cliente_nombre,
    direccion_entrega: p.direccion_entrega,
    ciudad: p.ciudad,
    zona: p.zona,
    referencias: a.referencias,
    unidades: Math.round(a.unidades * 100) / 100,
    total: a.hayPrecio ? Math.round(a.total * 100) / 100 : null,
    estado: p.estado,
    prioridad: p.prioridad,
    ruta_id: p.ruta_id,
    ruta_nombre: rutaLabel_(r),
    ruta_estado: r ? r.estado : '',
    responsable_id: p.responsable_id,
    responsable_nombre: resp ? resp.nombre : '',
    fecha_estimada_entrega: p.fecha_estimada_entrega,
    fecha_despacho: p.fecha_despacho,
    fecha_entrega: p.fecha_entrega,
    fecha_actualizacion: p.fecha_actualizacion,
    fecha_inicio_preparacion: p.fecha_inicio_preparacion,
    observaciones: p.observaciones,
    anulado: p.anulado === 'SI',
    retrasado: isRetrasado_(p, today),
    preparado: !!p.fecha_fin_preparacion,
    version: p.version,
    es_demo: p.es_demo === 'SI'
  };
}

/* ===================== Listado ===================== */

const PEDIDO_SORT = ['numero_pedido', 'fecha_creacion', 'cliente_nombre', 'zona', 'unidades', 'estado', 'prioridad',
  'ruta_nombre', 'responsable_nombre', 'fecha_estimada_entrega', 'fecha_actualizacion'];

function listPedidos_(f) {
  const q = vStr_(f.q, 'Búsqueda', { max: 100 }).toLowerCase();
  const estado = vEnum_(f.estado, ESTADOS, 'Estado', false);
  const desde = vDate_(f.desde, 'Desde', false);
  const hasta = vDate_(f.hasta, 'Hasta', false);
  const rutaId = vId_(f.ruta_id, 'Ruta', false);
  const respId = vId_(f.responsable_id, 'Responsable', false);
  const prioridad = vEnum_(f.prioridad, PRIORIDADES, 'Prioridad', false);
  const retrasados = vBool_(f.retrasados);
  const incluirAnulados = vBool_(f.incluirAnulados);
  const preparado = vEnum_(f.preparado, ['SI', 'NO'], 'Preparado', false);
  if (desde && hasta && desde > hasta) throw appError_('VALIDACION', 'La fecha inicial no puede ser posterior a la final.');
  const sortBy = PEDIDO_SORT.indexOf(f.sortBy) >= 0 ? f.sortBy : 'fecha_creacion';
  const dir = f.sortDir === 'asc' ? 1 : -1;
  const pageSize = Math.min(CONFIG.MAX_PAGE_SIZE, Math.max(5, Math.floor(Number(f.pageSize) || 20)));
  let page = Math.max(1, Math.floor(Number(f.page) || 1));

  const today = today_();
  const ctx = refCtx_();
  let items = readTable_('Pedidos').filter(function (p) {
    if (!incluirAnulados && p.anulado === 'SI') return false;
    if (q && p.numero_pedido.toLowerCase().indexOf(q) < 0 && p.cliente_nombre.toLowerCase().indexOf(q) < 0 &&
        p.cliente_documento.toLowerCase().indexOf(q) < 0) return false;
    if (estado && p.estado !== estado) return false;
    const fc = p.fecha_creacion.slice(0, 10);
    if (desde && fc < desde) return false;
    if (hasta && fc > hasta) return false;
    if (rutaId && (rutaId === '__none' ? p.ruta_id !== '' : p.ruta_id !== rutaId)) return false;
    if (respId && (respId === '__none' ? p.responsable_id !== '' : p.responsable_id !== respId)) return false;
    if (prioridad && p.prioridad !== prioridad) return false;
    if (retrasados && !isRetrasado_(p, today)) return false;
    if (preparado && (!!p.fecha_fin_preparacion) !== (preparado === 'SI')) return false;
    return true;
  }).map(function (p) { return summarizePedido_(p, ctx, today); });

  items.sort(function (a, b) {
    let x = a[sortBy], y = b[sortBy];
    if (sortBy === 'prioridad') { x = PRIORIDAD_RANK[x] || 0; y = PRIORIDAD_RANK[y] || 0; }
    if (sortBy === 'estado') { x = ESTADOS.indexOf(x); y = ESTADOS.indexOf(y); }
    if (x < y) return -dir;
    if (x > y) return dir;
    return a.numero_pedido < b.numero_pedido ? dir : -dir;
  });
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, pages);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: total, page: page, pageSize: pageSize, pages: pages };
}

/* ===================== Detalle ===================== */

function findPedido_(id) {
  const pid = vId_(id, 'Pedido', true);
  const ped = readTable_('Pedidos').filter(function (x) { return x.pedido_id === pid; })[0];
  if (!ped) throw appError_('NO_ENCONTRADO', 'No se encontró el pedido solicitado.');
  return ped;
}

/** Carga un pedido para escritura verificando la versión enviada por el cliente. */
function loadPedido_(id, version) {
  const ped = findPedido_(id);
  if (version !== undefined && version !== null && version !== '' && String(ped.version) !== String(version)) {
    throw appError_('CONFLICTO', 'El pedido fue modificado por otro usuario o proceso. Recargue la información e intente de nuevo.');
  }
  return ped;
}

function savePedido_(ped, u) {
  ped.version = String((Number(ped.version) || 0) + 1);
  ped.fecha_actualizacion = now_();
  ped.actualizado_por = u.correo;
  updateRow_('Pedidos', ped);
}

function getPedido_(p, u) {
  const ped = findPedido_(p.pedido_id);
  const ctx = refCtx_();
  const detalles = readTable_('DetallePedidos').filter(function (d) { return d.pedido_id === ped.pedido_id; }).map(clean_);
  const usuario = function (id) { const x = ctx.usuarios[id]; return x ? { usuario_id: x.usuario_id, nombre: x.nombre } : null; };
  return {
    pedido: clean_(ped),
    resumen: summarizePedido_(ped, ctx, today_()),
    detalles: detalles,
    historial: historyFor_('Pedido', ped.pedido_id),
    ruta: ctx.rutas[ped.ruta_id] ? clean_(ctx.rutas[ped.ruta_id]) : null,
    responsable: usuario(ped.responsable_id),
    preparador: usuario(ped.preparador_id),
    editables: editableFields_(u, ped),
    lineasEditables: lineasEditables_(u, ped)
  };
}

/* ===================== Validación de entrada ===================== */

function validatePedidoInput_(d, usuarios) {
  const out = {
    cliente_nombre: vStr_(d.cliente_nombre, 'Cliente', { required: true, max: 150 }),
    cliente_documento: vStr_(d.cliente_documento, 'Documento', { max: 30 }),
    cliente_telefono: vPhone_(d.cliente_telefono, 'Teléfono', true),
    cliente_correo: vEmail_(d.cliente_correo, 'Correo electrónico', false),
    direccion_entrega: vStr_(d.direccion_entrega, 'Dirección de entrega', { required: true, max: 250 }),
    ciudad: vStr_(d.ciudad, 'Ciudad o municipio', { required: true, max: 80 }),
    zona: vStr_(d.zona, 'Barrio o zona', { required: true, max: 80 }),
    fecha_estimada_entrega: vDate_(d.fecha_estimada_entrega, 'Fecha estimada de entrega', true),
    prioridad: vEnum_(d.prioridad || 'normal', PRIORIDADES, 'Prioridad'),
    observaciones: vStr_(d.observaciones, 'Observaciones', { max: 1000 }),
    observaciones_internas: vStr_(d.observaciones_internas, 'Observaciones internas', { max: 1000 }),
    responsable_id: vId_(d.responsable_id, 'Responsable', false)
  };
  if (out.responsable_id) {
    const r = usuarios[out.responsable_id];
    if (!r || r.activo !== 'SI') throw appError_('VALIDACION', 'El responsable seleccionado no existe o está inactivo.');
  }
  return out;
}

function productosMap_() { return indexBy_(readTable_('Productos'), 'producto_id'); }

/** Verifica que una ruta admita nuevos pedidos (estado y capacidad). */
function assertRutaAsignable_(rutaId, nuevos) {
  const r = readTable_('Rutas').filter(function (x) { return x.ruta_id === rutaId; })[0];
  if (!r) throw appError_('NO_ENCONTRADO', 'No se encontró la ruta seleccionada.');
  if (r.estado !== 'planificada' && r.estado !== 'activa') {
    throw appError_('ESTADO_INVALIDO', 'No se pueden asignar pedidos a una ruta ' + r.estado + '.');
  }
  const cap = Number(r.capacidad) || 0;
  if (cap > 0 && nuevos > 0) {
    const actuales = readTable_('Pedidos').filter(function (p) {
      return p.ruta_id === rutaId && p.anulado !== 'SI' && p.estado !== 'Entregado';
    }).length;
    if (actuales + nuevos > cap) {
      throw appError_('VALIDACION', 'La ruta ' + r.codigo_ruta + ' superaría su capacidad (' + cap + ' pedidos; asignados: ' + actuales + ').');
    }
  }
  return r;
}

function detalleRows_(pedidoId, lineas) {
  return lineas.map(function (l) {
    return Object.assign({ detalle_id: uuid_(), pedido_id: pedidoId, cantidad_preparada: '0' }, l);
  });
}

/** Siguiente número de pedido legible y único. Debe ejecutarse dentro del bloqueo. */
function nextNumeroPedido_() {
  const cfgRows = readTable_('Configuracion');
  const row = cfgRows.filter(function (r) { return r.clave === 'consecutivo_pedidos'; })[0];
  if (!row) throw appError_('DB_ESTRUCTURA', 'Falta la clave "consecutivo_pedidos" en Configuracion. Ejecute setupDatabase().');
  const prefRow = cfgRows.filter(function (r) { return r.clave === 'prefijo_pedidos'; })[0];
  const prefijo = (prefRow && prefRow.valor) || 'PED';
  const usados = {};
  readTable_('Pedidos').forEach(function (p) { usados[p.numero_pedido] = true; });
  let n = Math.max(0, Math.floor(Number(row.valor) || 0));
  let numero;
  do { n++; numero = prefijo + '-' + ('000000' + n).slice(-6); } while (usados[numero]);
  row.valor = String(n);
  updateRow_('Configuracion', row);
  return numero;
}

/* ===================== Crear / editar ===================== */

function createPedido_(p, u) {
  const usuarios = indexBy_(readTable_('Usuarios'), 'usuario_id');
  const data = validatePedidoInput_(p, usuarios);
  if (data.fecha_estimada_entrega < today_()) throw appError_('VALIDACION', 'La fecha estimada de entrega no puede ser anterior a hoy.');
  const lineas = validateLineas_(p.lineas, productosMap_());
  const rutaId = vId_(p.ruta_id, 'Ruta', false);
  if (rutaId) {
    requirePerm_(u, 'rutas.asignar');
    assertRutaAsignable_(rutaId, 1);
  }
  const now = now_();
  const pedido = Object.assign({}, data, {
    pedido_id: uuid_(),
    numero_pedido: nextNumeroPedido_(),
    fecha_creacion: now,
    fecha_actualizacion: now,
    estado: 'Pendiente',
    ruta_id: rutaId,
    creado_por: u.correo,
    actualizado_por: u.correo,
    anulado: 'NO',
    version: '1',
    es_demo: 'NO'
  });
  // Primero el detalle: si fallara la escritura del pedido, las líneas huérfanas no aparecen en ninguna vista.
  appendRows_('DetallePedidos', detalleRows_(pedido.pedido_id, lineas));
  appendRows_('Pedidos', [pedido]);
  const hist = [{ entidad: 'Pedido', entidad_id: pedido.pedido_id, accion: 'CREAR', nuevo: 'Pendiente',
    observacion: pedido.numero_pedido + ' · ' + lineas.length + ' línea(s)' }];
  if (rutaId) hist.push({ entidad: 'Pedido', entidad_id: pedido.pedido_id, accion: 'ASIGNAR_RUTA', nuevo: rutaId });
  logHistory_(hist, u);
  return { pedido_id: pedido.pedido_id, numero_pedido: pedido.numero_pedido };
}

/** Campos que cada rol puede modificar según el estado del pedido. */
function editableFields_(u, ped) {
  if (!can_(u, 'pedidos.editar') || ped.anulado === 'SI') return [];
  if (ped.estado === 'Entregado') return u.rol === ROL.ADMIN ? ['observaciones', 'observaciones_internas'] : [];
  if (ped.estado === 'Despachado') {
    return u.rol === ROL.ADMIN ? PEDIDO_CAMPOS_BASE.slice() : ['observaciones', 'observaciones_internas'];
  }
  return PEDIDO_CAMPOS_BASE.slice();
}

function lineasEditables_(u, ped) {
  return can_(u, 'pedidos.editar') && ped.anulado !== 'SI' && ped.estado === 'Pendiente';
}

function updatePedido_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  const allowed = editableFields_(u, ped);
  if (!allowed.length) throw appError_('ESTADO_INVALIDO', 'El estado actual del pedido no permite modificarlo.');
  const usuarios = indexBy_(readTable_('Usuarios'), 'usuario_id');
  const data = validatePedidoInput_(p, usuarios);
  if (data.fecha_estimada_entrega !== ped.fecha_estimada_entrega && data.fecha_estimada_entrega < ped.fecha_creacion.slice(0, 10)) {
    throw appError_('VALIDACION', 'La fecha estimada de entrega no puede ser anterior a la fecha de creación.');
  }
  const anterior = {}, nuevo = {};
  allowed.forEach(function (k) {
    if (data[k] !== ped[k]) { anterior[k] = ped[k]; nuevo[k] = data[k]; ped[k] = data[k]; }
  });

  if (p.ruta_id !== undefined) {
    const rutaId = vId_(p.ruta_id, 'Ruta', false);
    if (rutaId !== ped.ruta_id) {
      requirePerm_(u, 'rutas.asignar');
      if (ESTADOS_ASIGNABLES.indexOf(ped.estado) < 0) throw appError_('ESTADO_INVALIDO', 'Solo se puede cambiar la ruta de pedidos pendientes o en preparación.');
      if (rutaId) assertRutaAsignable_(rutaId, 1);
      anterior.ruta_id = ped.ruta_id; nuevo.ruta_id = rutaId; ped.ruta_id = rutaId;
    }
  }

  if (vBool_(p.lineasModificadas)) {
    if (!lineasEditables_(u, ped)) throw appError_('ESTADO_INVALIDO', 'Solo se pueden modificar los productos de pedidos pendientes.');
    const lineas = validateLineas_(p.lineas, productosMap_());
    const viejas = readTable_('DetallePedidos').filter(function (d) { return d.pedido_id === ped.pedido_id; });
    deleteRows_('DetallePedidos', viejas);
    appendRows_('DetallePedidos', detalleRows_(ped.pedido_id, lineas));
    anterior.lineas = viejas.map(function (d) { return d.sku + ' x ' + d.cantidad; }).join('; ');
    nuevo.lineas = lineas.map(function (d) { return d.sku + ' x ' + d.cantidad; }).join('; ');
  }

  if (!Object.keys(nuevo).length) return { sinCambios: true, version: ped.version };
  savePedido_(ped, u);
  logHistory_([{ entidad: 'Pedido', entidad_id: ped.pedido_id, accion: 'EDITAR', anterior: anterior, nuevo: nuevo,
    observacion: vStr_(p.motivo, 'Motivo', { max: 500 }) }], u);
  return { version: ped.version };
}

function duplicatePedido_(p, u) {
  const orig = findPedido_(p.pedido_id);
  const prodMap = productosMap_();
  const lineas = readTable_('DetallePedidos').filter(function (d) { return d.pedido_id === orig.pedido_id; })
    .map(function (d) {
      const prod = prodMap[d.producto_id];
      if (!prod || prod.activo !== 'SI') throw appError_('VALIDACION', 'No se puede duplicar: el producto "' + d.nombre_producto + '" ya no está activo.');
      return { producto_id: d.producto_id, cantidad: d.cantidad, precio_unitario: d.precio_unitario, observaciones: d.observaciones };
    });
  const hoy = today_();
  const datos = {};
  PEDIDO_CAMPOS_BASE.forEach(function (k) { datos[k] = orig[k]; });
  datos.fecha_estimada_entrega = orig.fecha_estimada_entrega >= hoy ? orig.fecha_estimada_entrega : hoy;
  const usuarios = indexBy_(readTable_('Usuarios'), 'usuario_id');
  if (datos.responsable_id && (!usuarios[datos.responsable_id] || usuarios[datos.responsable_id].activo !== 'SI')) datos.responsable_id = '';
  datos.lineas = lineas;
  const res = createPedido_(datos, u);
  logHistory_([{ entidad: 'Pedido', entidad_id: res.pedido_id, accion: 'DUPLICAR', anterior: orig.numero_pedido, nuevo: res.numero_pedido }], u);
  return res;
}

/* ===================== Anular / eliminar ===================== */

function anularPedido_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  if (ped.anulado === 'SI') throw appError_('ESTADO_INVALIDO', 'El pedido ya está anulado.');
  if (ped.estado === 'Entregado') throw appError_('ESTADO_INVALIDO', 'Un pedido entregado no puede anularse.');
  const motivo = vJustificacion_(p.motivo);
  ped.anulado = 'SI';
  ped.motivo_anulacion = motivo;
  savePedido_(ped, u);
  logHistory_([{ entidad: 'Pedido', entidad_id: ped.pedido_id, accion: 'ANULAR', anterior: ped.estado, nuevo: 'Anulado', observacion: motivo }], u);
  return { ok: true };
}

/** Eliminación física solo para pedidos sin movimientos logísticos (pendientes, sin ruta ni preparación). */
function eliminarPedido_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  if (ped.estado !== 'Pendiente' || ped.ruta_id || ped.fecha_inicio_preparacion) {
    throw appError_('ESTADO_INVALIDO', 'Solo se pueden eliminar pedidos pendientes sin ruta ni preparación. Use la anulación para conservar la trazabilidad.');
  }
  const motivo = vJustificacion_(p.motivo);
  const detalles = readTable_('DetallePedidos').filter(function (d) { return d.pedido_id === ped.pedido_id; });
  deleteRows_('Pedidos', [ped]);
  deleteRows_('DetallePedidos', detalles);
  logHistory_([{ entidad: 'Pedido', entidad_id: ped.pedido_id, accion: 'ELIMINAR', anterior: ped.numero_pedido + ' · ' + ped.cliente_nombre,
    nuevo: 'Eliminado', observacion: motivo }], u);
  return { ok: true };
}
