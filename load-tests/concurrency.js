import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const VUS = Number(__ENV.VUS || 500);
const DURATION = __ENV.DURATION || '20s';
const RAMP_UP = __ENV.RAMP_UP || '5s';

export const options = {
  scenarios: {
    concurrency_stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: VUS },
        { duration: DURATION, target: VUS },
      ],
      gracefulRampDown: '3s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.50'],
  },
};

export default function () {
  const writeResponse = http.post(
    `${BASE_URL}/api/counter/increment`,
    JSON.stringify({ step: 1 }),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '30s',
    }
  );

  check(writeResponse, {
    'increment status 200': (r) => r.status === 200,
  });

  const readResponse = http.get(`${BASE_URL}/api/counter`, {
    timeout: '30s',
  });

  check(readResponse, {
    'read status 200': (r) => r.status === 200,
    'value is number': (r) => {
      if (r.status !== 200) return false;
      try {
        return typeof r.json('value') === 'number';
      } catch {
        return false;
      }
    },
  });
}
