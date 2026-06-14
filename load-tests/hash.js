import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TARGET_RPS = Number(__ENV.TARGET_RPS || 50);
const DURATION = __ENV.DURATION || '30s';
const ROUNDS = Number(__ENV.HASH_ROUNDS || 500);

const payload = JSON.stringify({
  data: 'cpu-benchmark-payload-with-fixed-size-content',
  rounds: ROUNDS,
});

export const options = {
  scenarios: {
    hash_load: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(TARGET_RPS * 2, 200),
      maxVUs: Math.max(TARGET_RPS * 4, 400),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  const response = http.post(`${BASE_URL}/api/hash`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '120s',
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'has hash': (r) => typeof r.json('hash') === 'string',
  });
}
