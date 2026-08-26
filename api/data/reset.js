const db = require('../db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = req.headers.authorization?.split(' ')[1];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await db.query('DELETE FROM profiles WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM diary_entries WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM weight_logs WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM user_stats WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM coach_conversations WHERE user_id = ?', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
