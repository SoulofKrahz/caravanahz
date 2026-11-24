/* Krahz · «Línea de invierno» (xmas.js), decoración de temporada para NoticiaHZ, Rutahz y CaravanaHZ.
   Va copiado en cada app (site/xmas.js) y se carga al final del <body>:
     <script src="xmas.js" defer><\/script>
   La copia de referencia es la de NoticiaHZ; Rutahz y CaravanaHZ llevan el mismo archivo.

   - Activa del 20 de noviembre al 6 de enero, hora local. El resto del año no hace nada.
   - Estrella dorada al final de la línea del logo (.lp). En Rutahz sustituye el punto final de la ruta.
   - Cinta dorada en el borde inferior de la cabecera, con el acento que elige cada usuario en el centro.
   - «Edición de Navidad» junto al logo, solo en NoticiaHZ y si hay sitio.
   - Una vez al día, al abrir: la estrella aparece con un giro y caen copos 4 s en la cabecera (no en Rutahz).
   - Tarjeta los días señalados (24, 25 y 31 de diciembre, 1 y 6 de enero); se cierra con la cruz.
   - Favicon de temporada: insignia dorada con estrella. No toca el manifest ni el icono instalado.
   - Saludo y botón «Quitar adornos» / «Poner adornos» en «Acerca de» (.abt), recordado solo esta temporada.
   - Sin animaciones con prefers-reduced-motion o «Menos movimiento» de la app (html.rm).
   - Pruebas: ?xmas=1 fuerza encendido, ?xmas=0 apagado, ?xmasday=AAAA-MM-DD simula el día.
     API: krahzXmas.start() / krahzXmas.stop(). */
