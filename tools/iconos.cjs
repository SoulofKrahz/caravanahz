// Genera los iconos y manifests por color (site/ic/*.png, site/manifest-<color>.webmanifest), como en Noticiahz.
// El color de cada uno sale del mismo cálculo que usa la app (czAcc en index.html), así el icono coincide con la app.
// Esmeralda (el color de partida) usa los iconos de siempre de site/icons/.
// Uso: PW_EXE=/opt/pw-browsers/chromium node tools/iconos.cjs   (con playwright disponible)
// Si añades o cambias un color en theme.js (PRESETS), vuelve a ejecutarlo y actualiza la lista de czIco (index.html)
// y COLORS (_worker.js).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// La furgoneta: en negro sobre colores claros y en blanco sobre colores oscuros (lt), para que siempre se vea
const glyph = lt => `<path d="M12 42V24a4 4 0 0 1 4-4h22l8 9h4a3 3 0 0 1 3 3v10" fill="none" stroke="${lt ? '#fff' : '#06150f'}" stroke-width="5" stroke-linejoin="round"/>` +
  `<circle cx="21" cy="44" r="4.5" fill="#fff"/><circle cx="43" cy="44" r="4.5" fill="#fff"/><path d="M17 26h12v7H17z" fill="#fff"/>`;
const svg = (c, lt, mask) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` + (mask
  ? `<rect width="64" height="64" fill="${c}"/><g transform="translate(32 32) scale(.78) translate(-32 -32)">${glyph(lt)}</g>`
  : `<rect width="64" height="64" rx="15" fill="${c}"/>${glyph(lt)}`) + `</svg>`;

(async () => {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const theme = fs.readFileSync(path.join(SITE, 'js/theme.js'), 'utf8');
  const PRE = eval(theme.match(/export const PRESETS = (\[[\s\S]*?\]);/)[1]);
  const acc = html.match(/(window\.czAcc=function[\s\S]*?\}\};)/)[1];
  const b = await chromium.launch({ executablePath: process.env.PW_EXE || undefined });
  const p = await b.newPage();
  await p.setContent('<script>' + acc + '</script>');
  const cols = await p.evaluate(pre => Object.fromEntries(pre.filter(x => x[1] != null).map(([n, h, s]) => { const a = czAcc(h, s); return [n, [a.fav, a.lt]]; })), PRE);
  const base = JSON.parse(fs.readFileSync(path.join(SITE, 'manifest.webmanifest'), 'utf8'));
  fs.mkdirSync(path.join(SITE, 'ic'), { recursive: true });
  const shot = async (s, n, file) => {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<style>*{margin:0}svg{display:block;width:${n}px;height:${n}px}</style>${s}`);
    await p.screenshot({ path: file, omitBackground: true });
  };
  const out = {};
  for (const [name, h] of PRE) {
    if (h == null) continue;
    const k = slug(name), [c, lt] = cols[name];
    for (const n of [192, 512]) await shot(svg(c, lt, false), n, path.join(SITE, 'ic', `${k}-${n}.png`));
    await shot(svg(c, lt, true), 512, path.join(SITE, 'ic', `${k}-mask.png`));
    await shot(svg(c, lt, true), 180, path.join(SITE, 'ic', `${k}-apple.png`));
    const m = JSON.parse(JSON.stringify(base));
    m.icons = [{ src: `ic/${k}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `ic/${k}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: `ic/${k}-mask.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }];
    m.theme_color = c;
    (m.shortcuts || []).forEach(x => (x.icons = [{ src: `ic/${k}-192.png`, sizes: '192x192', type: 'image/png' }]));
    fs.writeFileSync(path.join(SITE, `manifest-${k}.webmanifest`), JSON.stringify(m, null, 2) + '\n');
    out[k] = c + (lt ? ' (furgoneta blanca)' : '');
  }
  console.log(out);
  await b.close();
})();
