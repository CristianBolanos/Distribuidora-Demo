# SISTEMA DE GESTIÓN DE PEDIDOS Y DESPACHO CON GOOGLE SHEETS

ruta para crear la base de datos: una hoja de Google Sheets propia (ver README.md, paso 1 de instalación; el ID de la hoja se configura en `src/Config.gs`).

## 1. Rol y objetivo del proyecto

Actúa como un equipo de desarrollo de software compuesto por un arquitecto de software, desarrollador full-stack experto en Google Apps Script, especialista en Google Sheets API, diseñador UX/UI y analista de procesos logísticos.

Tu objetivo es diseñar y construir una aplicación web completa, funcional, segura, responsive y profesional para gestionar pedidos, preparación de mercancía, asignación de rutas, despacho y seguimiento de entregas.

La aplicación debe utilizar **Google Sheets como almacenamiento de datos y Google Apps Script como backend**. La interfaz debe ser independiente de la estructura interna de las hojas de cálculo, de forma que los usuarios puedan realizar las operaciones desde un panel web sin tener que editar directamente la base de datos.

No construyas solamente una maqueta visual ni un prototipo con información ficticia. Implementa las operaciones CRUD necesarias, las validaciones, las reglas de negocio, la persistencia de los datos y la gestión de errores.

El sistema debe estar preparado para utilizarse como una herramienta interna de una pequeña o mediana empresa de distribución.

## 2. Arquitectura tecnológica obligatoria

Utiliza las siguientes tecnologías:

- **Base de datos:** Google Sheets.
- **Backend:** Google Apps Script con JavaScript moderno compatible con su entorno.
- **Frontend:** HTML5, CSS3 y JavaScript moderno.
- **Componentes visuales:** Chart.js para los gráficos, cuando sea necesario.
- **Iconografía:** Lucide Icons o una alternativa compatible.
- **Generación de informes:** CSV y PDF.
- **Despliegue:** aplicación web publicada mediante Google Apps Script.
- **Idioma:** español.
- **Zona horaria:** America/Bogota.
- **Formato de fecha:** DD/MM/AAAA.
- **Moneda:** peso colombiano (COP), cuando se muestren valores económicos.

Utiliza Google Sheets mediante las funciones de servidor de Apps Script, como `SpreadsheetApp`, y `LockService` cuando sea necesario proteger operaciones concurrentes.

No expongas identificadores sensibles, credenciales privadas ni funciones de escritura de datos directamente en el navegador. El frontend debe comunicarse con el backend a través de funciones controladas de Apps Script.

Organiza el código en módulos lógicos y evita concentrar toda la lógica en un único archivo.

## 3. Diseño visual y experiencia de usuario

Construye una interfaz administrativa moderna, minimalista, profesional y fácil de utilizar.

### Identidad visual

Utiliza esta paleta de colores:

- Fondo principal: `#F8FAFC`.
- Fondo secundario: `#F1F5F9`.
- Tarjetas y superficies: `#FFFFFF`.
- Texto principal: `#111827`.
- Texto secundario: `#475569`.
- Bordes: `#E2E8F0`.
- Color principal: `#4F46E5`.
- Color de éxito: `#16A34A`.
- Color de advertencia: `#D97706`.
- Color de error: `#DC2626`.

Usa una tipografía legible, preferiblemente Inter. Mantén una jerarquía visual consistente, espacios equilibrados, bordes discretos, sombras sutiles y componentes reutilizables.

### Diseño responsive

La aplicación debe adaptarse a:

- Computadores de escritorio.
- Portátiles.
- Tablets.
- Teléfonos móviles.

En escritorio, utiliza una barra lateral de navegación, un encabezado con las acciones principales y un área de contenido organizada mediante tablas, formularios y tarjetas.

En dispositivos móviles, adapta las tablas mediante desplazamiento controlado o vistas de tarjetas, y convierte la navegación lateral en un menú compacto.

Incluye estados visuales para carga, errores, operaciones exitosas, ausencia de resultados y confirmaciones antes de acciones importantes.

Evita recargas completas innecesarias de la página después de cada operación.

