/**
 * Rutas.gs — Administración de rutas de distribución y asignación MANUAL de pedidos.
 * No hay optimización geográfica de recorridos (no se integra ningún servicio de mapas).
 * Capacidad: número máximo de pedidos abiertos (no entregados ni anulados) asignados a la ruta.
 */

function rutaConteos_(rutaId, pedidos) {
  const c = { total: 0, 'Pendiente': 0, 'En preparación': 0, 'Despachado': 0, 'Entregado': 0, preparados: 0 };
  pedidos.forEach(function (p) {
    if (p.ruta_id !== rutaId || p.anulado === 'SI') return;
    c.total++;
    c[p.estado] = (c[p.estado] || 0) + 1;
    if (p.estado === 'En preparación' && p.fecha_fin_preparacion) c.preparados++;
  });
  return c;
}

function listRutas_(f) {
  const estado = vEnum_(f.estado, RUTA_ESTADOS, 'Estado', false);
  const desde = vDate_(f.desde, 'Desde', false);
  const hasta = vDate_(f.hasta, 'Hasta', false);
  const usuarios = indexBy_(readTable_('Usuarios'), 'usuario_id');
  const pedidos = readTable_('Pedidos');
  return readTable_('Rutas').filter(function (r) {
    return (!estado || r.estado === estado) && (!desde || r.fecha_operacion >= desde) && (!hasta || r.fecha_operacion <= hasta);
  }).map(function (r) {
    const o = clean_(r);
    o.responsable_nombre = usuarios[r.responsable_id] ? usuarios[r.responsable_id].nombre : '';
    o.conteos = rutaConteos_(r.ruta_id, pedidos);
    return o;
  }).sort(function (a, b) { return a.fecha_operacion < b.fecha_operacion ? 1 : a.fecha_operacion > b.fecha_operacion ? -1 : a.codigo_ruta.localeCompare(b.codigo_ruta); });
}

function findRuta_(id) {
  const rid = vId_(id, 'Ruta', true);
  const r = readTable_('Rutas').filter(function (x) { return x.ruta_id === rid; })[0];
  if (!r) throw appError_('NO_ENCONTRADO', 'No se encontró la ruta.');
  return r;
}

function getRuta_(p) {
  const r = findRuta_(p.ruta_id);
  const ctx = refCtx_();
  const today = today_();
  const todos = readTable_('Pedidos');
  const pedidos = todos.filter(function (x) { return x.ruta_id === r.ruta_id && x.anulado !== 'SI'; })
    .map(function (x) { return summarizePedido_(x, ctx, today); })
    .sort(function (a, b) { return ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado) || a.numero_pedido.localeCompare(b.numero_pedido); });
  const o = clean_(r);
  o.responsable_nombre = ctx.usuarios[r.responsable_id] ? ctx.usuarios[r.responsable_id].nombre : '';
  return {
    ruta: o,
    conteos: rutaConteos_(r.ruta_id, todos),
    pedidos: pedidos,
    pendientesDespacho: pedidos.filter(function (x) { return ESTADOS_ASIGNABLES.indexOf(x.estado) >= 0; })
  };
}

