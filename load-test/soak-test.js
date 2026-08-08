import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 200,
  duration: '10m',

  thresholds: {
    http_req_duration: ['p(95)<1200'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = 'http://localhost:8080';

export default function () {
  const payload = JSON.stringify({
    email: 'admin@example.com',
    password: 'admin123',
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
    'status 200': (r) => r.status === 200,
  });

  sleep(1);
}