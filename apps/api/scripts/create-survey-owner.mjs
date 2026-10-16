import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';

import pg from 'pg';

const { Client } = pg;
const scryptAsync = promisify(scrypt);

function readSecret(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error('Este comando necesita una terminal interactiva'));
      return;
    }

    const input = process.stdin;
    const output = process.stdout;
    const previousRawMode = input.isRaw;
    let value = '';

    function finish(error) {
      input.off('data', onData);
      input.setRawMode(Boolean(previousRawMode));
      input.pause();
      output.write('\n');
      error ? reject(error) : resolve(value);
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Operación cancelada'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          if (value) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          output.write('*');
        }
      }
    }

    output.write(label);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64);
  return ['scrypt', salt.toString('base64url'), derivedKey.toString('base64url')].join('$');
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada en apps/api/.env');
  }

  const fromEnvironment = process.argv.includes('--from-env');
  let companyName;
  let personName;
  let email;
  let password;

  if (fromEnvironment) {
    companyName = (process.env.YALIKA_BOOTSTRAP_ORGANIZATION ?? '').trim();
    personName = (process.env.YALIKA_BOOTSTRAP_NAME ?? '').trim();
    email = (process.env.YALIKA_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
    password = process.env.YALIKA_BOOTSTRAP_PASSWORD ?? '';

    if (![companyName, personName, email, password].every(Boolean)) {
      console.log('No se configuró una cuenta inicial de Encuestas; se omitirá este paso.');
      return;
    }
  } else {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    companyName = (await terminal.question('Nombre de su negocio u organización: ')).trim();
    personName = (await terminal.question('Nombre de la persona: ')).trim();
    email = (await terminal.question('Correo para ingresar: ')).trim().toLowerCase();
    terminal.close();

    password = await readSecret('Contraseña de la nueva cuenta: ');
    const confirmation = await readSecret('Repite la contraseña: ');
    if (password !== confirmation) {
      throw new Error('Las contraseñas no coinciden');
    }
  }

  if (companyName.length < 2 || personName.length < 2) {
    throw new Error('Escribe el nombre de la organización y de la persona');
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('El correo no tiene un formato válido');
  }

  if (password.length < 10 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password)) {
    throw new Error('Usa al menos 10 caracteres e incluye letras y números');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');
    const duplicateUser = await client.query(
      'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email],
    );
    if (duplicateUser.rowCount) {
      if (fromEnvironment) {
        await client.query('ROLLBACK');
        console.log(`La cuenta inicial ${email} ya existe; no se duplicó.`);
        return;
      }
      throw new Error(`Ya existe una cuenta con el correo ${email}`);
    }

    const duplicateCompany = await client.query(
      'SELECT 1 FROM companies WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [companyName],
    );
    if (duplicateCompany.rowCount) {
      throw new Error(`Ya existe una empresa llamada ${companyName}. Usa un nombre diferente para mantenerla separada.`);
    }

    const companyId = randomUUID();
    const roleId = randomUUID();
    const userId = randomUUID();
    const now = new Date();

    await client.query(
      `INSERT INTO companies (id, name, status, "createdAt", "updatedAt")
       VALUES ($1, $2, 'active', $3, $3)`,
      [companyId, companyName, now],
    );
    await client.query(
      `INSERT INTO roles (id, name, description, status, "companyId", "createdAt", "updatedAt")
       VALUES ($1, 'Encuestas', 'Acceso exclusivo al módulo de encuestas', 'active', $2, $3, $3)`,
      [roleId, companyId, now],
    );
    await client.query(
      `INSERT INTO users
       (id, name, email, status, "passwordHash", "passwordChangedAt", "companyId", "roleId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $5, $5)`,
      [userId, personName, email, await hashPassword(password), now, companyId, roleId],
    );

    await client.query('COMMIT');
    console.log('\nCUENTA DE ENCUESTAS CREADA CORRECTAMENTE');
    console.log(`Organización: ${companyName}`);
    console.log(`Persona: ${personName}`);
    console.log(`Correo: ${email}`);
    console.log('Acceso permitido: Encuestas');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
