/**
 * Config.gs — Configuración global, esquema de datos, estados y matriz de permisos.
 * Este archivo solo se ejecuta en el servidor: el identificador de la hoja nunca llega al navegador.
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: 'TU_ID_DE_HOJA_DE_CALCULO', // Reemplazar por el ID de su hoja (parte de la URL entre /d/ y /edit)
  TZ: 'America/Bogota',
  APP_TITLE: 'Gestión de Pedidos y Despacho',
  LOCK_TIMEOUT_MS: 25000,
  REF_CACHE_TTL_S: 300,
  IDEMPOTENCY_TTL_S: 600,
  MAX_PAGE_SIZE: 100,
  MAX_REPORT_ROWS: 5000,
  MAX_PDF_ROWS: 1500
});

/**
 * Esquema de hojas. La primera columna de cada hoja es su identificador estable.
 * Columnas añadidas respecto al mínimo solicitado (justificación):
 *  - Pedidos.observaciones_internas: notas logísticas separadas de las del cliente.
 *  - Pedidos.fecha_inicio_preparacion / fecha_fin_preparacion / preparador_id: distinguen
 *    "comenzar" y "finalizar" la preparación y permiten las alertas de tiempo.
 *  - Pedidos.recibido_por / observacion_entrega: confirmación de entrega (Módulo H).
 *  - Pedidos.motivo_anulacion: trazabilidad de la anulación lógica.
 *  - Pedidos.version: control de concurrencia optimista (detecta ediciones simultáneas).
 *  - *.es_demo: separa los datos de demostración de los reales.
 *  - DetallePedidos.cantidad_preparada: resultado del alistamiento por línea.
 *  - Productos.precio_referencia: precio sugerido opcional (no es costo logístico).
 *  - Configuracion usa formato clave/valor; el consecutivo de pedidos vive aquí (sin hoja extra).
 */
const SCHEMA = Object.freeze({
  Pedidos: ['pedido_id', 'numero_pedido', 'fecha_creacion', 'cliente_nombre', 'cliente_documento',
    'cliente_telefono', 'cliente_correo', 'direccion_entrega', 'ciudad', 'zona', 'fecha_estimada_entrega',
    'fecha_despacho', 'fecha_entrega', 'prioridad', 'estado', 'ruta_id', 'responsable_id', 'observaciones',
    'fecha_actualizacion', 'creado_por', 'actualizado_por', 'anulado',
    'observaciones_internas', 'fecha_inicio_preparacion', 'fecha_fin_preparacion', 'preparador_id',
    'recibido_por', 'observacion_entrega', 'motivo_anulacion', 'version', 'es_demo'],
  DetallePedidos: ['detalle_id', 'pedido_id', 'producto_id', 'nombre_producto', 'sku', 'cantidad',
    'precio_unitario', 'subtotal', 'observaciones', 'cantidad_preparada'],
  Productos: ['producto_id', 'sku', 'nombre', 'descripcion', 'unidad_medida', 'activo', 'fecha_creacion',
    'fecha_actualizacion', 'precio_referencia', 'es_demo'],
  Rutas: ['ruta_id', 'codigo_ruta', 'nombre_ruta', 'zona', 'fecha_operacion', 'responsable_id', 'vehiculo',
    'capacidad', 'estado', 'observaciones', 'fecha_creacion', 'fecha_actualizacion', 'descripcion', 'es_demo'],
  Usuarios: ['usuario_id', 'correo', 'nombre', 'rol', 'activo', 'fecha_creacion', 'es_demo'],
  Historial: ['historial_id', 'entidad', 'entidad_id', 'accion', 'valor_anterior', 'valor_nuevo',
    'fecha_evento', 'usuario', 'observacion'],
  Configuracion: ['clave', 'valor', 'descripcion']
});

