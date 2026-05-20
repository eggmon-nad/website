// EGGMON global click counter for Vercel.
// Requires these Vercel Environment Variables:
// - UPSTASH_REDIS_REST_URL
// - UPSTASH_REDIS_REST_TOKEN
//
// Optional:
// - EGGMON_COUNTER_KEY, defaults to "eggmon:global-clicks"

const COUNTER_KEY = process.env.EGGMON_COUNTER_KEY || 'eggmon:global-clicks';

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(status).json(payload);
}

async function redisCommand(command, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    const err = new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    err.code = 'MISSING_UPSTASH_ENV';
    throw err;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command, ...args]),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    const err = new Error(data.error || `Upstash request failed with ${response.status}`);
    err.code = 'UPSTASH_ERROR';
    err.status = response.status;
    throw err;
  }

  return data.result;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const value = await redisCommand('GET', COUNTER_KEY);
      const total = Number.parseInt(value || '0', 10) || 0;
      sendJson(res, 200, { total });
    } catch (error) {
      console.error('[EGGMON counter GET]', error);
      sendJson(res, error.code === 'MISSING_UPSTASH_ENV' ? 500 : 502, {
        error: error.message,
        total: null,
      });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const value = await redisCommand('INCR', COUNTER_KEY);
      const total = Number.parseInt(value || '0', 10) || 0;
      sendJson(res, 200, { total });
    } catch (error) {
      console.error('[EGGMON counter POST]', error);
      sendJson(res, error.code === 'MISSING_UPSTASH_ENV' ? 500 : 502, {
        error: error.message,
        total: null,
      });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  sendJson(res, 405, { error: 'Method not allowed', total: null });
};
