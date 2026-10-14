/**
 * Usuarios.gs — Autenticación (cuentas de Google), autorización por rol y administración de usuarios.
 *
 * Estrategia: la aplicación se publica como "Ejecutar como: yo" y "Acceso: cualquier usuario del dominio".
 * En ese contexto Session.getActiveUser().getEmail() devuelve el correo del visitante SOLO si pertenece al
 * mismo dominio de Google Workspace que el propietario. Si el correo llega vacío (cuentas de otro dominio,
 * cuentas personales o despliegue anónimo), todas las operaciones se bloquean. No se usan contraseñas.
 */

function currentUser_() {
  if (_memo.__user && !_memo.__fresh) return _memo.__user;
  const email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw appError_('NO_AUTENTICADO', 'No fue posible verificar su identidad. Ingrese con una cuenta de Google autorizada de la organización.');
  }
  const u = readTable_('Usuarios').filter(function (x) {
    return x.correo.toLowerCase() === email && x.activo === 'SI';
  })[0];
  if (!u) throw appError_('NO_AUTORIZADO', 'Su cuenta (' + email + ') no está autorizada para usar la aplicación. Solicite acceso a un administrador.');
  if (ROLES.indexOf(u.rol) < 0) throw appError_('NO_AUTORIZADO', 'Su cuenta tiene un rol no válido. Contacte al administrador.');
  if (!_memo.__fresh) _memo.__user = u;
  return u;
}

function can_(user, perm) {
  const roles = PERMISOS[perm];
  return !!roles && roles.indexOf(user.rol) >= 0;
}

function requirePerm_(user, perm) {
  if (!can_(user, perm)) throw appError_('SIN_PERMISO', 'No tiene permisos para realizar esta operación.');
}

function permisosDe_(rol) {
  return Object.keys(PERMISOS).filter(function (p) { return PERMISOS[p].indexOf(rol) >= 0; });
}

function sessionInfo_(u) {
  const cfg = getConfig_();
  return {
    usuario: { usuario_id: u.usuario_id, nombre: u.nombre, correo: u.correo, rol: u.rol },
    permisos: permisosDe_(u.rol),
    config: {
      nombre_empresa: cfg.nombre_empresa,
      intervalo_actualizacion_seg: cfgNum_(cfg, 'intervalo_actualizacion_seg', 60),
      hoy: today_()
    },
    catalogos: {
      estados: ESTADOS,
      prioridades: PRIORIDADES,
      rutaEstados: RUTA_ESTADOS,
      roles: ROLES,
      // Solo id, nombre y rol: suficiente para seleccionar responsables sin exponer correos.
      usuarios: readTable_('Usuarios').filter(function (x) { return x.activo === 'SI'; })
        .map(function (x) { return { usuario_id: x.usuario_id, nombre: x.nombre, rol: x.rol }; })
    }
  };
}

function listUsuarios_() {
  return readTable_('Usuarios').map(clean_).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
}

function saveUsuario_(p, u) {
  const usuarios = readTable_('Usuarios');
  const id = vId_(p.usuario_id, 'Usuario', false);
  const data = {
    correo: vEmail_(p.correo, 'Correo', true),
    nombre: vStr_(p.nombre, 'Nombre', { required: true, max: 120 }),
    rol: vEnum_(p.rol, ROLES, 'Rol'),
    activo: vBool_(p.activo) ? 'SI' : 'NO'
  };
  const dup = usuarios.filter(function (x) { return x.correo.toLowerCase() === data.correo && x.usuario_id !== id; })[0];
  if (dup) throw appError_('VALIDACION', 'Ya existe un usuario con ese correo.');

  const adminsActivos = function (list) {
    return list.filter(function (x) { return x.rol === ROL.ADMIN && x.activo === 'SI'; }).length;
  };

  if (!id) {
    const nuevo = Object.assign({ usuario_id: uuid_(), fecha_creacion: now_(), es_demo: 'NO' }, data);
    appendRows_('Usuarios', [nuevo]);
    logHistory_([{ entidad: 'Usuario', entidad_id: nuevo.usuario_id, accion: 'CREAR', nuevo: data }], u);
    return clean_(nuevo);
  }
  const actual = usuarios.filter(function (x) { return x.usuario_id === id; })[0];
  if (!actual) throw appError_('NO_ENCONTRADO', 'No se encontró el usuario.');
  if (actual.usuario_id === u.usuario_id && (data.activo !== 'SI' || data.rol !== ROL.ADMIN)) {
    throw appError_('VALIDACION', 'No puede desactivar su propia cuenta ni quitarse el rol de Administrador.');
  }
  const anterior = { correo: actual.correo, nombre: actual.nombre, rol: actual.rol, activo: actual.activo };
  const simulada = usuarios.map(function (x) { return x.usuario_id === id ? Object.assign({}, x, data) : x; });
  if (adminsActivos(simulada) < 1) throw appError_('VALIDACION', 'Debe existir al menos un administrador activo.');
  Object.assign(actual, data);
  updateRow_('Usuarios', actual);
  logHistory_([{ entidad: 'Usuario', entidad_id: id, accion: 'EDITAR', anterior: anterior, nuevo: data }], u);
  return clean_(actual);
}

/* ===================== Configuración general ===================== */

const EDITABLE_CONFIG = {
  nombre_empresa: function (v) { return vStr_(v, 'Nombre de la empresa', { required: true, max: 120 }); },
  prefijo_pedidos: function (v) {
    const s = vStr_(v, 'Prefijo de pedidos', { required: true, max: 8 }).toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(s)) throw appError_('VALIDACION', 'El prefijo solo admite letras A-Z y números.');
    return s;
  },
  alerta_pendiente_horas: function (v) { return String(vNumber_(v, 'Horas límite en Pendiente', { required: true, min: 1, max: 720 })); },
  alerta_preparacion_horas: function (v) { return String(vNumber_(v, 'Horas límite en preparación', { required: true, min: 0.5, max: 720 })); },
  alerta_entrega_horas: function (v) { return String(vNumber_(v, 'Horas de gracia de entrega', { required: true, min: 0, max: 720 })); },
  intervalo_actualizacion_seg: function (v) { return String(vNumber_(v, 'Intervalo de actualización', { required: true, integer: true, min: 30, max: 3600 })); },
  incluir_demo_en_reportes: function (v) { return vEnum_(v, ['SI', 'NO'], 'Incluir datos demo'); },
  modo_produccion: function (v) { return vEnum_(v, ['SI', 'NO'], 'Modo producción'); }
};

function getConfigAdmin_() {
  return readTable_('Configuracion').map(function (r) {
    return { clave: r.clave, valor: r.valor, descripcion: r.descripcion, editable: r.clave in EDITABLE_CONFIG };
  });
}

function saveConfig_(p, u) {
  const rows = readTable_('Configuracion');
  const cambios = [];
  Object.keys(p).forEach(function (k) {
    if (!(k in EDITABLE_CONFIG)) return;
    const val = EDITABLE_CONFIG[k](p[k]);
    const row = rows.filter(function (r) { return r.clave === k; })[0];
    if (!row) throw appError_('DB_ESTRUCTURA', 'Falta la clave de configuración "' + k + '". Ejecute setupDatabase().');
    if (row.valor !== val) {
      cambios.push({ entidad: 'Configuracion', entidad_id: k, accion: 'EDITAR', anterior: row.valor, nuevo: val });
      row.valor = val;
      updateRow_('Configuracion', row);
    }
  });
  if (cambios.length) logHistory_(cambios, u);
  return { cambios: cambios.length };
}