## 4. Módulos principales

Construye los siguientes módulos funcionales.

### Módulo A. Dashboard administrativo

La página inicial debe presentar un resumen visual del estado de la operación logística.

#### Indicadores principales

Incluye tarjetas para mostrar:

1. Total de pedidos registrados.
2. Pedidos pendientes.
3. Pedidos en preparación.
4. Pedidos despachados.
5. Pedidos entregados.
6. Pedidos que presentan retrasos.
7. Pedidos creados durante el día.
8. Pedidos entregados durante el día.

Los indicadores deben calcularse con datos reales de Google Sheets y actualizarse cuando existan cambios, respetando el intervalo de actualización establecido.

No incluyas cifras ficticias como si fueran datos reales.

#### Gráficos

Implementa gráficos para mostrar:

- Pedidos por estado.
- Evolución diaria de pedidos.
- Pedidos despachados y entregados por período.
- Rendimiento de las rutas.
- Cantidad de pedidos por responsable.

Permite seleccionar períodos como hoy, últimos siete días, últimos treinta días y rango personalizado.

Aclara la definición de cada indicador y evita contabilizar una misma orden varias veces en los totales.

#### Alertas operativas

Muestra alertas para:

- Pedidos pendientes durante demasiado tiempo.
- Pedidos en preparación que superan el tiempo esperado.
- Pedidos despachados cuya fecha estimada de entrega ha vencido.
- Pedidos sin ruta asignada.
- Pedidos sin responsable asignado.

Los umbrales de tiempo deben ser configurables. Una alerta no debe modificar automáticamente el estado de un pedido.

### Módulo B. Registro y gestión de pedidos

Permite registrar, consultar, actualizar y administrar pedidos.

#### Formulario de creación

Incluye estos campos:

- Número de pedido, generado automáticamente.
- Fecha y hora de creación.
- Nombre o razón social del cliente.
- Documento o identificación del cliente, opcional.
- Teléfono de contacto.
- Correo electrónico, opcional.
- Dirección de entrega.
- Ciudad o municipio.
- Barrio o zona.
- Fecha estimada de entrega.
- Prioridad: baja, normal, alta o urgente.
- Observaciones.
- Responsable asignado.
- Ruta asignada, opcional inicialmente.
- Estado del pedido.
- Productos solicitados y sus cantidades.
- Observaciones internas para operaciones logísticas.

Cada pedido puede contener varios productos.

Permite agregar, editar y eliminar líneas de productos antes de confirmar el registro. Valida que las cantidades sean numéricas y mayores que cero.

Si el sistema incluye precios, calcula subtotales y totales automáticamente. No supongas que un precio comercial equivale al costo logístico.

#### Acciones disponibles

- Crear pedido.
- Consultar detalles.
- Editar información.
- Duplicar un pedido, si el usuario tiene permisos.
- Buscar por número de pedido.
- Eliminar o anular pedidos conforme a las reglas de negocio.
- Imprimir una orden de preparación.
- Consultar el historial de modificaciones.

Los pedidos que ya tengan movimientos logísticos no deben borrarse físicamente sin controles. Prefiere la anulación lógica para conservar la trazabilidad.

El número de pedido debe ser único y no depender del número de fila de Google Sheets.

### Módulo C. Listado y búsqueda de pedidos

Diseña una tabla administrativa que incluya:

- Número de pedido.
- Fecha de creación.
- Cliente.
- Dirección o zona.
- Cantidad de referencias o unidades.
- Estado actual.
- Prioridad.
- Ruta.
- Responsable.
- Fecha estimada de entrega.
- Última actualización.
- Acciones disponibles.

Incorpora las siguientes funciones:

- Búsqueda por número de pedido.
- Búsqueda por cliente.
- Filtro por estado.
- Filtro por rango de fechas.
- Filtro por ruta.
- Filtro por responsable.
- Filtro por prioridad.
- Filtro por pedidos retrasados.
- Ordenamiento por columnas.
- Paginación.
- Restablecimiento de filtros.

Los filtros deben poder combinarse. Deben funcionar con los registros reales de Google Sheets, sin limitar la aplicación a los primeros datos de prueba.

