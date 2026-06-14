'use strict';

const { parentPort, workerData } = require('worker_threads');
const crypto = require('crypto');

function computeHashSync(data, rounds = 1000) {
  const input = typeof data === 'string' ? data : JSON.stringify(data);
  let hash = crypto.createHash('sha256').update(input).digest('hex');

  for (let i = 1; i < rounds; i += 1) {
    hash = crypto.createHash('sha256').update(hash).digest('hex');
  }

  return {
    algorithm: 'sha256',
    rounds,
    hash,
    inputLength: input.length,
    worker: true,
  };
}

function computeArraySync(size = 1_000_000) {
  const parsed = Number(size);
  const length = Number.isFinite(parsed)
    ? Math.min(Math.max(Math.floor(parsed), 1), 10_000_000)
    : 1_000_000;

  let sum = 0;
  let max = 0;
  let min = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < length; i += 1) {
    const value = (i * 31 + 17) % 997;
    sum += value;
    if (value > max) max = value;
    if (value < min) min = value;
  }

  return {
    size: length,
    sum,
    max,
    min,
    average: sum / length,
    worker: true,
  };
}

const { type, payload } = workerData;

if (type === 'hash') {
  parentPort.postMessage(computeHashSync(payload.data, payload.rounds));
} else if (type === 'array') {
  parentPort.postMessage(computeArraySync(payload.size));
} else {
  throw new Error(`Unknown worker task type: ${type}`);
}
