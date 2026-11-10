// Acceso con clave. Todo se descifra en el navegador: el servidor solo guarda contenido ilegible.
// Las fotos, vídeos y figuras se descifran al entrar y la aplicación los usa desde la memoria.
(function () {
  const $ = (s) => document.querySelector(s);
  const ENC = new TextEncoder(), DEC = new TextDecoder();
  let llave = null, conf = null;
  const hex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  const traer = async (u) => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error('red'); return r.arrayBuffer(); };
  const abrir = async (buf) => { const b = new Uint8Array(buf); return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, llave, b.subarray(12)); };
  async function derivar(clave) {
    const base = await crypto.subtle.importKey('raw', ENC.encode(clave), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: hex(conf.sal), iterations: conf.iter }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  function cargar(src) {
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = mal; document.body.append(s); });
  }
  // Descifra todos los archivos (seis a la vez) y muestra el avance.
  async function medios(mapa) {
    const L = Object.entries(mapa), total = L.reduce((s, [, m]) => s + (m.b || 1), 0);
    const M = {};
    let hecho = 0, i = 0;
    const barra = $('#acBarra'), msg = $('#acMsg');
    barra.hidden = false;
    const uno = async () => {
      while (i < L.length) {
        const [rel, m] = L[i++];
        const datos = await abrir(await traer('d/' + m.id + '.bin'));
        M[rel] = URL.createObjectURL(new Blob([datos], { type: m.t }));
        hecho += m.b || 1;
        const p = Math.round(hecho / total * 100);
        barra.firstElementChild.style.width = p + '%';
        msg.textContent = `Abriendo el proyecto… ${p} %`;
      }
    };
    await Promise.all(Array.from({ length: 6 }, uno));
    return M;
  }
  async function arrancar(datos) {
    $('#acMsg').className = 'ok';
    window.MEDIOS = await medios(datos.mapa || {});
    window.PROYECTO = datos;
    $('#acceso').hidden = true;
    await cargar('modelo.js');
    await cargar('app.js');
  }
  async function entrar(clave) {
    llave = await derivar(clave);
    let datos;
    try { datos = JSON.parse(DEC.decode(await abrir(await traer('e.bin')))); } catch (e) {
      if (e && e.message === 'red') throw new Error('No se ha podido conectar. Comprueba la conexión a internet.');
      throw new Error('Clave incorrecta.');
    }
    // La clave no se guarda: solo la llave derivada, y solo en esta pestaña.
    try { sessionStorage.setItem('llave', JSON.stringify(await crypto.subtle.exportKey('jwk', llave))); } catch (e) { /* sin almacenamiento */ }
    await arrancar(datos);
  }
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
  (async function () {
    try { conf = JSON.parse(DEC.decode(await traer('cifrado.json'))); } catch (e) { $('#acMsg').textContent = 'No se ha podido conectar. Comprueba la conexión a internet.'; return; }
    if (!window.crypto || !crypto.subtle) { $('#acMsg').textContent = 'Este navegador no puede abrir el proyecto. Usa Chrome, Edge, Firefox o Safari actualizados.'; return; }
    try {
      const j = sessionStorage.getItem('llave');
      if (j) {
        llave = await crypto.subtle.importKey('jwk', JSON.parse(j), { name: 'AES-GCM' }, true, ['decrypt']);
        await arrancar(JSON.parse(DEC.decode(await abrir(await traer('e.bin')))));
        return;
      }
    } catch (e) { try { sessionStorage.removeItem('llave'); } catch (x) { /* nada */ } $('#acMsg').textContent = ''; $('#acBarra').hidden = true; }
    $('#acForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const b = $('#acEntrar'), m = $('#acMsg');
      b.disabled = true; m.className = 'ok'; m.textContent = 'Comprobando…';
      try { await entrar($('#acClave').value); } catch (e) { m.className = ''; m.textContent = e.message || 'Clave incorrecta.'; b.disabled = false; $('#acBarra').hidden = true; $('#acClave').select(); }
    });
  })();
})();
