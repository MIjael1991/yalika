import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';

const { Client } = pg;

const privacy =
  'Acepto que mis respuestas y los datos que esta encuesta solicita se utilicen únicamente para sus fines indicados. Los datos de identificación se protegen y sólo puede consultarlos la persona creadora de la encuesta.';

const demos = [
  {
    title: 'PRUEBA 1 · Satisfacción del servicio',
    slug: 'prueba-satisfaccion-servicio',
    description: 'Encuesta demo anónima para probar escalas, sí/no, opción única y comentarios.',
    identityMode: 'anonymous',
    collectMunicipality: false,
    collectLocality: false,
    collectPostalCode: false,
    collectAddress: false,
    collectCurp: false,
    collectVoterKey: false,
    collectElectoralSection: false,
    collectIne: false,
    ineCaptureMode: 'front',
    ineAutoExtract: false,
    ineRequired: false,
    questions: [
      ['¿Qué tan satisfecho estás con el servicio recibido?', 'rating', ['1 · Nada satisfecho', '2', '3', '4', '5 · Muy satisfecho'], true],
      ['¿La atención fue clara y amable?', 'yesno', ['Sí', 'No'], true],
      ['¿Qué aspecto valoraste más?', 'choice', ['Rapidez', 'Trato', 'Precio', 'Calidad', 'Otro'], true],
      ['¿Qué aspectos mejorarías?', 'multi', ['Tiempo de espera', 'Información', 'Trato', 'Instalaciones', 'Otro'], true],
      ['¿Volverías a utilizar el servicio?', 'yesno', ['Sí', 'No'], true],
      ['¿Qué sugerencia concreta nos dejarías?', 'text', [], false],
    ],
  },
  {
    title: 'PRUEBA 2 · Consulta vecinal con INE frente',
    slug: 'prueba-consulta-vecinal-ine-frente',
    description: 'Encuesta demo con teléfono, ubicación, domicilio y fotografía opcional sólo del frente de la INE.',
    identityMode: 'phone',
    collectMunicipality: true,
    collectLocality: true,
    collectPostalCode: true,
    collectAddress: true,
    collectCurp: false,
    collectVoterKey: false,
    collectElectoralSection: true,
    collectIne: true,
    ineCaptureMode: 'front',
    ineAutoExtract: true,
    ineRequired: false,
    questions: [
      ['¿Cuál es el principal problema de tu colonia?', 'choice', ['Seguridad', 'Alumbrado', 'Agua', 'Calles', 'Basura', 'Otro'], true],
      ['¿Qué servicios necesitan atención urgente?', 'multi', ['Seguridad', 'Alumbrado', 'Agua', 'Pavimentación', 'Áreas verdes', 'Otro'], true],
      ['¿Consideras que ha mejorado tu colonia durante el último año?', 'yesno', ['Sí', 'No'], true],
      ['¿Qué tan importante es atender el problema principal?', 'rating', ['1 · Poco importante', '2', '3', '4', '5 · Muy importante'], true],
      ['¿Participarías en una reunión vecinal para revisar soluciones?', 'yesno', ['Sí', 'No'], true],
      ['Escribe una propuesta breve para tu colonia.', 'text', [], false],
    ],
  },
  {
    title: 'PRUEBA 3 · Registro con verificación completa',
    slug: 'prueba-registro-verificacion-completa',
    description: 'Encuesta demo para probar teléfono, correo, CP, domicilio, CURP, clave de elector e INE frente + reverso.',
    identityMode: 'email_and_phone',
    collectMunicipality: true,
    collectLocality: true,
    collectPostalCode: true,
    collectAddress: true,
    collectCurp: true,
    collectVoterKey: true,
    collectElectoralSection: true,
    collectIne: true,
    ineCaptureMode: 'front_back',
    ineAutoExtract: true,
    ineRequired: true,
    questions: [
      ['¿Confirmas que deseas participar en este registro de prueba?', 'yesno', ['Sí', 'No'], true],
      ['Selecciona el tema que más te interesa.', 'choice', ['Bienestar', 'Educación', 'Salud', 'Seguridad', 'Otro'], true],
      ['¿Por qué medios prefieres recibir seguimiento?', 'multi', ['Teléfono', 'Correo electrónico', 'Mensaje', 'Otro'], true],
      ['Califica qué tan sencillo fue completar el registro.', 'rating', ['1 · Muy difícil', '2', '3', '4', '5 · Muy sencillo'], true],
      ['¿Qué mejorarías del proceso?', 'text', [], false],
    ],
  },
];

