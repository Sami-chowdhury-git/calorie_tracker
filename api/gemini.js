/**
 * Vercel Serverless Function — Gemini API Proxy
 * 
 * Keeps the API key on the server. The browser never sees it.
 * Set GEMINI_API_KEY (and optionally GEMINI_API_KEY_2) in
 * Vercel Dashboard → Project Settings → Environment Variables.
 */

module.exports = async function handler(req, res) {
  // CORS headers for the frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
  ].filter(Boolean);

  if (keys.length === 0) {
    return res.status(500).json({ error: 'No GEMINI_API_KEY configured in environment variables.' });
  }

  const model = 'gemini-2.5-flash';
  const body = req.body;

  for (let i = 0; i < keys.length; i++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[i]}`;

    try {
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
}