/** Valores por defecto de la hoja Configuracion: [clave, valor, descripción]. */
const DEFAULT_CONFIG = Object.freeze([
  ['nombre_empresa', 'Mi Empresa Distribuidora', 'Nombre mostrado en la aplicación y en los informes'],
  ['zona_horaria', 'America/Bogota', 'Zona horaria de la operación (informativa; el sistema usa America/Bogota)'],
  ['prefijo_pedidos', 'PED', 'Prefijo del número de pedido (A-Z, 0-9, máx. 8)'],
  ['consecutivo_pedidos', '0', 'Último consecutivo usado. NO editar manualmente'],
  ['alerta_pendiente_horas', '24', 'Horas máximas en estado Pendiente antes de alertar'],
  ['alerta_preparacion_horas', '4', 'Horas máximas en preparación antes de alertar'],
  ['alerta_entrega_horas', '0', 'Horas de gracia tras el fin del día estimado de entrega antes de alertar'],
  ['intervalo_actualizacion_seg', '60', 'Intervalo de actualización automática del dashboard (segundos)'],
  ['incluir_demo_en_reportes', 'SI', 'SI/NO: incluir datos de demostración en dashboard e informes'],
  ['modo_produccion', 'NO', 'SI/NO: en producción seedDemoData() exige confirmación explícita']
]);

const ESTADOS = Object.freeze(['Pendiente', 'En preparación', 'Despachado', 'Entregado']);
const TRANSICIONES = Object.freeze({
  'Pendiente': ['En preparación'],
  'En preparación': ['Despachado'],
  'Despachado': ['Entregado'],
  'Entregado': []
});
const ESTADO_ANTERIOR = Object.freeze({
  'En preparación': 'Pendiente',
  'Despachado': 'En preparación',
  'Entregado': 'Despachado'
});
/** Estados en los que un pedido puede asignarse o retirarse de una ruta. */
const ESTADOS_ASIGNABLES = Object.freeze(['Pendiente', 'En preparación']);

const PRIORIDADES = Object.freeze(['baja', 'normal', 'alta', 'urgente']);
const PRIORIDAD_RANK = Object.freeze({ baja: 1, normal: 2, alta: 3, urgente: 4 });

const RUTA_ESTADOS = Object.freeze(['planificada', 'activa', 'finalizada', 'cancelada']);
const RUTA_TRANSICIONES = Object.freeze({
  planificada: ['activa', 'cancelada'],
  activa: ['finalizada', 'cancelada'],
  finalizada: [],
  cancelada: []
});

const ROL = Object.freeze({
  ADMIN: 'Administrador',
  OPER: 'Operador',
  BODEGA: 'Responsable de bodega',
  DESP: 'Despachador',
  CONS: 'Consulta'
});
const ROLES = Object.freeze([ROL.ADMIN, ROL.OPER, ROL.BODEGA, ROL.DESP, ROL.CONS]);

/** Matriz de permisos (principio de mínimo privilegio). Se verifica en el servidor en cada acción. */
const PERMISOS = Object.freeze({
  'dashboard.ver': ROLES,
  'pedidos.ver': ROLES,
  'pedidos.crear': [ROL.ADMIN, ROL.OPER],
  'pedidos.editar': [ROL.ADMIN, ROL.OPER],
  'pedidos.duplicar': [ROL.ADMIN, ROL.OPER],
  'pedidos.anular': [ROL.ADMIN],
  'pedidos.eliminar': [ROL.ADMIN],
  'preparacion.gestionar': [ROL.ADMIN, ROL.BODEGA],
  'despacho.gestionar': [ROL.ADMIN, ROL.DESP],
  'entrega.registrar': [ROL.ADMIN, ROL.DESP],
  'rutas.ver': ROLES,
  'rutas.gestionar': [ROL.ADMIN],
  'rutas.asignar': [ROL.ADMIN, ROL.DESP],
  'productos.gestionar': [ROL.ADMIN],
  'usuarios.gestionar': [ROL.ADMIN],
  'config.gestionar': [ROL.ADMIN],
  'reportes.ver': [ROL.ADMIN, ROL.CONS],
  'historial.ver': [ROL.ADMIN],
  'excepciones.autorizar': [ROL.ADMIN]
});
