import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TARGET_RPS = Number(__ENV.TARGET_RPS || 20);
const DURATION = __ENV.DURATION || '30s';
const RECORD_COUNT = Number(__ENV.RECORD_COUNT || 3000);
const VALUE_SIZE = Number(__ENV.VALUE_SIZE || 2048);

function buildPayload() {
  const filler = 'x'.repeat(VALUE_SIZE);
  const records = [];

  for (let i = 0; i < RECORD_COUNT; i += 1) {
    records.push({
      id: i + 1,
      value: `${filler}-${i}`,
      tags: ['benchmark', 'heavy-json'],
    });
  }

  return JSON.stringify({
    meta: { recordCount: RECORD_COUNT, valueSize: VALUE_SIZE },
    records,
  });
}

const payload = buildPayload();

export const options = {
  scenarios: {
    transform_load: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(TARGET_RPS * 2, 100),
      maxVUs: Math.max(TARGET_RPS * 4, 200),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  const response = http.post(`${BASE_URL}/api/transform`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '120s',
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'has checksum': (r) => typeof r.json('checksum') === 'string',
  });
}
