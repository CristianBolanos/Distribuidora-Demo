// build.mjs — Genera demo/index.html (archivo único) a partir del código real de src/.
// Uso: node demo/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');
const read = (f) => readFileSync(f, 'utf8');

const GS = ['Config', 'Validaciones', 'Database', 'Code', 'Usuarios', 'Historial', 'Productos', 'Pedidos', 'Flujo', 'Rutas', 'Reportes', 'Setup', 'Tests'];
const backend = GS.map((f) => `// ===== src/${f}.gs =====\n` + read(join(src, f + '.gs'))).join('\n');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script'); // evita cerrar la etiqueta <script> antes de tiempo

const demoCss = `<style>
.demo-bar{position:fixed;left:12px;bottom:12px;z-index:150;display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:calc(100vw - 24px);
  background:#111827;color:#fff;padding:8px 10px;border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.25);font-size:12px}
.demo-bar select{min-height:28px;padding:2px 6px;font-size:12px;width:auto;max-width:230px;color:#111827}
.demo-bar button{border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit}
.demo-bar button:hover{background:rgba(255,255,255,.12)}
.demo-tag{background:#4F46E5;border-radius:6px;padding:2px 6px;font-weight:700;letter-spacing:.04em}
@media (max-width:768px){.demo-bar .demo-txt{display:none}.demo-bar{left:8px;right:auto;bottom:8px;padding:6px 8px;flex-wrap:nowrap}.demo-bar select{max-width:150px}}
</style>`;

let html = read(join(src, 'Index.html'));
html = html.replace(/<\?!=\s*include_\('(\w+)'\);?\s*\?>/g, (_, name) => read(join(src, name + '.html')));
html = html.replace('<base target="_top">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Gestión de Pedidos y Despacho · Demo</title>\n' +
  '  <meta name="description" content="Demo de un sistema de gestión de pedidos, preparación, rutas y despacho construido con Google Apps Script y Google Sheets.">');
html = html.replace('</head>', demoCss + '\n</head>');

// El backend y el simulador deben cargarse antes que los scripts del frontend.
const backendBlock = `<script>\n${safe(read(join(here, 'shim.js')))}\n</script>\n<script>\n${safe(backend)}\n__demo.boot();\n</script>\n`;
const firstFrontScript = html.indexOf('<script>\n\'use strict\';');
if (firstFrontScript < 0) throw new Error('No se encontró el inicio de los scripts del frontend.');
html = html.slice(0, firstFrontScript) + backendBlock + html.slice(firstFrontScript);
const bodyEnd = html.lastIndexOf('</body>'); // el último: el código de informes también contiene '</body>'
html = html.slice(0, bodyEnd) + `<script>\n${safe(read(join(here, 'demo-ui.js')))}\n</script>\n` + html.slice(bodyEnd);

if (/<\?/.test(html)) throw new Error('Quedaron etiquetas de plantilla sin procesar.');
writeFileSync(join(here, 'index.html'), html);
console.log('demo/index.html generado (' + Math.round(html.length / 1024) + ' KB)');
