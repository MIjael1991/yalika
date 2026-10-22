// Pruebas de las plantillas Yalika: integridad de presets, temporadas y secciones extra.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const webSrc = path.join(root, 'src', 'app', 's', '[slug]');

function load(file) {
  const source = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, require, console });
  return mod.exports;
}

const presets = load(path.join(webSrc, 'template-presets.ts'));
const art = load(path.join(webSrc, 'template-art.ts'));

test('cada plantilla tiene datos completos y piezas de arte existentes', () => {
  assert.ok(presets.PRESETS.length >= 12);
  const ids = new Set();
  for (const p of presets.PRESETS) {
    assert.ok(p.id.startsWith('yk_'), p.id);
    assert.ok(!ids.has(p.id), `id repetido ${p.id}`);
    ids.add(p.id);
    assert.ok(p.items.length >= 6, `${p.id} necesita al menos 6 elementos`);
    assert.equal(p.highlights.length, 4, p.id);
    assert.equal(p.steps.length, 3, p.id);
    for (const key of ['bg', 'fg', 'mut', 'accent', 'soft', 'card', 'deep', 'onAccent']) assert.match(p.c[key], /^#[0-9a-f]{6}$/i, `${p.id}.${key}`);
    const hero = art.heroArt(p.hero, p.label);
    assert.ok(hero.startsWith('<svg'), `${p.id} sin portada`);
    assert.ok(!hero.includes('undefined') && !hero.includes('NaN'), `${p.id} portada con valores rotos`);
    for (const item of p.items) {
      const svg = item.kind === 'house' ? art.houseArt(item.house ?? 'casa', item.hv ?? 0, item.n) : art.tileArt(item.kind, { a: item.a ?? p.c.accent, b: item.b ?? p.c.accent2, bg: item.bg }, item.n);
      assert.ok(svg.startsWith('<svg'), `${p.id}/${item.n}`);
      assert.ok(!svg.includes('undefined') && !svg.includes('NaN'), `${p.id}/${item.n} con valores rotos`);
    }
  }
});

test('la API acepta todas las plantillas nuevas', () => {
  for (const file of ['create-site.dto.ts', 'update-site.dto.ts']) {
    const source = fs.readFileSync(path.join(root, '..', 'api', 'src', 'core', 'site', 'dto', file), 'utf8');
    for (const id of presets.PRESET_IDS) assert.ok(source.includes(`'${id}'`), `${file} no incluye ${id}`);
  }
});

test('plantilla de temporada sugerida por fecha', () => {
  assert.equal(presets.suggestedSeason(new Date(2026, 9, 20)), 'yk_dia_muertos');
  assert.equal(presets.suggestedSeason(new Date(2026, 10, 2)), 'yk_dia_muertos');
  assert.equal(presets.suggestedSeason(new Date(2026, 10, 20)), 'yk_gran_venta');
  assert.equal(presets.suggestedSeason(new Date(2026, 11, 10)), 'yk_navidad');
  assert.equal(presets.suggestedSeason(new Date(2027, 1, 10)), 'yk_amor');
  assert.equal(presets.suggestedSeason(new Date(2027, 4, 5)), 'yk_madres');
  assert.equal(presets.suggestedSeason(new Date(2026, 7, 15)), 'yk_clases');
  assert.equal(presets.suggestedSeason(new Date(2026, 5, 15)), null);
});
