/**
 * Setup.gs — Inicialización idempotente de la base de datos y datos de demostración.
 * Ejecutar desde el editor de Apps Script (solo el propietario del proyecto puede hacerlo).
 */

/** Crea hojas, encabezados y configuración faltantes. Nunca borra datos existentes. */
function setupDatabase() {
  const owner = assertOwner_();
  const log = withLock_(function () {
    const ss = ss_();
    const out = [];
    Object.keys(SCHEMA).forEach(function (name) {
      let sh = ss.getSheetByName(name);
      if (!sh) { sh = ss.insertSheet(name); out.push('Hoja creada: ' + name); }
      const cols = SCHEMA[name];
      const lastCol = sh.getLastColumn();
      if (lastCol === 0) {
        sh.getRange(1, 1, 1, cols.length).setValues([cols]);
        out.push('Encabezados creados en ' + name);
      } else {
        const hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
        const missing = cols.filter(function (h) { return hdr.indexOf(h) < 0; });
        if (missing.length) {
          sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
          out.push('Columnas añadidas en ' + name + ': ' + missing.join(', '));
        }
      }
      const width = sh.getLastColumn();
      sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#F1F5F9');
      sh.setFrozenRows(1);
      // Texto plano: evita que Sheets convierta fechas, teléfonos o números de documento.
      sh.getRange(1, 1, sh.getMaxRows(), width).setNumberFormat('@');
      delete _memo['h_' + name];
    });

    const cfg = readTable_('Configuracion');
    const faltan = DEFAULT_CONFIG.filter(function (d) { return !cfg.some(function (r) { return r.clave === d[0]; }); });
    if (faltan.length) {
      appendRows_('Configuracion', faltan.map(function (d) { return { clave: d[0], valor: d[1], descripcion: d[2] }; }));
      out.push('Configuración añadida: ' + faltan.map(function (d) { return d[0]; }).join(', '));
    }

    const usuarios = readTable_('Usuarios');
    if (!usuarios.some(function (u) { return u.rol === ROL.ADMIN && u.activo === 'SI'; })) {
      const existente = usuarios.filter(function (u) { return u.correo.toLowerCase() === owner; })[0];
      if (existente) {
        existente.rol = ROL.ADMIN; existente.activo = 'SI';
        updateRow_('Usuarios', existente);
      } else {
        appendRows_('Usuarios', [{ usuario_id: uuid_(), correo: owner, nombre: 'Administrador', rol: ROL.ADMIN, activo: 'SI', fecha_creacion: now_(), es_demo: 'NO' }]);
      }
      out.push('Administrador inicial: ' + owner);
    }
    const def = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
    if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) { ss.deleteSheet(def); out.push('Hoja vacía por defecto eliminada'); }
    return out.length ? out : ['La estructura ya estaba completa. No se realizaron cambios.'];
  });
  log.forEach(function (l) { console.log(l); });
  return log;
}

/**
 * Crea datos de DEMOSTRACIÓN (marcados con es_demo = SI y prefijo [DEMO]). No sobrescribe nada.
 * Si la base está en modo producción o ya contiene pedidos reales, exige crear la propiedad de script
 * CONFIRMAR_DEMO = SI (Configuración del proyecto → Propiedades del script). La propiedad se borra al terminar.
 */
