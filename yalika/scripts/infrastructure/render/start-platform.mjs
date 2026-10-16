import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDirectory, '..', '..');
const apiRoot = join(projectRoot, 'apps', 'api');
const webRoot = join(projectRoot, 'apps', 'web');
const publicPort = process.env.PORT || '10000';

const accountSetup = spawnSync(
  process.execPath,
  ['scripts/create-survey-owner.mjs', '--from-env'],
  {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

if (accountSetup.status !== 0) {
  console.error('No fue posible preparar la cuenta inicial de Encuestas.');
  process.exit(accountSetup.status ?? 1);
}

for (const key of [
  'ORION_BOOTSTRAP_ORGANIZATION',
  'ORION_BOOTSTRAP_NAME',
  'ORION_BOOTSTRAP_EMAIL',
  'ORION_BOOTSTRAP_PASSWORD',
]) {
  delete process.env[key];
}

const api = spawn(process.execPath, ['dist/main.js'], {
  cwd: apiRoot,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3000',
  },
  stdio: 'inherit',
});

const web = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', '-p', publicPort],
  {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ORION_API_URL: 'http://127.0.0.1:3000',
      PORT: publicPort,
    },
    stdio: 'inherit',
  },
);

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

api.on('exit', (code) => {
  if (!stopping) {
    console.error(`La API terminó inesperadamente con código ${code ?? 1}`);
    stop(code ?? 1);
  }
});

web.on('exit', (code) => {
  if (!stopping) {
    console.error(`La web terminó inesperadamente con código ${code ?? 1}`);
    stop(code ?? 1);
  }
});

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
