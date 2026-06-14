'use strict';

const Fastify = require('fastify');
const {
  getStaticJson,
  validateAndTransformHeavyJson,
  simulateIoDelay,
  computeHash,
  computeArray,
  counterStore,
  BODY_LIMIT_BYTES,
} = require('@benchmark/shared');

const PORT = Number(process.env.PORT || 3002);
const USE_WORKER_THREADS = process.env.USE_WORKER_THREADS === 'true';

function createApp() {
  const app = Fastify({
    logger: false,
    bodyLimit: BODY_LIMIT_BYTES,
  });

  app.get('/health', async () => ({
    status: 'ok',
    framework: 'fastify',
    pid: process.pid,
    workerThreads: USE_WORKER_THREADS,
  }));

  app.get('/api/static', async () => getStaticJson());

  app.post('/api/transform', async (request, reply) => {
    try {
      return validateAndTransformHeavyJson(request.body);
    } catch (error) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.get('/api/io-simulate', async (request) => simulateIoDelay(request.query.delay));

  app.post('/api/hash', async (request) => {
    const rounds = request.body?.rounds || 1000;
    const data = request.body?.data || 'benchmark-payload';
    return computeHash(data, rounds, USE_WORKER_THREADS);
  });

  app.post('/api/compute', async (request) => {
    const size = request.body?.size || 1_000_000;
    return computeArray(size, USE_WORKER_THREADS);
  });

  app.get('/api/counter', async () => counterStore.read());

  app.post('/api/counter/increment', async (request) => {
    const step = request.body?.step || 1;
    return counterStore.increment(step);
  });

  app.post('/api/counter/reset', async () => {
    counterStore.value = 0;
    counterStore.reads = 0;
    counterStore.writes = 0;
    return { reset: true, pid: process.pid };
  });

  return app;
}

async function start() {
  const app = createApp();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Fastify on http://localhost:${PORT}`);
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { createApp, start, PORT };
