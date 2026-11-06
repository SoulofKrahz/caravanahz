/* Krahz · Adornos de Navidad (xmas.js)
   Va copiado en cada app (site/xmas.js) y se carga con una línea al final del <body>:
     <script src="xmas.js" defer><\/script>
   La copia de referencia es la de NoticiaHZ; Rutahz y CaravanaHZ llevan el mismo archivo.

   - Se activa solo del 20 de noviembre al 6 de enero, hora local. El resto del año no hace nada.
   - Bombillas en rojo, dorado y verde clásicos más el color de acento de cada app, con brillo en modo oscuro.
   - Nieve suave dentro de la cabecera, por detrás del logo y los botones.
   - Guirnalda bajo la cabecera: [data-xmas-garland], .appbar o el <header> de la página
     (NoticiaHZ <header>, Rutahz header.top, CaravanaHZ header.hdr). Si la cabecera se esconde con .hd, se esconde con ella.
   - Destello en la esquina superior izquierda del favicon SVG (hueco libre en los logos de las cuatro apps).
     Vale para favicon en data: o en archivo .svg del mismo sitio, y se vuelve a poner si la app cambia el favicon
     al elegir color. No toca el manifest ni el icono de la app instalada.
   - Saludo "Felices fiestas" dentro de .abt (o de [data-xmas-greeting]), también si la app lo pinta más tarde
     (CaravanaHZ lo crea al abrir Ajustes). Trae un botón para quitar o poner los adornos, recordado solo esta temporada.
   - Sin animación con prefers-reduced-motion o con "menos movimiento" de la app (html.rm).
   - No bloquea clics (pointer-events:none).
   - Pruebas: ?xmas=1 fuerza encendido, ?xmas=0 apagado. API: krahzXmas.start() / krahzXmas.stop(). */