async function chooseUser(client) {
  const result = await client.query(
    `SELECT u.id, u.name, u.email, u."companyId", c.name AS "companyName"
     FROM users u
     JOIN companies c ON c.id = u."companyId"
     WHERE u.status = 'active'
     ORDER BY u."createdAt" ASC
     LIMIT 50`,
  );
  if (!result.rows.length) throw new Error('No hay usuarios activos para asignar las encuestas de prueba.');
  if (result.rows.length === 1 || !process.stdin.isTTY) return result.rows[0];

  console.log('\nElige a qué usuario se asignarán las 3 encuestas de prueba:');
  result.rows.forEach((row, index) => {
    console.log(`  [${index + 1}] ${row.name} · ${row.email} · ${row.companyName}`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Número de usuario: ')).trim();
  rl.close();
  const index = Number(answer) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= result.rows.length) {
    throw new Error('No se eligió un usuario válido.');
  }
  return result.rows[index];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está configurada.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const owner = await chooseUser(client);
    await client.query('BEGIN');
    for (const demo of demos) {
      const exists = await client.query('SELECT id FROM surveys WHERE slug = $1 LIMIT 1', [demo.slug]);
      if (exists.rowCount) {
        console.log(`Ya existe: ${demo.title} · se conserva sin duplicar.`);
        continue;
      }
      const surveyId = randomUUID();
      const now = new Date();
      await client.query(
        `INSERT INTO surveys
        (id, title, slug, description, status, "identityMode", "accessMode",
         "collectMunicipality", "collectLocality", "collectPostalCode", "collectAddress",
         "collectCurp", "collectVoterKey", "collectElectoralSection", "collectLeaderProposal", "collectIne",
         "ineCaptureMode", "ineAutoExtract", "ineRequired", "ineRetentionDays",
         "showPublicResults", "privacyNotice", "thankYouMessage", "companyId", "createdById",
         "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,'draft',$5,'public',$6,$7,$8,$9,$10,$11,$12,false,$13,$14,$15,$16,30,false,$17,$18,$19,$20,$21,$21)`,
        [
          surveyId, demo.title, demo.slug, demo.description, demo.identityMode,
          demo.collectMunicipality, demo.collectLocality, demo.collectPostalCode, demo.collectAddress,
          demo.collectCurp, demo.collectVoterKey, demo.collectElectoralSection, demo.collectIne, demo.ineCaptureMode,
          demo.ineAutoExtract, demo.ineRequired, privacy,
          'Gracias. Esta fue una encuesta de prueba de Yaleka.', owner.companyId, owner.id, now,
        ],
      );
      for (const [index, question] of demo.questions.entries()) {
        const [prompt, type, options, publicAggregate] = question;
        await client.query(
          `INSERT INTO survey_questions
           (id, prompt, type, options, required, "publicAggregate", "sortOrder", "surveyId", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4::jsonb,true,$5,$6,$7,$8,$8)`,
          [randomUUID(), prompt, type, JSON.stringify(options), publicAggregate, index, surveyId, now],
        );
      }
      console.log(`Creada: ${demo.title}`);
    }
    await client.query('COMMIT');
    console.log(`\nLas encuestas quedaron como BORRADOR para ${owner.name} (${owner.email}).`);
    console.log('Revísalas en Encuestas y publica sólo las que quieras probar con personas reales.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
