const { authenticateRequest } = require('./_lib/auth');
const { applySecurityAndCors, validateOriginForMutation } = require('./_lib/cors');
const { checkUserRateLimit } = require('./_lib/rate-limit');

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB cap
const MAX_IMAGE_BASE64_CHARS = 1600000;
const MAX_TEXT_CHARS = 30000;
const MAX_TURNS = 24;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function validateGeminiPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }

  const serializedBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
  if (serializedBytes > MAX_PAYLOAD_BYTES) {
    return { status: 413, message: `Payload exceeds maximum allowed size (${MAX_PAYLOAD_BYTES} bytes)` };
  }

  if (!Array.isArray(body.contents) || body.contents.length === 0 || body.contents.length > MAX_TURNS) {
    return 'contents must be a non-empty array (max 24 turns)';
  }

  for (const turn of body.contents) {
    if (!turn || typeof turn !== 'object' || !Array.isArray(turn.parts) || turn.parts.length === 0 || turn.parts.length > 4) {
      return 'Each content turn must contain 1–4 parts';
    }
    for (const part of turn.parts) {
      if (!part || typeof part !== 'object') return 'Invalid content part';
      if (part.text !== undefined) {
        if (typeof part.text !== 'string' || part.text.length > MAX_TEXT_CHARS) {
          return `Text part exceeds ${MAX_TEXT_CHARS} characters`;
        }
      }
      if (part.inlineData !== undefined) {
        const mime = String(part.inlineData.mimeType || '').toLowerCase();
        const data = part.inlineData.data;
        if (!ALLOWED_MIME_TYPES.has(mime)) {
          return 'Unsupported image MIME type';
        }
        if (typeof data !== 'string' || data.length === 0 || data.length > MAX_IMAGE_BASE64_CHARS) {
          return { status: 413, message: 'Encoded image exceeds maximum size' };
        }
      }
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  applySecurityAndCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateOriginForMutation(req)) return res.status(403).json({ error: 'Forbidden origin' });

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  const user = await authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const rateLimitMax = parseInt(process.env.GEMINI_RATE_LIMIT_PER_MIN || '20', 10);
    const rl = await checkUserRateLimit(user.id, 'gemini', Number.isFinite(rateLimitMax) ? rateLimitMax : 20);
    res.setHeader('X-RateLimit-Limit', String(rl.limit));
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));

    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait before sending more AI requests.' });
    }
  } catch (rlErr) {
    console.error('Rate limit check error:', rlErr);
    return res.status(500).json({ error: 'Server rate limit check failed' });
  }

  const body = req.body;
  const validationError = validateGeminiPayload(body);
  if (validationError) {
    if (typeof validationError === 'object') {
      return res.status(validationError.status).json({ error: validationError.message });
    }
    return res.status(400).json({ error: validationError });
  }

  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
  ].filter(Boolean);

  if (keys.length === 0) {
    return res.status(500).json({ error: 'No GEMINI_API_KEY configured in environment variables.' });
  }

  const sanitizedBody = {
    contents: body.contents.map(turn => ({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: turn.parts
    })),
    generationConfig: {
      temperature: typeof body.generationConfig?.temperature === 'number'
        ? Math.max(0, Math.min(1, body.generationConfig.temperature))
        : 0.2,
      maxOutputTokens: Math.min(4096, Math.max(64, parseInt(body.generationConfig?.maxOutputTokens || '2048', 10) || 2048)),
      ...(body.generationConfig?.responseMimeType === 'application/json'
        ? { responseMimeType: 'application/json' }
        : {})
    }
  };

  const model = 'gemini-2.5-flash';

  for (let i = 0; i < keys.length; i++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[i]}`;

    try {
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedBody),
        signal: AbortSignal.timeout(25000)
      });

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        return res.status(200).json(data);
      }

      const status = geminiRes.status;

      if ((status === 429 || status === 503) && i < keys.length - 1) {
        console.warn(`Key ${i + 1} rate limited (${status}), rotating…`);
        continue;
      }

      const errBody = await geminiRes.text();
      return res.status(status).json({ error: `Gemini API error (${status})`, details: errBody });
    } catch (fetchErr) {
      if (i < keys.length - 1) continue;
      return res.status(502).json({ error: 'Failed to reach Gemini API', details: fetchErr.message });
    }
  }
};
