// Une el índice del Word con tus cambios. Lo usan la aplicación y el generador, así el tribunal ve exactamente lo mismo.
(function (g, f) {
  if (typeof module === 'object' && module.exports) module.exports = f();
  else g.Modelo = f();
})(globalThis, function () {
  const copia = (o) => JSON.parse(JSON.stringify(o));
  const ABREVIATURAS = [
    { abreviatura: 'FC', explicacion: 'Frecuencia cardíaca' },
    { abreviatura: 'HIIT', explicacion: 'Entrenamiento interválico de alta intensidad' },
    { abreviatura: 'MICT', explicacion: 'Entrenamiento continuo de intensidad moderada' },
    { abreviatura: 'VFC', explicacion: 'Variabilidad de la frecuencia cardíaca' },
  ];
  const abreviaturas = (proy) => copia(Array.isArray(proy && proy.abreviaturas) ? proy.abreviaturas : ABREVIATURAS);
  // Página tal como se ve: la del Word con tus ediciones encima.
  function pagina(p, e) {
    if (!e) return p;
    return {
      ...p,
      titulo: e.titulo ?? p.titulo,
      numero: e.numero ?? p.numero,
      bloques: e.bloques ?? p.bloques,
      subs: e.subsecciones ?? (p.subs || []).map((s) => { const es = (e.subs || {})[s.id]; return es ? { ...s, titulo: es.titulo ?? s.titulo, bloques: es.bloques ?? s.bloques } : s; }),
      editada: true,
      conflicto: !!e.base && e.base !== p.huella,
    };
  }
  function efectivo(doc, proy) {
    if (!doc) return null;
    const ed = (proy && proy.ediciones) || {};
    const eliminadas = new Set((proy && proy.eliminadas) || []);
    let paginas = [...doc.paginas, ...((proy && proy.paginasNuevas) || [])]
      .filter((p) => !eliminadas.has(p.id) && p.id !== 'abreviaturas')
      .map((p) => pagina(p, ed[p.id]));
    const orden = (proy && proy.orden) || [];
    if (orden.length) {
      const pos = new Map(orden.map((id, i) => [id, i]));
      const base = new Map(paginas.map((p, i) => [p.id, i]));
      paginas = paginas.slice().sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1000 + base.get(a.id)) - (pos.has(b.id) ? pos.get(b.id) : 1000 + base.get(b.id)));
    }
    // La pestaña del índice siempre queda inmediatamente después de Referencias.
    const at = paginas.findIndex((p) => p.id === 'referencias');
    if (!(proy && proy.sinAbreviaturas)) paginas.splice(at < 0 ? paginas.length : at + 1, 0, { id: 'abreviaturas', numero: '',
      titulo: 'Índice de abreviaturas', bloques: [], subs: [], especial: 'abreviaturas' });
    return { ...doc, portada: (proy && proy.portada) || doc.portada, paginas };
  }
  // Qué ha cambiado entre la versión del índice vista la última vez y la actual.
  function cambios(antes, doc) {
    const a = antes || {}, n = {};
    doc.paginas.forEach((p) => { n[p.id] = p.huella; });
    return {
      nuevas: Object.keys(n).filter((k) => !(k in a)),
      quitadas: Object.keys(a).filter((k) => !(k in n)),
      cambiadas: Object.keys(n).filter((k) => k in a && a[k] !== n[k]),
    };
  }
  const huellas = (doc) => Object.fromEntries(doc.paginas.map((p) => [p.id, p.huella]));
  // Archivos que necesita una página (para copiar solo lo usado al generar).
  function archivos(doc, proy, personas) {
    const s = new Set();
    const m = (proy && proy.medios) || {};
    Object.values(m).forEach((x) => { if (x.fondo) s.add(x.fondo); if (x.video) s.add(x.video); });
    const recorre = (lista) => (lista || []).forEach((b) => { if (b.t === 'img') s.add('cache/' + b.src); if (b.t === 'medio' && b.src) s.add(b.src); });
    doc.paginas.forEach((p) => { recorre(p.bloques); (p.subs || []).forEach((x) => recorre(x.bloques)); });
    const carpeta = ((proy && proy.personas) || {}).carpeta || 'medios/personas';
    const usaPersonas = (personas || []).length && (Object.values(m).some((x) => x.mosaico) || true);
    if (usaPersonas) (personas || []).forEach((n) => s.add(`${carpeta}/${n}`));
    if (proy && proy.logo) s.add(proy.logo);
    return [...s];
  }
  return { efectivo, cambios, huellas, archivos, copia, abreviaturas };
});
