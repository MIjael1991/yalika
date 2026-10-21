const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (mod, filename) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename,
  );
const ine = require("../src/lib/yalika-ine.ts");
const tools = require("../src/lib/estudio-tools.ts");
const conv = require("../src/lib/yalika-convert.ts");
const JPG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAUACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDPooorhPqAooooAKKKKACiiigD/9k=", "base64"));
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, a + " ≠ " + b);
(async () => {
  // 1. Una hoja con los dos lados: al tamaño real de una credencial, centrados y sin encimarse.
  const same = ine.sheetPlan({ paper: "letter", layout: "same", size: "real" });
  assert.equal(same.pages, 1);
  assert.equal(same.items.length, 2);
  const [f, b] = same.items;
  near(f.w, 85.6);
  near(f.h, 53.98);
  near(f.x, (215.9 - 85.6) / 2);
  assert.ok(b.y >= f.y + f.h, "el reverso va debajo del frente");
  assert.ok(b.y + b.h <= 279.4 - 12, "cabe dentro de la hoja");
  // 2. Cada lado en su hoja (salto de página).
  const sep = ine.sheetPlan({ paper: "a4", layout: "separate", size: "large" });
  assert.equal(sep.pages, 2);
  assert.deepEqual(sep.items.map((i) => i.page), [0, 1]);
  near(sep.items[0].w, 85.6 * 1.5);
  assert.equal(sep.items[0].y, sep.items[1].y, "mismo lugar en las dos hojas");
  // 3. Ampliada en una sola hoja también cabe en Carta y A4.
  for (const paper of ["letter", "a4"]) assert.doesNotThrow(() => ine.sheetPlan({ paper, layout: "same", size: "large" }));
  // 4. Píxeles a 300 ppp.
  const px = ine.cardPixels("real");
  assert.equal(px.w, 1011);
  assert.equal(px.h, 638);
  near(px.w / px.h, ine.CARD_RATIO, 0.01);
  // 5. Esquinas por defecto: proporción de credencial y dentro de la foto.
  const q = ine.defaultCardQuad(1600, 1200);
  near(ine.quadAspect(q, 1600, 1200), ine.CARD_RATIO, 0.01);
  for (const p of q) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  // 6. Foto sin nada que detectar: queda el cuadro por defecto y se avisa (found = false).
  const flat = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4).fill(128) };
  assert.equal(ine.pickCardQuad(flat).found, false);
  // 6b. Credencial con franja oscura sobre una mesa oscura: se encuentra por contraste con el fondo, con su proporción.
  const W = 640, H = 480, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, inCard = x >= 150 && x < 490 && y >= 130 && y < 345, header = inCard && y < 175;
      const c = header ? [150, 40, 80] : inCard ? [236, 226, 236] : [40, 36, 34];
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  const hit = ine.pickCardQuad({ width: W, height: H, data });
  assert.equal(hit.found, true);
  near(ine.quadAspect(hit.quad, W, H), 340 / 215, 0.08);
  assert.equal(ine.cleanNote("  Solo   para\n trámite  "), "Solo para trámite");
  assert.equal(ine.cleanNote("x".repeat(200)).length, ine.MAX_NOTE);
  // 7. Grises: R = G = B, opaco.
  const g = ine.toGray({ width: 2, height: 1, data: Uint8ClampedArray.from([255, 0, 0, 255, 10, 200, 90, 255]) });
  assert.ok(g.data[0] === g.data[1] && g.data[1] === g.data[2] && g.data[3] === 255);
  // 8. PDF: una hoja o dos según el salto de página.
  const pages = async (blob) => (Buffer.from(await blob.arrayBuffer()).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(await pages(await ine.inePdf({ front: JPG, back: JPG }, { paper: "letter", layout: "same", size: "real" })), 1);
  assert.equal(await pages(await ine.inePdf({ front: JPG, back: JPG }, { paper: "letter", layout: "separate", size: "real" })), 2);
  // 9. Con un solo lado solo sale ese lado, sin hojas vacías.
  assert.equal(await pages(await ine.inePdf({ back: JPG }, { paper: "a4", layout: "separate", size: "real" })), 1);
  await assert.rejects(ine.inePdf({}, { paper: "a4", layout: "same", size: "real" }), /al menos una foto/);
  // 10. Menú: cada herramienta aparece una sola vez, con su título, y los atajos apuntan a herramientas que existen.
  const ids = tools.TOOLS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of tools.TOOLS) assert.ok(t.title && t.short && t.hint && t.icon, t.id);
  assert.equal(tools.toolById("identificacion").short, "Copia de INE");
  assert.equal(tools.toolById("nada"), undefined);
  assert.equal(tools.toolHref("voz"), "/estudio?tab=voz");
  for (const s of tools.SHORTCUTS) {
    const u = new URL(s.href, "http://x");
    assert.ok(tools.toolById(u.searchParams.get("tab")), s.href);
    const de = u.searchParams.get("de"),
      a = u.searchParams.get("a");
    assert.ok(conv.targetsFor(de).some((t) => t.id === a), s.href + " no existe en el convertidor");
  }
  console.log("yalika-ine: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
