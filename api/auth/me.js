const { authenticateRequest } = require('../_lib/auth');
const { applySecurityAndCors } = require('../_lib/cors');

module.exports = async (req, res) => {
  applySecurityAndCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticateRequest(req);
  if (!user) {
    return res.status(200).json({ authenticated: false, user: null });
  }

  return res.status(200).json({
    authenticated: true,
    user: { id: user.id, name: user.name, email: user.email }
  });
};
