/**
 * Flujo.gs — Máquina de estados del pedido: preparación, despacho, entrega y reversiones autorizadas.
 * Flujo normal: Pendiente → En preparación → Despachado → Entregado. Todas las transiciones se validan aquí.
 */

function histPedido_(ped, accion, anterior, nuevo, observacion) {
  return { entidad: 'Pedido', entidad_id: ped.pedido_id, accion: accion, anterior: anterior, nuevo: nuevo, observacion: observacion || '' };
}

function iniciarPreparacion_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  assertTransition_(ped, 'En preparación');
  const obs = vStr_(p.observacion, 'Observación', { max: 500 });
  ped.estado = 'En preparación';
  ped.fecha_inicio_preparacion = now_();
  ped.preparador_id = u.usuario_id;
  savePedido_(ped, u);
  logHistory_([histPedido_(ped, 'INICIAR_PREPARACION', 'Pendiente', 'En preparación', obs)], u);
  return { version: ped.version };
}

/** Registra cantidades alistadas por línea y, si se solicita y todo está completo, finaliza la preparación. */
function registrarPreparacion_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  if (ped.anulado === 'SI' || ped.estado !== 'En preparación') {
    throw appError_('ESTADO_INVALIDO', 'Solo se puede registrar el alistamiento de pedidos en preparación.');
  }
  if (ped.fecha_fin_preparacion) throw appError_('ESTADO_INVALIDO', 'La preparación de este pedido ya fue finalizada.');
  const obs = vStr_(p.observacion, 'Observación', { max: 500 });
  const detalles = readTable_('DetallePedidos').filter(function (d) { return d.pedido_id === ped.pedido_id; });
  const input = {};
  (Array.isArray(p.lineas) ? p.lineas : []).forEach(function (l) { if (l) input[String(l.detalle_id)] = l; });
  const cambiadas = [];
  detalles.forEach(function (d) {
    const l = input[d.detalle_id];
    if (!l) return;
    const q = vNumber_(l.cantidad_preparada, 'Cantidad preparada de ' + d.nombre_producto, { required: true, min: 0, max: Number(d.cantidad) });
    if (Number(d.cantidad_preparada || 0) !== q) { d.cantidad_preparada = String(q); cambiadas.push(d); }
  });
  const completo = detalles.length > 0 && detalles.every(function (d) { return Number(d.cantidad_preparada || 0) >= Number(d.cantidad); });
  const finalizar = vBool_(p.finalizar);
  // Se valida antes de escribir para no dejar cantidades guardadas a medias si la operación se rechaza.
  if (finalizar && !completo) throw appError_('VALIDACION', 'No se puede finalizar: hay productos con cantidades pendientes de alistar.');
  updateRows_('DetallePedidos', cambiadas);

  const hist = [];
  if (cambiadas.length) {
    hist.push(histPedido_(ped, 'REGISTRAR_ALISTAMIENTO', '', cambiadas.map(function (d) {
      return d.sku + ': ' + d.cantidad_preparada + '/' + d.cantidad;
    }).join('; '), obs));
  }
  if (finalizar) {
    ped.fecha_fin_preparacion = now_();
    hist.push(histPedido_(ped, 'FINALIZAR_PREPARACION', 'En preparación', 'Preparación completa', obs));
  }
  if (hist.length) {
    savePedido_(ped, u);
    logHistory_(hist, u);
  }
  return { completo: completo, finalizado: !!ped.fecha_fin_preparacion, version: ped.version };
}

function despachar_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  assertTransition_(ped, 'Despachado');
  if (!ped.ruta_id) throw appError_('VALIDACION', 'Asigne una ruta al pedido antes de despacharlo.');
  const ruta = readTable_('Rutas').filter(function (r) { return r.ruta_id === ped.ruta_id; })[0];
  if (!ruta || (ruta.estado !== 'planificada' && ruta.estado !== 'activa')) {
    throw appError_('ESTADO_INVALIDO', 'La ruta asignada no está planificada ni activa.');
  }
  const obs = vStr_(p.observacion, 'Observación', { max: 500 });
  const hist = [];
  if (!ped.fecha_fin_preparacion) {
    if (!vBool_(p.excepcion)) {
      throw appError_('ESTADO_INVALIDO', 'El pedido no ha completado la preparación. Solo un administrador puede despacharlo como excepción justificada.');
    }
    requirePerm_(u, 'excepciones.autorizar');
    hist.push(histPedido_(ped, 'EXCEPCION_DESPACHO', 'Preparación incompleta', 'Despacho autorizado', vJustificacion_(p.justificacion)));
  }
  ped.estado = 'Despachado';
  ped.fecha_despacho = now_();
  savePedido_(ped, u);
  hist.push(histPedido_(ped, 'DESPACHAR', 'En preparación', 'Despachado', (obs ? obs + ' · ' : '') + 'Ruta ' + ruta.codigo_ruta));
  logHistory_(hist, u);
  return { version: ped.version };
}

function registrarEntrega_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  assertTransition_(ped, 'Entregado');
  if (!vBool_(p.confirmado)) throw appError_('VALIDACION', 'Debe confirmar que la entrega fue realizada.');
  const fecha = vDateTime_(p.fecha_entrega, 'Fecha y hora de entrega', true);
  if (parseDT_(fecha).getTime() > Date.now() + 5 * 60000) throw appError_('VALIDACION', 'La fecha de entrega no puede ser futura.');
  if (ped.fecha_despacho && fecha < ped.fecha_despacho.slice(0, 16) + ':00') {
    throw appError_('VALIDACION', 'La fecha de entrega no puede ser anterior a la fecha de despacho.');
  }
  ped.estado = 'Entregado';
  ped.fecha_entrega = fecha;
  ped.recibido_por = vStr_(p.recibido_por, 'Persona que recibe', { max: 120 });
  ped.observacion_entrega = vStr_(p.observacion_entrega, 'Observación del repartidor', { max: 500 });
  savePedido_(ped, u);
  logHistory_([histPedido_(ped, 'ENTREGAR', 'Despachado', 'Entregado',
    [ped.recibido_por ? 'Recibió: ' + ped.recibido_por : '', ped.observacion_entrega].filter(String).join(' · '))], u);
  return { version: ped.version };
}

/** Devuelve el pedido al estado anterior. Requiere permiso de excepciones y justificación; queda auditado. */
function revertirEstado_(p, u) {
  const ped = loadPedido_(p.pedido_id, p.version);
  if (ped.anulado === 'SI') throw appError_('ESTADO_INVALIDO', 'El pedido está anulado.');
  const destino = ESTADO_ANTERIOR[ped.estado];
  if (!destino) throw appError_('ESTADO_INVALIDO', 'El estado actual no tiene un estado anterior al que volver.');
  const just = vJustificacion_(p.justificacion);
  const origen = ped.estado;
  if (origen === 'Entregado') { ped.fecha_entrega = ''; ped.recibido_por = ''; ped.observacion_entrega = ''; }
  if (origen === 'Despachado') { ped.fecha_despacho = ''; }
  if (origen === 'En preparación') { ped.fecha_inicio_preparacion = ''; ped.fecha_fin_preparacion = ''; ped.preparador_id = ''; }
  ped.estado = destino;
  savePedido_(ped, u);
  logHistory_([histPedido_(ped, 'EXCEPCION_REVERSION', origen, destino, just)], u);
  return { version: ped.version, estado: destino };
}