Muestra mensajes claros cuando no existan resultados.

### Módulo D. Preparación de pedidos

Desarrolla un flujo de preparación para el personal responsable de alistar la mercancía.

Cada orden debe mostrar:

- Número del pedido.
- Cliente.
- Productos solicitados.
- Cantidades.
- Observaciones relevantes.
- Fecha estimada de entrega.
- Responsable de preparación.
- Estado actual.

Permite revisar los productos y registrar el resultado del alistamiento.

Distingue entre las acciones de comenzar la preparación y finalizarla. Si un pedido está completamente preparado, permite avanzar al proceso de despacho.

No permitas marcar como despachado un pedido que todavía no haya completado el proceso requerido de preparación, salvo que un administrador autorizado aplique una excepción registrada y justificada.

### Módulo E. Estados y flujo de trabajo

Implementa inicialmente los cuatro estados solicitados:

1. **Pendiente:** el pedido ha sido registrado y aún no ha comenzado su preparación.
2. **En preparación:** el pedido está siendo alistado.
3. **Despachado:** el pedido salió a distribución.
4. **Entregado:** el pedido fue recibido en su destino.

Establece el siguiente flujo normal:

Pendiente → En preparación → Despachado → Entregado.

Controla las transiciones desde el servidor, no solo desde los botones del frontend.

Registra automáticamente:

- Estado anterior.
- Estado nuevo.
- Fecha y hora del cambio.
- Usuario que realizó la acción.
- Observación del movimiento, cuando corresponda.

Si un pedido requiere corrección o devolución a un estado anterior, exige los permisos adecuados y una justificación. Registra la excepción en el historial.

No marques automáticamente como entregado un pedido únicamente por haber vencido su fecha estimada.

### Módulo F. Gestión de rutas

Construye un módulo para administrar las rutas de distribución.

#### Registro de rutas

Cada ruta debe contar con:

- Identificador único.
- Nombre o código de ruta.
- Descripción.
- Ciudad o zona atendida.
- Responsable de distribución.
- Fecha de operación.
- Vehículo o identificación del medio de transporte, opcional.
- Capacidad operativa, opcional.
- Estado de la ruta: planificada, activa, finalizada o cancelada.
- Observaciones.

#### Funcionalidades

- Crear rutas.
- Editar rutas.
- Consultar rutas.
- Asignar pedidos a una ruta.
- Retirar pedidos de una ruta bajo las condiciones permitidas.
- Consultar pedidos asociados.
- Ver las cantidades y el estado de cada pedido.
- Consultar los pedidos pendientes de despacho por ruta.
- Finalizar la jornada de una ruta sin cambiar indebidamente los estados de sus pedidos.

Evita asignar pedidos a rutas canceladas o finalizadas.

La primera versión debe permitir asignar pedidos manualmente. No afirmes que existe optimización automática de recorridos por geolocalización si no se ha implementado una integración real de mapas y cálculo de rutas.

### Módulo G. Responsables y usuarios

Implementa un registro administrativo de usuarios y responsables.

Los perfiles iniciales serán:

**Administrador**
- Acceso a todos los módulos.
- Gestión de usuarios.
- Configuración general.
- Administración de rutas.
- Acceso a reportes.
- Autorización de excepciones.
- Consulta del historial de auditoría.

**Operador**
- Registro de pedidos.
- Consulta de pedidos.
- Actualización de información permitida.
- Consulta de estados y observaciones.

**Responsable de bodega**
- Consulta de pedidos pendientes.
- Gestión de preparación.
- Actualización de las operaciones de alistamiento.

**Despachador**
- Asignación de rutas.
- Gestión del despacho.
- Consulta de pedidos preparados.
- Seguimiento de entregas.

**Consulta**
- Acceso de solo lectura a los módulos autorizados.

Aplica el principio de mínimo privilegio.

Los permisos deben comprobarse en el backend antes de ejecutar cada operación. Ocultar un botón en la interfaz no constituye un mecanismo de autorización suficiente.

