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
const { zlibSync } = require("fflate");
const F = require("../src/lib/yalika-imgfmt.ts");
// PNG mínimo (RGBA) para probar los empaquetadores sin navegador.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = new Uint8Array(12 + data.length),
    v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  [...type].forEach((c, i) => (out[4 + i] = c.charCodeAt(0)));
  out.set(data, 8);
  v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
  return out;
};
const png = (size, rgba = [200, 30, 30, 255]) => {
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) raw.set(rgba, y * (size * 4 + 1) + 1 + x * 4);
  const ihdr = new Uint8Array(13),
    v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};
const px = (w, h, f = (x, y) => [x * 10, y * 10, 99, 255]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
};
(async () => {
  // .ico
  const sizes = [256, 16, 48, 32];
  const ico = F.icoFile(sizes.map((s) => ({ size: s, bytes: png(s) })));
  const v = new DataView(ico.buffer);
  assert.equal(v.getUint16(0, true), 0);
  assert.equal(v.getUint16(2, true), 1, "tipo icono");
  assert.equal(v.getUint16(4, true), 4, "cuatro imágenes");
  assert.deepEqual([ico[6], ico[22], ico[38], ico[54]], [16, 32, 48, 0], "ordenadas de menor a mayor; 256 se guarda como 0");
  const off = v.getUint32(6 + 12, true), len = v.getUint32(6 + 8, true);
  assert.deepEqual([...ico.subarray(off, off + 4)], [0x89, 0x50, 0x4e, 0x47], "cada entrada empieza con la firma PNG");
  assert.equal(off + len, v.getUint32(22 + 12, true), "las entradas van una tras otra");
  assert.throws(() => F.icoFile([]), /No hay imágenes/);
  assert.throws(() => F.icoFile([{ size: 20, bytes: png(20) }]), /no válida/);
  assert.throws(() => F.icoFile([{ size: 16, bytes: new Uint8Array(20) }]), /no válida/);

  // .icns
  const icns = F.icnsFile([1024, 16, 128, 512, 256].map((s) => ({ size: s, bytes: png(s) })));
  const w = new DataView(icns.buffer);
  assert.equal(String.fromCharCode(...icns.subarray(0, 4)), "icns");
  assert.equal(w.getUint32(4), icns.length, "largo total");
  const types = [];
  for (let at = 8; at < icns.length; ) {
    types.push(String.fromCharCode(...icns.subarray(at, at + 4)));
    at += w.getUint32(at + 4);
  }
  assert.deepEqual(types, ["icp4", "ic07", "ic08", "ic09", "ic10"]);
  assert.throws(() => F.icnsFile([{ size: 100, bytes: png(100) }]), /no válida/);

  // BMP: 3x2 con filas alineadas a 4 bytes
  const bmp = F.bmpFile(px(3, 2));
  const b = new DataView(bmp.buffer);
  assert.equal(String.fromCharCode(bmp[0], bmp[1]), "BM");
  assert.equal(b.getUint32(2, true), bmp.length);
  assert.equal(bmp.length, 54 + 12 * 2, "3 píxeles x 3 bytes = 9, alineado a 12");
  assert.equal(b.getInt32(18, true), 3);
  assert.equal(b.getInt32(22, true), 2);
  assert.deepEqual([...bmp.subarray(54 + 12, 54 + 12 + 3)], [99, 0, 0], "la primera fila del archivo es la de abajo; el orden es B, G, R");
  // TIFF
  const tif = F.tiffFile(px(3, 2));
  const t = new DataView(tif.buffer);
  assert.deepEqual([...tif.subarray(0, 4)], [0x49, 0x49, 42, 0]);
  const n = t.getUint16(8, true);
  assert.equal(n, 9);
  const tags = Object.fromEntries(Array.from({ length: n }, (_, i) => [t.getUint16(10 + i * 12, true), t.getUint32(10 + i * 12 + 8, true) & (t.getUint16(10 + i * 12 + 2, true) === 3 ? 0xffff : 0xffffffff)]));
  assert.equal(tags[256], 3);
  assert.equal(tags[257], 2);
  assert.equal(tags[279], 18);
  assert.equal(tif.length, tags[273] + 18);
  assert.deepEqual([...tif.subarray(tags[273], tags[273] + 3)], [0, 0, 99], "primer píxel en RGB");
  assert.throws(() => F.bmpFile({ data: new Uint8ClampedArray(4), width: 5000, height: 1 }), /no es válida/);
  assert.throws(() => F.tiffFile({ data: new Uint8ClampedArray(3), width: 1, height: 1 }), /no es válida/);

  // Nombres y texto de ayuda
  assert.equal(F.linuxIconName("Mi Logo Ñandú 2026!"), "mi-logo-nandu-2026");
  assert.equal(F.linuxIconName("???"), "icono");
  assert.match(F.ICON_README("Mi logo", "mi-logo"), /Icon=mi-logo/);
  if (process.env.IMGFMT_OUT) {
    fs.writeFileSync(process.env.IMGFMT_OUT + "/t.ico", ico);
    fs.writeFileSync(process.env.IMGFMT_OUT + "/t.icns", icns);
    fs.writeFileSync(process.env.IMGFMT_OUT + "/t.bmp", F.bmpFile(px(37, 23)));
    fs.writeFileSync(process.env.IMGFMT_OUT + "/t.tif", F.tiffFile(px(37, 23)));
  }
  console.log("FORMATOS_OK: .ico, .icns, BMP y TIFF (estructura, orden, tamaños, errores) y nombres para Linux.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
