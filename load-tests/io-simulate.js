import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TARGET_RPS = Number(__ENV.TARGET_RPS || 200);
const DURATION = __ENV.DURATION || '30s';
const DELAY_MS = __ENV.DELAY_MS || '300';

export const options = {
  scenarios: {
    io_load: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(TARGET_RPS * 2, 1000),
      maxVUs: Math.max(TARGET_RPS * 3, 2000),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}/api/io-simulate?delay=${DELAY_MS}`, {
    timeout: '60s',
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'simulated io': (r) => r.json('simulated') === true,
  });

  sleep(0.01);
}
