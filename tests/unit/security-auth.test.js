import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { signJwt, verifyJwt, parseCookies, COOKIE_NAME } = require('../../api/_lib/auth.js');
const { isAllowedOrigin } = require('../../api/_lib/cors.js');

describe('Server Session Security & JWT Integrity', () => {
  const secret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('signs and verifies valid expiring JWT session payloads', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = signJwt(
      { sub: 'user-123', jti: 'sess-abc', email: 'test@example.com', iat: nowSec, exp: nowSec + 3600 },
      secret
    );
    const verified = verifyJwt(token, secret);
    expect(verified).not.toBeNull();
    expect(verified.sub).toBe('user-123');
    expect(verified.jti).toBe('sess-abc');
  });

  it('rejects tampered JWT signatures and wrong secrets', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'user-123', jti: 'sess-abc', exp: nowSec + 3600 }, secret);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'victim-999', jti: 'sess-abc', exp: nowSec + 3600 })).toString('base64url')}.${parts[2]}`;

    expect(verifyJwt(tampered, secret)).toBeNull();
    expect(verifyJwt(token, 'wrong-secret-0123456789abcdef0123456789abcdef')).toBeNull();
  });

  it('rejects expired JWT session tokens', () => {
    const expiredSec = Math.floor(Date.now() / 1000) - 10;
    const token = signJwt({ sub: 'user-123', jti: 'sess-abc', exp: expiredSec }, secret);
    expect(verifyJwt(token, secret)).toBeNull();
  });

  it('parses HttpOnly cookie values safely', () => {
    const cookies = parseCookies({
      headers: { cookie: `other=1; ${COOKIE_NAME}=abc.def.ghi; theme=dark` }
    });
    expect(cookies[COOKIE_NAME]).toBe('abc.def.ghi');
    expect(cookies.theme).toBe('dark');
  });

  it('blocks untrusted third-party CORS origins while allowing production host', () => {
    expect(isAllowedOrigin('https://caltrack-amber.vercel.app', { headers: { host: 'caltrack-amber.vercel.app' } })).toBe(true);
    expect(isAllowedOrigin('https://evil-attacker.example.com', { headers: { host: 'caltrack-amber.vercel.app' } })).toBe(false);
  });
});