(function () {
  'use strict';
  if (window.krahzXmas) return;

  var doc = document, KEY = 'krahz-xmas', SP = 36;
  var COL = ['var(--xm-red)', 'var(--xm-gold)', 'var(--xm-green)', 'var(--em2,#059669)'];
  var now = new Date();
  var season = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  var OFF = 'off:' + season;

  function inSeason(d) { var m = d.getMonth(), n = d.getDate(); return (m === 10 && n >= 20) || m === 11 || (m === 0 && n <= 6); }
  function getPref() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setPref(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {} }
  function forced() { var m = /[?&]xmas=([01])(?:&|$)/.exec(location.search); return m ? m[1] === '1' : null; }
  function r(n) { return Math.round(n * 10) / 10; }

  /* ---------- estilos ---------- */
  var WIRE = 'color-mix(in srgb,var(--mu,#5a6578) 45%,transparent)';
  var CSS =
    ':root{--xm-red:#c8322f;--xm-gold:#c7941f;--xm-green:#1e8a4c}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--xm-red:#ff6b5e;--xm-gold:#f2c75c;--xm-green:#4fd27e}}' +
    ':root[data-theme=dark]{--xm-red:#ff6b5e;--xm-gold:#f2c75c;--xm-green:#4fd27e}' +
    '.xm-g{position:absolute;left:0;right:0;bottom:-19px;height:20px;pointer-events:none;z-index:2;transition:opacity .2s}' +
    '.xm-s{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1}' +
    '.xm-g.xm-fix{position:fixed;top:env(safe-area-inset-top,0px);bottom:auto;z-index:40}' +
    '.hd>.xm-g{opacity:0}' +
    '.xm-g svg{display:block;width:100%;height:20px;overflow:visible}' +
    '.xm-w{fill:none;stroke:' + WIRE + ';stroke-width:1}' +
    '.xm-c{fill:' + WIRE + '}' +
    '.xm-b{animation:xm-tw 3.6s ease-in-out infinite}' +
    '@keyframes xm-tw{0%,100%{opacity:1}50%{opacity:.3}}' +
    '.xm-b{filter:drop-shadow(0 0 1.5px currentColor)}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .xm-b{filter:drop-shadow(0 0 4px currentColor)}}' +
    ':root[data-theme=dark] .xm-b{filter:drop-shadow(0 0 4px currentColor)}' +
    '@media (prefers-reduced-motion:reduce){.xm-b{animation:none}}' +
    'html.rm .xm-b{animation:none}' +
    '.xm-hi{display:flex;flex-direction:column;align-items:center;margin:12px 0 0}' +
    '.xm-hi svg{width:40px;height:22px;margin-bottom:2px}' +
    '.xm-hi i{font:italic 500 18px/1.25 var(--f-disp,Newsreader,Georgia,serif);color:var(--em,#047857)}' +
    '.xm-hi button{font:500 12.5px var(--f-ui,Inter,system-ui,sans-serif);color:var(--mu,#5a6578);background:none;border:0;' +
    'padding:6px 10px;min-height:32px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
    '.xm-hi button:focus-visible{outline:2px solid var(--em2,#059669);outline-offset:2px;border-radius:6px}';

  function injectCss() {
    if (doc.getElementById('xm-css')) return;
    var s = doc.createElement('style'); s.id = 'xm-css'; s.textContent = CSS; doc.head.appendChild(s);
  }

  /* ---------- guirnalda ---------- */
  var g = null, ro = null, onResize = null;

  function buildSvg(w) {
    var n = Math.max(2, Math.round(w / SP)), s = w / n, d = 'M0 1', caps = '', bulbs = '';
    for (var i = 0; i < n; i++) {
      var x = i * s, mx = x + s / 2;
      d += ' Q' + r(mx) + ' 11 ' + r(x + s) + ' 1';          // el cable cuelga 5px entre enganches
      var delay = -(((i * 7) % 11) / 11 * 3.6).toFixed(2);   // desfase fijo: parpadeo irregular pero estable
      caps += '<rect class="xm-c" x="' + r(mx - 1.8) + '" y="5.2" width="3.6" height="3" rx=".7"/>';
      bulbs += '<g class="xm-b" style="color:' + COL[i % COL.length] + ';animation-delay:' + delay + 's">' +
        '<ellipse cx="' + r(mx) + '" cy="12.6" rx="3.3" ry="4.5" fill="currentColor"/>' +
        '<ellipse cx="' + r(mx - 1.1) + '" cy="11.2" rx=".9" ry="1.5" fill="#fff" opacity=".55"/></g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r(w) + ' 20" aria-hidden="true" focusable="false">' +
      '<path class="xm-w" d="' + d + '"/>' + caps + bulbs + '</svg>';
  }

  function headerEl() {
    return doc.querySelector('[data-xmas-garland]') || doc.querySelector('.appbar') ||
      doc.querySelector('body > header') || doc.querySelector('header');
  }

  /* ---------- nieve dentro de la cabecera ---------- */
  // Pocos copos, lentos y por detrás del logo y los botones (z-index:-1 dentro de la cabecera).
  // Sin animación (copos quietos) con prefers-reduced-motion o html.rm. Se para con la pestaña oculta.
  var snow = null;

  function mountSnow(host) {
    var c = doc.createElement('canvas'); c.className = 'xm-s'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    var ctx = c.getContext('2d'), W = 0, H = 0, fl = [], raf = 0, last = 0, root = doc.documentElement;
    if (!ctx) { c.remove(); return null; }
    var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var dk = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
    function still() { return (mq && mq.matches) || root.classList.contains('rm'); }
    function dark() { var t = root.getAttribute('data-theme'); return t ? t === 'dark' : !!(dk && dk.matches); }
    function flake(top) { return { x: Math.random() * W, y: top ? -4 : Math.random() * H, r: .7 + Math.random() * 1.5,
      v: 6 + Math.random() * 11, a: .35 + Math.random() * .5, p: Math.random() * 6.3 }; }
    function size() {
      W = host.clientWidth; H = host.clientHeight; if (!W || !H) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(W / 13); fl = []; for (var i = 0; i < n; i++) fl.push(flake(false));
      paint();
    }
    function paint() {
      ctx.clearRect(0, 0, W, H);
      var d = dark(); ctx.fillStyle = d ? '#fff' : '#7f93b3';
      for (var i = 0; i < fl.length; i++) {
        var f = fl[i]; ctx.globalAlpha = f.a * (d ? .9 : .55);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function tick(t) {
      raf = requestAnimationFrame(tick);
      if (doc.hidden || still() || t - last < 33) { if (still()) last = t; return; }
      var dt = Math.min(.1, (t - (last || t)) / 1000); last = t;
      for (var i = 0; i < fl.length; i++) {
        var f = fl[i]; f.y += f.v * dt; f.x += Math.sin(f.p + t / 1400) * 6 * dt;
        if (f.y > H + 3) { fl[i] = flake(true); }
      }
      paint();
    }
    size(); raf = requestAnimationFrame(tick);
    return { size: size, paint: paint, stop: function () { cancelAnimationFrame(raf); c.remove(); } };
  }

  function mountGarland() {
    var host = headerEl();
    g = doc.createElement('div'); g.className = 'xm-g'; g.setAttribute('aria-hidden', 'true');
    if (host) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(g);
      snow = mountSnow(host);
    } else { g.classList.add('xm-fix'); doc.body.appendChild(g); }
    var box = host || doc.documentElement;
    var draw = function () {
      var w = box.clientWidth; if (w > 0 && g && g._w !== w) { g._w = w; g.innerHTML = buildSvg(w); }
      if (snow) snow.size();
    };
    draw();
    if (window.ResizeObserver) { ro = new ResizeObserver(draw); ro.observe(box); }
    else { onResize = draw; addEventListener('resize', draw); }
  }

  function unmountGarland() {
    if (ro) { ro.disconnect(); ro = null; }
    if (onResize) { removeEventListener('resize', onResize); onResize = null; }
    if (snow) { snow.stop(); snow = null; }
    if (g) { g.remove(); g = null; }
  }

  /* ---------- favicon ---------- */
  // Destello de 4 puntas en la esquina superior izquierda de un icono de 64x64: en NoticiaHZ, Rutahz, CaravanaHZ
  // y MediaSkinHZ esa esquina está libre (el logo empieza más abajo o más a la derecha).
  var STAR = '<g data-xm="1" transform="scale(%S)"><path d="M10.5 4.5 12.1 8.9 16.5 10.5 12.1 12.1 10.5 16.5 8.9 12.1 4.5 10.5 8.9 8.9Z" fill="white"/></g>';
  var favMo = null, favBusy = false, favToken = 0;

  function iconLink() { return doc.querySelector('link[rel~="icon"]'); }

  function withStar(svg) {
    if (svg.indexOf('data-xm') > -1) return svg;
    var vb = /viewBox=['"]\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)/.exec(svg), k = vb ? +vb[1] / 64 : 1;
    var i = svg.lastIndexOf('</svg>'); if (i < 0) return svg;
    return svg.slice(0, i) + STAR.replace('%S', Math.round(k * 1000) / 1000) + svg.slice(i);
  }

  function writeIcon(l, svg) {
    favBusy = true;
    l.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg));
    favBusy = false;
  }

  function addStar() {
    var l = iconLink(); if (!l) return;
    var h = l.getAttribute('href') || '', c = h.indexOf(',');
    if (h.indexOf('data:image/svg+xml') === 0) {
      if (c < 0 || h.slice(0, c).indexOf('base64') > -1) return;
      var svg; try { svg = decodeURIComponent(h.slice(c + 1)); } catch (e) { return; }
      if (svg.indexOf('data-xm') < 0) writeIcon(l, withStar(svg));
      return;
    }
    // Favicon en archivo (Rutahz: icono.svg). Solo SVG del mismo sitio.
    if (!/\.svg(\?|#|$)/i.test(h) || !window.fetch) return;
    var url; try { url = new URL(h, location.href); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    var t = ++favToken;
    l._xmOrig = h;
    fetch(url.href).then(function (res) { return res.ok ? res.text() : null; }).then(function (svg) {
      if (!svg || t !== favToken || !on || l.getAttribute('href') !== h) return;
      writeIcon(l, withStar(svg));
    }).catch(function () {});
  }

  function removeStar() {
    favToken++;
    var l = iconLink(); if (!l) return;
    if (l._xmOrig) { favBusy = true; l.setAttribute('href', l._xmOrig); favBusy = false; l._xmOrig = null; return; }
    var h = l.getAttribute('href') || '', c = h.indexOf(',');
    if (h.indexOf('data:image/svg+xml') !== 0 || c < 0) return;
    var svg; try { svg = decodeURIComponent(h.slice(c + 1)); } catch (e) { return; }
    if (svg.indexOf('data-xm') > -1) writeIcon(l, svg.replace(/<g data-xm="1"[\s\S]*?<\/g>/, ''));
  }

  // Si la app cambia el favicon (al elegir color), se vuelve a poner el destello.
  function watchFav() {
    var l = iconLink(); if (!l || favMo || !window.MutationObserver) return;
    favMo = new MutationObserver(function () {
      // Los avisos llegan después de cada cambio, también de los nuestros: si ya lleva el destello, no hay nada que hacer.
      if (!on || favBusy || (l.getAttribute('href') || '').indexOf('data-xm') > -1) return;
      l._xmOrig = null; addStar();
    });
    favMo.observe(l, { attributes: true, attributeFilter: ['href'] });
  }

  /* ---------- saludo ---------- */
  var hi = null, on = false, pageMo = null, pending = false;

  function sync() { if (hi) hi.querySelector('button').textContent = on ? 'Quitar adornos' : 'Poner adornos'; }

  function mountHi() {
    if (hi && hi.isConnected) return;
    var t = doc.querySelector('[data-xmas-greeting]') || doc.querySelector('.abt');
    if (!t) return;
    hi = doc.createElement('p'); hi.className = 'xm-hi';
    hi.innerHTML = '<svg viewBox="0 0 40 22" aria-hidden="true">' +
      '<path d="M20 13C15 5 7 4 2 8c3 .8 4.2 3.6 3 6.4 4.4-2.4 10-2.6 15-1.4z" fill="var(--xm-green)"/>' +
      '<path d="M20 13c5-8 13-9 18-5-3 .8-4.2 3.6-3 6.4-4.4-2.4-10-2.6-15-1.4z" fill="var(--xm-green)" opacity=".8"/>' +
      '<circle cx="17" cy="14" r="2.8" fill="var(--xm-red)"/><circle cx="23" cy="14" r="2.8" fill="var(--xm-red)"/>' +
      '<circle cx="20" cy="10" r="2.8" fill="var(--xm-red)"/></svg>' +
      '<i>Felices fiestas</i><button type="button"></button>';
    hi.querySelector('button').addEventListener('click', function () {
      if (on) { decoOff(); setPref(OFF); } else { decoOn(); setPref(null); }
      sync();
    });
    t.appendChild(hi);
    sync();
  }

  // Las apps de una sola página pintan "Acerca de" al abrir Ajustes: se vigila el DOM, como mucho una vez por fotograma.
  function watchPage() {
    if (pageMo || !window.MutationObserver) return;
    pageMo = new MutationObserver(function () {
      if (pending || (hi && hi.isConnected)) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; mountHi(); });
    });
    pageMo.observe(doc.body, { childList: true, subtree: true });
  }

  /* ---------- encendido ---------- */
  function decoOn() { if (on) return; on = true; mountGarland(); addStar(); }
  function decoOff() { if (!on) return; on = false; unmountGarland(); removeStar(); }

  // Al cambiar de tema, los copos quietos (menos movimiento) se repintan con el color nuevo.
  if (window.MutationObserver) new MutationObserver(function () { if (snow) snow.paint(); })
    .observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

  function start(withDeco) { injectCss(); watchFav(); watchPage(); mountHi(); if (withDeco) decoOn(); sync(); }
  function stop() {
    decoOff();
    if (pageMo) { pageMo.disconnect(); pageMo = null; }
    if (hi) { hi.remove(); hi = null; }
  }

  window.krahzXmas = {
    start: function () { start(true); },
    stop: stop,
    get active() { return on; }
  };

  function init() {
    var f = forced(), show = f !== null ? f : inSeason(now);
    if (show) start(f === true || getPref() !== OFF);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