No inventes un sistema de autenticación seguro basado únicamente en comparar un nombre de usuario o una contraseña almacenada en texto plano en una hoja.

Selecciona una estrategia de autenticación compatible con el despliegue de Apps Script, documenta las restricciones de `Session.getActiveUser().getEmail()` y verifica qué identidad está disponible realmente en el contexto de ejecución.

Para una aplicación interna, prioriza el acceso restringido mediante cuentas de Google autorizadas. Si el contexto de despliegue no permite verificar la identidad, bloquea las operaciones protegidas hasta disponer de un mecanismo de autenticación confiable.

### Módulo H. Seguimiento de entregas

Permite consultar el historial logístico de un pedido.

Muestra una línea de tiempo con:

- Pedido registrado.
- Preparación iniciada.
- Preparación finalizada.
- Pedido despachado.
- Entrega registrada.

Cada evento debe incluir fecha, hora, usuario responsable y observaciones disponibles.

Permite registrar la confirmación de entrega con:

- Fecha y hora reales.
- Persona que recibe, opcional.
- Observación del repartidor, opcional.
- Confirmación de entrega realizada.
- Evidencia de entrega, opcional para una versión posterior.

No inventes firmas digitales, fotografías ni confirmaciones de terceros si no se han implementado.

### Módulo I. Reportes y exportación

Implementa un apartado de reportes operativos.

Incluye informes de:

- Pedidos registrados por período.
- Pedidos por estado.
- Pedidos despachados.
- Pedidos entregados.
- Pedidos pendientes.
- Pedidos retrasados.
- Pedidos por ruta.
- Pedidos por responsable.
- Historial de operaciones.
- Rendimiento de entregas.

Añade filtros por fecha, estado, ruta, responsable y prioridad.

#### Exportación CSV

Permite exportar los registros que coincidan con los filtros aplicados.

El archivo debe:

- Utilizar encabezados descriptivos en español.
- Mantener fechas y valores de manera consistente.
- Gestionar correctamente tildes y caracteres especiales.
- Utilizar una codificación compatible con hojas de cálculo.
- Protegerse contra la interpretación accidental de contenido como fórmulas si los datos comienzan con caracteres peligrosos como `=`, `+`, `-` o `@`.
- Respetar los permisos del usuario que realiza la exportación.

#### Exportación PDF

Genera informes con:

- Título del informe.
- Fecha de generación.
- Período consultado.
- Filtros aplicados.
- Datos correspondientes al informe.
- Totales relevantes.
- Numeración de páginas cuando sea viable.

Diseña los documentos para su lectura en pantalla e impresión. No generes archivos PDF que contengan únicamente la captura visual del dashboard si se requiere consultar los datos tabulares.

Los informes deben crearse a partir de los datos autorizados del servidor, no de información enviada libremente por el navegador.

## 5. Estructura de Google Sheets

Crea automáticamente la estructura de la base de datos con una función de inicialización, por ejemplo, `setupDatabase()`.

La inicialización debe comprobar si existen las hojas y encabezados requeridos. No debe borrar datos existentes cuando se ejecuta nuevamente.

Utiliza identificadores únicos para las relaciones entre registros. Nunca dependas exclusivamente de los números de fila, porque las filas pueden cambiar de posición.

Crea las siguientes hojas.

### Hoja: Pedidos

Columnas mínimas:

- pedido_id
- numero_pedido
- fecha_creacion
- cliente_nombre
- cliente_documento
- cliente_telefono
- cliente_correo
- direccion_entrega
- ciudad
- zona
- fecha_estimada_entrega
- fecha_despacho
- fecha_entrega
- prioridad
- estado
- ruta_id
- responsable_id
- observaciones
- fecha_actualizacion
- creado_por
- actualizado_por
- anulado

### Hoja: DetallePedidos

- detalle_id
- pedido_id
- producto_id
- nombre_producto
- sku
- cantidad
- precio_unitario, opcional
- subtotal, opcional
- observaciones

Conserva una copia del nombre y del SKU utilizados al registrar la línea del pedido para mantener el historial si el catálogo cambia posteriormente.

### Hoja: Productos

