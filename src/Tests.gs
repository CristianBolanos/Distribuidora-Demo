/**
 * Tests.gs — Pruebas automáticas de reglas de negocio puras (no tocan la hoja de cálculo).
 * Ejecutar runTests() desde el editor y revisar el registro de ejecución.
 */

function runTests() {
  assertOwner_();
  const results = [];
  const t = function (name, fn) {
    try { fn(); results.push('✔ ' + name); } catch (e) { results.push('✘ ' + name + ' → ' + e.message); }
  };
  const eq = function (a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' esperado ' + JSON.stringify(b) + ', obtenido ' + JSON.stringify(a)); };
  const throwsCode = function (fn, code) {
    try { fn(); } catch (e) { if (e.appCode === code) return; throw new Error('código ' + e.appCode + ' en lugar de ' + code); }
    throw new Error('no lanzó error ' + code);
  };

  t('Flujo normal de estados permitido', function () {
    eq(canTransition_('Pendiente', 'En preparación'), true);
    eq(canTransition_('En preparación', 'Despachado'), true);
    eq(canTransition_('Despachado', 'Entregado'), true);
  });
  t('Saltos y retrocesos ordinarios rechazados', function () {
    eq(canTransition_('Pendiente', 'Despachado'), false);
    eq(canTransition_('Pendiente', 'Entregado'), false);
    eq(canTransition_('Entregado', 'Despachado'), false);
    eq(canTransition_('Despachado', 'En preparación'), false);
  });
  t('Entregado no admite cambios ordinarios', function () {
    throwsCode(function () { assertTransition_({ estado: 'Entregado', anulado: 'NO' }, 'Despachado'); }, 'ESTADO_INVALIDO');
  });
  t('Pedido anulado no cambia de estado', function () {
    throwsCode(function () { assertTransition_({ estado: 'Pendiente', anulado: 'SI' }, 'En preparación'); }, 'ESTADO_INVALIDO');
  });
  t('Retraso: fecha vencida y no entregado', function () {
    eq(isRetrasado_({ estado: 'Despachado', anulado: 'NO', fecha_estimada_entrega: '2026-01-01' }, '2026-01-02'), true);
    eq(isRetrasado_({ estado: 'Entregado', anulado: 'NO', fecha_estimada_entrega: '2026-01-01' }, '2026-01-02'), false);
    eq(isRetrasado_({ estado: 'Pendiente', anulado: 'NO', fecha_estimada_entrega: '2026-01-02' }, '2026-01-02'), false);
    eq(isRetrasado_({ estado: 'Pendiente', anulado: 'SI', fecha_estimada_entrega: '2026-01-01' }, '2026-01-02'), false);
  });
  t('Validación de fechas', function () {
    eq(vDate_('2026-02-28', 'F', true), '2026-02-28');
    throwsCode(function () { vDate_('2026-02-30', 'F', true); }, 'VALIDACION');
    throwsCode(function () { vDate_('14/10/2026', 'F', true); }, 'VALIDACION');
    eq(vDateTime_('2026-10-14T08:05', 'F', true), '2026-10-14 08:05:00');
  });
  t('Fechas en zona horaria de Bogotá', function () {
    eq(Utilities.formatDate(parseDT_('2026-10-14 00:00:00'), 'America/Bogota', 'yyyy-MM-dd HH:mm'), '2026-10-14 00:00');
    eq(addDays_('2026-12-31', 1), '2027-01-01');
    eq(dmy_('2026-10-14 08:05:00'), '14/10/2026 08:05');
  });
  t('Cantidades deben ser numéricas y mayores que cero', function () {
    const prod = { p1: { producto_id: 'p1', nombre: 'X', sku: 'X1', activo: 'SI' } };
    throwsCode(function () { validateLineas_([{ producto_id: 'p1', cantidad: 0 }], prod); }, 'VALIDACION');
    throwsCode(function () { validateLineas_([{ producto_id: 'p1', cantidad: 'abc' }], prod); }, 'VALIDACION');
    throwsCode(function () { validateLineas_([], prod); }, 'VALIDACION');
    const l = validateLineas_([{ producto_id: 'p1', cantidad: '2,5', precio_unitario: 1000 }], prod);
    eq([l[0].cantidad, l[0].subtotal, l[0].sku], [2.5, 2500, 'X1']);
  });
  t('Productos inactivos o inexistentes rechazados', function () {
    const prod = { p1: { producto_id: 'p1', nombre: 'X', sku: 'X1', activo: 'NO' } };
    throwsCode(function () { validateLineas_([{ producto_id: 'p1', cantidad: 1 }], prod); }, 'VALIDACION');
    throwsCode(function () { validateLineas_([{ producto_id: 'p9', cantidad: 1 }], prod); }, 'VALIDACION');
  });
  t('Protección contra fórmulas en hoja y CSV', function () {
    eq(safeCell_('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
    eq(safeCell_('+573001234567'), "'+573001234567");
    eq(safeCell_('Normal'), 'Normal');
    eq(csvCell_('@SUM(A1)'), "'@SUM(A1)");
    eq(csvCell_('a;b'), '"a;b"');
    eq(csvCell_('di "hola"'), '"di ""hola"""');
    eq(csvCell_('Bogotá ñandú'), 'Bogotá ñandú');
    eq(csvCell_('x\n"y"'), '"x\n""y"""');
  });
  t('Matriz de permisos (mínimo privilegio)', function () {
    eq(can_({ rol: ROL.CONS }, 'pedidos.crear'), false);
    eq(can_({ rol: ROL.CONS }, 'pedidos.ver'), true);
    eq(can_({ rol: ROL.OPER }, 'usuarios.gestionar'), false);
    eq(can_({ rol: ROL.BODEGA }, 'despacho.gestionar'), false);
    eq(can_({ rol: ROL.DESP }, 'preparacion.gestionar'), false);
    eq(can_({ rol: ROL.DESP }, 'excepciones.autorizar'), false);
    eq(can_({ rol: ROL.ADMIN }, 'excepciones.autorizar'), true);
    eq(can_({ rol: 'Desconocido' }, 'pedidos.ver'), false);
  });
  t('Campos editables por rol y estado', function () {
    eq(editableFields_({ rol: ROL.CONS }, { estado: 'Pendiente', anulado: 'NO' }).length, 0);
    eq(editableFields_({ rol: ROL.OPER }, { estado: 'Entregado', anulado: 'NO' }).length, 0);
    eq(editableFields_({ rol: ROL.OPER }, { estado: 'Despachado', anulado: 'NO' }), ['observaciones', 'observaciones_internas']);
    eq(lineasEditables_({ rol: ROL.OPER }, { estado: 'En preparación', anulado: 'NO' }), false);
  });
  t('Justificación mínima en excepciones', function () {
    throwsCode(function () { vJustificacion_('corto'); }, 'VALIDACION');
    eq(vJustificacion_('Cliente solicitó corrección del despacho'), 'Cliente solicitó corrección del despacho');
  });

  const fails = results.filter(function (r) { return r.indexOf('✘') === 0; }).length;
  results.push('— ' + (results.length - fails) + ' correctas, ' + fails + ' fallidas');
  results.forEach(function (r) { console.log(r); });
  return results;
}
