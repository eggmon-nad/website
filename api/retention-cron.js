const retentionHandler = require('./retention');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  req.url = '/api/retention?sync=1&cron=1';
  req.query = { ...(req.query || {}), sync: '1', cron: '1' };

  return retentionHandler(req, res);
};
