'use strict';

const crypto = require('crypto');
const { Worker } = require('worker_threads');
const path = require('path');

const staticPayload = {
  status: 'ok',
  service: 'api',
  version: '1.0.0',
  data: { count: 42, items: ['a', 'b', 'c'] },
};

function getStaticJson() {
  return {
    ...staticPayload,
    timestamp: new Date().toISOString(),
  };
}

function validateAndTransformHeavyJson(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Body must be a JSON object');
  }

  const records = body.records;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Field "records" must be a non-empty array');
  }

  const transformed = records.map((record, index) => {
    if (!record || typeof record !== 'object') {
      throw new Error(`Record ${index} must be an object`);
    }
    if (typeof record.id !== 'number' || typeof record.value !== 'string') {
      throw new Error(`Record ${index}: invalid id or value`);
    }

    return {
      id: record.id,
      value: record.value.trim().toUpperCase(),
      hash: crypto.createHash('sha256').update(`${record.id}:${record.value}`).digest('hex'),
      length: record.value.length,
    };
  });

  return {
    inputCount: records.length,
    outputCount: transformed.length,
    checksum: crypto.createHash('sha256').update(JSON.stringify(transformed)).digest('hex'),
    sample: transformed.slice(0, 3),
  };
}

function simulateIoDelay(delayMs = 300) {
  let delay = Number(delayMs);
  if (!Number.isFinite(delay)) {
    delay = 300;
  }
  delay = Math.min(Math.max(delay, 100), 500);

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ delayMs: delay, finishedAt: new Date().toISOString() });
    }, delay);
  });
}

function computeHashSync(data, rounds = 1000) {
  const input = typeof data === 'string' ? data : JSON.stringify(data);
  let hash = crypto.createHash('sha256').update(input).digest('hex');

  for (let i = 1; i < rounds; i += 1) {
    hash = crypto.createHash('sha256').update(hash).digest('hex');
  }

  return { algorithm: 'sha256', rounds, hash, inputLength: input.length };
}

function computeArraySync(size = 1_000_000) {
  let length = Number(size);
  if (!Number.isFinite(length)) {
    length = 1_000_000;
  }
  length = Math.min(Math.max(Math.floor(length), 1), 10_000_000);

  let sum = 0;
  let max = 0;
  let min = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < length; i += 1) {
    const value = (i * 31 + 17) % 997;
    sum += value;
    if (value > max) max = value;
    if (value < min) min = value;
  }

  return { size: length, sum, max, min, average: sum / length };
}

function runInWorker(type, payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'cpu-worker.js'), {
      workerData: { type, payload },
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

async function computeHash(data, rounds = 1000, useWorker = false) {
  if (useWorker) {
    return runInWorker('hash', { data, rounds });
  }
  return computeHashSync(data, rounds);
}

async function computeArray(size = 1_000_000, useWorker = false) {
  if (useWorker) {
    return runInWorker('array', { size });
  }
  return computeArraySync(size);
}

const counterStore = {
  value: 0,
  reads: 0,
  writes: 0,
  read() {
    this.reads += 1;
    return { value: this.value, reads: this.reads, writes: this.writes, pid: process.pid };
  },
  increment(step = 1) {
    const delta = Number.isFinite(Number(step)) ? Math.max(1, Math.floor(Number(step))) : 1;
    this.writes += 1;
    this.value += delta;
    return { value: this.value, delta, reads: this.reads, writes: this.writes, pid: process.pid };
  },
};

function generateHeavyPayload(recordCount = 5000, valueSize = 2048) {
  const chunk = 'x'.repeat(valueSize);
  const records = [];

  for (let i = 0; i < recordCount; i += 1) {
    records.push({ id: i + 1, value: `${chunk}-${i}` });
  }

  return { meta: { recordCount, valueSize }, records };
}

module.exports = {
  getStaticJson,
  validateAndTransformHeavyJson,
  simulateIoDelay,
  computeHash,
  computeHashSync,
  computeArray,
  computeArraySync,
  counterStore,
  generateHeavyPayload,
  BODY_LIMIT_BYTES: 52 * 1024 * 1024,
};