- producto_id
- sku
- nombre
- descripcion
- unidad_medida
- activo
- fecha_creacion
- fecha_actualizacion

No implementes un inventario con existencias y movimientos si no se han desarrollado las reglas necesarias para evitar inconsistencias. Si añades inventario, crea un módulo explícito con movimientos identificables y validaciones.

### Hoja: Rutas

- ruta_id
- codigo_ruta
- nombre_ruta
- zona
- fecha_operacion
- responsable_id
- vehiculo
- capacidad
- estado
- observaciones
- fecha_creacion
- fecha_actualizacion

### Hoja: Usuarios

- usuario_id
- correo
- nombre
- rol
- activo
- fecha_creacion

No almacenes contraseñas en texto plano.

### Hoja: Historial

- historial_id
- entidad
- entidad_id
- accion
- valor_anterior
- valor_nuevo
- fecha_evento
- usuario
- observacion

Utiliza esta hoja para auditar cambios relevantes en pedidos, rutas y registros administrativos.

### Hoja: Configuracion

Permite almacenar parámetros como:

- Nombre de la empresa.
- Zona horaria.
- Prefijo de pedidos.
- Tiempo límite para alertas de preparación.
- Tiempo límite para alertas de entrega.
- Opciones generales de la aplicación.

La estructura final puede ampliarse si es necesario, pero debes justificar cada hoja adicional y evitar duplicar información innecesariamente.

## 6. Reglas de integridad y consistencia de datos

Implementa las siguientes reglas:

1. Cada pedido debe tener un identificador único e inmutable.
2. Cada pedido debe tener un número de pedido único y legible.
3. Las relaciones deben basarse en identificadores estables.
4. Los pedidos deben contener al menos una línea de detalle para poder confirmarse.
5. Las cantidades deben ser válidas.
6. Los registros deben validarse en el backend aunque el frontend ya los haya validado.
7. Los pedidos entregados no pueden continuar cambiando de estado por las acciones ordinarias.
8. Las excepciones deben requerir autorización y quedar auditadas.
9. Las operaciones críticas deben evitar duplicaciones por dobles clics o solicitudes repetidas.
10. Las operaciones de escritura deben manejar conflictos cuando varios usuarios trabajan simultáneamente.
11. Las fechas deben almacenarse y compararse consistentemente, considerando la zona horaria de Colombia.
12. Las consultas deben gestionar correctamente hojas vacías y registros incompletos.
13. La anulación de un pedido debe conservar su historial.
14. El sistema debe informar de forma clara cuando una operación no se haya completado.

Usa operaciones por lotes para leer y escribir datos cuando sea posible. Evita consultar individualmente cada celda en ciclos innecesarios.

Utiliza `LockService` en las operaciones que puedan producir identificadores duplicados, carreras de escritura u otras condiciones de concurrencia.

## 7. Seguridad y protección de información

La aplicación manejará información de clientes y operación logística. Por tanto:

- Restringe el acceso a los usuarios autorizados.
- Verifica permisos en el servidor en cada operación protegida.
- Valida y normaliza todos los datos recibidos.
- Evita ejecutar código generado a partir de entradas de usuarios.
- Escapa correctamente contenido dinámico en HTML.
- No expongas credenciales privadas en archivos HTML o JavaScript del navegador.
- No permitas que cualquier usuario modifique cualquier hoja mediante parámetros enviados desde el cliente.
- Limita los campos que puede actualizar cada rol.
- Mantén un historial de las operaciones sensibles.
- Gestiona errores sin mostrar información interna innecesaria.
- Evita registrar innecesariamente datos personales en los mensajes técnicos.
- Documenta quién puede acceder a la aplicación, al proyecto de Apps Script y a la hoja de cálculo.

No publiques una aplicación administrativa con acceso anónimo a las operaciones de lectura y escritura.

La configuración de despliegue debe ser coherente con el mecanismo de autenticación escogido. No supongas que una comprobación del frontend puede reemplazar la autenticación y autorización del backend.

## 8. Rendimiento y límites de Google Sheets

Diseña el sistema considerando las cuotas y limitaciones de Apps Script y Google Sheets.

