import { randomBytes, scrypt } from 'node:crypto';
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

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
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

  return [
    'scrypt',
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const connectionString = process.env.DATABASE_URL;

  if (!email) {
    throw new Error(
      'Uso: npm run auth:set-password -- correo@orion.local',
    );
  }

  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada en apps/api/.env');
  }

  const password = await readSecret('Nueva contraseña: ');
  const confirmation = await readSecret('Repite la contraseña: ');

  if (password !== confirmation) {
    throw new Error('Las contraseñas no coinciden');
  }

  if (
    password.length < 10 ||
    !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error(
      'Usa al menos 10 caracteres e incluye letras y números',
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE users
       SET "passwordHash" = $1,
           "passwordChangedAt" = NOW(),
           "failedLoginAttempts" = 0,
           "lockedUntil" = NULL,
           "updatedAt" = NOW()
       WHERE LOWER(email) = LOWER($2)
       RETURNING id, name, email`,
      [await hashPassword(password), email],
    );

    if (result.rowCount !== 1) {
      throw new Error(`No existe una cuenta ORION con el correo ${email}`);
    }

    await client.query(
      `UPDATE auth_sessions
       SET "revokedAt" = NOW()
       WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [result.rows[0].id],
    );
    await client.query('COMMIT');

    console.log(`Contraseña actualizada para ${result.rows[0].name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
