const ALLOWED_ORIGINS = new Set([
  'https://caltrack-amber.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4173',
  'http://localhost:5000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:8080'
]);

function isAllowedOrigin(origin, req) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;

  const host = req.headers?.host;
  if (host) {
    if (origin === `https://${host}` || origin === `http://${host}`) return true;
  }

  try {
    const parsed = new URL(origin);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
    if (parsed.hostname.endsWith('.vercel.app') && parsed.hostname.startsWith('caltrack')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function applySecurityAndCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers?.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (origin && isAllowedOrigin(origin, req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function validateOriginForMutation(req) {
  const origin = req.headers?.origin;
  if (origin && !isAllowedOrigin(origin, req)) {
    return false;
  }
  return true;
}

module.exports = {
  applySecurityAndCors,
  validateOriginForMutation,
  isAllowedOrigin
};