function saveRuta_(p, u) {
  const rutas = readTable_('Rutas');
  const id = vId_(p.ruta_id, 'Ruta', false);
  const usuarios = indexBy_(readTable_('Usuarios'), 'usuario_id');
  const data = {
    codigo_ruta: vStr_(p.codigo_ruta, 'Código de ruta', { required: true, max: 30 }).toUpperCase(),
    nombre_ruta: vStr_(p.nombre_ruta, 'Nombre de ruta', { required: true, max: 100 }),
    descripcion: vStr_(p.descripcion, 'Descripción', { max: 500 }),
    zona: vStr_(p.zona, 'Ciudad o zona atendida', { required: true, max: 120 }),
    fecha_operacion: vDate_(p.fecha_operacion, 'Fecha de operación', true),
    responsable_id: vId_(p.responsable_id, 'Responsable', false),
    vehiculo: vStr_(p.vehiculo, 'Vehículo', { max: 60 }),
    capacidad: vNumber_(p.capacidad, 'Capacidad', { integer: true, min: 1, max: 10000 }),
    observaciones: vStr_(p.observaciones, 'Observaciones', { max: 1000 })
  };
  if (data.responsable_id && (!usuarios[data.responsable_id] || usuarios[data.responsable_id].activo !== 'SI')) {
    throw appError_('VALIDACION', 'El responsable seleccionado no existe o está inactivo.');
  }
  const dup = rutas.filter(function (r) { return r.codigo_ruta.toUpperCase() === data.codigo_ruta && r.ruta_id !== id; })[0];
  if (dup) throw appError_('VALIDACION', 'Ya existe una ruta con el código ' + data.codigo_ruta + '.');
  const now = now_();
  if (!id) {
    const nueva = Object.assign({ ruta_id: uuid_(), estado: 'planificada', fecha_creacion: now, fecha_actualizacion: now, es_demo: 'NO' }, data);
    appendRows_('Rutas', [nueva]);
    logHistory_([{ entidad: 'Ruta', entidad_id: nueva.ruta_id, accion: 'CREAR', nuevo: data.codigo_ruta }], u);
    return clean_(nueva);
  }
  const actual = findRuta_(id);
  if (actual.estado === 'finalizada' || actual.estado === 'cancelada') {
    if (actual.observaciones === data.observaciones) throw appError_('ESTADO_INVALIDO', 'En una ruta ' + actual.estado + ' solo se pueden editar las observaciones.');
    const ant = actual.observaciones;
    actual.observaciones = data.observaciones;
    actual.fecha_actualizacion = now;
    updateRow_('Rutas', actual);
    logHistory_([{ entidad: 'Ruta', entidad_id: id, accion: 'EDITAR', anterior: { observaciones: ant }, nuevo: { observaciones: data.observaciones } }], u);
    return clean_(actual);
  }
  if (data.capacidad !== '') {
    const abiertos = readTable_('Pedidos').filter(function (x) { return x.ruta_id === id && x.anulado !== 'SI' && x.estado !== 'Entregado'; }).length;
    if (abiertos > data.capacidad) throw appError_('VALIDACION', 'La capacidad no puede ser menor que los pedidos abiertos asignados (' + abiertos + ').');
  }
  const anterior = {}, nuevo = {};
  Object.keys(data).forEach(function (k) {
    if (String(data[k]) !== String(actual[k])) { anterior[k] = actual[k]; nuevo[k] = data[k]; actual[k] = data[k]; }
  });
  if (!Object.keys(nuevo).length) return clean_(actual);
  actual.fecha_actualizacion = now;
  updateRow_('Rutas', actual);
  logHistory_([{ entidad: 'Ruta', entidad_id: id, accion: 'EDITAR', anterior: anterior, nuevo: nuevo }], u);
  return clean_(actual);
}

/**
 * Cambia el estado de la ruta. Nunca modifica el estado de los pedidos:
 *  - finalizada: los pedidos no despachados se liberan de la ruta (quedan "sin ruta" para reasignarse);
 *    los despachados sin entregar conservan la ruta y se informan como pendientes de confirmar entrega.
 *  - cancelada: solo administradores; se rechaza si hay pedidos despachados sin entregar.
 */
