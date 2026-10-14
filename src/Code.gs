/**
 * Code.gs — Punto de entrada de la aplicación web y enrutador de acciones.
 *
 * Funciones públicas (invocables con google.script.run): doGet() y api().
 * Funciones de mantenimiento (setupDatabase, seedDemoData, purgeDemoData, runTests) verifican que
 * las ejecute el propietario del script. Todas las demás funciones terminan en "_" y son privadas.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Inserta el contenido de un archivo HTML parcial (usado desde Index.html). */
function include_(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

/**
 * Tabla de acciones. perm: permiso requerido; write: la acción escribe (bloqueo + idempotencia).
 * Las funciones se envuelven para que la resolución sea perezosa (orden de carga de archivos).
 */
const ROUTES = {
  'session.get': { fn: (p, u) => sessionInfo_(u) },
  'dashboard.get': { perm: 'dashboard.ver', fn: (p) => getDashboard_(p) },

  'pedidos.list': { perm: 'pedidos.ver', fn: (p) => listPedidos_(p) },
  'pedidos.get': { perm: 'pedidos.ver', fn: (p, u) => getPedido_(p, u) },
  'pedidos.create': { perm: 'pedidos.crear', write: true, fn: (p, u) => createPedido_(p, u) },
  'pedidos.update': { perm: 'pedidos.editar', write: true, fn: (p, u) => updatePedido_(p, u) },
  'pedidos.duplicate': { perm: 'pedidos.duplicar', write: true, fn: (p, u) => duplicatePedido_(p, u) },
  'pedidos.anular': { perm: 'pedidos.anular', write: true, fn: (p, u) => anularPedido_(p, u) },
  'pedidos.eliminar': { perm: 'pedidos.eliminar', write: true, fn: (p, u) => eliminarPedido_(p, u) },

  'flujo.iniciarPreparacion': { perm: 'preparacion.gestionar', write: true, fn: (p, u) => iniciarPreparacion_(p, u) },
  'flujo.registrarPreparacion': { perm: 'preparacion.gestionar', write: true, fn: (p, u) => registrarPreparacion_(p, u) },
  'flujo.despachar': { perm: 'despacho.gestionar', write: true, fn: (p, u) => despachar_(p, u) },
  'flujo.registrarEntrega': { perm: 'entrega.registrar', write: true, fn: (p, u) => registrarEntrega_(p, u) },
  'flujo.revertir': { perm: 'excepciones.autorizar', write: true, fn: (p, u) => revertirEstado_(p, u) },

  'productos.list': { perm: 'pedidos.ver', fn: (p, u) => listProductos_(p, u) },
  'productos.save': { perm: 'productos.gestionar', write: true, fn: (p, u) => saveProducto_(p, u) },

  'rutas.list': { perm: 'rutas.ver', fn: (p) => listRutas_(p) },
  'rutas.get': { perm: 'rutas.ver', fn: (p) => getRuta_(p) },
  'rutas.save': { perm: 'rutas.gestionar', write: true, fn: (p, u) => saveRuta_(p, u) },
  'rutas.cambiarEstado': { perm: 'rutas.asignar', write: true, fn: (p, u) => cambiarEstadoRuta_(p, u) },
  'rutas.asignar': { perm: 'rutas.asignar', write: true, fn: (p, u) => asignarPedidos_(p, u) },
  'rutas.retirar': { perm: 'rutas.asignar', write: true, fn: (p, u) => retirarPedido_(p, u) },

  'usuarios.list': { perm: 'usuarios.gestionar', fn: () => listUsuarios_() },
  'usuarios.save': { perm: 'usuarios.gestionar', write: true, fn: (p, u) => saveUsuario_(p, u) },

  'config.get': { perm: 'config.gestionar', fn: () => getConfigAdmin_() },
  'config.save': { perm: 'config.gestionar', write: true, fn: (p, u) => saveConfig_(p, u) },

  'historial.list': { perm: 'historial.ver', fn: (p) => listHistorial_(p) },

  'reportes.generar': { perm: 'reportes.ver', fn: (p, u) => generateReport_(p, u) },
  'reportes.csv': { perm: 'reportes.ver', fn: (p, u) => exportCsv_(p, u) },
  'reportes.pdf': { perm: 'reportes.ver', fn: (p, u) => exportPdf_(p, u) }
};

/** Único punto de entrada de datos desde el navegador. Devuelve siempre {ok, data|error}. */
function api(action, payload) {
  try {
    const route = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null;
    if (!route) throw appError_('ACCION_INVALIDA', 'Acción no válida.');
    const p = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
    const user = currentUser_();
    if (route.perm) requirePerm_(user, route.perm);
    const exec = () => route.fn(p, user);
    const data = route.write
      ? withLock_(() => withIdempotency_(p._requestId, user.correo, () => {
          // Se revalida el usuario dentro del bloqueo (pudo ser desactivado mientras tanto).
          const fresh = currentUser_();
          if (route.perm) requirePerm_(fresh, route.perm);
          return route.fn(p, fresh);
        }))
      : exec();
    return { ok: true, data: data === undefined ? null : data };
  } catch (e) {
    return errorEnvelope_(e);
  }
}

function errorEnvelope_(e) {
  if (e && e.appCode) return { ok: false, error: { code: e.appCode, message: e.message } };
  const msg = String((e && e.message) || e);
  console.error('Error interno: ' + msg + (e && e.stack ? '\n' + e.stack : ''));
  if (/Service invoked too many times|quota|Exceeded maximum execution time|too many simultaneous|límite|Rate Limit/i.test(msg)) {
    return { ok: false, error: { code: 'LIMITE', message: 'Se alcanzó un límite temporal de Google Apps Script. Espere unos minutos e intente de nuevo.' } };
  }
  if (/Lock|bloqueo/i.test(msg)) {
    return { ok: false, error: { code: 'OCUPADO', message: 'El sistema está ocupado. Intente nuevamente en unos segundos.' } };
  }
  return { ok: false, error: { code: 'INTERNO', message: 'No fue posible completar la operación. Si el problema persiste, contacte al administrador.' } };
}

/** Permite ejecutar funciones de mantenimiento solo al propietario del proyecto (editor o web). */
function assertOwner_() {
  const active = (Session.getActiveUser().getEmail() || '').toLowerCase();
  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!active || active !== owner) throw appError_('SIN_PERMISO', 'Solo el propietario del proyecto puede ejecutar esta función.');
  return owner;
}
