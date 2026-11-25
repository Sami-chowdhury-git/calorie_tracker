require('dotenv').config();

const BASE_URL = process.env.AUDIT_BASE_URL || 'https://caltrack-amber.vercel.app';

function extractCookies(res) {
  const setCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  return setCookie.map(c => c.split(';')[0]).join('; ');
}

async function runLiveSecurityAndSyncAudit() {
  const email = `sync_audit_${Date.now()}@example.com`;
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sync Audit User', email, password: 'AuditPassword123!' })
  });
  if (!signupRes.ok) throw new Error(`Signup failed: ${signupRes.status}`);
  const signupBody = await signupRes.json();
  const userId = signupBody.user.id;
  const deviceACookie = extractCookies(signupRes);

  // S1 Check: raw user ID in Authorization header without session cookie MUST fail 401
  const spoofSync = await fetch(`${BASE_URL}/api/data/sync`, {
    headers: { Authorization: `Bearer ${userId}` }
  });
  if (spoofSync.status !== 401) {
    throw new Error(`Expected 401 for spoofed Bearer userId, got ${spoofSync.status}`);
  }

  // Second device login
  const loginBRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'AuditPassword123!' })
  });
  if (!loginBRes.ok) throw new Error(`Device B login failed: ${loginBRes.status}`);
  const deviceBCookie = extractCookies(loginBRes);

  const now = Date.now();
  // Device A logs breakfast and a coach message
  const syncARes = await fetch(`${BASE_URL}/api/data/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: deviceACookie },
    body: JSON.stringify({
      diaryItems: [{
        id: 'audit-item-a',
        date_str: '2026-11-25',
        meal_type: 'breakfast',
        data: { id: 'audit-item-a', name: 'Oats', calories: 300, protein: 10, carbs: 50, fat: 5 },
        updated_at: now,
        deleted: false
      }],
      coachThreads: [{
        id: 'audit-conv-1',
        title: 'Audit Chat',
        messages: [{ id: 'm-a', role: 'user', text: 'Breakfast check', createdAt: now }],
        active: true,
        updated_at: now,
        deleted: false
      }]
    })
  });
  if (!syncARes.ok) throw new Error(`Sync A failed: ${syncARes.status}`);

  // Device B concurrently logs lunch and another coach message on SAME thread without pulling first
  const syncBRes = await fetch(`${BASE_URL}/api/data/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: deviceBCookie },
    body: JSON.stringify({
      diaryItems: [{
        id: 'audit-item-b',
        date_str: '2026-11-25',
        meal_type: 'lunch',
        data: { id: 'audit-item-b', name: 'Salmon', calories: 450, protein: 40, carbs: 0, fat: 28 },
        updated_at: now + 100,
        deleted: false
      }],
      coachThreads: [{
        id: 'audit-conv-1',
        title: 'Audit Chat',
        messages: [{ id: 'm-b', role: 'user', text: 'Lunch check', createdAt: now + 100 }],
        active: true,
        updated_at: now + 100,
        deleted: false
      }]
    })
  });
  const syncBJson = await syncBRes.json();
  const itemIds = (syncBJson.diaryItems || []).map(i => i.id).sort();
  const coachMsgs = (syncBJson.coachThreads || []).find(t => t.id === 'audit-conv-1')?.messages?.map(m => m.id) || [];

  if (!itemIds.includes('audit-item-a') || !itemIds.includes('audit-item-b')) {
    throw new Error(`Multi-device diary merge failed! Got IDs: ${JSON.stringify(itemIds)}`);
  }
  if (!coachMsgs.includes('m-a') || !coachMsgs.includes('m-b')) {
    throw new Error(`Multi-device coach thread merge failed! Got msgs: ${JSON.stringify(coachMsgs)}`);
  }

  // Logout revokes Device B session -> subsequent /api/data/sync with Device B cookie MUST return 401
  await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: deviceBCookie }
  });
  const postLogoutRes = await fetch(`${BASE_URL}/api/data/sync`, {
    headers: { Cookie: deviceBCookie }
  });
  if (postLogoutRes.status !== 401) {
    throw new Error(`Revoked session cookie was not rejected! Status: ${postLogoutRes.status}`);
  }

  // S3 Rate Limit Check: 21 rapid calls to /api/gemini with empty body triggers 400 (first 20) then 429 without burning Gemini quota
  const rlStatuses = [];
  for (let i = 0; i < 21; i++) {
    const r = await fetch(`${BASE_URL}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: deviceACookie },
      body: JSON.stringify({})
    });
    rlStatuses.push(r.status);
  }
  const triggered429 = rlStatuses.includes(429);
  if (!triggered429) {
    throw new Error(`Expected 429 rate limit to trigger after 20 requests, got: ${JSON.stringify(rlStatuses)}`);
  }

  // Clean up via Device A
  await fetch(`${BASE_URL}/api/data/reset`, {
    method: 'POST',
    headers: { Cookie: deviceACookie }
  });
  await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: deviceACookie }
  });

  console.log(JSON.stringify({
    s1SpoofBearerRejected: spoofSync.status === 401,
    multiDeviceDiaryItemsMerged: itemIds,
    multiDeviceCoachMsgsMerged: coachMsgs,
    serverSessionRevocationRejected: postLogoutRes.status === 401,
    s3RateLimitTriggered429: triggered429
  }, null, 2));
}

runLiveSecurityAndSyncAudit().catch(err => {
  console.error('Live Security & Sync Audit failed:', err);
  process.exit(1);
});
