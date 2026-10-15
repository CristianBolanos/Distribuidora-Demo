/**
 * Formato.gs — Presentación visual de la hoja de cálculo (no afecta los datos).
 *  - Encabezados con color, filas alternadas, anchos de columna, colores por estado/prioridad.
 *  - Hoja "Resumen": panel tipo dashboard con indicadores y gráficos que se actualizan solos (fórmulas).
 *  - Aviso al editar a mano las hojas de datos (solo advertencia; la aplicación sigue escribiendo).
 * Ejecutar formatSpreadsheet() desde el editor después de setupDatabase(). Se puede repetir sin riesgo.
 */

const THEME = {
  primary: '#4F46E5', primaryDark: '#3730A3', primarySoft: '#EEF2FF',
  text: '#111827', text2: '#475569', border: '#E2E8F0', band: '#F8FAFC', white: '#FFFFFF',
  ok: '#16A34A', okSoft: '#DCFCE7', warn: '#D97706', warnSoft: '#FEF3C7',
  err: '#DC2626', errSoft: '#FEE2E2', info: '#0284C7', infoSoft: '#E0F2FE', slateSoft: '#F1F5F9'
};

const SHEET_STYLE = {
  Pedidos: { tab: '#4F46E5', freezeCols: 2 },
  DetallePedidos: { tab: '#6366F1', freezeCols: 0 },
  Productos: { tab: '#0EA5E9', freezeCols: 0 },
  Rutas: { tab: '#16A34A', freezeCols: 0 },
  Usuarios: { tab: '#D97706', freezeCols: 0 },
  Historial: { tab: '#64748B', freezeCols: 0 },
  Configuracion: { tab: '#94A3B8', freezeCols: 0 }
};

