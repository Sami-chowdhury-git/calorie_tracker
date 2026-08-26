
const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send('Missing fields');
  
  try {
    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    await db.query('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)', [id, name, email, hash]);
    res.json({ success: true, user: { id, name, email } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Email already registered' });
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