(function () {
  'use strict';
  if (window.krahzXmas) return;

  var doc = document, root = doc.documentElement, KEY = 'krahz-xmas';
  var search = location.search;
  var simDay = (/[?&]xmasday=(\d{4}-\d{2}-\d{2})/.exec(search) || [])[1];
  var now = simDay ? new Date(simDay + 'T12:00:00') : new Date();
  var season = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  var OFF = 'off:' + season;
  var TODAY = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
  var title = (doc.title || '').toLowerCase();
  var APP = title.indexOf('ruta') > -1 ? 'rz' : title.indexOf('caravana') > -1 ? 'cz' : 'nz';

  function inSeason(d) { var m = d.getMonth(), n = d.getDate(); return (m === 10 && n >= 20) || m === 11 || (m === 0 && n <= 6); }
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
    catch (e) { return null; }
  }
  function forced() { var m = /[?&]xmas=([01])(?:&|$)/.exec(search); return m ? m[1] === '1' : null; }
  function still() {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) {}
    return root.classList.contains('rm');
  }
  function r1(n) { return Math.round(n * 100) / 100; }
  function starPts(cx, cy, R, r) {
    var p = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; p.push(r1(cx + d * Math.cos(a)) + ',' + r1(cy + d * Math.sin(a))); }
    return p.join(' ');
  }

  /* ---------- estilos ---------- */
  var SERIF = 'Newsreader,var(--f-disp,Georgia),Georgia,"Times New Roman",serif';
  var CSS =
    ':root{--xm-gold:#a8740f}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--xm-gold:#ecc46a}}' +
    ':root[data-theme=dark]{--xm-gold:#ecc46a}' +
    // logo
    '.lp.xm-l{overflow:visible}' +
    '.xm-l .xm-st{fill:var(--xm-gold);stroke:none}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .xm-l .xm-st{filter:drop-shadow(0 0 3px var(--xm-gold))}}' +
    ':root[data-theme=dark] .xm-l .xm-st{filter:drop-shadow(0 0 3px var(--xm-gold))}' +
    '.xm-l.xm-anim .xm-st{transform-box:fill-box;transform-origin:center;animation:xm-in .6s .45s cubic-bezier(.3,1.6,.5,1) both}' +
    '.xm-l.xm-anim .xm-ln{stroke-dasharray:90;animation:xm-draw .5s ease-out both}' +
    '@keyframes xm-in{from{transform:scale(0) rotate(-40deg)}to{transform:none}}' +
    '@keyframes xm-draw{from{stroke-dashoffset:90}to{stroke-dashoffset:0}}' +
    // edición
    '.xm-ed{font:italic 500 15px/1 ' + SERIF + ';color:var(--xm-gold);white-space:nowrap;align-self:center;margin-left:8px;flex:none}' +
    '@media (max-width:359px){.xm-ed{display:none}}' +
    // cinta
    '.xm-c{position:absolute;left:0;right:0;bottom:-1px;height:2px;pointer-events:none;z-index:2;' +
    'background:linear-gradient(90deg,transparent,var(--xm-gold) 18%,var(--em2,#059669) 50%,var(--xm-gold) 82%,transparent)}' +
    '.xm-c svg{position:absolute;top:-4px;width:10px;height:10px;fill:var(--xm-gold)}' +
    '.xm-s{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;transition:opacity .8s}' +
    // tarjeta
    '.xm-k{position:relative;display:flex;gap:14px;align-items:flex-start;background:var(--card,#fff);border:1px solid var(--bd,#e1e6ee);' +
    'border-radius:18px;padding:16px 46px 16px 16px;margin:12px 0;overflow:hidden;text-align:left}' +
    '.xm-k::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--xm-gold),var(--em2,#059669))}' +
    '.xm-k .xm-i{width:38px;height:38px;flex:none;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--xm-gold) 14%,transparent)}' +
    '.xm-k .xm-i svg{width:20px;height:20px;fill:var(--xm-gold)}' +
    '.xm-k small{display:block;font:600 11.5px/1.3 var(--f-ui,Inter,system-ui,sans-serif);letter-spacing:.07em;text-transform:uppercase;color:var(--mu,#5a6578)}' +
    '.xm-k b{display:block;font:italic 500 23px/1.15 ' + SERIF + ';color:var(--tx,#101827);margin:3px 0 4px}' +
    '.xm-k p{margin:0;font:14px/1.45 var(--f-ui,Inter,system-ui,sans-serif);color:var(--mu,#5a6578)}' +
    '.xm-k .xm-x{position:absolute;top:8px;right:8px;width:36px;height:36px;border-radius:10px;border:0;background:none;color:var(--mu,#5a6578);display:grid;place-items:center;cursor:pointer}' +
    '.xm-k .xm-x:hover{background:color-mix(in srgb,var(--mu,#5a6578) 12%,transparent)}' +
    '.xm-k .xm-x:focus-visible,.xm-hi button:focus-visible{outline:2px solid var(--em2,#059669);outline-offset:2px}' +
    // saludo en «Acerca de»
    '.xm-hi{display:flex;flex-direction:column;align-items:center;margin:12px 0 0}' +
    '.xm-hi svg{width:20px;height:20px;fill:var(--xm-gold);margin-bottom:2px}' +
    '.xm-hi i{font:italic 500 18px/1.25 ' + SERIF + ';color:var(--tx,#101827)}' +
    '.xm-hi button{font:500 12.5px var(--f-ui,Inter,system-ui,sans-serif);color:var(--mu,#5a6578);background:none;border:0;' +
    'padding:6px 10px;min-height:32px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;border-radius:6px}' +
    '@media (prefers-reduced-motion:reduce){.xm-l .xm-st,.xm-l .xm-ln{animation:none!important}}' +
    'html.rm .xm-l .xm-st,html.rm .xm-l .xm-ln{animation:none!important}';

  function injectCss() {
    if (doc.getElementById('xm-css')) return;
    var s = doc.createElement('style'); s.id = 'xm-css'; s.textContent = CSS; doc.head.appendChild(s);
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, at) { var e = doc.createElementNS(SVGNS, tag); for (var k in at) e.setAttribute(k, at[k]); return e; }
  var STAR20 = '<svg viewBox="0 0 20 20" aria-hidden="true"><polygon points="' + starPts(10, 10.6, 9, 3.8) + '"/></svg>';

  /* ---------- estrella en la línea del logo ---------- */
  var firstToday = false;

  function decorateLine(s) {
    if (s._xm) return;
    var vb = (s.getAttribute('viewBox') || '0 0 44 24').split(/[\s,]+/).map(Number);
    var p = s.querySelector('path'), c = s.querySelector('circle'), ex, ey, w;
    if (!p) return;
    var st = { vb: s.getAttribute('viewBox'), width: s.style.width, d: p.getAttribute('d'), c: c };
    if (c) {                                    // Rutahz: la ruta acaba en un punto → estrella en su lugar
      ex = +c.getAttribute('cx'); ey = +c.getAttribute('cy'); c.remove();
    } else {                                    // pulso: la línea se alarga y acaba en estrella
      try { var len = p.getTotalLength(), pt = p.getPointAtLength(len); ex = pt.x + 6; ey = pt.y; }
      catch (e) { ex = vb[2] + 5; ey = vb[3] / 2 + 1; }
    }
    w = Math.max(vb[2], ex + 7.5);
    var cw = parseFloat(getComputedStyle(s).width) || 40;
    s.setAttribute('viewBox', vb[0] + ' ' + vb[1] + ' ' + r1(w) + ' ' + vb[3]);
    s.style.width = r1(cw * w / vb[2]) + 'px';
    p.classList.add('xm-ln');
    var star = svgEl('polygon', { class: 'xm-st', points: starPts(ex, ey, 7, 3) });
    s.appendChild(star);
    s.classList.add('xm-l');
    if (firstToday && !still()) s.classList.add('xm-anim');
    s._xm = { st: st, star: star };
  }

  function undecorateLine(s) {
    var x = s._xm; if (!x) return;
    x.star.remove();
    if (x.st.c) s.appendChild(x.st.c);
    if (x.st.vb) s.setAttribute('viewBox', x.st.vb);
    s.style.width = x.st.width;
    var p = s.querySelector('path'); if (p) p.classList.remove('xm-ln');
    s.classList.remove('xm-l', 'xm-anim');
    s._xm = null;
  }

  function decorateLogos() { doc.querySelectorAll('svg.lp').forEach(decorateLine); }

  /* ---------- cabecera: cinta, edición y copos ---------- */
  var hdr = null, ribbon = null, edition = null, snow = null;

  function headerEl() {
    return doc.querySelector('[data-xmas-garland]') || doc.querySelector('.appbar') ||
      doc.querySelector('body > header') || doc.querySelector('header');
  }

  function mountHeader() {
    hdr = headerEl(); if (!hdr) return;
    if (getComputedStyle(hdr).position === 'static') { hdr.style.position = 'relative'; hdr._xmPos = 1; }
    ribbon = doc.createElement('div'); ribbon.className = 'xm-c'; ribbon.setAttribute('aria-hidden', 'true');
    ribbon.innerHTML = ['33%', '67%'].map(function (x) {
      return '<svg viewBox="0 0 10 10" style="left:calc(' + x + ' - 5px)"><path d="M5 0 6.2 3.8 10 5 6.2 6.2 5 10 3.8 6.2 0 5 3.8 3.8Z"/></svg>';
    }).join('');
    hdr.appendChild(ribbon);

    if (APP === 'nz') {
      var lg = hdr.querySelector('.logo');
      if (lg) {
        edition = doc.createElement('span'); edition.className = 'xm-ed'; edition.textContent = 'Edición de Navidad';
        lg.insertAdjacentElement('afterend', edition);
        // si empuja la barra y algo se sale, se quita
        var bar = lg.parentElement;
        requestAnimationFrame(function () { if (edition && bar && bar.scrollWidth > bar.clientWidth + 1) { edition.remove(); edition = null; } });
      }
    }
    if (firstToday && APP !== 'rz' && !still()) snow = snowMoment(hdr);
  }

  function unmountHeader() {
    if (snow) { snow.stop(); snow = null; }
    if (ribbon) { ribbon.remove(); ribbon = null; }
    if (edition) { edition.remove(); edition = null; }
    if (hdr && hdr._xmPos) { hdr.style.position = ''; hdr._xmPos = 0; }
    hdr = null;
  }

  // Copos durante 4 s en la cabecera, por detrás del logo y los botones; luego se desvanecen y se quitan.
  function snowMoment(host) {
    var c = doc.createElement('canvas'); c.className = 'xm-s'; c.setAttribute('aria-hidden', 'true');
    var ctx = c.getContext && c.getContext('2d'); if (!ctx) return null;
    host.insertBefore(c, host.firstChild);
    var W = host.clientWidth, H = host.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1), fl = [], raf = 0, t0 = 0, done = false;
    if (!W || !H) { c.remove(); return null; }
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var dark = (function () {
      var t = root.getAttribute('data-theme'); if (t) return t === 'dark';
      try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
    })();
    for (var i = 0, n = Math.round(W / 11); i < n; i++)
      fl.push({ x: Math.random() * W, y: -Math.random() * H, r: .8 + Math.random() * 1.6, v: 14 + Math.random() * 20, p: Math.random() * 6.3 });
    function frame(t) {
      if (!t0) t0 = t;
      var el = (t - t0) / 1000;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = dark ? '#fff' : '#7f93b3';
      for (var i = 0; i < fl.length; i++) {
        var f = fl[i], y = f.y + f.v * el, x = f.x + Math.sin(f.p + el * 1.4) * 5;
        if (y > H + 3) continue;
        ctx.globalAlpha = dark ? .85 : .55; ctx.beginPath(); ctx.arc(x, y, f.r, 0, 6.283); ctx.fill();
      }
      if (el < 4) raf = requestAnimationFrame(frame);
      else { c.style.opacity = '0'; setTimeout(stop, 900); }
    }
    function stop() { if (done) return; done = true; cancelAnimationFrame(raf); c.remove(); }
    raf = requestAnimationFrame(frame);
    return { stop: stop };
  }

  /* ---------- tarjeta de día señalado ---------- */
  var DAYS = {
    '12-24': ['Nochebuena · 24 de diciembre', 'Felices fiestas', { nz: 'Hoy el feed puede esperar. Disfruta de la cena.', rz: 'Si hoy sales a visitas, conduce con calma.', cz: 'Buen viaje si hoy estás en ruta.' }],
    '12-25': ['Navidad · 25 de diciembre', 'Feliz Navidad', { nz: 'Que el día sea largo y tranquilo.', rz: 'Que el día sea largo y tranquilo.', cz: 'Que el día sea largo y tranquilo.' }],
    '12-31': ['Nochevieja · 31 de diciembre', 'Hoy cierra el año', { nz: 'Gracias por leer con la app este 2026.', rz: 'Gracias por usar la app este 2026.', cz: 'Gracias por viajar con la app este 2026.' }],
    '01-01': ['Año nuevo · 1 de enero', 'Feliz 2027', { nz: 'Empezamos el año juntos.', rz: 'Empezamos el año juntos.', cz: 'Que este año haya muchos kilómetros.' }],
    '01-06': ['Reyes · 6 de enero', 'Último día de fiestas', { nz: 'Mañana los adornos se recogen solos.', rz: 'Mañana los adornos se recogen solos.', cz: 'Mañana los adornos se recogen solos.' }]
  };
  var CARD_KEY = 'krahz-xmas-card';
  var card = null, pageMo = null, pending = false;

  function cardSpot() {
    if (APP === 'nz') { var st = doc.querySelector('main .status'); return st ? { parent: st.parentNode, before: st.nextSibling } : null; }
    if (APP === 'rz') { var v = doc.getElementById('v-ruta'), eb = doc.getElementById('editBar'); return v ? { parent: v, before: eb ? eb.nextSibling : v.firstChild } : null; }
    var route = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/')[0];
    var view = doc.getElementById('view');
    return route === 'inicio' && view ? { parent: view, before: view.firstChild } : null;
  }

  function mountCard() {
    var t = DAYS[TODAY.slice(5)];
    if (!t || ls(CARD_KEY) === TODAY) return;
    if (card && card.isConnected) return;
    var spot = cardSpot(); if (!spot) return;
    card = doc.createElement('section'); card.className = 'xm-k'; card.setAttribute('aria-label', t[1]);
    card.innerHTML = '<span class="xm-i">' + STAR20 + '</span><div><small>' + t[0] + '</small><b>' + t[1] + '</b><p>' +
      t[2][APP] + ' Krahz</p></div><button type="button" class="xm-x" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    card.querySelector('.xm-x').addEventListener('click', function () { ls(CARD_KEY, TODAY); if (card) card.remove(); card = null; });
    spot.parent.insertBefore(card, spot.before || null);
  }

  function unmountCard() { if (card) card.remove(); card = null; }

  /* ---------- favicon ---------- */
  var favMo = null, favBusy = false, favToken = 0;
  var BADGE = '<g data-xm="1" transform="scale(%S)"><circle cx="49" cy="15" r="14" fill="#ecc46a" stroke="#fff" stroke-width="3"/>' +
    '<polygon points="' + starPts(49, 15.6, 8.2, 3.4) + '" fill="#fff"/></g>';

  function iconLink() { return doc.querySelector('link[rel~="icon"]'); }
  function withBadge(svg) {
    if (svg.indexOf('data-xm') > -1) return svg;
    var vb = /viewBox=['"]\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)/.exec(svg), k = vb ? +vb[1] / 64 : 1;
    var i = svg.lastIndexOf('</svg>'); if (i < 0) return svg;
    return svg.slice(0, i) + BADGE.replace('%S', Math.round(k * 1000) / 1000) + svg.slice(i);
  }
  function writeIcon(l, svg) { favBusy = true; l.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg)); favBusy = false; }

  function addBadge() {
    var l = iconLink(); if (!l) return;
    var h = l.getAttribute('href') || '', c = h.indexOf(',');
    if (h.indexOf('data:image/svg+xml') === 0) {
      if (c < 0 || h.slice(0, c).indexOf('base64') > -1) return;
      var svg; try { svg = decodeURIComponent(h.slice(c + 1)); } catch (e) { return; }
      if (svg.indexOf('data-xm') < 0) writeIcon(l, withBadge(svg));
      return;
    }
    if (!/\.svg(\?|#|$)/i.test(h) || !window.fetch) return;
    var url; try { url = new URL(h, location.href); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    var t = ++favToken; l._xmOrig = h;
    fetch(url.href).then(function (res) { return res.ok ? res.text() : null; }).then(function (svg) {
      if (!svg || t !== favToken || !on || l.getAttribute('href') !== h) return;
      writeIcon(l, withBadge(svg));
    }).catch(function () {});
  }

  function removeBadge() {
    favToken++;
    var l = iconLink(); if (!l) return;
    if (l._xmOrig) { favBusy = true; l.setAttribute('href', l._xmOrig); favBusy = false; l._xmOrig = null; return; }
    var h = l.getAttribute('href') || '', c = h.indexOf(',');
    if (h.indexOf('data:image/svg+xml') !== 0 || c < 0) return;
    var svg; try { svg = decodeURIComponent(h.slice(c + 1)); } catch (e) { return; }
    if (svg.indexOf('data-xm') > -1) writeIcon(l, svg.replace(/<g data-xm="1"[\s\S]*?<\/g>/, ''));
  }

  // La app cambia el favicon al elegir color: se vuelve a poner la insignia.
  function watchFav() {
    var l = iconLink(); if (!l || favMo || !window.MutationObserver) return;
    favMo = new MutationObserver(function () {
      if (!on || favBusy || (l.getAttribute('href') || '').indexOf('data-xm') > -1) return;
      l._xmOrig = null; addBadge();
    });
    favMo.observe(l, { attributes: true, attributeFilter: ['href'] });
  }

  /* ---------- saludo en «Acerca de» ---------- */
  var hi = null, on = false;

  function sync() { if (hi) hi.querySelector('button').textContent = on ? 'Quitar adornos' : 'Poner adornos'; }

  function mountHi() {
    if (hi && hi.isConnected) return;
    var t = doc.querySelector('[data-xmas-greeting]') || doc.querySelector('.abt');
    if (!t) return;
    hi = doc.createElement('p'); hi.className = 'xm-hi';
    hi.innerHTML = STAR20 + '<i>Felices fiestas</i><button type="button"></button>';
    hi.querySelector('button').addEventListener('click', function () {
      if (on) { decoOff(); ls(KEY, OFF); } else { decoOn(); ls(KEY, null); }
      sync();
    });
    t.appendChild(hi);
    sync();
  }

  // Las apps pintan vistas más tarde (Ajustes, Inicio, logos de «Acerca de»): se revisa como mucho una vez por fotograma.
  function watchPage() {
    if (pageMo || !window.MutationObserver) return;
    pageMo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        mountHi();
        if (on) { decorateLogos(); mountCard(); }
      });
    });
    pageMo.observe(doc.body, { childList: true, subtree: true });
    addEventListener('hashchange', function () { if (on) mountCard(); });
  }

  /* ---------- encendido ---------- */
  function decoOn() { if (on) return; on = true; decorateLogos(); mountHeader(); mountCard(); addBadge(); }
  function decoOff() {
    if (!on) return; on = false;
    doc.querySelectorAll('svg.lp').forEach(undecorateLine);
    unmountHeader(); unmountCard(); removeBadge();
  }

  function start(withDeco) {
    injectCss();
    var last = ls(KEY + '-day');
    firstToday = last !== TODAY; ls(KEY + '-day', TODAY);
    watchFav(); watchPage(); mountHi();
    if (withDeco) decoOn();
    sync();
  }
  function stop() {
    decoOff();
    if (pageMo) { pageMo.disconnect(); pageMo = null; }
    if (hi) { hi.remove(); hi = null; }
  }

  window.krahzXmas = { start: function () { start(true); }, stop: stop, get active() { return on; } };

  function init() {
    var f = forced(), show = f !== null ? f : inSeason(now);
    if (show) start(f === true || ls(KEY) !== OFF);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