Implementa:

- Lecturas y escrituras por lotes.
- Consultas eficientes.
- Paginación de resultados en la interfaz.
- Actualización selectiva de los componentes.
- Caché para información de referencia cuando sea apropiado.
- Invalidación de caché cuando cambien los datos relacionados.
- Manejo de errores y reintentos limitados cuando sean seguros.
- Prevención de escrituras duplicadas.
- Mensajes amigables cuando se alcancen límites de uso.

Evita cargar repetidamente todos los datos de cada hoja para cada interacción.

No afirmes que Google Sheets proporciona las transacciones, índices o concurrencia de una base de datos relacional. Si el volumen de pedidos crece considerablemente o hay múltiples usuarios concurrentes con operaciones críticas, documenta los riesgos y propone una migración a PostgreSQL o una base de datos equivalente.

## 9. Estructura y organización del código

Organiza el proyecto de la siguiente manera, adaptando los nombres a las convenciones de Apps Script:

- `Code.gs`: entrada principal del backend y enrutamiento de la aplicación.
- `Config.gs`: configuración y constantes.
- `Database.gs`: acceso a Google Sheets.
- `Pedidos.gs`: operaciones de pedidos.
- `Productos.gs`: catálogo de productos.
- `Rutas.gs`: administración de rutas.
- `Usuarios.gs`: gestión de permisos.
- `Historial.gs`: auditoría de operaciones.
- `Reportes.gs`: generación de informes.
- `Validaciones.gs`: validaciones y reglas de negocio.
- `Index.html`: estructura principal del frontend.
- `Styles.html`: estilos.
- `Scripts.html`: lógica del frontend.
- Archivos parciales adicionales para componentes compartidos, si resultan útiles.

Debido a que Apps Script tiene un entorno de ejecución diferente al de Node.js, utiliza exclusivamente dependencias compatibles con la arquitectura elegida.

Implementa una función principal `doGet()` para servir la aplicación web y separa claramente las funciones públicas invocables desde el frontend de las funciones internas del backend.

Usa `google.script.run` con sus manejadores de éxito y error para comunicar el frontend con Apps Script.

No entregues funciones ficticias, botones sin implementar o comentarios del tipo «aquí iría el código». Todas las acciones esenciales deben tener una implementación funcional.

## 10. Manejo de errores y experiencia operacional

Implementa mensajes para casos como:

- No se puede conectar con el backend.
- La hoja de datos no existe o tiene una estructura incorrecta.
- No se encuentra el pedido.
- Los datos enviados no son válidos.
- El usuario no tiene permisos.
- El estado actual no permite la operación.
- El pedido ya fue modificado por otro proceso.
- Se produjo un error al generar un informe.
- Se alcanzó un límite temporal de Apps Script.

Muestra mensajes comprensibles en la interfaz y conserva detalles técnicos únicamente en registros de depuración controlados.

Antes de eliminar, anular o ejecutar acciones irreversibles, muestra un diálogo de confirmación que explique claramente la acción.

Incluye indicadores de carga y deshabilita temporalmente los botones durante operaciones para prevenir solicitudes duplicadas.

## 11. Datos de demostración

Proporciona una función independiente, por ejemplo, `seedDemoData()`, para crear datos de prueba.

Incluye clientes, productos, rutas, usuarios de prueba y pedidos en diferentes estados para comprobar todas las vistas del dashboard.

Los datos deben identificarse claramente como demostración.

La función debe negarse a ejecutarse sobre datos de producción sin una confirmación explícita y no debe sobrescribir registros existentes.

No utilices estos datos para los informes reales después de desplegar el sistema.

## 12. Criterios de aceptación y pruebas

Antes de considerar terminada la aplicación, comprueba que:

