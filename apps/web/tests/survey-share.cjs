// Encuestas: enlace publico, QR y resultados para tres encuestas de tipos distintos.
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  test = require("node:test"),
  assert = require("node:assert/strict"),
  ts = require("typescript"),
  QRCode = require("qrcode");

function load(file, extraExports) {
  const source =
    fs.readFileSync(path.join(__dirname, file), "utf8") +
    `\nexport {${extraExports}};`;
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exportsObject = {};
  vm.runInNewContext(code, {
    exports: exportsObject,
    require: () => ({}),
    window: {},
    URL,
  });
  return exportsObject;
}

const { normalizePublicBaseUrl, isLocalUrl, toLocalInput, closingNote } = load(
  "../src/app/surveys/survey-workspace.tsx",
  "normalizePublicBaseUrl,isLocalUrl,toLocalInput,closingNote",
);
const { buildSurveyInsights } = load(
  "../../api/src/core/survey/survey-results.ts",
  "buildSurveyInsights",
);

// Mismo armado que usa la pantalla de Compartir.
const shareLink = (base, slug) => `${base}/e/${slug}`;

const surveys = [
  {
    nombre: "A · Opinion de la comunidad (publica, direccion con diagonal final)",
    slug: "opinion-comunidad",
    direccion: "https://app.ejemplo.mx/",
    enlace: "https://app.ejemplo.mx/e/opinion-comunidad",
    qr: true,
    respuestas: 10,
    preguntas: [
      {
        prompt: "¿Que prefieres?",
        type: "choice",
        answers: [
          { option: "Opcion A", count: 7 },
          { option: "Opcion B", count: 3 },
        ],
        textAnswerCount: 0,
      },
    ],
    insight: "70%",
  },
  {
    nombre: "B · Satisfaccion del cliente (calificacion y texto, tunel sin https)",
    slug: "satisfaccion-clientes",
    direccion: "abc-123.trycloudflare.com",
    enlace: "https://abc-123.trycloudflare.com/e/satisfaccion-clientes",
    qr: true,
    respuestas: 4,
    preguntas: [
      {
        prompt: "Califica la atencion",
        type: "rating",
        answers: [
          { option: "5", count: 3 },
          { option: "3", count: 1 },
        ],
        textAnswerCount: 0,
      },
      {
        prompt: "¿Algun comentario?",
        type: "text",
        answers: [],
        textAnswerCount: 2,
      },
    ],
    insight: "4.5",
  },
  {
    nombre: "C · Consulta por seccion electoral (direccion local: sin QR)",
    slug: "consulta-seccion-0457",
    direccion: "http://localhost:3001",
    enlace: "http://localhost:3001/e/consulta-seccion-0457",
    qr: false,
    respuestas: 400,
    preguntas: [
      {
        prompt: "¿Por quien votarias?",
        type: "choice",
        answers: [
          { option: "Candidatura 1", count: 180 },
          { option: "Candidatura 2", count: 220 },
        ],
        textAnswerCount: 0,
      },
    ],
    insight: "Candidatura 2” con 55%",
  },
];

for (const s of surveys) {
  test(s.nombre, async () => {
    const base = normalizePublicBaseUrl(s.direccion);
    const link = shareLink(base, s.slug);
    assert.equal(link, s.enlace);
    assert.equal(isLocalUrl(link), !s.qr);

    if (s.qr) {
      const dataUrl = await QRCode.toDataURL(link, { width: 420, margin: 2 });
      assert.ok(dataUrl.startsWith("data:image/png;base64,"));
      const png = Buffer.from(dataUrl.split(",")[1], "base64");
      assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
      assert.equal(png.readUInt32BE(16), 420);
    }

    const insights = buildSurveyInsights(s.respuestas, s.preguntas);
    assert.ok(
      insights.join(" ").includes(s.insight),
      `esperaba "${s.insight}" en: ${insights.join(" | ")}`,
    );
  });
}

test("direcciones invalidas o locales nunca generan QR", () => {
  assert.equal(normalizePublicBaseUrl(""), "");
  assert.equal(isLocalUrl("http://127.0.0.1:3001/e/x"), true);
  assert.equal(isLocalUrl("no es una url"), true);
  assert.equal(isLocalUrl("https://app.ejemplo.mx/e/x"), false);
});

test("fecha de cierre: se conserva al editar y se explica en la tarjeta", () => {
  const local = new Date(2026, 9, 30, 18, 0);
  assert.equal(toLocalInput(local.toISOString()), "2026-10-30T18:00");
  assert.equal(toLocalInput(null), "");
  assert.equal(toLocalInput("no es fecha"), "");

  const future = new Date(Date.now() + 5 * 86400000).toISOString();
  const past = new Date(Date.now() - 5 * 86400000).toISOString();
  assert.match(closingNote("active", future), /^Cierra el /);
  assert.match(closingNote("closed", past), /^Cerró el /);
  // cerrada a mano antes de la fecha: no debe decir que "cerró" en el futuro
  assert.equal(closingNote("closed", future), "");
  assert.equal(closingNote("draft", future), "");
  assert.equal(closingNote("active", null), "");
});
