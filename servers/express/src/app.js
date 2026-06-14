'use strict';

const express = require('express');
const {
  getStaticJson,
  validateAndTransformHeavyJson,
  simulateIoDelay,
  computeHash,
  computeArray,
  counterStore,
  BODY_LIMIT_BYTES,
} = require('@benchmark/shared');

const PORT = Number(process.env.PORT || 3001);
const USE_WORKER_THREADS = process.env.USE_WORKER_THREADS === 'true';

function createApp() {
  const app = express();

  app.use(express.json({ limit: BODY_LIMIT_BYTES }));
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      framework: 'express',
      pid: process.pid,
      workerThreads: USE_WORKER_THREADS,
    });
  });

  app.get('/api/static', (_req, res) => {
    res.json(getStaticJson());
  });

  app.post('/api/transform', (req, res) => {
    try {
      const result = validateAndTransformHeavyJson(req.body);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/io-simulate', async (req, res) => {
    try {
      const result = await simulateIoDelay(req.query.delay);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/hash', async (req, res) => {
    try {
      const rounds = req.body?.rounds || 1000;
      const data = req.body?.data || 'benchmark-payload';
      const result = await computeHash(data, rounds, USE_WORKER_THREADS);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/compute', async (req, res) => {
    try {
      const size = req.body?.size || 1_000_000;
      const result = await computeArray(size, USE_WORKER_THREADS);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/counter', (_req, res) => {
    res.json(counterStore.read());
  });

  app.post('/api/counter/increment', (req, res) => {
    const step = req.body?.step || 1;
    res.json(counterStore.increment(step));
  });

  app.post('/api/counter/reset', (_req, res) => {
    counterStore.value = 0;
    counterStore.reads = 0;
    counterStore.writes = 0;
    res.json({ reset: true, pid: process.pid });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
  console.log(`Express on http://localhost:${PORT}`);
  });
}

module.exports = { createApp, PORT };
