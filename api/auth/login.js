const db = require('../db');
const bcrypt = require('bcryptjs');
const { createSession } = require('../_lib/auth');
const { applySecurityAndCors, validateOriginForMutation } = require('../_lib/cors');

module.exports = async (req, res) => {
  applySecurityAndCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!validateOriginForMutation(req)) return res.status(403).json({ success: false, error: 'Forbidden origin' });

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }

  try {
    const [rows] = await db.query('SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'No account found with this email' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    await createSession(req, res, user);
    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
