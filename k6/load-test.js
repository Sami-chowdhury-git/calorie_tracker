import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.AUDIT_BASE_URL || 'https://caltrack-amber.vercel.app';
const appErrors = new Rate('app_errors');
const syncLatency = new Trend('sync_duration');

export const options = {
  scenarios: {
    security_checks: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'securityProbe'
    },
    concurrent_sync: {
      executor: 'constant-vus',
      vus: 8,
      duration: '15s',
      startTime: '2s',
      exec: 'multiUserSync'
    }
  },
  thresholds: {
    app_errors: ['rate<0.02'],
    checks: ['rate==1.0'],
    sync_duration: ['p(95)<5000']
  }
};

export function securityProbe() {
  const unauthSync = http.get(`${BASE_URL}/api/data/sync`, {
    headers: { Authorization: 'Bearer 11111111-1111-1111-1111-111111111111' },
    responseCallback: http.expectedStatuses(401)
  });
  check(unauthSync, {
    'unauth/spoofed sync returns 401': (r) => r.status === 401
  });

  const unauthGemini = http.post(
    `${BASE_URL}/api/gemini`,
    JSON.stringify({ contents: [{ parts: [{ text: 'apple' }] }] }),
    { headers: { 'Content-Type': 'application/json' }, responseCallback: http.expectedStatuses(401) }
  );
  check(unauthGemini, {
    'unauth gemini proxy returns 401': (r) => r.status === 401
  });
}

export function multiUserSync() {
  const email = `k6_vu_${__VU}_${__ITER}_${Date.now()}@example.com`;
  const jar = http.cookieJar();
  jar.clear(BASE_URL);

  const signupRes = http.post(
    `${BASE_URL}/api/auth/signup`,
    JSON.stringify({ name: `K6 Load User ${__VU}`, email, password: 'LoadTestPassword123!' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const signupOk = check(signupRes, {
    'signup 200': (r) => r.status === 200,
    'sets HttpOnly cookie': (r) => Boolean(r.cookies.caltrack_session && r.cookies.caltrack_session.length > 0)
  });

  if (!signupOk) {
    appErrors.add(1);
    return;
  }

  const now = Date.now();
  const payload = {
    profile: { name: `K6 User ${__VU}`, age: 25, gender: 'male', weight: 75, weightUnit: 'kg', height: 178, heightUnit: 'cm', tdee: 2400, protein: 160, carbs: 240, fat: 80, updated_at: now },
    diaryItems: [{
      id: `k6-item-${__VU}-${__ITER}-${now}`,
      date_str: '2026-11-25',
      meal_type: 'lunch',
      data: { id: `k6-item-${__VU}-${__ITER}-${now}`, name: 'K6 Chicken Rice', calories: 550, protein: 40, carbs: 65, fat: 12, fiber: 3, sugar: 1, sodium: 400 },
      updated_at: now,
      deleted: false
    }],
    waterEntries: [{
      id: `k6-water-${__VU}-${__ITER}-${now}`,
      date_str: '2026-11-25',
      ml: 500,
      time: new Date().toISOString(),
      updated_at: now,
      deleted: false
    }],
    since: 0
  };

  const syncPost = http.post(
    `${BASE_URL}/api/data/sync`,
    JSON.stringify(payload),
    { headers: { 'Content-Type': 'application/json' } }
  );
  syncLatency.add(syncPost.timings.duration);

  const syncOk = check(syncPost, {
    'sync POST 200': (r) => r.status === 200,
    'sync returns merged item': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.diaryItems) && body.diaryItems.length >= 1;
      } catch {
        return false;
      }
    }
  });

  const syncGet = http.get(`${BASE_URL}/api/data/sync?since=0`);
  const getOk = check(syncGet, {
    'sync GET 200': (r) => r.status === 200
  });

  // Oversized payload test on first iteration of VU 1
  if (__VU === 1 && __ITER === 0) {
    const big = 'A'.repeat(2100000);
    const bigRes = http.post(
      `${BASE_URL}/api/gemini`,
      JSON.stringify({ contents: [{ parts: [{ text: big }] }] }),
      { headers: { 'Content-Type': 'application/json' }, responseCallback: http.expectedStatuses(413) }
    );
    check(bigRes, {
      'oversized gemini payload rejected 413': (r) => r.status === 413
    });
  }

  http.post(`${BASE_URL}/api/data/reset`, null);
  http.post(`${BASE_URL}/api/auth/logout`, null);

  appErrors.add(!(signupOk && syncOk && getOk));
  sleep(0.3);
}
