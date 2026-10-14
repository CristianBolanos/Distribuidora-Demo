/* =====================================================================
 * demo-ui.js — Barra de la demo: cambio de rol, reinicio de datos y
 * exportación PDF mediante el diálogo de impresión del navegador.
 * ===================================================================== */
(function () {
  // En la demo el "PDF" es el HTML del informe: se abre el diálogo de impresión (Guardar como PDF).
  const originalDownload = window.downloadBlob;
  window.downloadBlob = async function (blob, filename) {
    if (!/\.pdf$/i.test(filename)) return originalDownload(blob, filename);
    const html = await blob.text();
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html.replace('<head>', '<head><title>' + filename.replace(/\.pdf$/i, '') + '</title>')); doc.close();
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => iframe.remove(), 1500); }, 300);
  };

  function bar() {
    const usuarios = __demo.usuarios();
    const activo = __demo.activo();
    const el = document.createElement('div');
    el.className = 'demo-bar';
    el.innerHTML = `
      <span class="demo-tag">DEMO</span>
      <span class="demo-txt">Datos ficticios guardados solo en este navegador.</span>
      <label class="demo-txt" for="demoUser">Ver como:</label>
      <select id="demoUser">${usuarios.map((u) => `<option value="${esc(u.correo)}" ${u.correo === activo ? 'selected' : ''}>${esc(u.rol)} · ${esc(u.nombre.replace('[DEMO] ', ''))}</option>`).join('')}</select>
      <button type="button" id="demoReset" title="Borra los cambios y vuelve a los datos iniciales">Reiniciar datos</button>
      <button type="button" id="demoClose" aria-label="Ocultar barra de demo">×</button>`;
    document.body.appendChild(el);
    el.querySelector('#demoUser').onchange = (e) => __demo.cambiarUsuario(e.target.value);
    el.querySelector('#demoReset').onclick = () => { if (confirm('¿Reiniciar la demo? Se perderán los cambios que haya hecho.')) __demo.reiniciar(); };
    el.querySelector('#demoClose').onclick = () => el.remove();
  }
  document.addEventListener('DOMContentLoaded', bar);
})();
