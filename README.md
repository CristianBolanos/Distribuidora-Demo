# Sistema de Gestión de Pedidos y Despacho (Google Sheets + Apps Script)

Aplicación web interna para registrar pedidos, controlar la preparación, asignar rutas, despachar, registrar entregas, consultar indicadores y exportar informes. **Google Sheets** almacena los datos y **Google Apps Script** es el backend.

> **Demo en vivo:** [`demo/`](demo/) contiene una versión que funciona en cualquier navegador sin cuenta de Google. Ejecuta el mismo código de `src/` con los servicios de Google simulados y datos ficticios. Vea [demo/README.md](demo/README.md) para publicarla en GitHub Pages.

---

## Entregable 1 · Arquitectura

```
Navegador (HTML/CSS/JS, Chart.js, Lucide)
   │  google.script.run.api(acción, datos)   ← único punto de entrada
   ▼
Apps Script (Code.gs → ROUTES)
   1. Identifica al usuario (Session.getActiveUser) y lo busca en la hoja Usuarios
   2. Verifica el permiso de la acción (matriz PERMISOS)
   3. Escrituras: LockService + idempotencia (_requestId) + control de versión
   4. Valida y normaliza los datos → reglas de negocio → auditoría
   ▼
Google Sheets (lecturas/escrituras por lotes, caché de datos de referencia)
```

- El navegador **nunca** recibe el ID de la hoja ni credenciales; solo llama a `api()` con un nombre de acción permitido.
- Las respuestas siempre son `{ok:true,data}` o `{ok:false,error:{code,message}}` con mensajes comprensibles. Los detalles técnicos solo van al registro de ejecución (Stackdriver).

### Modelo de datos

| Hoja | Clave | Relaciones |
|---|---|---|
| Pedidos | `pedido_id` (UUID inmutable), `numero_pedido` (PED-000001, único) | `ruta_id` → Rutas, `responsable_id`/`preparador_id` → Usuarios |
| DetallePedidos | `detalle_id` | `pedido_id` → Pedidos, `producto_id` → Productos (con copia de nombre y SKU) |
| Productos | `producto_id` | — |
| Rutas | `ruta_id` | `responsable_id` → Usuarios |
| Usuarios | `usuario_id` | `correo` (cuenta de Google) |
| Historial | `historial_id` | `entidad` + `entidad_id` |
| Configuracion | `clave` | parámetros y consecutivo de pedidos |

Columnas añadidas al mínimo pedido (justificadas en `Config.gs`): fechas de inicio/fin de preparación, preparador, datos de entrega (recibido por, observación), motivo de anulación, `version` (concurrencia optimista), `es_demo`, `cantidad_preparada` por línea y `precio_referencia` en productos. No se creó ninguna hoja adicional.

### Flujo de estados

`Pendiente → En preparación → Despachado → Entregado` (controlado en el servidor, `Flujo.gs`).
- Dentro de *En preparación* se distingue **iniciar** y **finalizar** la preparación (con cantidades por línea).
- Despachar exige preparación finalizada y una ruta planificada/activa; sin preparación solo un Administrador puede hacerlo como **excepción justificada**.
- Revertir a un estado anterior: solo Administrador, con justificación; queda en el historial como `EXCEPCION_REVERSION`.
- Anulación lógica (Administrador, con motivo). Eliminación física solo de pedidos Pendientes sin ruta ni preparación.
- Las alertas y las fechas vencidas nunca cambian el estado de un pedido.

---

## Entregable 2 · Estructura de archivos (`src/`)

| Archivo | Responsabilidad |
|---|---|
| `appsscript.json` | Manifiesto: V8, zona America/Bogota, web app "ejecutar como yo" + "dominio". |
| `Code.gs` | `doGet()`, `api()` (enrutador con permisos, bloqueo e idempotencia), manejo de errores. |
| `Config.gs` | ID de la hoja, esquema, estados, transiciones, roles y matriz de permisos. |
| `Database.gs` | Acceso a Sheets por lotes, caché, `withLock_`, idempotencia, configuración. |
| `Validaciones.gs` | Fechas (Bogotá), validadores, reglas puras (transiciones, retraso, CSV, anti-fórmulas). |
| `Pedidos.gs` | Listado/filtros/orden/paginación, detalle, crear, editar, duplicar, anular, eliminar. |
| `Flujo.gs` | Preparación, despacho, entrega y reversiones. |
| `Rutas.gs` | CRUD de rutas, estados, asignar/retirar pedidos, finalizar jornada. |
| `Productos.gs` | Catálogo (sin inventario). |
| `Usuarios.gs` | Autenticación, autorización, usuarios y configuración general. |
| `Historial.gs` | Auditoría. |
| `Reportes.gs` | Dashboard, alertas, 10 informes, CSV y PDF. |
| `Setup.gs` | `setupDatabase()`, `seedDemoData()`, `purgeDemoData()`. |
| `Formato.gs` | `formatSpreadsheet()`: diseño visual de las hojas y panel Resumen con gráficos. |
| `Tests.gs` | `runTests()`: pruebas de reglas de negocio. |
| `Index.html` | Estructura principal. |
| `Styles.html` | Estilos (paleta solicitada, responsive). |
| `Scripts.html` | Núcleo del frontend, componentes y dashboard. |
| `ViewsPedidos.html` | Pedidos: listado, formulario, detalle, seguimiento, impresión. |
| `ViewsOperacion.html` | Preparación, despacho/entregas y rutas. |
| `ViewsAdmin.html` | Reportes, productos, usuarios, auditoría y configuración. |

