'use strict';

const autocannon = require('autocannon');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTransformPayload(recordCount = 3000, valueSize = 2048) {
  const filler = 'x'.repeat(valueSize);
  const records = [];

  for (let i = 0; i < recordCount; i += 1) {
    records.push({
      id: i + 1,
      value: `${filler}-${i}`,
      tags: ['benchmark', 'heavy-json'],
    });
  }

  return JSON.stringify({
    meta: { recordCount, valueSize },
    records,
  });
}

function getScenario(testName, baseUrl, targetRps) {
  const scenarios = {
    static: {
      url: `${baseUrl}/api/static`,
      method: 'GET',
    },
    transform: {
      url: `${baseUrl}/api/transform`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: buildTransformPayload(),
    },
    'io-simulate': {
      url: `${baseUrl}/api/io-simulate?delay=300`,
      method: 'GET',
    },
    hash: {
      url: `${baseUrl}/api/hash`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'cpu-benchmark-payload', rounds: 500 }),
    },
    compute: {
      url: `${baseUrl}/api/compute`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: 1_000_000 }),
    },
    concurrency: {
      url: `${baseUrl}/api/counter/increment`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 1 }),
    },
  };

  return scenarios[testName];
}

async function runNodeLoadTest(testName, baseUrl, targetRps, duration) {
  const scenario = getScenario(testName, baseUrl, targetRps);
  const durationSec = Number.parseInt(duration, 10) || 15;
  const connections = testName === 'concurrency'
    ? Math.min(Number(targetRps), 500)
    : Math.min(Math.max(Math.floor(targetRps / 2), 10), 200);

  const result = await autocannon({
    ...scenario,
    connections,
    amount: testName === 'concurrency' ? undefined : undefined,
    duration: durationSec,
    pipelining: 1,
    timeout: 120,
  });

  const latency = result.latency || {};

  return {
    metrics: {
      rps: result.requests.average || 0,
      avgLatencyMs: latency.average || 0,
      medLatencyMs: latency.mean || latency.average || 0,
      p95LatencyMs: latency.p95 || latency.p99 || 0,
      maxLatencyMs: latency.max || 0,
      totalRequests: result.requests.total || 0,
      failedRate: result.errors > 0 ? result.errors / result.requests.total : 0,
    },
    raw: result,
    engine: 'autocannon',
  };
}

module.exports = {
  runNodeLoadTest,
  sleep,
};
