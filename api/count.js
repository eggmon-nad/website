// EGGMON global click counter for Vercel.
// Works with either Upstash Redis env names or Vercel KV env names:
// - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// - KV_REST_API_URL + KV_REST_API_TOKEN
//
// Optional:
// - EGGMON_COUNTER_KEY, defaults to "eggmon:global-clicks"

const COUNTER_KEY = process.env.EGGMON_COUNTER_KEY || 'eggmon:global-clicks';

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return { url, token };
}

function cleanBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function encodeArg(value) {
  return encodeURIComponent(String(value));
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(status).json(payload);
}

async function redisCommand(command, ...args) {
  const { url, token } = getRedisConfig();

  if (!url || !token) {
    const err = new Error('Counter backend is not configured. Add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN, in Vercel Environment Variables and redeploy.');
    err.code = 'MISSING_REDIS_ENV';
    throw err;
  }

  const baseUrl = cleanBaseUrl(url);
  if (!/^https:\/\//i.test(baseUrl)) {
    const err = new Error('Redis REST URL must start with https://. Do not use the rediss:// Redis URL here; use the REST URL from Upstash/Vercel KV.');
    err.code = 'BAD_REDIS_URL';
    throw err;
  }

  const endpoint = `${baseUrl}/${[command, ...args].map(encodeArg).join('/')}`;
  const response = await fetch(endpoint, {
    method: command === 'GET' ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    const err = new Error(`Redis REST returned non-JSON response: ${text.slice(0, 120)}`);
    err.code = 'BAD_REDIS_RESPONSE';
    err.status = response.status;
    throw err;
  }

  if (!response.ok || data.error) {
    const err = new Error(data.error || `Redis REST request failed with status ${response.status}`);
    err.code = response.status === 401 ? 'REDIS_AUTH_ERROR' : 'REDIS_ERROR';
    err.status = response.status;
    throw err;
  }

  return data.result;
}

function normalizeTotal(value) {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const value = await redisCommand('GET', COUNTER_KEY);
      const total = normalizeTotal(value);
      sendJson(res, 200, {
        ok: true,
        total,
        key: COUNTER_KEY,
        storage: process.env.KV_REST_API_URL ? 'vercel-kv/upstash' : 'upstash',
      });
    } catch (error) {
      console.error('[EGGMON counter GET]', error);
      sendJson(res, error.code === 'MISSING_REDIS_ENV' || error.code === 'BAD_REDIS_URL' ? 500 : 502, {
        ok: false,
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        total: null,
      });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const value = await redisCommand('INCR', COUNTER_KEY);
      const total = normalizeTotal(value);
      sendJson(res, 200, {
        ok: true,
        total,
        key: COUNTER_KEY,
        storage: process.env.KV_REST_API_URL ? 'vercel-kv/upstash' : 'upstash',
      });
    } catch (error) {
      console.error('[EGGMON counter POST]', error);
      sendJson(res, error.code === 'MISSING_REDIS_ENV' || error.code === 'BAD_REDIS_URL' ? 500 : 502, {
        ok: false,
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        total: null,
      });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  sendJson(res, 405, { ok: false, error: 'Method not allowed', total: null });
};