function seedDemoData() {
  assertOwner_();
  const res = withLock_(function () {
    const cfg = getConfig_();
    const props = PropertiesService.getScriptProperties();
    const pedidos = readTable_('Pedidos');
    if (pedidos.some(function (p) { return p.es_demo === 'SI'; })) {
      throw appError_('DEMO', 'Ya existen datos de demostración. Ejecute purgeDemoData() si desea regenerarlos.');
    }
    const hayReales = pedidos.some(function (p) { return p.es_demo !== 'SI'; });
    if ((cfg.modo_produccion === 'SI' || hayReales) && props.getProperty('CONFIRMAR_DEMO') !== 'SI') {
      throw appError_('DEMO', 'La base contiene datos reales o está en modo producción. Para continuar, cree la propiedad de script CONFIRMAR_DEMO=SI y vuelva a ejecutar.');
    }
    const now = now_();
    const today = today_();
    const sys = { correo: 'demo@sistema' };

    const usuarios = [
      ['[DEMO] Laura Gómez', 'operador.demo@ejemplo.invalid', ROL.OPER],
      ['[DEMO] Carlos Ruiz', 'bodega.demo@ejemplo.invalid', ROL.BODEGA],
      ['[DEMO] Andrés Mejía', 'despacho.demo@ejemplo.invalid', ROL.DESP],
      ['[DEMO] Paula Ríos', 'despacho2.demo@ejemplo.invalid', ROL.DESP]
    ].map(function (u) { return { usuario_id: uuid_(), nombre: u[0], correo: u[1], rol: u[2], activo: 'SI', fecha_creacion: now, es_demo: 'SI' }; });
    appendRows_('Usuarios', usuarios);

    const productos = [
      ['DEMO-001', 'Arroz 500 g', 'und', 3200], ['DEMO-002', 'Aceite 1 L', 'und', 11500], ['DEMO-003', 'Azúcar 1 kg', 'und', 4800],
      ['DEMO-004', 'Café 250 g', 'und', 9800], ['DEMO-005', 'Harina de trigo 1 kg', 'und', 3900], ['DEMO-006', 'Lenteja 500 g', 'und', 4100],
      ['DEMO-007', 'Agua 600 ml (paca x24)', 'paca', 18000], ['DEMO-008', 'Detergente 2 kg', 'und', 21500]
    ].map(function (p) {
      return { producto_id: uuid_(), sku: p[0], nombre: '[DEMO] ' + p[1], descripcion: 'Producto de demostración', unidad_medida: p[2],
        activo: 'SI', fecha_creacion: now, fecha_actualizacion: now, precio_referencia: p[3], es_demo: 'SI' };
    });
    appendRows_('Productos', productos);

    const rutas = [
      ['DEMO-R1', 'Ruta Norte', 'Cali · Norte', 0, 'activa', usuarios[2], 'Camión ABC-123', 15],
      ['DEMO-R2', 'Ruta Sur', 'Cali · Sur', 1, 'planificada', usuarios[3], 'Furgón XYZ-987', 12],
      ['DEMO-R3', 'Ruta Centro', 'Cali · Centro', -2, 'finalizada', usuarios[2], 'Moto MNO-45', '']
    ].map(function (r) {
      return { ruta_id: uuid_(), codigo_ruta: r[0], nombre_ruta: '[DEMO] ' + r[1], zona: r[2], fecha_operacion: addDays_(today, r[3]), estado: r[4],
        responsable_id: r[5].usuario_id, vehiculo: r[6], capacidad: r[7], observaciones: '', descripcion: 'Ruta de demostración',
        fecha_creacion: now, fecha_actualizacion: now, es_demo: 'SI' };
    });
    appendRows_('Rutas', rutas);

    const clientes = [
      ['Tienda La Esquina', 'Calle 45N # 5-20', 'Vipasa'], ['Minimercado El Sol', 'Cra 1 # 70-15', 'Calima'],
      ['Supertienda Los Andes', 'Av 6N # 28-10', 'Granada'], ['Autoservicio Pance', 'Cra 122 # 18-40', 'Pance'],
      ['Distribuciones Valle', 'Calle 5 # 66-12', 'El Ingenio'], ['Panadería San Fernando', 'Cra 34 # 3-50', 'San Fernando'],
      ['Restaurante El Fogón', 'Calle 15 # 4-30', 'San Nicolás'], ['Colegio Santa Rita', 'Cra 8 # 12-80', 'Centro']
    ];
    // [díasAtrás, estado, índice de ruta (-1 = sin ruta), prioridad, conResponsable]
    const plan = [
      [12, 'Entregado', 2, 'normal', true], [11, 'Entregado', 2, 'alta', true], [10, 'Entregado', 2, 'normal', true],
      [8, 'Entregado', 0, 'baja', true], [6, 'Entregado', 0, 'urgente', true], [5, 'Despachado', 0, 'normal', true],
      [4, 'Despachado', 0, 'alta', true], [3, 'En preparación', 0, 'normal', true], [2, 'En preparación', 1, 'urgente', true],
      [2, 'En preparación', -1, 'normal', false], [3, 'Pendiente', -1, 'alta', false], [1, 'Pendiente', 1, 'normal', true],
      [1, 'Pendiente', -1, 'baja', true], [0, 'Pendiente', 1, 'normal', true], [0, 'Pendiente', -1, 'urgente', false],
      [0, 'En preparación', 0, 'alta', true]
    ];
    const clamp = function (s) { return s > now ? now : s; };
    const pedidosNuevos = [], detalles = [], hist = [];
    plan.forEach(function (pl, i) {
      const c = clientes[i % clientes.length];
      const creado = addDays_(today, -pl[0]) + ' ' + ('0' + (7 + (i % 4))).slice(-2) + ':' + ('0' + ((i * 7) % 60)).slice(-2) + ':00';
      const fc = clamp(creado);
      const ped = {
        pedido_id: uuid_(), numero_pedido: nextNumeroPedido_(), fecha_creacion: fc,
        cliente_nombre: '[DEMO] ' + c[0], cliente_documento: '900' + (100000 + i), cliente_telefono: '+57 300 000 00' + ('0' + i).slice(-2),
        cliente_correo: '', direccion_entrega: c[1], ciudad: 'Cali', zona: c[2],
        fecha_estimada_entrega: addDays_(today, -pl[0] + (i % 3 === 0 ? 1 : 2)), prioridad: pl[3], estado: pl[1],
        ruta_id: pl[2] >= 0 ? rutas[pl[2]].ruta_id : '', responsable_id: pl[4] ? usuarios[i % 2 === 0 ? 0 : 1].usuario_id : '',
        observaciones: i % 5 === 0 ? 'Entregar en horario de la mañana' : '', observaciones_internas: '',
        creado_por: sys.correo, actualizado_por: sys.correo, anulado: 'NO', version: '1', es_demo: 'SI',
        fecha_inicio_preparacion: '', fecha_fin_preparacion: '', preparador_id: '', fecha_despacho: '', fecha_entrega: '',
        recibido_por: '', observacion_entrega: '', motivo_anulacion: ''
      };
      const h = function (accion, ant, nue, fecha) {
        hist.push({ entidad: 'Pedido', entidad_id: ped.pedido_id, accion: accion, anterior: ant, nuevo: nue, fecha: fecha, usuario: sys.correo, observacion: 'Dato de demostración' });
      };
      h('CREAR', '', 'Pendiente', fc);
      const idx = ESTADOS.indexOf(pl[1]);
      const terminado = idx >= 2 || (idx === 1 && i % 2 === 0);
      if (idx >= 1) { ped.fecha_inicio_preparacion = clamp(addHours_(fc, 2)); ped.preparador_id = usuarios[1].usuario_id; h('INICIAR_PREPARACION', 'Pendiente', 'En preparación', ped.fecha_inicio_preparacion); }
      if (terminado) { ped.fecha_fin_preparacion = clamp(addHours_(fc, 4)); h('FINALIZAR_PREPARACION', 'En preparación', 'Preparación completa', ped.fecha_fin_preparacion); }
      if (idx >= 2) { ped.fecha_despacho = clamp(addHours_(fc, 20)); h('DESPACHAR', 'En preparación', 'Despachado', ped.fecha_despacho); }
      if (idx >= 3) {
        ped.fecha_entrega = clamp(addHours_(fc, i === 1 ? 70 : 28)); ped.recibido_por = 'Recepción [DEMO]';
        h('ENTREGAR', 'Despachado', 'Entregado', ped.fecha_entrega);
      }
      ped.fecha_actualizacion = [ped.fecha_entrega, ped.fecha_despacho, ped.fecha_fin_preparacion, ped.fecha_inicio_preparacion, fc].filter(String)[0];
      pedidosNuevos.push(ped);
      for (let k = 0; k < 1 + (i % 3); k++) {
        const pr = productos[(i + k * 3) % productos.length];
        const cant = 2 + ((i + k) % 6) * 2;
        detalles.push({ detalle_id: uuid_(), pedido_id: ped.pedido_id, producto_id: pr.producto_id, nombre_producto: pr.nombre, sku: pr.sku,
          cantidad: cant, precio_unitario: pr.precio_referencia, subtotal: cant * pr.precio_referencia, observaciones: '',
          cantidad_preparada: terminado ? cant : (idx === 1 ? Math.floor(cant / 2) : 0) });
      }
    });
    appendRows_('DetallePedidos', detalles);
    appendRows_('Pedidos', pedidosNuevos);
    logHistory_(hist, sys);
    props.deleteProperty('CONFIRMAR_DEMO');
    return 'Datos de demostración creados: ' + usuarios.length + ' usuarios, ' + productos.length + ' productos, ' +
      rutas.length + ' rutas y ' + pedidosNuevos.length + ' pedidos.';
  });
  console.log(res);
  return res;
}

/** Elimina únicamente los registros marcados como demostración (es_demo = SI) y su historial. */
function purgeDemoData() {
  assertOwner_();
  const res = withLock_(function () {
    const ids = {};
    ['Pedidos', 'Productos', 'Rutas', 'Usuarios'].forEach(function (t) {
      readTable_(t).forEach(function (r) { if (r.es_demo === 'SI') ids[r[SCHEMA[t][0]]] = true; });
    });
    const out = {};
    out.DetallePedidos = rewriteTable_('DetallePedidos', function (r) { return !ids[r.pedido_id]; });
    out.Historial = rewriteTable_('Historial', function (r) { return !ids[r.entidad_id]; });
    ['Pedidos', 'Productos', 'Rutas', 'Usuarios'].forEach(function (t) {
      out[t] = rewriteTable_(t, function (r) { return r.es_demo !== 'SI'; });
    });
    return 'Registros de demostración eliminados: ' + JSON.stringify(out);
  });
  console.log(res);
  return res;
}
