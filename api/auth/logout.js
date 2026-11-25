const { revokeSession } = require('../_lib/auth');
const { applySecurityAndCors, validateOriginForMutation } = require('../_lib/cors');

module.exports = async (req, res) => {
  applySecurityAndCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!validateOriginForMutation(req)) return res.status(403).json({ success: false, error: 'Forbidden origin' });

  try {
    await revokeSession(req, res);
    return res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
