// Proyecto de investigación: portada, mapa visual, páginas, edición, fotos y vídeos, avisos de versión, ajustes y generación.
// Dos modos: Editor (tú) y Tribunal (lectura). Sin window.api es una versión generada para el tribunal: solo lectura.
(async function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const copia = (o) => JSON.parse(JSON.stringify(o));
  const CONSULTA = !window.api;
  let P = CONSULTA ? window.PROYECTO : await window.api.leer();
  P.proyecto = P.proyecto || {};
  let modo = CONSULTA ? 'tribunal' : (P.ajustes.modo || 'editor');
  let actual = 'portada', editando = false, M = null, generando = false;
  const url = (rel) => (window.MEDIOS && window.MEDIOS[rel]) || P.baseUrl + String(rel).split('/').map(encodeURIComponent).join('/');
  const esVideo = (r) => /\.(mp4|webm|mov|m4v)$/i.test(r || '');
  const esPdf = (r) => /\.pdf$/i.test(r || '');
  const ed = () => !CONSULTA && modo === 'editor';

  function aviso(t, ms = 3800) {
    const e = $('#toast'); e.textContent = t; e.classList.add('ver');
    clearTimeout(aviso.t); aviso.t = setTimeout(() => e.classList.remove('ver'), ms);
  }

  /* ---------- Datos ---------- */
  const EF = () => (P.documento ? Modelo.efectivo(P.documento, P.proyecto) : null);
  const ocultas = () => new Set(P.proyecto.ocultas || []);
  const todas = () => (EF() ? EF().paginas.filter((p) => p.id !== 'indice') : []);
  const visibles = () => todas().filter((p) => ed() || !ocultas().has(p.id));
  const pagina = (id) => (EF() ? EF().paginas.find((p) => p.id === id) : null);
  const original = (id) => [...P.documento.paginas, ...(P.proyecto.paginasNuevas || [])].find((p) => p.id === id);
  const medio = (id) => (P.proyecto.medios || {})[id] || {};
  const carpetaPersonas = () => (P.proyecto.personas || {}).carpeta || 'medios/personas';
  const fondoDe = (id) => { const m = medio(id); return m.video || m.fondo || (m.mosaico && P.personas && P.personas[0] ? `${carpetaPersonas()}/${P.personas[0]}` : null); };
  const etiqueta = (p) => p.numero || '';
  let tGuardar = null;
  async function guardarProyecto(inmediato) {
    if (CONSULTA) return;
    clearTimeout(tGuardar);
    const hacer = async () => {
      try {
        const r = await window.api.guardar(copia(P.proyecto));
        if (r && r.error) throw new Error(r.error);
        const e = $('#beEstado'); if (e) e.textContent = `Guardado a las ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
      } catch (error) { const e = $('#beEstado'); if (e) e.textContent = 'No se pudo guardar'; aviso('No se pudo guardar: ' + error.message, 10000); throw error; }
    };
    if (inmediato) return hacer();
    const e = $('#beEstado'); if (e) e.textContent = 'Guardando…';
    tGuardar = setTimeout(() => hacer().catch(() => {}), 600);
  }

  /* ---------- Texto con formato ---------- */
  const tramos = (t) => (t || []).map((x) => {
    let s = esc(x.x).replace(/\n/g, '<br>');
    if (x.sup) s = `<sup>${s}</sup>`;
    if (x.i) s = `<em>${s}</em>`;
    if (x.b) s = `<strong>${s}</strong>`;
    if (x.href) s = `<a href="${esc(x.href)}" target="_blank">${s}</a>`;
    return s;
  }).join('');
  const plano = (t) => (t || []).map((x) => x.x).join('').trim();
  const celdaHtml = (c) => c.lineas.map(tramos).join('<br>');
  const esNumero = (s) => /^[\d.,]+\s*%?$/.test(s.trim());
  const aNumero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
  // Del texto editado (HTML) a tramos con negrita, cursiva, superíndice y enlaces.
  function leerTramos(el) {
    const out = [];
    const push = (x, f) => {
      if (!x) return;
      const u = out[out.length - 1];
      if (u && u.b === f.b && u.i === f.i && u.sup === f.sup && (u.href || null) === (f.href || null)) u.x += x;
      else out.push({ x, b: f.b, i: f.i, sup: f.sup, ...(f.href ? { href: f.href } : {}) });
    };
    const walk = (n, f) => {
      if (n.nodeType === 3) { push(n.nodeValue.replace(/ /g, ' '), f); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') { push('\n', f); return; }
      const g = { ...f };
      if (t === 'B' || t === 'STRONG') g.b = true;
      if (t === 'I' || t === 'EM') g.i = true;
      if (t === 'SUP') g.sup = true;
      if (t === 'A') g.href = n.getAttribute('href');
      if ((t === 'DIV' || t === 'P') && n !== el && out.length && !out[out.length - 1].x.endsWith('\n')) push('\n', f);
      n.childNodes.forEach((c) => walk(c, g));
    };
    walk(el, { b: false, i: false, sup: false, href: null });
    while (out.length) { const u = out[out.length - 1]; u.x = u.x.replace(/\n+$/, ''); if (u.x) break; out.pop(); }
    return out;
  }
  const partirLineas = (tr) => {
    const lineas = [[]];
    tr.forEach((x) => x.x.split('\n').forEach((parte, i) => { if (i) lineas.push([]); if (parte) lineas[lineas.length - 1].push({ ...x, x: parte }); }));
    return lineas.filter((l) => l.length);
  };

  /* ---------- Bloques ---------- */
  function tabla(b) {
    const f = b.filas;
    if (!f.length) return '';
    if (f.length === 1 && f[0].every((c) => c.lineas.length >= 2 && esNumero(plano(c.lineas[0])))) {
      return `<div class="stats rev">${f[0].map((c) => `<div class="stat"><strong data-cuenta="${esc(plano(c.lineas[0]))}">${esc(plano(c.lineas[0]))}</strong><span>${c.lineas.slice(1).map(tramos).join(' ')}</span></div>`).join('')}</div>`;
    }
    if (f.length === 1 && f[0].length === 1) {
      const [t0, ...r] = f[0][0].lineas;
      return `<aside class="recuadro rev">${r.length ? `<small>${tramos(t0)}</small>${r.map(tramos).join('<br>')}` : tramos(t0)}</aside>`;
    }
    if (f.length > 1 && f[0].slice(1).every((c) => !c.lineas.length) && f.slice(1).every((r) => r.length === 2)) {
      return `<div class="ficha rev"><h3>${celdaHtml(f[0][0])}</h3><dl class="kv">${f.slice(1).map((r) => `<dt>${celdaHtml(r[0])}</dt><dd>${celdaHtml(r[1])}</dd>`).join('')}</dl></div>`;
    }
    if (f.every((r) => r.length === 2) && f.filter((r) => r[0].fondo).length >= f.length - 1 && !f[0][1].fondo) {
      return `<dl class="kv rev">${f.map((r) => `<dt>${celdaHtml(r[0])}</dt><dd>${celdaHtml(r[1])}</dd>`).join('')}</dl>`;
    }
    const cab = f[0].every((c) => c.fondo || c.lineas.every((l) => l.every((x) => x.b)));
    const cuerpo = cab ? f.slice(1) : f;
    return `<div class="tabla-c rev"><table class="t">${cab ? `<thead><tr>${f[0].map((c) => `<th>${celdaHtml(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${cuerpo.map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 && c.fondo ? 'k' : ''}">${celdaHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const ce = (k) => `data-k="${k}" contenteditable="true" spellcheck="true"`;
  function bloque(b, ruta, lead, editar) {
    if (editar) {
      const herr = `<div class="blk-herr"><button data-mas="${ruta}" title="Añadir un párrafo debajo">+ Texto</button><button data-lista="${ruta}">+ Lista</button><button data-tabla="${ruta}">+ Tabla</button><button data-ins="${ruta}" title="Insertar foto o vídeo debajo">+ Imagen/vídeo</button><button data-arriba="${ruta}" title="Subir bloque">↑</button><button data-abajo="${ruta}" title="Bajar bloque">↓</button><button data-quita="${ruta}" title="Eliminar este bloque">Eliminar</button></div>`;
      let dentro = '';
      if (b.t === 'p') dentro = `<p class="txt" ${ce(ruta)}>${tramos(b.tramos)}</p>`;
      else if (b.t === 'pie') dentro = `<p class="pie" ${ce(ruta)}>${tramos(b.tramos)}</p>`;
      else if (b.t === 'lista') dentro = `<ul class="lista">${b.items.map((it, j) => `<li><span ${ce(`${ruta}.i.${j}`)}>${tramos(it)}</span><button data-itemquita="${ruta}" data-item="${j}" class="ed-mini">Eliminar elemento</button></li>`).join('')}</ul>`;
      else if (b.t === 'tabla') dentro = `<div class="tabla-c"><table class="t ed"><thead><tr>${(b.filas[0] || []).map((_, j) => `<th><button data-colquita="${ruta}" data-col="${j}" class="ed-mini">Eliminar columna ${j + 1}</button></th>`).join('')}<th>Filas</th></tr></thead><tbody>${b.filas.map((r, i) => `<tr>${r.map((c, j) => `<td ${ce(`${ruta}.f.${i}.${j}`)}>${celdaHtml(c)}</td>`).join('')}<td><button data-filaquita="${ruta}" data-fila="${i}" class="ed-mini">Eliminar fila</button></td></tr>`).join('')}</tbody></table><div class="ed-fila"><button data-filamas="${ruta}">+ Fila</button><button data-colmas="${ruta}">+ Columna</button></div></div>`;
      else if (b.t === 'img') dentro = `<figure class="fig"><img src="${esc(url('cache/' + b.src))}" alt=""></figure>`;
      else if (b.t === 'medio') dentro = `<figure class="medio-b">${esPdf(b.src) ? `<button class="pdf-b" data-pdf="${esc(b.src)}"><b>PDF</b><span>${esc(b.src.split('/').pop().replace(/\.pdf$/i, '').replace(/_/g, ' '))}</span><small>Abrir en una ventana</small></button>` : esVideo(b.src) ? `<video src="${esc(url(b.src))}" controls muted playsinline></video>` : `<img src="${esc(url(b.src))}" alt="">`}<figcaption ${ce(`${ruta}.pie`)}>${tramos(b.pie || [])}</figcaption></figure>`;
      return `<div class="blk">${herr}${dentro}</div>`;
    }
    if (b.t === 'p') {
      const tx = plano(b.tramos);
      if (/^(Fuente|Nota)\b/.test(tx) && tx.length < 160) return `<p class="nota-f rev">${tramos(b.tramos)}</p>`;
      return `<p class="${lead && tx.length > 140 ? 'txt lead' : 'txt'} rev">${tramos(b.tramos)}</p>`;
    }
    if (b.t === 'lista') return `<ul class="lista rev">${b.items.map((it) => `<li>${tramos(it)}</li>`).join('')}</ul>`;
    if (b.t === 'pie') return `<p class="pie rev">${tramos(b.tramos)}</p>`;
    if (b.t === 'img') return `<figure class="fig rev" data-lupa="${esc(url('cache/' + b.src))}"><img src="${esc(url('cache/' + b.src))}" alt="" loading="lazy"></figure>`;
    if (b.t === 'medio') return `<figure class="medio-b rev">${esPdf(b.src) ? `<button class="pdf-b" data-pdf="${esc(b.src)}"><b>PDF</b><span>${esc(b.src.split('/').pop().replace(/\.pdf$/i, '').replace(/_/g, ' '))}</span><small>Abrir en una ventana</small></button>` : esVideo(b.src) ? `<video src="${esc(url(b.src))}" controls playsinline preload="metadata"></video>` : `<img src="${esc(url(b.src))}" alt="" loading="lazy" data-lupa-foto="${esc(url(b.src))}">`}${b.pie && plano(b.pie) ? `<figcaption>${tramos(b.pie)}</figcaption>` : ''}</figure>`;
    if (b.t === 'tabla') return tabla(b);
    return '';
  }
  function bloques(lista, prefijo, primero, editar) {
    let lead = primero;
    return (lista || []).map((b, i) => {
      const h = bloque(b, `${prefijo}${i}`, lead, editar);
      if (b.t === 'p' && lead && plano(b.tramos).length > 140) lead = false;
      return h;
    }).join('') || (editar ? `<div class="blk"><div class="blk-herr"><button data-mas="${prefijo}-1">+ Texto</button><button data-lista="${prefijo}-1">+ Lista</button><button data-tabla="${prefijo}-1">+ Tabla</button><button data-ins="${prefijo}-1">+ Imagen/vídeo</button></div><p>Este apartado está vacío. Añada contenido con los botones.</p></div>` : '');
  }
  const ecg = (cl) => `<svg class="${cl}" viewBox="0 0 1600 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70 H250 l18 -14 l14 14 h20 l12 30 l18 -95 l16 105 l12 -40 h60 l20 -12 l20 12 H760 l18 -14 l14 14 h20 l12 30 l18 -95 l16 105 l12 -40 h60 l20 -12 l20 12 H1600"/></svg>`;

  /* ---------- Menú (vertical u horizontal) ---------- */
  const grupo = (p) => (/^anexo/.test(p.id) ? 'Anexos' : p.id === 'referencias' ? 'Referencias' : p.id === 'abreviaturas' ? 'Abreviaturas' : !p.numero ? 'Presentación' : 'Proyecto');
  const itemNav = (p) => {
    const oc = ocultas().has(p.id);
    return `<button class="nv ${p.id === actual ? 'act' : ''} ${oc ? 'oculta' : ''}" data-ir="${p.id}"><span class="n">${esc(etiqueta(p))}</span><span>${esc(p.titulo)}</span>${ed() && p.conflicto ? '<span class="ojo" title="El Word ha cambiado esta página">‼</span>' : oc ? '<span class="ojo">oculta</span>' : ''}</button>`;
  };
  function pintarNav() {
    const ps = visibles();
    let g = null;
    $('#nav').innerHTML = ps.map((p) => { const gg = grupo(p), cab = gg !== g ? `<div class="nv-grupo">${gg}</div>` : ''; g = gg; return cab + itemNav(p); }).join('');
    const grupos = [];
    ps.forEach((p) => { const gg = grupo(p); let x = grupos.find((y) => y.n === gg); if (!x) grupos.push(x = { n: gg, ps: [] }); x.ps.push(p); });
    $('#navH').innerHTML = grupos.map((x) => {
      const act = x.ps.some((p) => p.id === actual) ? 'act' : '';
      if (x.ps.length === 1) return `<div class="dd ${act}"><button class="solo" data-ir="${x.ps[0].id}">${esc(x.n)}</button></div>`;
      return `<div class="dd ${act}"><button data-dd>${esc(x.n)}</button><div class="dd-panel ${x.ps.length > 7 ? 'ancho' : ''}">${x.ps.map(itemNav).join('')}</div></div>`;
    }).join('');
    $$('#navH .dd').forEach((d) => {
      let t = null;
      d.onmouseenter = () => { clearTimeout(t); $$('#navH .dd.abierto').forEach((o) => o !== d && o.classList.remove('abierto')); if (d.querySelector('.dd-panel')) d.classList.add('abierto'); };
      d.onmouseleave = () => { t = setTimeout(() => d.classList.remove('abierto'), 220); };
      const b = d.querySelector('[data-dd]'); if (b) b.onclick = () => d.classList.toggle('abierto');
    });
    $$('#nav [data-ir], #navH [data-ir], [data-ir].rail-inicio, .b-logo, .b-aj[data-ir]').forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
    $$('.tituloCorto').forEach((e) => { e.textContent = portadaTexto()[1] || ''; });
    const f = P.fuente;
    $('#railPie').innerHTML = !CONSULTA && !ed() ? '<div class="aviso-trib">Estás en la <b>vista del tribunal</b>. Para editar y ver Ajustes, vuelve al modo Editor.<button class="aVolver">Volver al modo Editor</button></div>' : !ed() ? '' : `${f ? `<span class="vivo"></span>Leído de <b>${esc(f.nombre)}</b><br>${new Date(f.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })} · se actualiza al guardar el Word` : ''}<button class="rail-aj" data-ir="ajustes">Ajustes · generar versión del tribunal</button>`;
    $$('#railPie [data-ir]').forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
    $$('.rail-ajustes').forEach((b) => { b.onclick = () => ir('ajustes'); b.classList.toggle('act', actual === 'ajustes'); });
    $$('.aVolver').forEach((b) => { b.onclick = async () => { modo = 'editor'; await window.api.ajuste('modo', modo); pintar(); }; });
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#navH .dd')) $$('#navH .dd.abierto').forEach((d) => d.classList.remove('abierto')); });
  const portadaTexto = () => (EF() ? EF().portada.filter((b) => b.t === 'p').map((b) => plano(b.tramos)) : []);

  /* ---------- Aviso de versión nueva del índice ---------- */
  function avisoNuevo() {
    if (!ed() || !P.documento) return '';
    const v = P.proyecto.visto;
    if (!v || v.huella === P.documento.huella) return '';
    const c = Modelo.cambios(v.huellas, P.documento);
    const tit = (id) => { const p = pagina(id); return p ? `${etiqueta(p) ? etiqueta(p) + ' · ' : ''}${p.titulo}` : id; };
    const chips = (l) => l.map((id) => `<button class="chip" data-ir="${id}">${esc(tit(id))}</button>`).join(' ');
    const conf = todas().filter((p) => p.conflicto).length;
    return `<div class="aviso-nuevo"><span>Versión nueva del índice: <b>${esc(P.fuente ? P.fuente.nombre : '')}</b>${v.archivo && P.fuente && v.archivo !== P.fuente.nombre ? ` (antes ${esc(v.archivo)})` : ''}.</span>
      ${c.cambiadas.length ? `<span>Cambian: ${chips(c.cambiadas)}</span>` : ''}${c.nuevas.length ? `<span>Nuevas: ${chips(c.nuevas)}</span>` : ''}${c.quitadas.length ? `<span>Ya no están: ${esc(c.quitadas.join(', '))}</span>` : ''}
      ${!c.cambiadas.length && !c.nuevas.length && !c.quitadas.length ? '<span>Solo hay cambios de formato.</span>' : ''}
      ${conf ? `<span><b>${conf}</b> ${conf === 1 ? 'página editada por ti ha cambiado' : 'páginas editadas por ti han cambiado'}: revísalas (‼ en el menú).</span>` : ''}
      <button id="bVisto">Entendido</button></div>`;
  }
  async function marcarVisto() {
    P.proyecto.visto = { archivo: P.fuente && P.fuente.nombre, huella: P.documento.huella, huellas: Modelo.huellas(P.documento) };
    await guardarProyecto(true);
  }

  /* ---------- Portada ---------- */
  function vistaPortada() {
    const [ceja, titulo, sub, autor, ...resto] = portadaTexto();
    const res = pagina('resumen-ejecutivo');
    const cifras = res && res.bloques.find((b) => b.t === 'tabla' && b.filas.length === 1 && b.filas[0].every((c) => c.lineas.length >= 2 && esNumero(plano(c.lineas[0]))));
    const mp = medio('portada');
    const fondo = mp.video ? `<video src="${esc(url(mp.video))}" autoplay muted loop playsinline></video>` : mp.fondo ? `<img class="p-foto" src="${esc(url(mp.fondo))}" alt="">` : '';
    const palabras = String(titulo || '').split(' ').map((w, i) => `<span class="pal" style="animation-delay:${300 + i * 90}ms">${esc(w)}</span>`).join(' ');
    const tarjeta = (p) => {
      const f = fondoDe(p.id), oc = ocultas().has(p.id);
      const m = !f ? '' : esVideo(f) ? `<video src="${esc(url(f))}" muted loop playsinline preload="metadata"></video>` : `<img src="${esc(url(f))}" alt="" loading="lazy">`;
      return `<button class="tj ${f ? '' : 'sin'} rev" data-ir="${p.id}">${m}${etiqueta(p) ? `<span class="tj-n">${esc(etiqueta(p))}</span>` : ''}<span class="tj-t">${esc(p.titulo)}</span>${oc ? '<span class="oc">Oculta al tribunal</span>' : ''}</button>`;
    };
    const per = P.proyecto.personas || {};
    const primera = visibles().find((p) => p.numero) || visibles()[0] || {};
    return `<section class="vista">${avisoNuevo()}
      <div class="portada">
        ${fondo}
        ${ed() ? '<div class="h-herr"><button id="bFondoPortada">Cambiar foto o vídeo de la portada</button></div>' : ''}
        <div class="p-dentro">
          <p class="p-ceja">${esc(ceja || '')}</p>
          <h1 class="p-titulo">${palabras}</h1>
          <p class="p-sub">${esc(sub || '')}</p>
          <div class="p-autor"><div><b>${esc(autor || '')}</b>${esc(resto[0] || '')}</div><div><b>${esc(resto[2] || '')}</b>${esc(resto[1] || '')}</div><div><b>${esc((resto[3] || '').split('·')[0])}</b>${esc((resto[3] || '').split('·').slice(1).join('·'))}</div></div>
        </div>
        <button class="p-entrar" data-ir="${primera.id}">Entrar en el proyecto <span>→</span></button>
        ${ecg('p-ecg')}
      </div>
      ${cifras ? `<div class="cifras-banda">${cifras.filas[0].map((c) => `<div class="cifra-g rev"><strong data-cuenta="${esc(plano(c.lineas[0]))}">${esc(plano(c.lineas[0]))}</strong><span>${c.lineas.slice(1).map(tramos).join(' ')}</span></div>`).join('')}</div>` : ''}
      ${P.personas && P.personas.length ? `<div class="personas" id="personas"><canvas></canvas><div class="velo"></div><div class="pe-tx rev"><small>Las personas</small><strong data-cuenta="${esc(per.cifra || P.personas.length)}">${esc(per.cifra || P.personas.length)}</strong><p>${esc(per.texto || '')}</p></div></div>` : ''}
      <div class="mapa"><h2 class="rev">El proyecto, de un vistazo</h2><p class="rev">${visibles().length} apartados. Pulsa cualquiera para entrar.</p><div class="tarjetas">${visibles().map(tarjeta).join('')}</div></div>
    </section>`;
  }

  /* ---------- Página ---------- */
  function vistaPagina(p0) {
    const editar = editando && ed();
    const p = editar ? M : p0;
    const m = medio(p.id), f = fondoDe(p.id), oc = ocultas().has(p.id);
    const medioH = m.mosaico ? '<canvas class="h-medio h-mosaico"></canvas>' : !f ? ecg('h-ecg') : esVideo(f) ? `<video class="h-medio" src="${esc(url(f))}" autoplay muted loop playsinline></video>` : `<img class="h-medio" src="${esc(url(f))}" alt="">`;
    const subs = p.subs || [];
    const ps = visibles(), i = ps.findIndex((x) => x.id === p.id), ant = ps[i - 1], sig = ps[i + 1];
    const enlace = (x, cl, rotulo) => { if (!x) return '<span></span>'; const ff = fondoDe(x.id); return `<button class="${cl}" data-ir="${x.id}">${ff && !esVideo(ff) ? `<img src="${esc(url(ff))}" alt="">` : ''}<small>${rotulo}</small><b>${esc(etiqueta(x) ? etiqueta(x) + ' · ' : '')}${esc(x.titulo)}</b></button>`; };
    const herr = ed() && !editar ? `<div class="h-herr"><button id="bEditar">Editar página</button><button id="bFondo">Cambiar foto o vídeo</button><button id="bOcultar" class="${oc ? 'on' : ''}">${oc ? 'Oculta al tribunal' : 'Visible para el tribunal'}</button></div>` : '';
    const conf = ed() && p0.conflicto && !editar ? `<div class="aviso-cf">El Word ha cambiado esta página desde que la editaste. <button id="cfVer">Ver diferencias</button><button id="cfMia">Quedarme con mi versión</button><button id="cfWord">Usar la del Word</button></div>` : '';
    return `<section class="vista">${avisoNuevo()}${conf}
      ${ed() && oc ? '<div class="aviso-ed">Esta página está oculta: el tribunal no la verá.</div>' : ''}
      ${ed() && p0.editada && !p0.conflicto && !editar ? '<div class="aviso-ed" style="background:#e8f2f4;color:#0b3440">Has editado esta página: lo que ves es tu versión. <button id="cfWord2">Volver al texto del Word</button></div>' : ''}
      <header class="heroe ${f || m.mosaico ? '' : 'sin'}">
        ${medioH}${herr}
        <div class="h-dentro">
          ${etiqueta(p) ? `<div class="h-num">${esc(etiqueta(p))}</div>` : ''}
          <h1 class="h-titulo" ${editar ? ce('titulo') : ''}>${esc(p.titulo)}</h1>
          ${subs.length && !editar ? `<div class="h-subs">${subs.map((s) => `<button data-sub="${s.id}">${esc(s.numero ? s.numero + ' ' : '')}${esc(s.titulo)}</button>`).join('')}</div>` : ''}
        </div>
        ${m.nota ? `<span class="h-nota">${esc(m.nota)}</span>` : ''}
      </header>
      ${editar ? `<div class="ed-pagina"><span>Edite los textos directamente. Puede añadir y eliminar contenido con los botones de cada bloque.</span><button id="edSub">+ Subapartado</button><button id="edNumero">Título y número</button><button id="edBorrarPagina">Eliminar página</button></div>` : ''}
      <div class="cuerpo ${subs.length > 1 && !editar ? '' : 'solo'} ${p.id === 'referencias' ? 'refs' : ''}">
        <article>
          ${bloques(p.bloques, 'b.', p.id !== 'referencias', editar)}
          ${subs.map((s, k) => `<section class="sub" id="${s.id}"><h2 class="${editar ? '' : 'rev'}"><small>${esc(s.numero)}</small><span ${editar ? ce(`s.${k}.titulo`) : ''}>${esc(s.titulo)}</span></h2>${editar ? `<div class="ed-fila"><button data-subedit="${k}">Título y número</button><button data-subup="${k}">↑</button><button data-subdown="${k}">↓</button><button data-subquita="${k}">Eliminar subapartado</button></div>` : ''}${bloques(s.bloques, `s.${k}.b.`, !p.bloques.length && k === 0, editar)}</section>`).join('')}
        </article>
        ${subs.length > 1 && !editar ? `<nav class="toc"><b>En esta página</b>${subs.map((s) => `<button data-sub="${s.id}">${esc(s.numero ? s.numero + ' ' : '')}${esc(s.titulo)}</button>`).join('')}</nav>` : ''}
      </div>
      ${editar ? '' : `<div class="sigue">${enlace(ant, '', 'Anterior')}${enlace(sig, 'der', 'Siguiente')}</div>`}
    </section>`;
  }

  /* ---------- Edición ---------- */
  const nuevoId = () => 'personal-' + (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
  const trTexto = (x) => [{ x, b: false, i: false, sup: false }];
  const celdaVacia = () => ({ lineas: [], fondo: null });

  function formulario(titulo, campos, alGuardar) {
    const dlg = document.createElement('dialog'); dlg.className = 'gestor';
    dlg.innerHTML = `<form><h2>${esc(titulo)}</h2>${campos.map((c) => `<label>${esc(c.label)}${c.area ? `<textarea name="${c.key}" rows="${c.rows || 3}" ${c.required ? 'required' : ''}>${esc(c.value || '')}</textarea>` : `<input name="${c.key}" value="${esc(c.value || '')}" ${c.required ? 'required' : ''}>`}</label>`).join('')}<p class="gestor-error" role="alert"></p><footer><button type="button" class="cancelar">Cancelar</button><button type="submit">Guardar</button></footer></form>`;
    document.body.append(dlg);
    dlg.onclose = () => dlg.remove();
    $('.cancelar', dlg).onclick = () => dlg.close();
    $('form', dlg).onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      for (const k of Object.keys(values)) values[k] = values[k].trim();
      try { await alGuardar(values); dlg.close(); }
      catch (error) { $('.gestor-error', dlg).textContent = error.message; }
    };
    dlg.showModal();
  }
  const camposPagina = (p = {}) => [{ key: 'titulo', label: 'Título', value: p.titulo, required: true }, { key: 'numero', label: 'Número o etiqueta (opcional)', value: p.numero }];

  function nuevaPagina() {
    if (!ed()) return;
    formulario('Añadir página', camposPagina(), async (v) => {
      if (!v.titulo) throw new Error('Escriba un título.');
      const p = { id: nuevoId(), titulo: v.titulo, numero: v.numero, bloques: [], subs: [], huella: 'personal' };
      P.proyecto.paginasNuevas = [...(P.proyecto.paginasNuevas || []), p];
      const order = todas().map((x) => x.id).filter((id) => id !== p.id);
      const at = order.indexOf(actual); order.splice(at < 0 ? order.length : at + 1, 0, p.id);
      P.proyecto.orden = order; await guardarProyecto(true); actual = p.id; empezarEdicion();
    });
  }
  async function eliminarPagina() {
    if (!ed() || actual === 'portada' || actual === 'abreviaturas' || actual === 'ajustes') return;
    if (!confirm(`¿Eliminar «${pagina(actual).titulo}» y su contenido del proyecto? Podrá restaurarla desde Ajustes. El Word original no se modifica.`)) return;
    P.proyecto.eliminadas = [...new Set([...(P.proyecto.eliminadas || []), actual])];
    editando = false; M = null; actual = 'portada'; await guardarProyecto(true); pintar();
  }
  function editarPortada() {
    const textos = portadaTexto();
    const labels = ['Encabezado', 'Título principal', 'Subtítulo', 'Autoría', 'Área de conocimiento', 'Facultad e institución', 'Cátedra', 'Versión y fecha'];
    formulario('Editar textos de la portada', labels.map((label, i) => ({ key: 'p'+i, label, value: textos[i], area: i === 1 || i === 2 })), async (v) => {
      let n = 0;
      P.proyecto.portada = copia(EF().portada).map((b) => b.t === 'p' ? { ...b, tramos: trTexto(v['p'+n++] ?? plano(b.tramos)) } : b);
      while (n < labels.length) P.proyecto.portada.push({ t: 'p', tramos: trTexto(v['p'+n++] || '') });
      await guardarProyecto(true); pintar(true);
    });
  }
  function editarContenido() {
    if (!ed()) return;
    if (actual === 'portada') editarPortada();
    else if (actual === 'ajustes') nuevaPagina();
    else if (actual === 'abreviaturas') { const e = $('[data-abr] input'); if (e) e.focus(); }
    else if (!editando) empezarEdicion();
  }
  function subapartado(k) {
    const s = k == null ? {} : M.subs[k];
    formulario(k == null ? 'Añadir subapartado' : 'Editar subapartado', camposPagina(s), async (v) => {
      if (!v.titulo) throw new Error('Escriba un título.');
      if (k == null) M.subs.push({ id: M.id + '--' + nuevoId(), ...v, bloques: [] });
      else Object.assign(M.subs[k], v);
      guardarEdicion(); await guardarProyecto(true); pintar(true);
    });
  }

  function vistaAbreviaturas() {
    const rows = Modelo.abreviaturas(P.proyecto);
    const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) => (a.abreviatura || '\uffff').localeCompare(b.abreviatura || '\uffff', 'es', { sensitivity: 'base' }));
    return `<section class="vista abreviaturas"><h1>Índice de abreviaturas</h1><p>Abreviaturas del proyecto y su explicación.</p>${ed() ? '<p>Edite las dos columnas y pulse Guardar. Puede añadir o eliminar las filas que necesite.</p><div class="ed-fila"><button id="abrMas">+ Añadir abreviatura</button><button id="abrGuardar">Guardar abreviaturas</button></div>' : ''}<table class="t"><thead><tr><th>Abreviatura</th><th>Explicación</th>${ed() ? '<th>Acciones</th>' : ''}</tr></thead><tbody>${sorted.map((r) => `<tr data-abr="${r.i}">${ed() ? `<td><input data-abr-campo="abreviatura" aria-label="Abreviatura" value="${esc(r.abreviatura)}"></td><td><textarea rows="2" data-abr-campo="explicacion" aria-label="Explicación">${esc(r.explicacion)}</textarea></td><td><button data-abr-quita="${r.i}">Eliminar</button></td>` : `<td><b>${esc(r.abreviatura)}</b></td><td>${esc(r.explicacion)}</td>`}</tr>`).join('')}</tbody></table>${!rows.length ? '<p>No hay abreviaturas registradas.</p>' : ''}<p id="abrEstado" role="status"></p></section>`;
  }
  function conectarAbreviaturas() {
    if (!ed()) return;
    const commit = () => {
      const rows = Modelo.abreviaturas(P.proyecto);
      $$('[data-abr]').forEach((tr) => $$('[data-abr-campo]', tr).forEach((input) => { rows[Number(tr.dataset.abr)][input.dataset.abrCampo] = input.value; }));
      P.proyecto.abreviaturas = rows;
    };
    $$('[data-abr-campo]').forEach((input) => { input.oninput = () => { commit(); guardarProyecto(); $('#abrEstado').textContent = 'Guardando los cambios…'; }; });
    $('#abrMas').onclick = async () => { commit(); P.proyecto.abreviaturas.push({ abreviatura: '', explicacion: '' }); await guardarProyecto(true); pintar(true); $$('[data-abr] input').find((e) => !e.value)?.focus(); };
    $('#abrGuardar').onclick = async () => { commit(); await guardarProyecto(true); pintar(true); $('#abrEstado').textContent = 'Abreviaturas guardadas. Se incluyen en las versiones del tribunal.'; };
    $$('[data-abr-quita]').forEach((button) => { button.onclick = async () => {
      commit(); if (!confirm('¿Eliminar esta abreviatura?')) return;
      P.proyecto.abreviaturas.splice(Number(button.dataset.abrQuita), 1); await guardarProyecto(true); pintar(true);
    }; });
  }
  // Rutas: "titulo", "b.3", "b.3.i.2" (lista), "b.3.f.1.2" (celda), "b.3.pie" (pie de foto), "s.1.titulo", "s.1.b.0"...
  function lugar(ruta) {
    const t = ruta.split('.');
    let base = M, k = 0;
    if (t[0] === 's') { base = M.subs[Number(t[1])]; k = 2; }
    if (t[k] === 'titulo') return { base, campo: 'titulo' };
    return { lista: base.bloques, idx: Number(t[k + 1]), resto: t.slice(k + 2), base };
  }
  function aplicarTexto(ruta, el) {
    const L = lugar(ruta);
    if (L.campo) { L.base.titulo = el.textContent.replace(/\s+/g, ' ').trim(); return; }
    const b = L.lista[L.idx], tr = leerTramos(el);
    if (!L.resto.length) b.tramos = tr;
    else if (L.resto[0] === 'i') b.items[Number(L.resto[1])] = tr;
    else if (L.resto[0] === 'f') b.filas[Number(L.resto[1])][Number(L.resto[2])].lineas = partirLineas(tr);
    else if (L.resto[0] === 'pie') b.pie = tr;
  }
  function guardarEdicion() {
    const o = original(M.id);
    P.proyecto.ediciones = P.proyecto.ediciones || {};
    P.proyecto.ediciones[M.id] = { base: o.huella, titulo: M.titulo, numero: M.numero, bloques: copia(M.bloques), subsecciones: copia(M.subs || []), fecha: new Date().toISOString() };
    guardarProyecto();
  }
  function empezarEdicion() {
    const { editada, conflicto, ...p } = copia(pagina(actual));
    M = p; editando = true; pintar(true);
    aviso('Pulsa sobre cualquier texto para cambiarlo. Se guarda solo.');
  }
  async function terminarEdicion() { await guardarProyecto(true); editando = false; M = null; pintar(true); }
  async function volverAlWord(id) {
    if (!confirm('¿Volver al texto del Word en esta página? Se perderán tus cambios de texto en ella.')) return;
    delete (P.proyecto.ediciones || {})[id];
    editando = false; M = null; await guardarProyecto(true); pintar(); aviso('La página vuelve a mostrar el texto del Word.');
  }
  function estructura(accion, ruta) {
    const L = lugar(ruta);
    const i = L.idx;
    const b = L.lista[i];
    if (accion === 'arriba' || accion === 'abajo') {
      const at = i + (accion === 'arriba' ? -1 : 1);
      if (at < 0 || at >= L.lista.length) return;
      [L.lista[i], L.lista[at]] = [L.lista[at], L.lista[i]];
      guardarEdicion(); pintar(true); return;
    }
    if (accion === 'lista' || accion === 'tabla') {
      const block = accion === 'lista' ? { t: 'lista', items: [trTexto('Nuevo elemento')] } : { t: 'tabla', filas: [[celdaVacia(), celdaVacia()], [celdaVacia(), celdaVacia()]] };
      L.lista.splice(i + 1, 0, block); guardarEdicion(); pintar(true); return;
    }
    if (accion === 'quita') { if (!confirm('¿Eliminar este bloque de la página?')) return; L.lista.splice(i, 1); guardarEdicion(); pintar(true); return; }
    if (accion === 'mas') {
      const b = L.lista[i];
      if (b && b.t === 'lista') b.items.push([{ x: 'Nuevo elemento', b: false, i: false, sup: false }]);
      else L.lista.splice(i + 1, 0, { t: 'p', tramos: [{ x: 'Escribe aquí el nuevo párrafo.', b: false, i: false, sup: false }] });
      guardarEdicion(); pintar(true); return;
    }
    if (accion === 'ins') galeria({ tipo: 'insertar' }, (sel) => { L.lista.splice(i + 1, 0, { t: 'medio', src: sel.rel, pie: sel.nota ? [{ x: sel.nota, b: false, i: false, sup: false }] : [] }); guardarEdicion(); pintar(true); });
  }
  function estructuraParte(accion, ruta, n) {
    const L = lugar(ruta), b = L.lista[L.idx];
    if (accion === 'itemquita') b.items.splice(n, 1);
    if (accion === 'filamas') b.filas.push(Array.from({ length: b.filas[0]?.length || 2 }, celdaVacia));
    if (accion === 'colmas') b.filas.forEach((row) => row.push(celdaVacia()));
    if (accion === 'filaquita') {
      if (b.filas.length === 1) { aviso('La tabla debe tener al menos una fila. Puede eliminar el bloque completo.'); return; }
      if (!confirm('¿Eliminar esta fila y sus datos?')) return;
      b.filas.splice(n, 1);
    }
    if (accion === 'colquita') {
      if (b.filas[0].length === 1) { aviso('La tabla debe tener al menos una columna. Puede eliminar el bloque completo.'); return; }
      if (!confirm('¿Eliminar esta columna y sus datos?')) return;
      b.filas.forEach((row) => row.splice(n, 1));
    }
    guardarEdicion(); pintar(true);
  }

  /* ---------- PDF en ventana emergente ---------- */
  function abrirPdf(rel) {
    const nombre = rel.split('/').pop().replace(/\.pdf$/i, '').replace(/_/g, ' ');
    if (!CONSULTA) { window.api.abrirPdf(rel); return; }
    const w = window.open('', '_blank', 'popup,width=1100,height=860');
    if (!w) { visorPdf(rel, nombre); return; }
    w.document.title = nombre;
    w.document.body.style.cssText = 'margin:0;background:#00151b';
    const f = w.document.createElement('iframe');
    f.style.cssText = 'border:0;width:100vw;height:100vh;display:block';
    f.src = url(rel) + '#toolbar=0&navpanes=0&view=FitH';
    w.document.body.append(f);
    w.document.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // Si el navegador bloquea las ventanas emergentes, el PDF se abre en un visor grande dentro de la página.
  function visorPdf(rel, nombre) {
    let v = $('#visorPdf');
    if (!v) { v = document.createElement('div'); v.id = 'visorPdf'; document.body.append(v); }
    v.innerHTML = `<div class="vp-cab"><b>${esc(nombre)}</b><button id="vpCerrar">Cerrar</button></div><iframe title="${esc(nombre)}" src="${esc(url(rel))}#toolbar=0&navpanes=0&view=FitH"></iframe>`;
    v.hidden = false;
    $('#vpCerrar').onclick = () => { v.hidden = true; v.innerHTML = ''; };
  }
  document.addEventListener('keydown', (e) => { const v = $('#visorPdf'); if (e.key === 'Escape' && v && !v.hidden) { v.hidden = true; v.innerHTML = ''; } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pdf]');
    if (!b || e.target.closest('[contenteditable="true"]')) return;
    e.preventDefault(); abrirPdf(b.dataset.pdf);
  });

  /* ---------- Galería de fotos y vídeos ---------- */
  function galeria(o, alElegir) {
    let sel = null;
    const g = $('#galeria');
    const pinta = () => {
      const ms = (P.medios || []).filter((x) => (o.tipo === 'fondo' ? x.tipo !== 'pdf' : x.tipo !== 'carpeta'));
      g.innerHTML = `<div class="ga-caja"><div class="ga-cab"><h2>${o.tipo === 'fondo' ? 'Foto o vídeo de la cabecera' : 'Insertar una foto, un vídeo o un PDF'}</h2><button id="gaAnadir" class="pri">Añadir desde el ordenador…</button><button id="gaCarpeta">Abrir carpeta</button><button id="gaCerrar">Cerrar</button></div>
        <div class="ga-rej">${o.tipo === 'fondo' ? '<button class="ga-it nada" data-rel="">Sin foto</button>' : ''}${ms.map((x) => `<button class="ga-it ${sel && sel.rel === x.rel ? 'sel' : ''}" data-rel="${esc(x.rel)}" data-tipo="${x.tipo}">${x.tipo === 'pdf' ? '<b class="ga-pdf">PDF</b><i>documento</i>' : x.tipo === 'video' ? `<video src="${esc(url(x.rel))}#t=1" muted preload="metadata"></video><i>vídeo</i>` : `<img src="${esc(url(x.muestra || x.rel))}" alt="" loading="lazy">${x.tipo === 'carpeta' ? `<i>mosaico · ${x.n}</i>` : ''}`}<span>${esc(x.rel.split('/').pop())}</span></button>`).join('')}</div>
        <div class="ga-pie"><input id="gaNota" placeholder="${o.tipo === 'fondo' ? 'Nota en la imagen (opcional), por ejemplo «Imagen generada con inteligencia artificial».' : 'Pie de foto (opcional)'}" value="${esc(o.nota || '')}"><button id="gaUsar" class="pri" ${sel ? '' : 'disabled'}>Usar</button></div></div>`;
      g.hidden = false;
      $$('.ga-it', g).forEach((b) => { b.onclick = () => { sel = { rel: b.dataset.rel, tipo: b.dataset.tipo || '' }; o.nota = $('#gaNota').value; pinta(); }; b.ondblclick = () => { sel = { rel: b.dataset.rel, tipo: b.dataset.tipo || '' }; usar(); }; });
      $('#gaCerrar').onclick = () => { g.hidden = true; };
      $('#gaCarpeta').onclick = () => window.api.abrirCarpeta('medios');
      $('#gaAnadir').onclick = async () => { o.nota = $('#gaNota').value; const r = await window.api.anadirMedios(); P.medios = r.medios; if (r.nuevos && r.nuevos.length) { sel = { rel: r.nuevos[0], tipo: esPdf(r.nuevos[0]) ? 'pdf' : esVideo(r.nuevos[0]) ? 'video' : 'img' }; aviso(`${r.nuevos.length} ${r.nuevos.length === 1 ? 'archivo copiado' : 'archivos copiados'} a la carpeta de medios.`); } pinta(); };
      $('#gaUsar').onclick = usar;
    };
    const usar = () => { if (!sel) return; g.hidden = true; alElegir({ ...sel, nota: ($('#gaNota') || {}).value || '' }); };
    pinta();
  }
  async function elegirFondo(id) {
    const m = medio(id);
    galeria({ tipo: 'fondo', nota: m.nota }, async (sel) => {
      P.proyecto.medios = P.proyecto.medios || {};
      if (!sel.rel) delete P.proyecto.medios[id];
      else P.proyecto.medios[id] = { ...(sel.tipo === 'video' ? { video: sel.rel } : sel.tipo === 'carpeta' ? { mosaico: sel.rel } : { fondo: sel.rel }), ...(sel.nota ? { nota: sel.nota } : {}) };
      await guardarProyecto(true); pintar(true); aviso('Cabecera actualizada.');
    });
  }

  /* ---------- Diferencias con el Word ---------- */
  function textos(p) {
    const out = [p.titulo];
    const mete = (l) => (l || []).forEach((b) => {
      if (b.t === 'p' || b.t === 'pie') out.push(plano(b.tramos));
      else if (b.t === 'lista') b.items.forEach((it) => out.push('· ' + plano(it)));
      else if (b.t === 'tabla') b.filas.forEach((r) => out.push(r.map((c) => c.lineas.map(plano).join(' ')).join(' | ')));
      else if (b.t === 'medio') out.push(`[${esPdf(b.src) ? 'PDF' : esVideo(b.src) ? 'Vídeo' : 'Foto'}: ${b.src.split('/').pop()}]`);
    });
    mete(p.bloques); (p.subs || []).forEach((s) => { out.push(s.titulo); mete(s.bloques); });
    return out.filter(Boolean);
  }
  function verDiferencias(id) {
    const mia = textos(pagina(id)), word = textos(original(id));
    const sm = new Set(mia), sw = new Set(word);
    $('#dif').innerHTML = `<div class="df-caja"><div class="df-cab"><h2>Diferencias en «${esc(original(id).titulo)}»</h2><button id="dfMia">Quedarme con mi versión</button><button class="pri" id="dfWord">Usar la del Word</button><button id="dfCerrar">Cerrar</button></div>
      <div class="df-cols"><div><h3>Tu versión</h3>${mia.map((t) => `<p class="${sw.has(t) ? '' : 'distinto'}">${esc(t)}</p>`).join('')}</div><div><h3>Word · ${esc(P.fuente ? P.fuente.nombre : '')}</h3>${word.map((t) => `<p class="${sm.has(t) ? '' : 'distinto'}">${esc(t)}</p>`).join('')}</div></div></div>`;
    $('#dif').hidden = false;
    $('#dfCerrar').onclick = () => { $('#dif').hidden = true; };
    $('#dfMia').onclick = async () => { $('#dif').hidden = true; await quedarmeMia(id); };
    $('#dfWord').onclick = async () => { $('#dif').hidden = true; delete P.proyecto.ediciones[id]; await guardarProyecto(true); pintar(); aviso('Se usa el texto del Word.'); };
  }
  async function quedarmeMia(id) { P.proyecto.ediciones[id].base = original(id).huella; await guardarProyecto(true); pintar(); aviso('Se mantiene tu versión.'); }

  /* ---------- Ajustes ---------- */
  function vistaAjustes() {
    const menu = P.ajustes.menu || 'vertical';
    const per = P.proyecto.personas || {};
    const ps = todas();
    return `<section class="vista ajustes"><h1>Ajustes</h1>
      <div class="aj-sec" id="secPub"><h2>Publicar en la web</h2><p>El tribunal entra con un enlace y una clave. Todo va cifrado: sin la clave no se puede leer nada.</p><div id="pubCaja"><p>Cargando…</p></div></div>
      <div class="aj-sec"><h2>Presentación del menú</h2><p>Cómo se mueve el tribunal por el proyecto. Se aplica también a las versiones que generes.</p>
        <div class="opciones"><button class="op ${menu === 'vertical' ? 'on' : ''}" data-menu="vertical"><div class="mini v"></div><b>Menú vertical</b><small>Columna a la izquierda con todos los apartados.</small></button>
        <button class="op ${menu === 'horizontal' ? 'on' : ''}" data-menu="horizontal"><div class="mini h"></div><b>Menú horizontal</b><small>Barra arriba con menús desplegables por grupos.</small></button></div></div>
      <div class="aj-sec"><h2>Páginas</h2><p>Orden en que aparecen y si el tribunal las ve. El texto se cambia con «Editar página».</p>
        <div class="pags">${ps.map((p, i) => `<div class="pg ${ocultas().has(p.id) ? 'oc' : ''}"><span class="n">${esc(etiqueta(p))}</span><span>${esc(p.titulo)} ${p.conflicto ? '<span class="tag">‼ cambió en el Word</span>' : p.editada ? '<span class="tag" style="color:#0b3440">editada</span>' : ''}</span><button data-sube="${i}" ${i ? '' : 'disabled'}>↑</button><button data-baja="${i}" ${i < ps.length - 1 ? '' : 'disabled'}>↓</button><button data-oc="${p.id}">${ocultas().has(p.id) ? 'Mostrar' : 'Ocultar'}</button></div>`).join('')}</div>
        <div class="aj-fila" style="margin-top:12px"><button id="ajNueva">+ Añadir página</button><button id="ajRestaurar">Restaurar páginas eliminadas (${(P.proyecto.eliminadas || []).length})</button><button id="ajOrden">Volver al orden del Word</button></div></div>
      <div class="aj-sec"><h2>Las personas</h2><p>Banda de la portada. Las fotos se leen de la carpeta <b>_datos/${esc(carpetaPersonas())}</b> cada vez que abres la aplicación (ahora hay ${(P.personas || []).length}).</p>
        <label class="campo">Cifra<input id="ajCifra" value="${esc(per.cifra || '')}"></label><label class="campo">Texto<input id="ajTexto" value="${esc(per.texto || '')}"></label></div>
      <div class="aj-sec"><h2>Índice del proyecto</h2><p>${P.fuente ? `Ahora se lee <b>${esc(P.fuente.nombre)}</b>. Se usa siempre el número de versión más alto de la carpeta Indices, al abrir y al guardar el Word.` : esc(P.error || '')}</p>
        <div class="aj-fila"><button id="ajReleer">Comprobar ahora</button><button id="ajIndices">Abrir carpeta Indices</button></div></div>
      <div class="aj-sec"><h2>Fotos y vídeos</h2><p>${(P.medios || []).length} elementos en <b>_datos/medios</b>. Puedes añadir más desde el ordenador o copiarlos en esa carpeta.</p>
        <div class="aj-fila"><button id="ajAnadir">Añadir fotos, vídeos o PDF…</button><button id="ajMedios">Abrir carpeta de medios</button></div></div>
      <div class="aj-sec"><h2>Generar la versión del tribunal</h2><p>Sale exactamente como la vista Tribunal: sin páginas ocultas y sin modo editor. Elige una carpeta corta, como el Escritorio o un pendrive.</p>
        <div class="gen"><button data-g="pc">Windows<small>Programa: doble clic en Proyecto.exe</small></button><button data-g="mac">Mac<small>Dos ZIP: Apple Silicon e Intel</small></button><button data-g="html">HTML<small>Carpeta que se abre en cualquier navegador</small></button><button data-g="zip">ZIP<small>La versión HTML comprimida, para enviar</small></button></div>
        <div id="prog"></div></div>
      <div class="aj-sec"><h2>Copias de seguridad</h2><p>Antes de guardar se copia tu archivo de cambios en <b>_datos/copias</b> (como máximo una vez por minuto).</p><div class="aj-fila"><button id="ajCopias">Abrir copias de seguridad</button></div></div>
    </section>`;
  }
  /* ---------- Publicar en la web ---------- */
  let pubVer = false;
  const horaEs = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
  function lineaEstado(s) {
    const t = s.estado === 'publicando' ? `Publicando… ${s.texto || ''}` : s.estado === 'error' ? `No se ha podido publicar: ${s.texto}` : s.texto || (s.ultima ? `Última publicación: ${horaEs(s.ultima)}.` : 'Aún no se ha publicado.');
    return `<p class="pub-est ${s.estado === 'error' ? 'mal' : s.estado === 'listo' ? 'bien' : ''}" id="pubEst" role="status">${esc(t)}</p>`;
  }
  async function pintarPub() {
    if (CONSULTA || !$('#pubCaja')) return;
    const s = await window.api.estadoPub();
    const caja = $('#pubCaja');
    if (!caja) return;
    const auto = s.modo === 'auto';
    caja.innerHTML = `
      <div class="pub-fila"><span class="pub-et">Cuándo se publica</span><div class="aj-fila"><button data-pm="manual" class="${auto ? '' : 'pub-on'}">Manual</button><button data-pm="auto" class="${auto ? 'pub-on' : ''}">Automático</button></div></div>
      <p class="pub-nota">${auto ? 'Automático: cuando cambias algo (o guardas una versión nueva del Word), se publica solo al cabo de un minuto y medio.' : 'Manual: se publica cuando pulsas «Publicar ahora».'}</p>
      <div class="pub-fila"><label class="pub-et" for="pubClave">Clave de acceso</label><input id="pubClave" class="pub-in" type="${pubVer ? 'text' : 'password'}" value="${esc(s.clave || '')}" spellcheck="false" autocomplete="off" placeholder="Escribe la clave (mínimo 6 caracteres)"><div class="aj-fila"><button id="pubVer">${pubVer ? 'Ocultar' : 'Mostrar'}</button><button id="pubGuardaClave">Guardar clave</button></div></div>
      <p class="pub-nota">Si cambias la clave, la anterior deja de servir: publica otra vez y envía la nueva al tribunal.</p>
      <div class="pub-fila"><span class="pub-et">Enlace para el tribunal</span>${s.url ? `<a href="${esc(s.url)}" target="_blank" class="pub-url">${esc(s.url)}</a><div class="aj-fila"><button id="pubCopiar">Copiar enlace</button></div>` : '<span class="pub-nota" style="margin:0">Aparecerá después de la primera publicación.</span>'}</div>
      <div class="pub-fila"><button class="pub-ya" id="pubYa" ${s.estado === 'publicando' || !s.clave ? 'disabled' : ''}>Publicar ahora</button></div>
      ${lineaEstado(s)}`;
    $$('[data-pm]', caja).forEach((b) => { b.onclick = async () => { const r = await window.api.ajustePub({ modo: b.dataset.pm }); if (r.error) aviso(r.error); pintarPub(); }; });
    $('#pubVer').onclick = () => { pubVer = !pubVer; $('#pubClave').type = pubVer ? 'text' : 'password'; $('#pubVer').textContent = pubVer ? 'Ocultar' : 'Mostrar'; };
    $('#pubGuardaClave').onclick = async () => {
      const v = $('#pubClave').value;
      if (v === s.clave) { aviso('La clave no ha cambiado.'); return; }
      if (s.clave && !confirm('¿Cambiar la clave? La anterior dejará de servir.')) return;
      const r = await window.api.ajustePub({ clave: v });
      aviso(r.error || 'Clave guardada. Ya puedes publicar.');
      pintarPub();
    };
    const bc = $('#pubCopiar'); if (bc) bc.onclick = async () => { try { await navigator.clipboard.writeText(s.url); aviso('Enlace copiado.'); } catch (x) { aviso('No se ha podido copiar.'); } };
    $('#pubYa').onclick = async () => { $('#pubYa').disabled = true; const r = await window.api.publicar(); if (r && r.error) aviso(r.error); pintarPub(); };
  }
  if (!CONSULTA) window.api.alPublicacion((s) => {
    const e = $('#pubEst');
    if (e) { e.outerHTML = lineaEstado(s); const b = $('#pubYa'); if (b) b.disabled = s.estado === 'publicando'; }
    if (s.estado === 'listo' && $('#pubCaja')) pintarPub();
    if (s.estado === 'error' && !$('#pubCaja')) aviso('No se ha podido publicar en la web: ' + s.texto, 7000);
  });
  function conectarAjustes(e) {
    pintarPub();
    $('#ajNueva').onclick = nuevaPagina;
    $('#ajRestaurar').onclick = async () => {
      if (!(P.proyecto.eliminadas || []).length) { aviso('No hay páginas eliminadas.'); return; }
      if (!confirm('¿Restaurar todas las páginas eliminadas, conservando sus ediciones?')) return;
      P.proyecto.eliminadas = []; await guardarProyecto(true); pintar(true);
    };
    $$('[data-menu]', e).forEach((b) => { b.onclick = async () => { P.ajustes.menu = b.dataset.menu; await window.api.ajuste('menu', P.ajustes.menu); pintar(true); aviso(P.ajustes.menu === 'horizontal' ? 'Menú horizontal con desplegables.' : 'Menú vertical.'); }; });
    const orden = () => todas().map((p) => p.id);
    const mover = async (i, d) => { const o = orden(); [o[i], o[i + d]] = [o[i + d], o[i]]; P.proyecto.orden = o; await guardarProyecto(true); pintar(true); };
    $$('[data-sube]', e).forEach((b) => { b.onclick = () => mover(Number(b.dataset.sube), -1); });
    $$('[data-baja]', e).forEach((b) => { b.onclick = () => mover(Number(b.dataset.baja), 1); });
    $$('[data-oc]', e).forEach((b) => { b.onclick = async () => { const s = ocultas(), id = b.dataset.oc; s.has(id) ? s.delete(id) : s.add(id); P.proyecto.ocultas = [...s]; await guardarProyecto(true); pintar(true); }; });
    $('#ajOrden').onclick = async () => { delete P.proyecto.orden; await guardarProyecto(true); pintar(true); aviso('Orden del Word.'); };
    const per = () => { P.proyecto.personas = { ...(P.proyecto.personas || {}), cifra: $('#ajCifra').value.trim(), texto: $('#ajTexto').value.trim() }; guardarProyecto(); };
    $('#ajCifra').oninput = per; $('#ajTexto').oninput = per;
    $('#ajReleer').onclick = async () => { P = { ...await window.api.releer() }; pintar(true); aviso(P.fuente ? `Leído: ${P.fuente.nombre}` : 'No hay índice.'); };
    $('#ajIndices').onclick = () => window.api.abrirCarpeta('indices');
    $('#ajMedios').onclick = () => window.api.abrirCarpeta('medios');
    $('#ajCopias').onclick = () => window.api.abrirCarpeta('copias');
    $('#ajAnadir').onclick = async () => { const r = await window.api.anadirMedios(); P.medios = r.medios; pintar(true); if (r.nuevos) aviso(`${r.nuevos.length} copiados a _datos/medios.`); };
    $$('[data-g]', e).forEach((b) => { b.onclick = () => generarVersion(b.dataset.g); });
  }
  async function generarVersion(tipo) {
    if (generando) return;
    if (editando) await terminarEdicion();
    await guardarProyecto(true);
    generando = true;
    $$('[data-g]').forEach((b) => { b.disabled = true; });
    $('#prog').textContent = 'Preparando…';
    const r = await window.api.generar(tipo);
    generando = false;
    $$('[data-g]').forEach((b) => { b.disabled = false; });
    if (r.cancelado) $('#prog').textContent = '';
    else if (r.error) { $('#prog').textContent = ''; aviso(r.error, 7000); }
    else $('#prog').innerHTML = '<b>Listo.</b><br>' + r.salida.map(esc).join('<br>');
  }
  if (!CONSULTA) window.api.alProgreso((p) => { const e = $('#prog'); if (e && generando) e.innerHTML = esc(p.fase) + (p.n ? ` (${p.i} de ${p.n})<br><progress max="${p.n}" value="${p.i}"></progress>` : ''); });

  /* ---------- Animaciones ---------- */
  let observa = null;
  function animar(raiz) {
    if (observa) observa.disconnect();
    observa = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('vis');
      e.target.querySelectorAll('[data-cuenta]').forEach(contar);
      if (e.target.matches('[data-cuenta]')) contar(e.target);
      observa.unobserve(e.target);
    }), { root: $('#escena'), threshold: .15 });
    $$('.rev', raiz).forEach((e) => observa.observe(e));
    $$('.cifra-g strong[data-cuenta]', raiz).forEach((e) => observa.observe(e));
  }
  function contar(el) {
    if (el.dataset.hecho) return; el.dataset.hecho = '1';
    const txt = el.dataset.cuenta, fin = aNumero(txt);
    if (!Number.isFinite(fin)) return;
    const miles = /\./.test(txt) || fin >= 10000, ini = performance.now(), dur = 1600;
    const f = (t) => { const k = Math.min(1, (t - ini) / dur), v = Math.round(fin * (1 - Math.pow(1 - k, 3))); el.textContent = miles ? v.toLocaleString('es-ES') : String(v); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  const MINIS = new Map();
  function mini(u) {
    if (MINIS.has(u)) return MINIS.get(u);
    const pr = fetch(u).then((r) => r.blob()).then((b) => createImageBitmap(b, { resizeWidth: 260, resizeQuality: 'medium' })).catch(() => null);
    MINIS.set(u, pr); return pr;
  }
  function mosaico(caja, cv, lista) {
    if (!cv || !lista.length) return;
    const W = caja.clientWidth, H = caja.clientHeight, dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    let cols = 1, mejor = 1e9;
    for (let k = 4; k <= 30; k++) { const r = Math.ceil(lista.length / k), d = Math.abs((W / k) / (H / r) - .75); if (d < mejor) { mejor = d; cols = k; } }
    const rows = Math.ceil(lista.length / cols), cw = W / cols, ch = H / rows;
    const orden = lista.map((x) => ({ x, r: Math.random() })).sort((a, b) => a.r - b.r);
    const celdas = Array.from({ length: cols * rows }, (_, i) => ({ cx: (i % cols) * cw, cy: Math.floor(i / cols) * ch, u: url(`${carpetaPersonas()}/${orden[i % orden.length].x}`), t: Math.random() * 2600 }));
    const t0 = performance.now(), bm = new Map();
    celdas.forEach((c) => mini(c.u).then((b) => bm.set(c.u, b)));
    const pinta = (t) => {
      if (!cv.isConnected) return;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      let pend = false;
      for (const c of celdas) {
        const b = bm.get(c.u), a = Math.max(0, Math.min(1, (t - t0 - c.t) / 500));
        if (!b || a < 1) pend = true;
        if (!b || a <= 0) continue;
        const e = Math.max(cw / b.width, ch / b.height), sw = cw / e, sh = ch / e;
        g.globalAlpha = a; g.drawImage(b, (b.width - sw) / 2, Math.max(0, (b.height - sh) * .3), sw, sh, c.cx + .5, c.cy + .5, cw - 1, ch - 1);
      }
      g.globalAlpha = 1;
      if (pend) requestAnimationFrame(pinta);
    };
    requestAnimationFrame(pinta);
  }

  /* ---------- Pintar y navegar ---------- */
  function pintar(conservar) {
    const e = $('#escena'), arriba = e.scrollTop;
    document.body.classList.toggle('tribunal', modo === 'tribunal');
    document.body.classList.toggle('consulta', CONSULTA);
    document.body.classList.toggle('horiz', (P.ajustes.menu || 'vertical') === 'horizontal');
    document.body.classList.toggle('editando', editando);
    $$('.mEd').forEach((b) => b.setAttribute('aria-pressed', modo === 'editor')); $$('.mTr').forEach((b) => b.setAttribute('aria-pressed', modo === 'tribunal'));
    $('#barraEd').hidden = !editando;
    if (!P.documento) { e.innerHTML = `<div class="vacio">${esc(P.error || 'No hay índice.')}<br><br>Guarda el Word del proyecto en la carpeta <b>Indices</b> y la aplicación lo leerá sola.</div>`; pintarNav(); return; }
    if (actual === 'ajustes' && !ed()) actual = 'portada';
    if (actual !== 'portada' && actual !== 'ajustes' && !visibles().some((p) => p.id === actual)) actual = 'portada';
    pintarNav();
    e.innerHTML = actual === 'portada' ? vistaPortada() : actual === 'ajustes' ? vistaAjustes() : actual === 'abreviaturas' ? vistaAbreviaturas() : vistaPagina(pagina(actual));
    if (conservar) e.scrollTop = arriba;
    $$('[data-ir]', e).forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
    $$('[data-sub]', e).forEach((b) => { b.onclick = () => { const s = document.getElementById(b.dataset.sub); if (s) s.scrollIntoView({ behavior: 'smooth' }); }; });
    $$('[data-lupa]', e).forEach((f) => { f.onclick = () => { $('#lupa img').src = f.dataset.lupa; $('#lupa').hidden = false; }; });
    $$('[data-lupa-foto]', e).forEach((f) => { f.onclick = () => { $('#lupa img').src = f.dataset.lupaFoto; $('#lupa').hidden = false; }; });
    $$('.tj video', e).forEach((v) => { v.parentElement.onmouseenter = () => v.play().catch(() => {}); v.parentElement.onmouseleave = () => v.pause(); });
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on('bOcultar', async () => { const s = ocultas(); s.has(actual) ? s.delete(actual) : s.add(actual); P.proyecto.ocultas = [...s]; await guardarProyecto(true); pintar(true); aviso(s.has(actual) ? 'Página oculta: el tribunal no la verá.' : 'Página visible para el tribunal.'); });
    on('bEditar', empezarEdicion);
    on('edSub', () => subapartado(null));
    on('edNumero', () => formulario('Título y número de página', camposPagina(M), async (v) => {
      if (!v.titulo) throw new Error('Escriba un título.');
      Object.assign(M, v); guardarEdicion(); await guardarProyecto(true); pintar(true);
    }));
    on('edBorrarPagina', eliminarPagina);
    on('bFondo', () => elegirFondo(actual));
    on('bFondoPortada', () => elegirFondo('portada'));
    on('bVisto', async () => { await marcarVisto(); pintar(true); });
    on('cfVer', () => verDiferencias(actual));
    on('cfMia', () => quedarmeMia(actual));
    on('cfWord', () => volverAlWord(actual));
    on('cfWord2', () => volverAlWord(actual));
    if (actual === 'ajustes') conectarAjustes(e);
    if (actual === 'abreviaturas') conectarAbreviaturas();
    if (editando) {
      $$('[data-k]', e).forEach((el) => {
        el.addEventListener('input', () => { aplicarTexto(el.dataset.k, el); guardarEdicion(); });
        el.addEventListener('paste', (ev) => { ev.preventDefault(); document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain')); });
      });
      $$('[data-mas]', e).forEach((b) => { b.onclick = () => estructura('mas', b.dataset.mas); });
      $$('[data-ins]', e).forEach((b) => { b.onclick = () => estructura('ins', b.dataset.ins); });
      $$('[data-quita]', e).forEach((b) => { b.onclick = () => estructura('quita', b.dataset.quita); });
      for (const accion of ['lista', 'tabla', 'arriba', 'abajo']) {
        $$(`[data-${accion}]`, e).forEach((button) => { button.onclick = () => estructura(accion, button.dataset[accion]); });
      }
      for (const accion of ['itemquita', 'filamas', 'colmas', 'filaquita', 'colquita']) {
        $$(`[data-${accion}]`, e).forEach((button) => { button.onclick = () => estructuraParte(accion, button.dataset[accion], Number(button.dataset.item ?? button.dataset.fila ?? button.dataset.col)); });
      }
      $$('[data-subedit]', e).forEach((b) => { b.onclick = () => subapartado(Number(b.dataset.subedit)); });
      $$('[data-subquita]', e).forEach((b) => { b.onclick = () => { if (!confirm('¿Eliminar este subapartado y todo su contenido?')) return; M.subs.splice(Number(b.dataset.subquita), 1); guardarEdicion(); pintar(true); }; });
      for (const [accion, delta] of [['subup', -1], ['subdown', 1]]) {
        $$(`[data-${accion}]`, e).forEach((b) => { b.onclick = () => {
          const i = Number(b.dataset[accion]), j = i + delta;
          if (j < 0 || j >= M.subs.length) return;
          [M.subs[i], M.subs[j]] = [M.subs[j], M.subs[i]];
          guardarEdicion(); pintar(true);
        }; });
      }
    }
    const per = $('#personas'); if (per) mosaico(per, $('canvas', per), P.personas || []);
    const hm = $('.h-mosaico', e); if (hm) mosaico(hm.parentElement, hm, P.personas || []);
    animar(e);
    if (editando) $$('.rev', e).forEach((x) => x.classList.add('vis'));
    progreso();
  }
  async function ir(id) {
    if (!id) return;
    if (editando) await terminarEdicion();
    actual = id;
    $('#escena').scrollTo({ top: 0, behavior: 'instant' });
    pintar();
  }
  function progreso() {
    const e = $('#escena'), k = e.scrollHeight > e.clientHeight ? e.scrollTop / (e.scrollHeight - e.clientHeight) : 0;
    $('#progreso i').style.width = `${(k * 100).toFixed(1)}%`;
    let act = null;
    $$('.sub', e).forEach((s) => { if (s.getBoundingClientRect().top < 160) act = s.id; });
    $$('.toc button').forEach((b) => b.classList.toggle('act', b.dataset.sub === act));
  }
  $('#escena').addEventListener('scroll', progreso, { passive: true });
  $('#lupa').onclick = () => { $('#lupa').hidden = true; };
  $$('#barraEd [data-cmd]').forEach((b) => { b.onmousedown = (ev) => { ev.preventDefault(); document.execCommand(b.dataset.cmd); const el = document.activeElement; if (el && el.dataset.k) { aplicarTexto(el.dataset.k, el); guardarEdicion(); } }; });
  $('#beFin').onclick = terminarEdicion;
  $$('.bContenido').forEach((b) => { b.onclick = editarContenido; });
  $('#beRest').onclick = () => volverAlWord(actual);
  if (!CONSULTA) {
    $$('.mEd').forEach((b) => { b.onclick = async () => { modo = 'editor'; await window.api.ajuste('modo', modo); pintar(); }; });
    $$('.mTr').forEach((b) => { b.onclick = async () => { if (editando) await terminarEdicion(); await guardarProyecto(true); modo = 'tribunal'; await window.api.ajuste('modo', modo); pintar(); aviso('Vista del tribunal: así lo verán.'); }; });
    window.api.alCerrar?.(async () => { try { await guardarProyecto(true); await window.api.cerrar(); } catch { /* El error de guardado queda visible; se mantiene la ventana abierta. */ } });
    window.api.alIndice(async ({ paquete }) => {
      await guardarProyecto(true);
      P = await window.api.leer(); if (editando) { editando = false; M = null; }
      pintar(true);
      aviso(`Índice actualizado: ${paquete.fuente.nombre}`, 5000);
    });
    // Primera vez: se toma como referencia la versión actual del índice.
    if (P.documento && !P.proyecto.visto) await marcarVisto();
  }

  /* ---------- Buscador ---------- */
  const sinAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function indexar() {
    const out = [];
    if (visibles().some((p) => p.id === 'abreviaturas')) Modelo.abreviaturas(P.proyecto).forEach((r) => out.push({ p: 'abreviaturas', donde: 'Índice de abreviaturas', t: `${r.abreviatura}: ${r.explicacion}` }));
    const mete = (p, sub, lista) => (lista || []).forEach((b) => {
      const t = b.t === 'lista' ? b.items.map(plano).join(' · ') : b.t === 'tabla' ? b.filas.map((r) => r.map((c) => c.lineas.map(plano).join(' ')).join(' · ')).join(' | ') : b.t === 'medio' ? plano(b.pie) : plano(b.tramos);
      if (t) out.push({ p: p.id, sub: sub && sub.id, donde: `${etiqueta(p) ? etiqueta(p) + ' · ' : ''}${p.titulo}${sub ? ' › ' + sub.titulo : ''}`, t });
    });
    visibles().forEach((p) => { out.push({ p: p.id, donde: p.titulo, t: p.titulo }); mete(p, null, p.bloques); (p.subs || []).forEach((s) => { out.push({ p: p.id, sub: s.id, donde: p.titulo, t: s.titulo }); mete(p, s, s.bloques); }); });
    return out;
  }
  let IDX = [], selR = 0;
  function abrirBuscador() { IDX = indexar(); $('#buscador').hidden = false; $('#buInput').value = ''; $('#buRes').innerHTML = ''; setTimeout(() => $('#buInput').focus(), 30); }
  function buscar() {
    const q = sinAcento($('#buInput').value.trim());
    if (q.length < 2) { $('#buRes').innerHTML = ''; return; }
    const res = IDX.filter((r) => sinAcento(r.t).includes(q)).slice(0, 40);
    selR = 0;
    $('#buRes').innerHTML = res.length ? res.map((r, i) => {
      const n = sinAcento(r.t).indexOf(q), a = Math.max(0, n - 70);
      const trozo = (a ? '…' : '') + esc(r.t.slice(a, n)) + '<mark>' + esc(r.t.slice(n, n + q.length)) + '</mark>' + esc(r.t.slice(n + q.length, n + q.length + 110)) + '…';
      return `<button class="bu-r ${i ? '' : 'sel'}" data-p="${r.p}" data-s="${r.sub || ''}"><small>${esc(r.donde)}</small><span>${trozo}</span></button>`;
    }).join('') : '<div class="bu-r"><span>Sin resultados.</span></div>';
    $$('#buRes [data-p]').forEach((b) => { b.onclick = () => saltar(b); });
  }
  function saltar(b) {
    $('#buscador').hidden = true; ir(b.dataset.p);
    if (b.dataset.s) setTimeout(() => { const s = document.getElementById(b.dataset.s); if (s) s.scrollIntoView({ behavior: 'smooth' }); }, 350);
  }
  $$('.bBuscar').forEach((b) => { b.onclick = abrirBuscador; });
  $('#buInput').addEventListener('input', buscar);
  $('#buscador').addEventListener('click', (e) => { if (e.target.id === 'buscador') $('#buscador').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscador(); return; }
    if (!$('#buscador').hidden) {
      const rs = $$('#buRes [data-p]');
      if (e.key === 'Escape') $('#buscador').hidden = true;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); selR = Math.max(0, Math.min(rs.length - 1, selR + (e.key === 'ArrowDown' ? 1 : -1))); rs.forEach((r, i) => r.classList.toggle('sel', i === selR)); if (rs[selR]) rs[selR].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && rs[selR]) saltar(rs[selR]);
      return;
    }
    if (e.key === 'Escape') { if (!$('#lupa').hidden) $('#lupa').hidden = true; if (!$('#galeria').hidden) $('#galeria').hidden = true; if (!$('#dif').hidden) $('#dif').hidden = true; return; }
    if (e.target.matches('input, textarea, [contenteditable]') || editando) return;
    const ps = ['portada', ...visibles().map((p) => p.id)], i = ps.indexOf(actual);
    if (e.key === 'ArrowRight' && i < ps.length - 1) ir(ps[i + 1]);
    if (e.key === 'ArrowLeft' && i > 0) ir(ps[i - 1]);
  });

  window.__app = { ir, pintar, estado: () => ({ actual, modo, editando, paginas: visibles().map((p) => p.id), menu: P.ajustes.menu }), P: () => P };
  pintar();
})();