function formatSpreadsheet() {
  assertOwner_();
  const ss = ss_();
  ss.setSpreadsheetTimeZone(CONFIG.TZ);
  Object.keys(SCHEMA).forEach(function (name) { formatDataSheet_(name); });
  buildResumen_();
  // Orden de pestañas: Resumen primero, luego las hojas de datos.
  ['Resumen'].concat(Object.keys(SCHEMA)).forEach(function (n, i) {
    const sh = ss.getSheetByName(n);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
  });
  ss.setActiveSheet(ss.getSheetByName('Resumen'));
  console.log('Formato aplicado.');
  return 'Formato aplicado a ' + (Object.keys(SCHEMA).length + 1) + ' hojas.';
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Letra de la columna de un campo según el encabezado real de la hoja. */
function colOf_(name, field) { return colLetter_(headerInfo_(name).map[field] + 1); }

function columnWidth_(field) {
  if (/_id$/.test(field) || field === 'historial_id' || field === 'detalle_id') return 110;
  if (/^fecha_/.test(field)) return 150;
  if (/observ|descripcion|direccion|valor_/.test(field)) return 260;
  if (/nombre|cliente_nombre|correo|zona|ciudad/.test(field)) return 200;
  if (/^(version|es_demo|anulado|activo|capacidad|cantidad|cantidad_preparada)$/.test(field)) return 90;
  return 130;
}

function formatDataSheet_(name) {
  const info = headerInfo_(name);
  const sh = info.sh;
  const width = info.width;
  const last = colLetter_(width);
  const style = SHEET_STYLE[name] || { tab: THEME.primary, freezeCols: 0 };

  sh.setTabColor(style.tab);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(style.freezeCols);
  sh.getRange('A:' + last).setFontFamily('Inter').setFontSize(10).setFontColor(THEME.text)
    .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  const header = sh.getRange(1, 1, 1, width);
  header.setBackground(style.tab).setFontColor(THEME.white).setFontWeight('bold')
    .setHorizontalAlignment('center').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sh.setRowHeight(1, 34);

  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange('A1:' + last).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(style.tab).setFirstRowColor(THEME.white).setSecondRowColor(THEME.band);

  SCHEMA[name].forEach(function (f) {
    const c = info.map[f] + 1;
    sh.setColumnWidth(c, columnWidth_(f));
    if (/_id$/.test(f) || f === 'version' || f === 'es_demo') sh.getRange(2, c, sh.getMaxRows() - 1, 1).setFontColor('#94A3B8');
    if (/^(cantidad|cantidad_preparada|precio_unitario|subtotal|precio_referencia|capacidad|version)$/.test(f)) {
      sh.getRange(2, c, sh.getMaxRows() - 1, 1).setHorizontalAlignment('right');
    }
  });

  const rules = [];
  const col = function (f) { return colOf_(name, f); };
  const rng = function (f) { return sh.getRange(col(f) + '2:' + col(f)); };
  const all = sh.getRange('A2:' + last);
  const pill = function (range, text, bg, fg) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setBold(true).setRanges([range]).build());
  };

  if (name === 'Pedidos') {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + col('anulado') + '2="SI"')
      .setBackground(THEME.errSoft).setFontColor('#991B1B').setStrikethrough(true).setRanges([all]).build());
    const est = rng('estado');
    pill(est, 'Pendiente', THEME.slateSoft, '#334155');
    pill(est, 'En preparación', THEME.warnSoft, '#B45309');
    pill(est, 'Despachado', THEME.primarySoft, THEME.primary);
    pill(est, 'Entregado', THEME.okSoft, '#15803D');
    const pr = rng('prioridad');
    pill(pr, 'urgente', THEME.errSoft, THEME.err);
    pill(pr, 'alta', THEME.warnSoft, '#B45309');
    pill(pr, 'baja', THEME.infoSoft, THEME.info);
    // Fecha estimada vencida en pedidos no entregados.
    const fe = col('fecha_estimada_entrega');
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($' + fe + '2<>"",$' + col('estado') + '2<>"Entregado",$' + col('anulado') + '2<>"SI",$' + fe + '2<TEXT(TODAY(),"yyyy-mm-dd"))')
      .setBackground(THEME.errSoft).setFontColor(THEME.err).setBold(true).setRanges([rng('fecha_estimada_entrega')]).build());
    sh.getRange(col('numero_pedido') + '2:' + col('numero_pedido')).setFontWeight('bold').setFontColor(THEME.primaryDark);
  }
  if (name === 'Rutas') {
    const e = rng('estado');
    pill(e, 'planificada', THEME.slateSoft, '#334155');
    pill(e, 'activa', THEME.primarySoft, THEME.primary);
    pill(e, 'finalizada', THEME.okSoft, '#15803D');
    pill(e, 'cancelada', THEME.errSoft, THEME.err);
    sh.getRange(col('codigo_ruta') + '2:' + col('codigo_ruta')).setFontWeight('bold');
  }
  if (name === 'Usuarios') {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + col('activo') + '2="NO"')
      .setFontColor('#94A3B8').setStrikethrough(true).setRanges([all]).build());
    pill(rng('rol'), 'Administrador', THEME.primarySoft, THEME.primary);
  }
  if (name === 'Productos') {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + col('activo') + '2="NO"')
      .setFontColor('#94A3B8').setStrikethrough(true).setRanges([all]).build());
  }
  if (name === 'Historial') {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('EXCEPCION').setBackground(THEME.warnSoft).setFontColor('#B45309').setBold(true).setRanges([rng('accion')]).build());
    pill(rng('accion'), 'ANULAR', THEME.errSoft, THEME.err);
    pill(rng('accion'), 'ELIMINAR', THEME.errSoft, THEME.err);
    pill(rng('accion'), 'ENTREGAR', THEME.okSoft, '#15803D');
  }
  if (name === 'Configuracion') {
    sh.getRange(col('clave') + '2:' + col('clave')).setFontWeight('bold');
    sh.getRange(col('descripcion') + '2:' + col('descripcion')).setFontColor(THEME.text2).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    sh.setColumnWidth(info.map.descripcion + 1, 420);
  }
  sh.setConditionalFormatRules(rules);

  // Advertencia (no bloqueo) al editar a mano: los datos los administra la aplicación.
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
    if (p.getDescription() === 'Administrada por la aplicación') p.remove();
  });
  sh.protect().setDescription('Administrada por la aplicación').setWarningOnly(true);
}

/* ===================== Hoja Resumen (dashboard con fórmulas) ===================== */

