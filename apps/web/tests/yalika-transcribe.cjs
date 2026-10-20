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
const { unzipSync, strFromU8 } = require("fflate");
const A = require("../src/lib/yalika-audio.ts");
const T = require("../src/lib/yalika-transcript.ts");
const R = require("../src/lib/yalika-transcribe.ts");
const D = require("../src/lib/yalika-document.ts");
const Dr = require("../src/lib/yalika-transcript-draft.ts");

const sine = (f, sr, sec, a = 0.5) => Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));
const rms = (x, from = 0, to = x.length) => Math.sqrt(x.slice(from, to).reduce((s, v) => s + v * v, 0) / (to - from));
// Cuadros de energía: [segundos, nivel] → arreglo de RMS cada 20 ms
const frames = (spec) => Float32Array.from(spec.flatMap(([sec, lvl]) => Array(Math.round(sec / A.FRAME_SEC)).fill(lvl)));
const SPEECH = 0.1, QUIET = 0.0005;

(async () => {
  // Cambio de frecuencia
  const r48 = A.resample(sine(1000, 48000, 2), 48000, 16000);
  assert.ok(Math.abs(r48.length - 32000) <= 1);
  assert.ok(Math.abs(rms(r48, 4000, 28000) - 0.5 / Math.SQRT2) < 0.01, "1 kHz se conserva");
  assert.ok(rms(A.resample(sine(9000, 48000, 2), 48000, 16000), 4000, 28000) < 0.02, "lo agudo que no cabe se filtra");
  const r44 = A.resample(sine(440, 44100, 1.5), 44100, 16000);
  assert.ok(Math.abs(r44.length - 24000) <= 1);
  const up = A.resample(sine(440, 8000, 1), 8000, 16000);
  assert.ok(Math.abs(up.length - 16000) <= 1 && Math.abs(rms(up, 2000, 14000) - 0.5 / Math.SQRT2) < 0.01, "también sube de 8 a 16 kHz");
  const whole = A.resample(sine(300, 44100, 3), 44100, 16000), rs = new A.Resampler(44100, 16000), parts = [];
  const src = sine(300, 44100, 3);
  for (let i = 0; i < src.length; i += 7001) parts.push(rs.push(src.subarray(i, i + 7001)));
  parts.push(rs.flush());
  const joined = Float32Array.from(parts.flatMap((p) => Array.from(p)));
  assert.equal(joined.length, whole.length);
  assert.ok(whole.every((v, i) => Math.abs(v - joined[i]) < 1e-6), "por trozos da lo mismo que de golpe");
  assert.equal(A.resample(src, 16000, 16000), src);
  assert.throws(() => new A.Resampler(0));

  // Filtro grave: quita corriente continua y zumbido, deja la voz
  const hum = A.HighPass.prototype.process.call(new A.HighPass(), Float32Array.from(sine(30, 16000, 2), (v) => v + 0.2));
  assert.ok(rms(hum, 8000, 32000) < 0.1, "zumbido y continua bajan");
  assert.ok(Math.abs(rms(new A.HighPass().process(sine(1000, 16000, 1)), 4000, 16000) - 0.5 / Math.SQRT2) < 0.02);

  // Almacén y medidor
  const store = new A.PcmStore(10);
  store.append(Float32Array.from([0.5, -0.5, 2, -2]));
  assert.equal(store.length, 4);
  const sl = store.slice(0, 4, 1);
  assert.ok(Math.abs(sl[0] - 0.5) < 1e-3 && sl[2] > 0.99 && sl[3] <= -0.99, "recorta sin desbordar");
  assert.deepEqual(Array.from(store.slice(10, 20)), []);
  const meter = new A.EnergyMeter(); meter.push(sine(200, 16000, 0.05)); meter.push(sine(200, 16000, 0.05));
  assert.equal(meter.finish().length, 5);

  // Niveles y volumen
  const lv = A.levels(frames([[5, QUIET], [5, SPEECH], [5, QUIET]]));
  assert.ok(lv.snr > 30 && lv.threshold > lv.floorDb && lv.threshold < lv.speechDb);
  assert.ok(A.gainFor(A.levels(frames([[5, 0.002], [5, 0.0001]]))) > 5, "voz baja sube de volumen");
  assert.ok(A.gainFor(A.levels(frames([[5, 0.9], [5, 0.001]]))) <= 1.01, "voz fuerte no se toca");
  assert.ok(A.gainFor(A.levels(frames([[5, 1e-5]]))) <= 31.7, "nunca más de 30 dB");
  assert.ok(A.gainFor(A.levels(frames([[5, 0.002], [5, 0.0001]])), 0.8) < 1.3, "un pico alto limita el volumen que se sube");

  // Cortes en pausas
  assert.deepEqual(A.planChunks(frames([[10, 0]])), [], "silencio total no tiene voz");
  const two = A.planChunks(frames([[2, QUIET], [10, SPEECH], [5, QUIET], [10, SPEECH], [2, QUIET]]));
  assert.equal(two.length, 2, "una pausa de 5 s separa dos bloques");
  assert.ok(two[0].end <= two[1].start && two[0].start >= 0 && two[0].end < 15);
  const merged = A.planChunks(frames([[1, QUIET], [6, SPEECH], [0.8, QUIET], [6, SPEECH], [1, QUIET]]));
  assert.equal(merged.length, 1, "una pausa corta no parte el bloque");
  // Habla continua de 90 s: bloques de máximo 28 s, sin huecos entre ellos
  const long = A.planChunks(frames([[1, QUIET], [90, SPEECH], [1, QUIET]]));
  assert.ok(long.length >= 4 && long.every((c) => c.end - c.start <= 28.7), "ninguno pasa de 28 s");
  for (let i = 1; i < long.length; i++) assert.ok(long[i].start <= long[i - 1].end + 0.05 && long[i].start >= long[i - 1].end - 0.7, "sin perder audio entre bloques");
  // El corte cae en la pausa más callada, no en medio de una palabra
  const withDip = new Float32Array(frames([[1, QUIET], [40, SPEECH], [1, QUIET]]));
  const dipAt = Math.round(24 / A.FRAME_SEC);
  for (let i = dipAt; i < dipAt + 5; i++) withDip[i] = 0.02;
  const cut = A.planChunks(withDip)[0];
  assert.ok(Math.abs(cut.end - 24.3) < 1.3, "corta en la pausa cercana a 24 s: " + cut.end);
  assert.ok(A.audioNotes(A.levels(frames([[5, 0.01], [5, 0.005]])), 9, 10).noisy);
  assert.ok(A.audioNotes(A.levels(frames([[5, 0.00005], [5, 0.00001]])), 1, 10).tooQuiet);

  // Texto: limpieza y partes dudosas
  const chunk = { start: 10, end: 30, speechDb: -20, snr: 25 };
  const seg = (pieces, extra = {}) => T.assemble([{ chunk: { ...chunk, ...extra.chunk }, pieces, confidence: extra.confidence }], { language: "spanish" });
  const ok = seg([{ start: 0, end: 4, text: " Buenos días, " }, { start: 4, end: 9, text: "¿cómo están ustedes?" }]);
  assert.deepEqual(ok.map((s) => s.text), ["Buenos días,", "¿cómo están ustedes?"]);
  assert.equal(ok[0].start, 10); assert.equal(ok[1].end, 19);
  assert.ok(ok.every((s) => s.doubt.length === 0), "voz clara no se marca");
  assert.equal(seg([{ start: 0, end: 3, text: "Subtítulos realizados por la comunidad de Amara.org" }]).length, 0, "créditos inventados se quitan");
  assert.equal(seg([{ start: 0, end: 3, text: "[Música]" }]).length, 0);
  assert.equal(seg([{ start: 0, end: 2, text: "Gracias." }], { chunk: { speechDb: -50 } }).length, 0, "despedida inventada con voz muy baja");
  assert.equal(seg([{ start: 0, end: 2, text: "Gracias." }]).length, 1, "un gracias real se conserva");
  assert.equal(seg([{ start: 0, end: 2, text: "Gracias." }])[0].doubt.length, 1, "pero se marca para revisar");
  const loop = seg([{ start: 0, end: 8, text: "No lo sé. " + "sí sí sí sí sí sí sí sí" }]);
  assert.ok(loop[0].text.split("sí").length < 5 && loop[0].doubt.some((d) => /repet/i.test(d)));
  const rep = T.collapseRepeats("Vamos a casa. Vamos a casa. Vamos a casa. Vamos a casa. Fin.");
  assert.equal(rep.text, "Vamos a casa. Vamos a casa. Fin."); assert.ok(rep.changed);
  assert.equal(T.collapseRepeats("Dije no, no quiero nada de eso.").changed, false, "repetir dos veces es normal");
  assert.ok(seg([{ start: 0, end: 5, text: "Hola a todos" }], { confidence: 0.4 })[0].doubt.some((d) => /seguro/.test(d)));
  assert.ok(seg([{ start: 0, end: 5, text: "Hola a todos" }], { chunk: { snr: 3 } })[0].doubt.some((d) => /ruido/.test(d)));
  assert.ok(seg([{ start: 0, end: 5, text: "Hola a todos" }], { chunk: { speechDb: -50 } })[0].doubt.some((d) => /baja/.test(d)));
  assert.ok(seg([{ start: 0, end: 3, text: "你好，大家好" }])[0].doubt.some((d) => /otro idioma/.test(d)));
  assert.ok(seg([{ start: 0, end: 3, text: "a".repeat(200) }])[0].doubt.some((d) => /Demasiado texto/.test(d)));
  assert.equal(seg([{ start: 0, end: null, text: "Último" }])[0].end, 30, "sin fin, termina con el bloque");
  const dup = T.assemble([
    { chunk: { start: 0, end: 10, speechDb: -20, snr: 25 }, pieces: [{ start: 8, end: 10, text: "Hasta luego a todos." }] },
    { chunk: { start: 10, end: 20, speechDb: -20, snr: 25 }, pieces: [{ start: 0, end: 2, text: "Hasta luego a todos." }] },
  ]);
  assert.equal(dup.length, 1);

  // Formatos de salida
  const segs = [
    { start: 0, end: 4, text: "Buenos días a todos.", doubt: [] },
    { start: 4.5, end: 9, text: "Hoy hablaremos del presupuesto.", doubt: ["El modelo no estaba seguro de esta parte."] },
    { start: 70, end: 75, text: "Segundo párrafo, tras una pausa larga.", doubt: [] },
  ];
  assert.equal(T.clock(75), "01:15"); assert.equal(T.clock(3725), "01:02:05");
  assert.equal(T.paragraphs(segs).length, 2);
  assert.equal(T.toText(segs, { times: true }), "[00:00] Buenos días a todos. Hoy hablaremos del presupuesto.\n\n[01:10] Segundo párrafo, tras una pausa larga.");
  assert.ok(T.toText(segs, { doubts: true }).includes("presupuesto. [¿?]"));
  assert.ok(!T.toText([{ ...segs[1], reviewed: true }], { doubts: true }).includes("[¿?]"), "lo revisado ya no se marca");
  const srt = T.toSrt(segs);
  assert.ok(srt.startsWith("1\n00:00:00,000 --> 00:00:04,000\nBuenos días a todos.\n\n2\n"));
  assert.match(T.toVtt(segs), /^WEBVTT\n\n00:00:00\.000 --> 00:00:04\.000\n/);
  const longCues = T.toCues([{ start: 0, end: 20, text: "Esta es una frase bastante larga que debe partirse en varios cuadros de subtítulo para que se lea cómodamente en pantalla, sin pasar de dos líneas cada uno.", doubt: [] }]);
  assert.ok(longCues.length >= 2 && longCues.every((c) => c.text.split("\n").length <= 2 && c.text.split("\n").every((l) => l.length <= 46)), "subtítulos cortos");
  assert.ok(longCues.every((c, i) => i === 0 || c.start >= longCues[i - 1].end - 1e-9), "sin encimarse");
  assert.deepEqual(T.stats(segs), { words: 14, doubtful: 1, segments: 3, duration: 75 });
  const rp = T.replaceAll(segs, "presupuesto", "PRESUPUESTO");
  assert.equal(rp.count, 1); assert.ok(rp.segments[1].text.includes("PRESUPUESTO")); assert.equal(T.replaceAll(segs, "", "x").count, 0);
  assert.equal(T.replaceAll(segs, "a.b", "x").count, 0, "no usa expresiones regulares");

  // Word y PDF con el modelo del editor
  const doc = T.toDocument(segs, { title: "Transcripción: clase", source: "clase.m4a", duration: 75, language: "Español", date: new Date(2026, 9, 20) }, { times: true, doubts: true });
  assert.equal(doc.paragraphs[0].bold, true);
  const docx = await D.exportWord(doc), files = unzipSync(new Uint8Array(await docx.arrayBuffer())), xml = strFromU8(files["word/document.xml"]);
  assert.ok(xml.includes("Buenos días a todos.") && xml.includes("[00:00]") && xml.includes("[¿?]") && xml.includes("clase.m4a"));
  const pdf = await D.exportPdf(doc);
  assert.ok(pdf.size > 1000 && Buffer.from(await pdf.arrayBuffer()).slice(0, 4).toString() === "%PDF");
  const huge = T.toDocument(Array.from({ length: 4000 }, (_, i) => ({ start: i * 100, end: i * 100 + 5, text: "palabra ".repeat(20).trim() + ".", doubt: [] })), { title: "x", source: "x", duration: 1, language: "Español", date: new Date() }, {});
  assert.ok(huge.paragraphs.at(-1).text.includes("muy largo"), "avisa si no cabe en un documento");
  D.parseDocument(huge);

  // Borrador: se guarda por cuenta y se valida al leerlo
  const mem = new Map();
  global.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const scope = { userId: "u1", companyId: "c1" };
  assert.equal(Dr.loadDraft(scope), null);
  assert.ok(Dr.saveDraft(scope, { name: "a.mp3", size: 1, language: "spanish", tier: "preciso", savedAt: "2026-10-20T00:00:00Z", seconds: 75, segments: segs }));
  assert.equal(Dr.loadDraft(scope).segments.length, 3);
  assert.equal(Dr.loadDraft({ userId: "u2", companyId: "c1" }), null, "otra cuenta no lo ve");
  mem.set([...mem.keys()][0], JSON.stringify({ name: "x", segments: [{ text: 5 }] }));
  assert.equal(Dr.loadDraft(scope), null, "un borrador dañado se ignora");
  Dr.saveDraft(scope, { name: "a.mp3", size: 1, language: "spanish", tier: "preciso", savedAt: "x", seconds: 1, segments: segs }); Dr.clearDraft(scope);
  assert.equal(Dr.loadDraft(scope), null);

  // Duda por palabra
  const wchunk = { start: 10, end: 20, snr: 30, speechDb: -20 };
  const wr = (pieces, words) => T.assemble([{ chunk: wchunk, pieces, confidence: 0.9, words }], { language: "spanish" });
  const w1 = wr([{ start: 0, end: 4, text: "Hola, Yalika es un sistema." }, { start: 4, end: 8, text: "Funciona sin internet." }], [0.99, 0.5, 0.95, 0.9, 0.98, 0.99, 0.65, 0.99]);
  assert.deepEqual(w1[0].shaky, ["Yalika"], "marca la palabra dudosa sin puntuación"); assert.deepEqual(w1[1].shaky, ["sin"]);
  assert.equal(w1[0].doubt.length, 0, "una palabra dudosa sola no manda a revisar toda la parte");
  const w2 = wr([{ start: 0, end: 4, text: "uno dos tres cuatro" }], [0.5, 0.6, 0.65, 0.99]);
  assert.ok(w2[0].doubt.some((d) => /dudó/.test(d)), "varias palabras dudosas sí");
  const w3 = wr([{ start: 0, end: 4, text: "uno dos tres" }], [0.99, 0.2, 0.99]);
  assert.ok(w3[0].doubt.some((d) => /dudó/.test(d)), "una palabra muy dudosa sí");
  assert.equal(wr([{ start: 0, end: 4, text: "uno dos tres" }], [0.1, 0.1])[0].shaky, undefined, "si la cuenta no cuadra no se usa");
  assert.equal(wr([{ start: 0, end: 4, text: "uno dos tres" }], undefined)[0].shaky, undefined);
  // Una pieza descartada (inventada) consume sus palabras sin desalinear las demás
  const w4 = T.assemble([{ chunk: { ...wchunk, snr: 3 }, pieces: [{ start: 0, end: 2, text: "Gracias." }, { start: 2, end: 6, text: "casa perro" }], confidence: 0.9, words: [0.99, 0.99, 0.3] }], { language: "spanish" });
  assert.deepEqual(w4.map((x) => x.text), ["casa perro"]); assert.deepEqual(w4[0].shaky, ["perro"]);
  // Al corregir, la palabra deja de salir como dudosa
  assert.deepEqual(T.shakyIn(w1[0]), ["Yalika"]); assert.deepEqual(T.shakyIn({ ...w1[0], text: "Hola, Yaleka es un sistema." }), []);
  // El borrador conserva las palabras dudosas
  Dr.saveDraft(scope, { name: "a.mp3", size: 1, language: "spanish", tier: "preciso", savedAt: "x", seconds: 1, segments: w1 });
  assert.deepEqual(Dr.loadDraft(scope).segments[0].shaky, ["Yalika"]); Dr.clearDraft(scope);

  // Orquestador con motor de mentira
  const speechFrames = frames([[1, QUIET], [8, SPEECH], [4, QUIET], [8, SPEECH], [1, QUIET]]);
  const media = { seconds: 22, frames: speechFrames, pcm: { slice: (a, b) => new Float32Array(b - a) } };
  const calls = [];
  const mk = (run) => ({ decode: async (_f, p) => { p(1); return media; }, open: async (d) => { d(5, 10); return { device: "wasm", close() { this.closed = true; }, run } }});
  const stages = [];
  const out = await R.transcribe({ name: "a.mp3" }, mk(async (audio, lang) => { calls.push([audio.length, lang]); return { pieces: [{ start: 0.3, end: 3, text: "Texto del bloque " + calls.length }], confidence: 0.9 }; }), { language: "spanish", onStage: (s) => stages.push(s.stage) });
  assert.equal(out.segments.length, 2); assert.equal(calls.length, 2); assert.equal(calls[0][1], "spanish");
  assert.deepEqual([...new Set(stages)], ["leyendo", "modelo", "escuchando"]);
  assert.ok(out.segments[1].start > out.segments[0].end, "tiempos en orden"); assert.equal(out.missing, 0);
  // Bloque vacío con voz clara: se reintenta y, si sigue vacío, se deja marcado
  let n = 0;
  const empty = await R.transcribe({ name: "a" }, mk(async () => { n++; return { pieces: [{ start: 0, end: 1, text: "" }] }; }), { language: null });
  assert.equal(n, 4, "dos intentos por bloque"); assert.equal(empty.missing, 2);
  assert.ok(empty.segments.every((s) => s.text === "[…]" && s.doubt.length));
  const failing = await R.transcribe({ name: "a" }, mk(async () => { throw Error("boom"); }), { language: null });
  assert.equal(failing.missing, 2);
  await assert.rejects(R.transcribe({ name: "a" }, { decode: async () => ({ seconds: 5, frames: frames([[5, 0]]), pcm: media.pcm }), open: async () => { throw Error("no abrió"); } }, { language: null }), /No se oyó voz/);
  await assert.rejects(R.transcribe({ name: "a" }, { ...mk(async () => ({ pieces: [] })), open: async () => { throw Error("sin red"); } }, { language: null }), /sin red/);
  const ctl = new AbortController();
  await assert.rejects(R.transcribe({ name: "a" }, mk(async () => { ctl.abort(); return { pieces: [{ start: 0, end: 1, text: "x" }] }; }), { language: null, signal: ctl.signal }), /Cancelado/);
  // El volumen bajo pero claro no se marca como problema
  const quietMedia = { ...media, frames: frames([[1, 0.00002], [8, 0.0015], [1, 0.00002]]) };
  const quiet = await R.transcribe({ name: "q" }, { decode: async () => quietMedia, open: async () => ({ device: "wasm", close() {}, run: async () => ({ pieces: [{ start: 0, end: 5, text: "Hablo bajito pero claro." }], confidence: 0.95 }) }) }, { language: "spanish" });
  assert.equal(quiet.segments[0].doubt.length, 0, "voz baja corregida con volumen no se marca: " + quiet.segments[0].doubt);
  console.log("yalika-transcribe: ok");
})().catch((e) => { console.error(e); process.exit(1); });
