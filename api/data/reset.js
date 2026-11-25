const db = require('../db');
const { authenticateRequest } = require('../_lib/auth');
const { applySecurityAndCors, validateOriginForMutation } = require('../_lib/cors');

module.exports = async (req, res) => {
  applySecurityAndCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateOriginForMutation(req)) return res.status(403).json({ error: 'Forbidden origin' });

  const user = await authenticateRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const userId = user.id;

  try {
    await db.query('DELETE FROM profiles WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM diary_entries WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM diary_items WHERE user_id = ?', [userId]).catch(() => {});
    await db.query('DELETE FROM water_entries WHERE user_id = ?', [userId]).catch(() => {});
    await db.query('DELETE FROM weight_logs WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM user_stats WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM coach_conversations WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM coach_threads WHERE user_id = ?', [userId]).catch(() => {});
    return res.json({ success: true });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
