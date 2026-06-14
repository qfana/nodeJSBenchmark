'use strict';

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');

const SERVER_MAP = {
  express: {
    port: 3001,
    cwd: path.join(ROOT, 'servers', 'express'),
    single: ['node', ['src/app.js']],
    cluster: ['node', ['src/cluster.js']],
    workers: ['node', ['src/app.js']],
    workersEnv: { USE_WORKER_THREADS: 'true' },
  },
  fastify: {
    port: 3002,
    cwd: path.join(ROOT, 'servers', 'fastify'),
    single: ['node', ['src/app.js']],
    cluster: ['node', ['src/cluster.js']],
    workers: ['node', ['src/app.js']],
    workersEnv: { USE_WORKER_THREADS: 'true' },
  },
  nestjs: {
    port: 3003,
    cwd: path.join(ROOT, 'servers', 'nestjs'),
    single: ['node', ['dist/main.js']],
    cluster: ['node', ['dist/cluster.js']],
    workers: ['node', ['dist/main.js']],
    workersEnv: { USE_WORKER_THREADS: 'true' },
  },
};

function parseArgs() {
  const framework = process.argv[2] || 'express';
  const mode = process.argv[3] || 'single';

  if (!SERVER_MAP[framework]) {
    throw new Error(`Unknown framework: ${framework}`);
  }

  if (!['single', 'cluster', 'workers'].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  return { framework, mode };
}

async function ensureNestBuilt() {
  const { execSync } = require('child_process');
  const distMain = path.join(ROOT, 'servers', 'nestjs', 'dist', 'main.js');
  if (!require('fs').existsSync(distMain)) {
    execSync('npm run build', {
      cwd: path.join(ROOT, 'servers', 'nestjs'),
      stdio: 'inherit',
    });
  }
}

async function main() {
  const { framework, mode } = parseArgs();
  const config = SERVER_MAP[framework];
  const [command, args] = config[mode];

  if (framework === 'nestjs') {
    await ensureNestBuilt();
  }

  const env = {
    ...process.env,
    PORT: String(config.port),
    ...(mode === 'workers' ? config.workersEnv : {}),
  };

  const child = spawn(command, args, {
    cwd: config.cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const baseUrl = `http://localhost:${config.port}`;
  const started = Date.now();

  const wait = () =>
    new Promise((resolve, reject) => {
      const attempt = () => {
        const req = http.get(`${baseUrl}/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) {
            console.log(`Сервер: ${baseUrl}`);
            resolve();
            return;
          }
          retry();
        });
        req.on('error', retry);
      };

      const retry = () => {
        if (Date.now() - started > 30000) {
          reject(new Error('Server startup timeout'));
          return;
        }
        setTimeout(attempt, 500);
      };

      attempt();
    });

  await wait();

  child.on('exit', (code) => process.exit(code || 0));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
