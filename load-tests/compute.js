import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TARGET_RPS = Number(__ENV.TARGET_RPS || 30);
const DURATION = __ENV.DURATION || '30s';
const ARRAY_SIZE = Number(__ENV.ARRAY_SIZE || 1000000);

const payload = JSON.stringify({ size: ARRAY_SIZE });

export const options = {
  scenarios: {
    compute_load: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(TARGET_RPS * 2, 150),
      maxVUs: Math.max(TARGET_RPS * 4, 300),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  const response = http.post(`${BASE_URL}/api/compute`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '120s',
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'has sum': (r) => typeof r.json('sum') === 'number',
  });
}
