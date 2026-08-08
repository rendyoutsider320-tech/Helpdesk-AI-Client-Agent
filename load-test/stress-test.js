import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],

  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.10'],
  },
};

const BASE_URL = 'http://localhost:8080';

export default function () {
  const payload = JSON.stringify({
    email: 'admin@example.com',
    password: 'ChangeMe@123',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    payload,
    params
  );

  console.log(`STATUS: ${response.status}`);
  console.log(`BODY: ${response.body}`);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 1500ms': (r) => r.timings.duration < 1500,
  });

  sleep(1);
}