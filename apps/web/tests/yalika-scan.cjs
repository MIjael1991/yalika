const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript"),
  Module = require("node:module");
const filename = path.resolve(__dirname, "../src/lib/yalika-scan.ts");
const m = new Module(filename, module);
m.filename = filename;
m.paths = module.paths;
m._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  filename,
);
const { rotate, crop, enhance, processPixels, imageQuality, clarify, scanPdf, checkImageFile, NO_MARGINS, detectDocument, warp, adjust, DEFAULT_LAYOUT } = m.exports;
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAA8ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0WiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP//Z", "base64");
function px(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}
const at = (p, x, y) => Array.from(p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 3));
(async () => {
  // Giro: 2x3, cada píxel con su propio valor.
  const base = px(2, 3, (x, y) => [x * 10 + y * 50, 0, 0]);
  const r1 = rotate(base, 1);
  assert.equal(r1.width, 3);
  assert.equal(r1.height, 2);
  assert.deepEqual(at(r1, 2, 0), at(base, 0, 0)); // arriba-izq -> arriba-der
  assert.deepEqual(at(r1, 0, 1), at(base, 1, 2)); // abajo-der -> abajo-izq
  assert.deepEqual(rotate(rotate(base, 1), 3).data, base.data);
  assert.deepEqual(rotate(rotate(base, 1), 1).data, rotate(base, 2).data);
  assert.deepEqual(rotate(rotate(rotate(rotate(base, 1), 1), 1), 1).data, base.data);
  assert.equal(rotate(base, -1).width, 3);
  assert.throws(() => rotate({ data: new Uint8ClampedArray(3), width: 1, height: 1 }, 1), /no válida/);

  // Recorte
  const big = px(10, 10, (x, y) => [x, y, 0]);
  const c = crop(big, { top: 0.1, left: 0.2, right: 0.3, bottom: 0 });
  assert.equal(c.width, 5);
  assert.equal(c.height, 9);
  assert.deepEqual(at(c, 0, 0), [2, 1, 0]);
  assert.equal(crop(big, NO_MARGINS), big);
  assert.equal(crop(big, { top: 9, left: 9, right: 9, bottom: 9 }).width, 2); // límite 45% por lado

  // Documento con sombra: la mitad izquierda está mucho más oscura.
  const W = 240,
    H = 120,
    blocks = [];
  for (let by = 12; by < H - 12; by += 24)
    for (let bx = 12; bx < W - 40; bx += 60) blocks.push([bx, by, 28, 6]);
  const isText = (x, y) => blocks.some(([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh);
  const shade = (x) => 1 - 0.45 * (1 - x / W);
  const page = px(W, H, (x, y) => {
    const v = (isText(x, y) ? 30 : 230) * shade(x);
    return [v, v, v * 0.95];
  });
  const bw = enhance(page, "bw");
  let paperWrong = 0, textWrong = 0, paper = 0, text = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = bw.data[(y * W + x) * 4];
      assert.ok(v === 0 || v === 255);
      if (isText(x, y)) { text++; if (v !== 0) textWrong++; }
      else { paper++; if (v !== 255) paperWrong++; }
    }
  assert.ok(text > 100 && paper > 100);
  assert.ok(paperWrong / paper < 0.01, "papel con sombra debe quedar blanco: " + paperWrong);
  assert.ok(textWrong / text < 0.02, "texto debe quedar negro: " + textWrong);
  const gray = enhance(page, "gray");
  assert.ok(at(gray, 10, 2)[0] > 235 && at(gray, W - 10, 2)[0] > 235, "gris: ambos lados claros");
  const color = enhance(page, "color");
  assert.ok(color.data[3] === 255 && color.width === W);
  assert.ok(at(color, 5, 2)[0] > 230);
  assert.equal(enhance(page, "original"), page);
  assert.ok(page.data[(2 * W + 5) * 4] < 150, "el original no se modifica");
  const full = processPixels(page, { mode: "bw", turns: 1, margins: { top: 0.1, right: 0, bottom: 0, left: 0 } });

  assert.equal(full.width, H);
  assert.equal(full.height, W - Math.floor(W * 0.1));

  // Detección y enderezado: hoja clara inclinada sobre fondo oscuro.
  const SW = 400, SH = 300, quad = [[90, 40], [330, 70], [310, 270], [60, 235]];
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % 4],
        cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (cr !== 0) { if (sign && Math.sign(cr) !== sign) return false; sign = Math.sign(cr); }
    }
    return true;
  };
  const photo = px(SW, SH, (x, y) => (inside(x, y) ? ((x * 7 + y * 3) % 40 < 3 ? [60, 60, 60] : [225, 225, 220]) : [45, 40, 38]));
  const found = detectDocument(photo);
  assert.ok(found, "debe encontrar la hoja");
  const expected = [[90, 40], [330, 70], [310, 270], [60, 235]];
  found.forEach((pt, i) => {
    assert.ok(Math.abs(pt.x * SW - expected[i][0]) < 8 && Math.abs(pt.y * SH - expected[i][1]) < 8, "esquina " + i + ": " + (pt.x * SW) + "," + (pt.y * SH));
  });
  const flat = warp(photo, found);
  assert.ok(flat.width > 200 && flat.height > 180);
  let dark = 0;
  for (let y = 4; y < flat.height - 4; y++) for (let x = 4; x < flat.width - 4; x++) if (flat.data[(y * flat.width + x) * 4] < 100) dark++;
  assert.ok(dark / (flat.width * flat.height) < 0.2, "sin fondo oscuro dentro del resultado: " + dark);
  const viaPipeline = processPixels(photo, { mode: "bw", turns: 0, margins: NO_MARGINS, quad: found });
  assert.equal(viaPipeline.width, flat.width);
  // Sin bordes claros: fondo uniforme o todo claro.
  assert.equal(detectDocument(px(100, 100, () => [240, 240, 240])), null);
  assert.equal(detectDocument(px(100, 100, () => [30, 30, 30])), null);
  // Una hoja con sombra de un lado (cambio suave, sin borde) no se recorta: se perdería la parte oscura.
  assert.equal(detectDocument(px(300, 200, (x) => { const v = Math.round(60 + (x / 300) * 180); return [v, v, v - 8]; })), null);
  // Cuadro completo = identidad (casi)
  const id = warp(photo, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  assert.equal(id.width, SW);
  assert.ok(Math.abs(id.data[(150 * SW + 200) * 4] - photo.data[(150 * SW + 200) * 4]) < 2);
  assert.throws(() => warp(photo, [{ x: 0, y: 0 }, { x: 0.001, y: 0 }, { x: 0.001, y: 0.001 }, { x: 0, y: 0.001 }]), /no son válidas/);

  // Archivos
  assert.ok(checkImageFile({ name: "a.pdf", type: "application/pdf", size: 1 }));
  assert.ok(checkImageFile({ name: "a.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 }));
  assert.equal(checkImageFile({ name: "a.jpg", type: "image/jpeg", size: 100 }), "");

  // PDF
  const pages = [
    { jpeg: new Uint8Array(JPEG), width: 40, height: 60 },
    { jpeg: new Uint8Array(JPEG), width: 60, height: 40 },
    { jpeg: new Uint8Array(JPEG), width: 40, height: 60 },
  ];
  const a4 = await scanPdf(pages, "a4", "Prueba");
  const txt = Buffer.from(await a4.arrayBuffer()).toString("latin1");
  assert.ok(txt.startsWith("%PDF"));
  assert.equal((txt.match(/\/Type\s*\/Page\b(?!s)/g) || []).length, 3);
  assert.ok(/MediaBox\s*\[0 0 595\.2\d* 841\.8\d*\]/.test(txt), "A4 vertical");
  assert.ok(/MediaBox\s*\[0 0 841\.8\d* 595\.2\d*\]/.test(txt), "A4 horizontal para imagen ancha");
  const letter = Buffer.from(await (await scanPdf(pages.slice(0, 1), "letter", "x")).arrayBuffer()).toString("latin1");
  assert.ok(/MediaBox\s*\[0 0 612(\.0*)? 792(\.0*)?\]/.test(letter));
  const fit = Buffer.from(await (await scanPdf(pages.slice(0, 1), "fit", "x", { ...DEFAULT_LAYOUT, margin: "none" })).arrayBuffer()).toString("latin1");
  assert.ok(/MediaBox\s*\[0 0 30(\.0*)? 45(\.0*)?\]/.test(fit), "tamaño de la imagen");
  await assert.rejects(() => scanPdf([], "a4", "x"), /al menos una/);
  await assert.rejects(() => scanPdf(Array(31).fill(pages[0]), "a4", "x"), /Máximo/);
  const P = (x, y) => ({ x, y });
  assert.ok(m.exports.validQuad([P(0.1, 0.1), P(0.9, 0.1), P(0.9, 0.9), P(0.1, 0.9)]), "esquinas válidas");
  assert.ok(!m.exports.validQuad([P(0.1, 0.1), P(0.9, 0.9), P(0.9, 0.1), P(0.1, 0.9)]), "esquinas cruzadas");
  assert.ok(!m.exports.validQuad([P(0.4, 0.4), P(0.5, 0.4), P(0.5, 0.5), P(0.4, 0.5)]), "área muy pequeña");
  assert.ok(!m.exports.validQuad([P(-0.1, 0), P(1, 0), P(1, 1), P(0, 1)]), "fuera de la imagen");
  assert.ok(!m.exports.validQuad([P(0, 0), P(0.5, 0), P(1, 0), P(0, 1)]), "tres puntos en línea");
  // Brillo y contraste
  const g = px(2, 1, (x) => [x ? 200 : 60, x ? 200 : 60, x ? 200 : 60]);
  assert.equal(adjust(g, 0, 0), g, "sin cambio devuelve la misma imagen");
  assert.ok(adjust(g, 0, 60).data[0] < 60 && adjust(g, 0, 60).data[4] > 200, "más contraste separa claros y oscuros");
  assert.ok(adjust(g, 40, 0).data[0] > 60, "más brillo");
  assert.equal(adjust(g, 0, 60).data[3], 255);
  assert.equal(g.data[0], 60, "el original no se modifica");
  assert.equal(processPixels(g, { mode: "bw", turns: 0, margins: NO_MARGINS, contrast: 80 }).data[0] % 255, 0, "blanco y negro ignora el contraste");
  // Fondo, marco y márgenes de la hoja
  const plain = Buffer.from(await (await scanPdf(pages.slice(0, 1), "a4", "x")).arrayBuffer()).toString("latin1");
  const styled = Buffer.from(await (await scanPdf(pages.slice(0, 1), "a4", "x", { margin: "wide", background: "#102030", frame: "thick", frameColor: "#ff0000" })).arrayBuffer()).toString("latin1");
  assert.ok(/ rg\b/.test(styled) && !/ rg\b/.test(plain), "fondo de color solo cuando se pide");
  assert.ok(/1\.? 0\.? 0\.? RG/.test(styled) && /\b3\.? w/.test(styled), "marco rojo grueso");
  const withMargin = Buffer.from(await (await scanPdf(pages.slice(0, 1), "fit", "x", { ...DEFAULT_LAYOUT, margin: "normal" })).arrayBuffer()).toString("latin1");
  assert.ok(/MediaBox\s*\[0 0 86(\.0*)? 101(\.0*)?\]/.test(withMargin), "la hoja crece con el margen: " + (/MediaBox[^\]]*\]/.exec(withMargin) || [])[0]);
  await assert.rejects(() => scanPdf(pages, "a4", "x", { ...DEFAULT_LAYOUT, background: "rojo" }), /no son válidas/);
  await assert.rejects(() => scanPdf(pages, "a4", "x", { ...DEFAULT_LAYOUT, margin: "gigante" }), /no son válidas/);
  // Calidad de la foto: se mide ruido y desenfoque y solo se corrige lo que hace falta.
  {
    const text = (x, y) => ((Math.floor(x / 12) + Math.floor(y / 18)) % 3 === 0 && y % 60 < 36 && x > 30 && x < 330 ? 40 : 235);
    const gray = (w, h, f) => px(w, h, (x, y) => { const v = f(x, y); return [v, v, v]; });
    const crisp = gray(360, 240, text);
    const soften = (p, r) => { // promedio horizontal y vertical: imita una foto movida o sin foco
      const out = new Uint8ClampedArray(p.data.length);
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        let sum = 0, n = 0;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < p.width && yy < p.height) { sum += p.data[(yy * p.width + xx) * 4]; n++; } }
        out.fill(Math.round(sum / n), (y * p.width + x) * 4, (y * p.width + x) * 4 + 3); out[(y * p.width + x) * 4 + 3] = 255;
      }
      return { data: out, width: p.width, height: p.height };
    };
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
    const noisy = gray(360, 240, (x, y) => Math.max(0, Math.min(255, text(x, y) + rnd() * 90)));
    const q0 = imageQuality(crisp), q1 = imageQuality(soften(crisp, 3)), q2 = imageQuality(noisy);
    assert.ok(q0.noise < 5 && q0.blur < 2, "foto nítida: " + JSON.stringify(q0));
    assert.ok(q1.blur > q0.blur + 1, "foto sin foco mide más borrosa: " + JSON.stringify([q0, q1]));
    assert.ok(q2.noise > 20, "foto con grano: " + JSON.stringify(q2));
    assert.equal(clarify(crisp), crisp, "una foto buena no se toca");
    const blurry = soften(crisp, 4), fixed = clarify(blurry);
    assert.notEqual(fixed, blurry);
    assert.ok(imageQuality(fixed).blur < imageQuality(blurry).blur, "después de aclarar se ve más nítida");
    const clean = clarify(noisy);
    assert.ok(imageQuality(clean).noise < q2.noise / 2, "el grano baja a menos de la mitad");
    assert.equal(clean.width, 360);
    // El papel queda parejo: junto al texto no hay halo más claro que el resto de la hoja.
    const doc = gray(400, 300, (x, y) => (x > 40 && x < 200 && y > 40 && y < 120 && (x + y * 3) % 7 < 3 ? 30 : 236));
    const flat = enhance(doc, "color"), at = (p, x, y) => p.data[(y * p.width + x) * 4];
    assert.ok(Math.abs(at(flat, 215, 80) - at(flat, 380, 280)) <= 6, "sin halo junto al texto: " + [at(flat, 215, 80), at(flat, 380, 280)]);
    assert.ok(at(flat, 380, 280) >= 250, "el papel sale casi blanco: " + at(flat, 380, 280));
    // Sombra que va de oscuro a claro: la parte oscura no se pierde ni se recorta.
    const shade = gray(400, 300, (x, y) => Math.round(((doc.data[(y * 400 + x) * 4] / 236) * (70 + (x / 400) * 170))));
    const fixedShade = processPixels(shade, { mode: "color", turns: 0, margins: NO_MARGINS, quad: detectDocument(shade) });
    assert.equal(fixedShade.width, 400);
    assert.ok(Math.abs(at(fixedShade, 5, 280) - at(fixedShade, 395, 280)) <= 22, "la sombra queda pareja: " + [at(fixedShade, 5, 280), at(fixedShade, 395, 280), at(fixedShade, 200, 280)]);
  }
  console.log("ESCANER_OK: giro, recorte, sombras, detección de bordes y perspectiva, gris/color/blanco y negro, original intacto, PDF multipágina y tamaños.");
})().catch((e) => { console.error(e); process.exit(1); });