function buildResumen_() {
  const ss = ss_();
  let sh = ss.getSheetByName('Resumen');
  if (!sh) sh = ss.insertSheet('Resumen', 0);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();
  sh.setConditionalFormatRules([]);
  sh.setHiddenGridlines(true);
  sh.setTabColor(THEME.primaryDark);
  sh.setFrozenRows(0);
  if (sh.getMaxColumns() < 16) sh.insertColumnsAfter(sh.getMaxColumns(), 16 - sh.getMaxColumns());
  if (sh.getMaxRows() < 95) sh.insertRowsAfter(sh.getMaxRows(), 95 - sh.getMaxRows());
  sh.getRange('A1:P95').breakApart(); // clear() no deshace las combinaciones de una ejecución anterior
  sh.getRange('A1:P95').setFontFamily('Inter').setFontColor(THEME.text).setVerticalAlignment('middle').setBackground(THEME.band);
  sh.setColumnWidth(1, 24);
  for (let c = 2; c <= 13; c++) sh.setColumnWidth(c, 105);
  sh.setColumnWidth(2, 210);
  sh.hideColumns(15, 2); // columnas auxiliares (O:P)

  // Rangos de las hojas de datos (columnas completas: crecen con los datos).
  const P = function (f) { const c = colOf_('Pedidos', f); return 'Pedidos!$' + c + '$2:$' + c; };
  const R = function (f) { const c = colOf_('Rutas', f); return 'Rutas!$' + c + '$2:$' + c; };
  const U = function (f) { const c = colOf_('Usuarios', f); return 'Usuarios!$' + c + '$2:$' + c; };
  const est = P('estado'), anul = P('anulado'), fc = P('fecha_creacion'), fen = P('fecha_entrega'), fe = P('fecha_estimada_entrega');
  const hoy = 'TEXT(TODAY(),"yyyy-mm-dd")';
  const empresa = getConfig_().nombre_empresa || 'Mi empresa';

  // Encabezado
  sh.getRange('B2:M2').merge().setValue('Panel de control · ' + empresa).setBackground(THEME.primary).setFontColor(THEME.white)
    .setFontSize(18).setFontWeight('bold').setHorizontalAlignment('left');
  sh.setRowHeight(2, 52);
  sh.getRange('B3:M3').merge().setFormula('="Datos en vivo desde las hojas de la aplicación · Hoy: "&TEXT(TODAY(),"dd/mm/yyyy")&" · Pedidos anulados excluidos"')
    .setBackground(THEME.primaryDark).setFontColor('#C7D2FE').setFontSize(10);
  sh.setRowHeight(3, 26);

  // Tarjetas de indicadores: [título, fórmula, color de acento, fondo]
  const cards = [
    ['Pedidos registrados', '=COUNTIFS(' + P('numero_pedido') + ',"<>",' + anul + ',"<>SI")', THEME.primary, THEME.primarySoft],
    ['Pendientes', '=COUNTIFS(' + est + ',"Pendiente",' + anul + ',"<>SI")', '#334155', THEME.slateSoft],
    ['En preparación', '=COUNTIFS(' + est + ',"En preparación",' + anul + ',"<>SI")', THEME.warn, THEME.warnSoft],
    ['Despachados', '=COUNTIFS(' + est + ',"Despachado",' + anul + ',"<>SI")', THEME.primary, THEME.primarySoft],
    ['Entregados', '=COUNTIFS(' + est + ',"Entregado",' + anul + ',"<>SI")', THEME.ok, THEME.okSoft],
    ['Con retraso', '=SUMPRODUCT((' + est + '<>"Entregado")*(' + anul + '<>"SI")*(' + fe + '<>"")*(' + fe + '<' + hoy + '))', THEME.err, THEME.errSoft],
    ['Creados hoy', '=COUNTIFS(' + fc + ',' + hoy + '&"*",' + anul + ',"<>SI")', THEME.info, THEME.infoSoft],
    ['Entregados hoy', '=COUNTIFS(' + fen + ',' + hoy + '&"*",' + est + ',"Entregado",' + anul + ',"<>SI")', THEME.ok, THEME.okSoft]
  ];
  cards.forEach(function (k, i) {
    const row = i < 4 ? 5 : 9;
    const col = 2 + (i % 4) * 3;
    const lbl = sh.getRange(row, col, 1, 3).merge();
    const val = sh.getRange(row + 1, col, 1, 3).merge();
    lbl.setValue(k[0].toUpperCase()).setFontSize(9).setFontWeight('bold').setFontColor(k[2]).setBackground(k[3]);
    val.setFormula(k[1]).setFontSize(26).setFontWeight('bold').setFontColor(THEME.text).setBackground(k[3]).setNumberFormat('#,##0');
    sh.getRange(row, col, 2, 3).setBorder(true, true, true, true, false, false, k[2], SpreadsheetApp.BorderStyle.SOLID_MEDIUM)
      .setHorizontalAlignment('left');
  });
  [5, 9].forEach(function (r) { sh.setRowHeight(r, 26); sh.setRowHeight(r + 1, 46); });
  sh.setRowHeight(8, 10);

  const section = function (a1, title) {
    sh.getRange(a1).merge().setValue(title).setFontSize(12).setFontWeight('bold').setFontColor(THEME.primaryDark)
      .setBorder(null, null, true, null, null, null, THEME.primary, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  };
  const table = function (a1Header, headers) {
    sh.getRange(a1Header).setValues([headers]).setBackground(THEME.primary).setFontColor(THEME.white).setFontWeight('bold');
  };

  // 1) Pedidos por estado + gráfico circular
  section('B13:M13', 'Pedidos por estado');
  table('B14:C14', ['Estado', 'Pedidos']);
  ESTADOS.forEach(function (e, i) {
    sh.getRange(15 + i, 2).setValue(e);
    sh.getRange(15 + i, 3).setFormula('=COUNTIFS(' + est + ',"' + e + '",' + anul + ',"<>SI")');
  });
  sh.getRange('B15:C18').setBackground(THEME.white).setBorder(true, true, true, true, true, true, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.PIE).addRange(sh.getRange('B14:C18')).setNumHeaders(1)
    .setPosition(14, 5, 10, 0).setOption('title', 'Distribución por estado').setOption('pieHole', 0.55)
    .setOption('colors', ['#94A3B8', THEME.warn, THEME.primary, THEME.ok]).setOption('legend', { position: 'right' })
    .setOption('width', 600).setOption('height', 270).setOption('backgroundColor', THEME.band).build());

  // 2) Prioridad (pedidos abiertos)
  sh.getRange('B21').setValue('Pedidos abiertos por prioridad').setFontWeight('bold').setFontColor(THEME.text2);
  table('B22:C22', ['Prioridad', 'Abiertos']);
  ['urgente', 'alta', 'normal', 'baja'].forEach(function (p, i) {
    sh.getRange(23 + i, 2).setValue(p.charAt(0).toUpperCase() + p.slice(1));
    sh.getRange(23 + i, 3).setFormula('=COUNTIFS(' + P('prioridad') + ',"' + p + '",' + est + ',"<>Entregado",' + anul + ',"<>SI",' + P('numero_pedido') + ',"<>")');
  });
  sh.getRange('B23:C26').setBackground(THEME.white).setBorder(true, true, true, true, true, true, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('B23').setFontColor(THEME.err).setFontWeight('bold');
  sh.getRange('B24').setFontColor(THEME.warn).setFontWeight('bold');

  // 3) Evolución últimos 14 días + gráfico de columnas
  section('B30:M30', 'Pedidos creados y entregados · últimos 14 días');
  table('B31:D31', ['Fecha', 'Creados', 'Entregados']);
  for (let i = 0; i < 14; i++) {
    const r = 32 + i;
    sh.getRange(r, 2).setFormula('=TODAY()-' + (13 - i)).setNumberFormat('ddd dd/mm');
    sh.getRange(r, 3).setFormula('=COUNTIFS(' + fc + ',TEXT(B' + r + ',"yyyy-mm-dd")&"*",' + anul + ',"<>SI")');
    sh.getRange(r, 4).setFormula('=COUNTIFS(' + fen + ',TEXT(B' + r + ',"yyyy-mm-dd")&"*",' + est + ',"Entregado",' + anul + ',"<>SI")');
  }
  sh.getRange('B32:D45').setBackground(THEME.white).setBorder(true, true, true, true, true, true, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).addRange(sh.getRange('B31:D45')).setNumHeaders(1)
    .setPosition(31, 6, 0, 0).setOption('title', 'Actividad diaria').setOption('colors', [THEME.primary, THEME.ok])
    .setOption('legend', { position: 'top' }).setOption('vAxis', { minValue: 0, format: '0' })
    .setOption('width', 620).setOption('height', 300).setOption('backgroundColor', THEME.band).build());

  // 4) Rendimiento por ruta (auxiliar: IDs de rutas en la columna oculta O)
  section('B49:M49', 'Pedidos por ruta');
  table('B50:E50', ['Ruta', 'Asignados', 'Entregados', '% entregado']);
  sh.getRange('O51').setFormula('=IFERROR(ARRAY_CONSTRAIN(FILTER(' + R('ruta_id') + ',' + R('ruta_id') + '<>""),15,1),"")');
  sh.getRange('B51').setFormula('=IFERROR(ARRAY_CONSTRAIN(FILTER(' + R('codigo_ruta') + '&" · "&' + R('nombre_ruta') + ',' + R('ruta_id') + '<>""),15,1),"Sin rutas registradas")');
  sh.getRange('C51').setFormula('=ARRAYFORMULA(IF(O51:O65="","",COUNTIFS(' + P('ruta_id') + ',O51:O65,' + anul + ',"<>SI")))');
  sh.getRange('D51').setFormula('=ARRAYFORMULA(IF(O51:O65="","",COUNTIFS(' + P('ruta_id') + ',O51:O65,' + est + ',"Entregado",' + anul + ',"<>SI")))');
  sh.getRange('E51').setFormula('=ARRAYFORMULA(IF((O51:O65="")+(C51:C65=0),"",D51:D65/C51:C65))');
  sh.getRange('E51:E65').setNumberFormat('0%');
  sh.getRange('B51:E65').setBackground(THEME.white).setBorder(true, true, true, true, false, true, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue(THEME.errSoft, SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMidpointWithValue(THEME.warnSoft, SpreadsheetApp.InterpolationType.NUMBER, '0.5')
      .setGradientMaxpointWithValue(THEME.okSoft, SpreadsheetApp.InterpolationType.NUMBER, '1').setRanges([sh.getRange('E51:E65')]).build()
  ]);
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR).addRange(sh.getRange('B50:D65')).setNumHeaders(1)
    .setPosition(50, 7, 0, 0).setOption('title', 'Asignados vs. entregados').setOption('colors', ['#94A3B8', THEME.ok])
    .setOption('legend', { position: 'top' }).setOption('hAxis', { minValue: 0, format: '0' })
    .setOption('width', 560).setOption('height', 320).setOption('backgroundColor', THEME.band).build());

  // 5) Responsables
  section('B69:C69', 'Pedidos abiertos por responsable'); // E69:M69 lo ocupa la alerta de retrasados
  table('B70:C70', ['Responsable', 'Abiertos']);
  sh.getRange('P71').setFormula('=IFERROR(ARRAY_CONSTRAIN(FILTER(' + U('usuario_id') + ',' + U('activo') + '="SI"),12,1),"")');
  sh.getRange('B71').setFormula('=IFERROR(ARRAY_CONSTRAIN(FILTER(' + U('nombre') + ',' + U('activo') + '="SI"),12,1),"")');
  sh.getRange('C71').setFormula('=ARRAYFORMULA(IF(P71:P82="","",COUNTIFS(' + P('responsable_id') + ',P71:P82,' + est + ',"<>Entregado",' + anul + ',"<>SI")))');
  sh.getRange('B71:C82').setBackground(THEME.white).setBorder(true, true, true, true, false, true, THEME.border, SpreadsheetApp.BorderStyle.SOLID);

  // 6) Pedidos retrasados (alerta)
  sh.getRange('E69:M69').merge().setValue('⚠ Pedidos retrasados (no entregados con fecha estimada vencida)').setFontSize(12).setFontWeight('bold')
    .setFontColor(THEME.err).setBorder(null, null, true, null, null, null, THEME.err, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange('E70:M70').setValues([['Número', '', 'Cliente', '', '', 'Zona', '', 'Entrega est.', 'Estado']])
    .setBackground(THEME.err).setFontColor(THEME.white).setFontWeight('bold');
  const cond = est + '<>"Entregado",' + anul + '<>"SI",' + fe + '<>"",' + fe + '<' + hoy;
  const lista = function (f, n) { return '=IFERROR(ARRAY_CONSTRAIN(FILTER(' + P(f) + ',' + cond + '),' + n + ',1),"")'; };
  sh.getRange('E71').setFormula('=IFERROR(ARRAY_CONSTRAIN(FILTER(' + P('numero_pedido') + ',' + cond + '),12,1),"Sin pedidos retrasados ✔")');
  sh.getRange('G71').setFormula(lista('cliente_nombre', 12));
  sh.getRange('J71').setFormula(lista('zona', 12));
  sh.getRange('L71').setFormula(lista('fecha_estimada_entrega', 12));
  sh.getRange('M71').setFormula(lista('estado', 12));
  sh.getRange('E71:M82').setBackground(THEME.white).setBorder(true, true, true, true, false, true, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('E71:E82').setFontWeight('bold').setFontColor(THEME.err);

  sh.getRange('B85:M85').merge().setValue('Este panel se calcula con fórmulas a partir de las hojas de datos. No escriba en esta hoja: se regenera al ejecutar formatSpreadsheet().')
    .setFontColor(THEME.text2).setFontSize(9).setFontStyle('italic');
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  sh.protect().setDescription('Panel generado automáticamente').setWarningOnly(true);
}