**Dependencias externas (solo en el navegador, por CDN):** Chart.js 4.4.1 (cdnjs), Lucide 0.460.0 (unpkg), fuente Inter (Google Fonts). El backend usa únicamente servicios nativos de Apps Script.

---

## Entregable 4 · Instalación

1. **Hoja de cálculo.** Cree una hoja de Google Sheets vacía y copie su ID (la parte de la URL entre `/d/` y `/edit`) en `Config.gs → CONFIG.SPREADSHEET_ID`, reemplazando `TU_ID_DE_HOJA_DE_CALCULO`.
2. **Proyecto de Apps Script.** Entre en <https://script.google.com> → *Nuevo proyecto* (proyecto independiente), con la **misma cuenta que es dueña de la hoja**.
3. **Archivos.** Cree cada archivo `.gs` y `.html` de `src/` con el **mismo nombre** (sin extensión en el editor) y pegue su contenido. En *Configuración del proyecto* active "Mostrar el archivo de manifiesto appsscript.json" y reemplácelo por el de `src/`.
   - Alternativa con [clasp](https://github.com/google/clasp): `clasp create --type standalone --rootDir src` y luego `clasp push`.
4. **Inicializar.** En el editor seleccione `setupDatabase` → *Ejecutar*. Crea hojas, encabezados y configuración sin borrar datos, y registra su correo como **Administrador**.
5. **Autorizar** los permisos que solicita Google (hojas de cálculo, correo del usuario).
6. **(Opcional) Datos de demostración:** ejecute `seedDemoData`. Para retirarlos: `purgeDemoData`. Si la base ya tiene pedidos reales o `modo_produccion=SI`, primero cree la propiedad de script `CONFIRMAR_DEMO=SI`.
7. **Pruebas:** ejecute `runTests` y revise el registro (13 pruebas).
7b. **Presentación de la hoja (opcional, recomendado):** abra `Formato.gs` y ejecute `formatSpreadsheet`. Aplica colores, filas alternadas, anchos de columna, colores por estado y prioridad, resaltado de fechas vencidas, y crea la hoja **Resumen**: un panel con indicadores, tablas y gráficos que se actualizan solos con fórmulas. Se puede volver a ejecutar sin riesgo (no toca los datos). Las hojas de datos muestran una advertencia si alguien intenta editarlas a mano.
8. **Publicar:** *Implementar → Nueva implementación → Aplicación web*:
   - **Ejecutar como:** Yo (propietario).
   - **Quién tiene acceso:** Cualquier usuario de *su dominio* (p. ej., miempresa.com).
9. **Usuarios:** abra la URL, vaya a *Usuarios y permisos* y registre el correo de Google y el rol de cada persona.
10. **Acceso restringido:** no comparta la hoja de cálculo con los usuarios finales (la app la usa con la identidad del propietario). Solo administradores técnicos deben tener acceso al proyecto y a la hoja.

### Autenticación — restricciones de `Session.getActiveUser().getEmail()`

- Con "Ejecutar como: yo", Google solo entrega el correo del visitante **si pertenece al mismo dominio de Google Workspace que el propietario**. Para cuentas personales (gmail.com) u otros dominios devuelve vacío.
- Si el correo llega vacío, **todas** las operaciones se bloquean (`NO_AUTENTICADO`). Si el correo no está activo en la hoja Usuarios: `NO_AUTORIZADO`.
- No se usan contraseñas. Nunca publique con acceso "Cualquier persona" (anónimo).
- Si necesitara usuarios de otro dominio, la alternativa es "Ejecutar como: usuario que accede" (requiere compartir la hoja con cada usuario, lo que les permitiría editarla directamente; no recomendado).

---

## Entregable 5 · Manual de usuario

- **Registrar pedidos** (Operador/Admin): *Pedidos → Nuevo pedido*. Complete cliente, entrega y productos (puede agregar o quitar líneas; cantidades > 0). El número y la fecha son automáticos; inicia *Pendiente*.
- **Buscar:** combine búsqueda, estado, fechas, ruta, responsable, prioridad y "solo retrasados"; haga clic en los encabezados para ordenar.
- **Preparar** (Bodega): *Preparación → Iniciar*, luego *Alistar*: registre las cantidades (botón "Completo"), *Guardar avance* o *Finalizar preparación* cuando todo esté completo. *Orden de preparación* imprime la lista.
- **Asignar rutas** (Despachador/Admin): *Rutas → (ruta) → Asignar pedidos*, o desde el formulario del pedido o al despachar. *Retirar* devuelve el pedido a "sin ruta".
- **Despachar:** *Despacho y entregas → Listos para despacho → Despachar* (elija ruta si falta).
- **Registrar entrega:** *En distribución → Entrega*: fecha/hora real, quién recibe, observación y confirmación.
- **Finalizar jornada:** en la ruta, *Finalizar jornada*. No cambia estados; libera los no despachados para reasignarlos.
- **Dashboard:** indicadores, gráficos por período (hoy, 7, 30 días o rango) y alertas; se actualiza solo según el intervalo configurado.
- **Informes:** *Reportes*: elija informe y filtros, vista previa, *Exportar CSV* (UTF-8, separador `;`) o *Exportar PDF*.
- **Usuarios y permisos** (Admin): crear, cambiar rol o desactivar. No puede desactivarse a sí mismo y siempre debe quedar un administrador activo.
- **Seguimiento:** en el detalle del pedido, pestañas *Seguimiento* (hitos) e *Historial* (todos los eventos).

| Rol | Puede |
|---|---|
| Administrador | Todo, incluidas excepciones, anulación, usuarios, configuración y auditoría |
| Operador | Crear, editar y duplicar pedidos |
| Responsable de bodega | Iniciar, registrar y finalizar preparación |
| Despachador | Asignar rutas, activar/finalizar rutas, despachar, registrar entregas |
| Consulta | Solo lectura + reportes |

---

## Entregable 6 · Validación final

### Pruebas ejecutadas
- `runTests()` — 13 pruebas de reglas de negocio (transiciones, retrasos, fechas Bogotá, cantidades, productos inactivos, anti-fórmulas en hoja/CSV, matriz de permisos, campos editables, justificaciones): **13/13 correctas** (ejecutadas en Node con stubs de `Utilities`).
- Verificación de sintaxis de todos los `.gs` y scripts del frontend: sin errores.

### Pruebas manuales pendientes (requieren la cuenta de Google y el despliegue)
Seguir los 20 criterios de aceptación: inicializar dos veces (no duplica), crear pedido con varios productos y recargar, filtros combinados, flujo completo, intento de transición no permitida con un rol sin permiso, historial de cada cambio, dashboard vs. hoja, alertas al ajustar umbrales, CSV con tildes en Excel, PDF, usuario no registrado (bloqueado), doble clic en "Registrar pedido" (un solo pedido), uso en móvil.

### Limitaciones conocidas
- Los PDF se generan con la conversión HTML→PDF de Apps Script, que **no permite numerar páginas**; máximo 1 500 filas (CSV hasta 5 000).
- No hay inventario, geolocalización, optimización de rutas, firmas ni fotos de evidencia.
- La caché de catálogos dura 5 min: ediciones manuales directas en la hoja pueden tardar en verse (las escrituras de la app la invalidan al instante).
- Cada consulta de pedidos lee la hoja completa (por lotes); adecuado hasta algunas decenas de miles de filas.
- Ediciones manuales en la hoja saltan las validaciones; `updateRow_` detecta filas movidas y rechaza la operación.

### Riesgos de usar Google Sheets
Sin transacciones ni integridad referencial; un error a mitad de una operación de varias escrituras puede dejar datos parciales (se ordenan las escrituras para minimizar el impacto). Todas las escrituras se serializan con un bloqueo global, lo que limita la concurrencia. Cuotas de Apps Script (tiempo de ejecución de 6 min, llamadas diarias).

### Recomendaciones para producción
Poner `modo_produccion=SI` e `incluir_demo_en_reportes=NO` y ejecutar `purgeDemoData`; restringir el acceso a la hoja y al proyecto; revisar la auditoría con regularidad. Si se superan ~20 000 pedidos, más de ~10 usuarios escribiendo a la vez, o se necesita integridad transaccional, migrar a **PostgreSQL** (p. ej., Cloud SQL) con una API propia; el modelo actual con identificadores UUID facilita esa migración.

---

## Configuración privada (qué poner y dónde)

Este repositorio **no contiene datos confidenciales**. Para usar el proyecto con su propia cuenta debe completar:

| Dato | Dónde ponerlo | Cómo obtenerlo |
|---|---|---|
| ID de la hoja de cálculo | `src/Config.gs` → `CONFIG.SPREADSHEET_ID` (hoy `TU_ID_DE_HOJA_DE_CALCULO`) | URL de su hoja de Google Sheets: la parte entre `/d/` y `/edit` |
| ID del proyecto de Apps Script | `.clasp.json` (copie `.clasp.json.example`; el archivo real está en `.gitignore`) | `clasp create` lo genera solo, o *Configuración del proyecto* en el editor de Apps Script |
| Correo del administrador | No se escribe en el código | `setupDatabase()` registra automáticamente a quien lo ejecuta |
| Usuarios y roles | Hoja `Usuarios` / módulo *Usuarios y permisos* | Los registra el administrador desde la aplicación |

**Reglas:** nunca suba al repositorio el ID real de su hoja, `.clasp.json`, `.clasprc.json`, correos reales ni datos de clientes. Antes de `clasp push` ponga su ID real en `Config.gs` y no lo confirme (commit) en git.

La demo (`demo/`) no usa ningún dato real: funciona con datos ficticios y servicios de Google simulados.
