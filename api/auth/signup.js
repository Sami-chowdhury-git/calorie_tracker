const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createSession } = require('../_lib/auth');
const { applySecurityAndCors, validateOriginForMutation } = require('../_lib/cors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  applySecurityAndCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!validateOriginForMutation(req)) return res.status(403).json({ success: false, error: 'Forbidden origin' });

  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }
  if (name.length > 100) {
    return res.status(400).json({ success: false, error: 'Name must be 100 characters or fewer' });
  }
  if (!EMAIL_REGEX.test(email) || email.length > 255) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
  }
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ success: false, error: 'Password must be 6–128 characters' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    await db.query(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
      [id, name, email, hash]
    );

    const user = { id, name, email };
    await createSession(req, res, user);
    return res.json({ success: true, user });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
