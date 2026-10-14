/**
 * Productos.gs — Catálogo de productos. No se implementa inventario (existencias/movimientos):
 * el catálogo solo identifica lo que se pide y se prepara.
 */

function listProductos_(p, u) {
  const soloActivos = !can_(u, 'productos.gestionar') || vBool_(p.soloActivos);
  return readTable_('Productos')
    .filter(function (x) { return !soloActivos || x.activo === 'SI'; })
    .map(clean_)
    .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
}

function saveProducto_(p, u) {
  const productos = readTable_('Productos');
  const id = vId_(p.producto_id, 'Producto', false);
  const data = {
    sku: vStr_(p.sku, 'SKU', { required: true, max: 40 }).toUpperCase(),
    nombre: vStr_(p.nombre, 'Nombre', { required: true, max: 150 }),
    descripcion: vStr_(p.descripcion, 'Descripción', { max: 500 }),
    unidad_medida: vStr_(p.unidad_medida, 'Unidad de medida', { required: true, max: 20 }),
    precio_referencia: vNumber_(p.precio_referencia, 'Precio de referencia', { min: 0, max: 1e10 }),
    activo: vBool_(p.activo) ? 'SI' : 'NO'
  };
  if (!/^[A-Z0-9._-]+$/.test(data.sku)) throw appError_('VALIDACION', 'El SKU solo admite letras, números, punto, guion y guion bajo.');
  const dup = productos.filter(function (x) { return x.sku.toUpperCase() === data.sku && x.producto_id !== id; })[0];
  if (dup) throw appError_('VALIDACION', 'Ya existe un producto con el SKU ' + data.sku + '.');
  const now = now_();
  if (!id) {
    const nuevo = Object.assign({ producto_id: uuid_(), fecha_creacion: now, fecha_actualizacion: now, es_demo: 'NO' }, data);
    appendRows_('Productos', [nuevo]);
    logHistory_([{ entidad: 'Producto', entidad_id: nuevo.producto_id, accion: 'CREAR', nuevo: data }], u);
    return clean_(nuevo);
  }
  const actual = productos.filter(function (x) { return x.producto_id === id; })[0];
  if (!actual) throw appError_('NO_ENCONTRADO', 'No se encontró el producto.');
  const anterior = clean_(actual);
  Object.assign(actual, data, { fecha_actualizacion: now });
  updateRow_('Productos', actual);
  logHistory_([{ entidad: 'Producto', entidad_id: id, accion: 'EDITAR', anterior: anterior, nuevo: data }], u);
  return clean_(actual);
}