function cambiarEstadoRuta_(p, u) {
  const r = findRuta_(p.ruta_id);
  const destino = vEnum_(p.estado, RUTA_ESTADOS, 'Estado de ruta');
  if ((RUTA_TRANSICIONES[r.estado] || []).indexOf(destino) < 0) {
    throw appError_('ESTADO_INVALIDO', 'Una ruta ' + r.estado + ' no puede pasar a ' + destino + '.');
  }
  if (destino === 'cancelada') requirePerm_(u, 'rutas.gestionar');
  const obs = vStr_(p.observacion, 'Observación', { max: 500 });
  if (destino === 'cancelada' && obs.length < 10) throw appError_('VALIDACION', 'Indique el motivo de la cancelación (mínimo 10 caracteres).');

  const pedidos = readTable_('Pedidos').filter(function (x) { return x.ruta_id === r.ruta_id && x.anulado !== 'SI'; });
  const enCamino = pedidos.filter(function (x) { return x.estado === 'Despachado'; });
  if (destino === 'cancelada' && enCamino.length) {
    throw appError_('ESTADO_INVALIDO', 'No se puede cancelar: hay ' + enCamino.length + ' pedido(s) despachados sin entrega registrada.');
  }
  const hist = [{ entidad: 'Ruta', entidad_id: r.ruta_id, accion: 'CAMBIAR_ESTADO', anterior: r.estado, nuevo: destino, observacion: obs }];
  let liberados = [];
  if (destino === 'finalizada' || destino === 'cancelada') {
    liberados = pedidos.filter(function (x) { return ESTADOS_ASIGNABLES.indexOf(x.estado) >= 0; });
    liberados.forEach(function (x) {
      x.ruta_id = '';
      savePedido_(x, u);
      hist.push({ entidad: 'Pedido', entidad_id: x.pedido_id, accion: 'RETIRAR_RUTA', anterior: r.ruta_id, nuevo: '',
        observacion: 'Ruta ' + r.codigo_ruta + ' ' + destino });
    });
  }
  r.estado = destino;
  r.fecha_actualizacion = now_();
  updateRow_('Rutas', r);
  logHistory_(hist, u);
  return { estado: destino, liberados: liberados.length, despachadosSinEntrega: enCamino.length };
}

function asignarPedidos_(p, u) {
  const r = findRuta_(p.ruta_id);
  const ids = Array.isArray(p.pedido_ids) ? p.pedido_ids.slice(0, 200).map(function (x) { return vId_(x, 'Pedido', true); }) : [];
  if (!ids.length) throw appError_('VALIDACION', 'Seleccione al menos un pedido.');
  const pedidos = indexBy_(readTable_('Pedidos'), 'pedido_id');
  const versiones = p.versiones && typeof p.versiones === 'object' ? p.versiones : {};
  const objetivo = [];
  ids.forEach(function (id) {
    const ped = pedidos[id];
    if (!ped) throw appError_('NO_ENCONTRADO', 'Uno de los pedidos seleccionados no existe.');
    if (versiones[id] !== undefined && String(versiones[id]) !== String(ped.version)) {
      throw appError_('CONFLICTO', 'El pedido ' + ped.numero_pedido + ' fue modificado por otro proceso. Recargue e intente de nuevo.');
    }
    if (ped.anulado === 'SI') throw appError_('ESTADO_INVALIDO', 'El pedido ' + ped.numero_pedido + ' está anulado.');
    if (ESTADOS_ASIGNABLES.indexOf(ped.estado) < 0) throw appError_('ESTADO_INVALIDO', 'El pedido ' + ped.numero_pedido + ' está ' + ped.estado + ' y no puede asignarse.');
    if (ped.ruta_id !== r.ruta_id && objetivo.indexOf(ped) < 0) objetivo.push(ped);
  });
  assertRutaAsignable_(r.ruta_id, objetivo.length);
  const hist = [];
  objetivo.forEach(function (ped) {
    hist.push({ entidad: 'Pedido', entidad_id: ped.pedido_id, accion: 'ASIGNAR_RUTA', anterior: ped.ruta_id, nuevo: r.ruta_id, observacion: 'Ruta ' + r.codigo_ruta });
    ped.ruta_id = r.ruta_id;
    savePedido_(ped, u);
  });
  logHistory_(hist, u);
  return { asignados: objetivo.map(function (x) { return { pedido_id: x.pedido_id, version: x.version }; }) };
}

function retirarPedido_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  if (!ped.ruta_id) throw appError_('VALIDACION', 'El pedido no tiene ruta asignada.');
  if (ESTADOS_ASIGNABLES.indexOf(ped.estado) < 0) throw appError_('ESTADO_INVALIDO', 'No se puede retirar de la ruta un pedido ' + ped.estado.toLowerCase() + '.');
  const anterior = ped.ruta_id;
  ped.ruta_id = '';
  savePedido_(ped, u);
  logHistory_([{ entidad: 'Pedido', entidad_id: ped.pedido_id, accion: 'RETIRAR_RUTA', anterior: anterior, nuevo: '',
    observacion: vStr_(p.observacion, 'Observación', { max: 500 }) }], u);
  return { version: ped.version };
}