1. Se puede inicializar la base de datos sin duplicar hojas o destruir información.
2. Se puede crear un pedido con varios productos.
3. El pedido queda guardado y sigue disponible después de recargar la aplicación.
4. Se puede localizar por número, cliente, estado y fechas.
5. Los filtros pueden utilizarse simultáneamente.
6. Se puede asignar una ruta y un responsable.
7. Se puede avanzar por el flujo de preparación, despacho y entrega.
8. Las transiciones no autorizadas son rechazadas en el servidor.
9. Cada cambio de estado queda registrado en el historial.
10. Las métricas del dashboard reflejan los datos reales.
11. Las alertas responden a condiciones configuradas.
12. Los reportes CSV se descargan con encabezados y caracteres correctos.
13. Los PDF se generan con contenido legible y filtros consistentes.
14. Un usuario sin permisos no puede ejecutar operaciones administrativas.
15. Dos solicitudes concurrentes no generan identificadores duplicados ni inconsistencias previsibles.
16. La interfaz funciona en escritorio y móvil.
17. La aplicación maneja hojas vacías, errores y ausencia de resultados.
18. No hay botones esenciales sin funcionalidad.
19. No hay credenciales privadas expuestas al cliente.
20. Las instrucciones de instalación y despliegue permiten que otra persona configure el proyecto.

Incluye pruebas de las reglas de negocio más importantes y una lista explícita de las limitaciones que no puedan verificarse automáticamente.

## 13. Entregables obligatorios

Entrega el proyecto completo en este orden:

**Entregable 1. Arquitectura**
- Descripción de la arquitectura.
- Flujo de comunicación entre frontend, Apps Script y Google Sheets.
- Modelo de datos y relaciones.

**Entregable 2. Estructura de archivos**
- Lista de todos los archivos necesarios.
- Responsabilidad de cada archivo.
- Dependencias utilizadas.

**Entregable 3. Código completo**
- Código completo del backend.
- Código completo del frontend.
- Estilos.
- Validaciones.
- Generación de informes.
- Control de acceso.
- Auditoría.
- Inicialización de Google Sheets.
- Datos de prueba independientes.

**Entregable 4. Instalación**
- Crear la hoja de cálculo.
- Crear el proyecto de Apps Script.
- Configurar el identificador de la hoja si corresponde.
- Crear los archivos requeridos.
- Ejecutar la función de inicialización.
- Autorizar los permisos solicitados.
- Configurar usuarios autorizados.
- Publicar la aplicación web.
- Configurar el acceso restringido.
- Probar el sistema.

**Entregable 5. Manual de usuario**
- Registrar pedidos.
- Preparar pedidos.
- Asignar rutas.
- Despachar pedidos.
- Registrar entregas.
- Consultar el dashboard.
- Descargar informes.
- Administrar usuarios y permisos.

**Entregable 6. Validación final**
- Lista de pruebas ejecutadas.
- Problemas detectados.
- Limitaciones conocidas.
- Riesgos asociados al uso de Sheets.
- Recomendaciones para producción y futura migración de base de datos.

## 14. Forma de trabajo

Construye el sistema por fases, manteniendo una arquitectura coherente entre todos los archivos.

Fase 1: diseño de la arquitectura y estructura de las hojas.

Fase 2: inicialización de la base de datos, validaciones y operaciones del backend.

Fase 3: gestión de pedidos y detalles.

Fase 4: preparación, estados, rutas y responsables.

Fase 5: dashboard, filtros y alertas.

Fase 6: reportes CSV/PDF, control de acceso y auditoría.

Fase 7: pruebas integrales, documentación y despliegue.

Primero presenta una breve descripción de la arquitectura y la estructura de datos elegidas. Después implementa cada fase sin perder la coherencia con las anteriores.

Si la plataforma tiene un límite de contexto o de longitud de respuesta, divide la implementación en entregas numeradas e indica con precisión qué archivos se han completado y cuáles faltan. No reemplaces el código faltante por pseudocódigo ni declares terminado el proyecto antes de completar y comprobar las funciones esenciales.

Si encuentras una limitación real de Google Apps Script o Google Sheets, explica el problema y utiliza una alternativa compatible, segura y documentada.

**Resultado esperado:** una aplicación web administrativa operativa para registrar pedidos, controlar la preparación de mercancía, asignar rutas y responsables, registrar despachos y entregas, consultar indicadores y exportar informes, con Google Sheets como almacenamiento y Google Apps Script como backend.