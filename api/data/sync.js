
const db = require('../db');

module.exports = async (req, res) => {
  const userId = req.headers.authorization?.split(' ')[1];
  if (!userId) return res.status(401).send('Unauthorized');

  try {
    if (req.method === 'GET') {
      const [profiles] = await db.query('SELECT data FROM profiles WHERE user_id = ?', [userId]);
      const [diary] = await db.query('SELECT date_str, data FROM diary_entries WHERE user_id = ?', [userId]);
      const [weight] = await db.query('SELECT date_str, weight FROM weight_logs WHERE user_id = ?', [userId]);
      const [stats] = await db.query('SELECT streaks, achievements, counters, food_freq FROM user_stats WHERE user_id = ?', [userId]);
      const [coach] = await db.query('SELECT data FROM coach_conversations WHERE user_id = ?', [userId]);

      res.json({
        profile: profiles[0]?.data || null,
        diary: diary,
        weight: weight,
        stats: stats[0] || null,
        coach: coach[0]?.data || null
      });
    } else if (req.method === 'POST') {
      // Upsert data from frontend to database
      const { profile, diary, weight, stats, coach } = req.body;
      
      if (profile) {
        await db.query('INSERT INTO profiles (user_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?', [userId, JSON.stringify(profile), JSON.stringify(profile)]);
      }
      
      if (diary && Array.isArray(diary)) {
        for (const entry of diary) {
          await db.query('INSERT INTO diary_entries (user_id, date_str, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = ?', [userId, entry.date_str, JSON.stringify(entry.data), JSON.stringify(entry.data)]);
        }
      }

      if (weight && Array.isArray(weight)) {
        for (const entry of weight) {
          await db.query('INSERT INTO weight_logs (user_id, date_str, weight) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE weight = ?', [userId, entry.date || entry.date_str, entry.weight, entry.weight]);
        }
      }

      if (stats) {
        await db.query('INSERT INTO user_stats (user_id, streaks, achievements, counters, food_freq) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE streaks = ?, achievements = ?, counters = ?, food_freq = ?', 
        [userId, JSON.stringify(stats.streaks), JSON.stringify(stats.achievements), JSON.stringify(stats.counters), JSON.stringify(stats.food_freq), JSON.stringify(stats.streaks), JSON.stringify(stats.achievements), JSON.stringify(stats.counters), JSON.stringify(stats.food_freq)]);
      }
      
      res.json({ success: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
