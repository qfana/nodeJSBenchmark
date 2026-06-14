import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TARGET_RPS = Number(__ENV.TARGET_RPS || 100);
const DURATION = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    static_load: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(TARGET_RPS, 500),
      maxVUs: Math.max(TARGET_RPS * 2, 1000),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}/api/static`);
  check(response, {
    'status is 200': (r) => r.status === 200,
    'has status field': (r) => r.json('status') === 'ok',
  });
}
