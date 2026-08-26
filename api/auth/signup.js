const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, error: 'Missing fields' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    await db.query('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)', [id, name, email, hash]);
    res.json({ success: true, user: { id, name, email } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Email already registered' });
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
