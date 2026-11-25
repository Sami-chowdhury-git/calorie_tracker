const crypto = require('crypto');
const db = require('../db');

const COOKIE_NAME = 'caltrack_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

let cachedDbSecret = null;

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let pad = str.length % 4;
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  if (pad === 2) normalized += '==';
  else if (pad === 3) normalized += '=';
  else if (pad === 1) throw new Error('Invalid base64url');
  return Buffer.from(normalized, 'base64');
}

async function getSigningSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }
  if (cachedDbSecret) return cachedDbSecret;

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_secrets (
      key_name VARCHAR(64) PRIMARY KEY,
      secret_value VARCHAR(128) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const generated = crypto.randomBytes(32).toString('hex');
  await db.query(
    'INSERT IGNORE INTO app_secrets (key_name, secret_value) VALUES (?, ?)',
    ['session_hmac_key', generated]
  );

  const [rows] = await db.query(
    'SELECT secret_value FROM app_secrets WHERE key_name = ?',
    ['session_hmac_key']
  );

  if (!rows.length || !rows[0].secret_value) {
    throw new Error('Failed to resolve session signing secret');
  }

  cachedDbSecret = rows[0].secret_value;
  return cachedDbSecret;
}

function signJwt(payload, secret) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${base64UrlEncode(sig)}`;
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, bodyB64, sigB64] = parts;
  const data = `${headerB64}.${bodyB64}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest();

  let actualSig;
  try {
    actualSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  if (actualSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(bodyB64).toString('utf8'));
  } catch {
    return null;
  }

  if (header?.alg !== 'HS256') return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload?.sub || !payload?.jti || !payload?.exp || payload.exp <= nowSec) {
    return null;
  }

  return payload;
}

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const result = {};
  if (!header) return result;

  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function isSecureRequest(req) {
  const proto = String(req.headers?.['x-forwarded-proto'] || '').toLowerCase();
  if (proto === 'https') return true;
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    const host = String(req.headers?.host || '');
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) return true;
  }
  return false;
}

function buildSessionCookie(token, maxAgeSec, secure) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(req, res, token) {
  const cookie = buildSessionCookie(token, SESSION_TTL_SECONDS, isSecureRequest(req));
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(req, res) {
  const cookie = buildSessionCookie('', 0, isSecureRequest(req));
  res.setHeader('Set-Cookie', cookie);
}

let sessionsTableReady = false;

async function ensureSessionsTable() {
  if (sessionsTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      expires_at BIGINT NOT NULL,
      revoked TINYINT(1) NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      INDEX idx_sessions_user_exp (user_id, expires_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  sessionsTableReady = true;
}

async function createSession(req, res, user) {
  await ensureSessionsTable();
  const secret = await getSigningSecret();
  const sessionId = crypto.randomBytes(24).toString('hex');
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + SESSION_TTL_SECONDS;
  const nowMs = Date.now();
  const expiresAtMs = expSec * 1000;

  await db.query(
    'INSERT INTO sessions (id, user_id, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, ?)',
    [sessionId, user.id, expiresAtMs, nowMs]
  );

  // Opportunistic cleanup of expired sessions for this user
  db.query('DELETE FROM sessions WHERE user_id = ? AND (expires_at < ? OR revoked = 1)', [user.id, nowMs - 86400000]).catch(() => {});

  const token = signJwt(
    {
      sub: user.id,
      jti: sessionId,
      name: user.name,
      email: user.email,
      iat: nowSec,
      exp: expSec
    },
    secret
  );

  setSessionCookie(req, res, token);
  return { sessionId, expSec };
}

async function authenticateRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  let secret;
  try {
    secret = await getSigningSecret();
  } catch {
    return null;
  }

  const payload = verifyJwt(token, secret);
  if (!payload) return null;

  try {
    const nowMs = Date.now();
    const [rows] = await db.query(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked, u.name, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.user_id = ?`,
      [payload.jti, payload.sub]
    );

    if (!rows.length) return null;
    const row = rows[0];
    if (row.revoked || Number(row.expires_at) <= nowMs) return null;

    return {
      id: row.user_id,
      name: row.name,
      email: row.email,
      sessionId: row.session_id
    };
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      await ensureSessionsTable();
      return null;
    }
    console.error('Session verification error:', err);
    return null;
  }
}

async function revokeSession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  clearSessionCookie(req, res);

  if (!token) return;
  try {
    const secret = await getSigningSecret();
    const payload = verifyJwt(token, secret);
    if (payload?.jti) {
      await ensureSessionsTable();
      await db.query('UPDATE sessions SET revoked = 1 WHERE id = ?', [payload.jti]);
    }
  } catch {
    // Ignore errors during logout cleanup
  }
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signJwt,
  verifyJwt,
  parseCookies,
  createSession,
  authenticateRequest,
  revokeSession,
  clearSessionCookie
};
