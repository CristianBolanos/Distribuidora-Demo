# Demo pública (sin cuenta de Google)

`index.html` es una versión de la aplicación que funciona en cualquier navegador, sin Google Apps Script ni Google Sheets. Sirve para mostrar el proyecto en un portafolio.

**No es una maqueta.** Ejecuta el **mismo código** del backend (`src/*.gs`) y del frontend (`src/*.html`). Solo se reemplazan los servicios de Google por simulaciones en el navegador (`shim.js`):

| Servicio de Google | En la demo |
|---|---|
| SpreadsheetApp (Google Sheets) | Hojas en memoria, guardadas en `localStorage` |
| Session (cuenta del usuario) | Selector "Ver como" para cambiar de rol |
| LockService, CacheService, PropertiesService | Equivalentes en memoria |
| google.script.run | Llama al backend local con latencia simulada |
| PDF de Apps Script | El informe se abre en el diálogo de impresión (Guardar como PDF) |

Los datos son ficticios (`seedDemoData()`) y viven solo en el navegador de cada visitante. Nada se envía a ningún servidor. "Reiniciar datos" vuelve al estado inicial.

## Regenerar la demo

Cada vez que cambie algo en `src/`, ejecute desde la raíz del proyecto:

```bash
node demo/build.mjs
```

## Publicar en GitHub Pages

1. Cree un repositorio en GitHub (por ejemplo, `gestion-pedidos-despacho`) y suba el proyecto. **No suba datos reales**; el `SPREADSHEET_ID` de `src/Config.gs` puede reemplazarlo por `'TU_ID_DE_HOJA'`.
2. En el repositorio: **Settings → Pages**.
3. En *Build and deployment* elija **Deploy from a branch**, rama `main`, carpeta **`/ (root)`**, y guarde.
4. En uno o dos minutos la demo quedará en:
   `https://<su-usuario>.github.io/<repositorio>/demo/`

Alternativas sin GitHub: arrastre la carpeta `demo/` a <https://app.netlify.com/drop>, o abra `demo/index.html` directamente en el navegador.

## Qué probar en la demo

- **Dashboard:** indicadores, gráficos por período y alertas.
- **Pedidos:** crear un pedido con varios productos, filtros combinados, orden por columnas, detalle con seguimiento e historial.
- **Flujo completo:** Preparación → Despacho y entregas → registrar la entrega.
- **Rutas:** asignar pedidos, activar y finalizar jornada.
- **Reportes:** vista previa, CSV y PDF.
- **Permisos:** con "Ver como" elija *Consulta* u *Operador* y compruebe qué opciones desaparecen y qué operaciones rechaza el servidor.
