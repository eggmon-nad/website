cat > api/retention-cron.js <<'EOF'
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      ok: false,
      cron: true,
      error: 'Method not allowed',
    });
  }

  try {
    const baseUrl = process.env.EGGMON_PUBLIC_BASE_URL || 'https://eggmon.fun';
    const url = `${baseUrl.replace(/\/$/, '')}/api/retention?sync=1&cron=1`;

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        accept: 'application/json',
        'user-agent': 'eggmon-retention-cron',
      },
    });

    const text = await response.text();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      return res.status(502).json({
        ok: false,
        cron: true,
        error: 'Retention API returned non-JSON',
        status: response.status,
        body: text.slice(0, 500),
      });
    }

    return res.status(response.ok && payload.ok !== false ? 200 : 502).json({
      ok: response.ok && payload.ok !== false,
      cron: true,
      forceSync: true,
      retentionStatus: response.status,
      retention: payload,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      cron: true,
      error: error.message || String(error),
    });
  }
};
EOF

git add api/retention-cron.js
git commit -m "Fix retention cron wrapper"
git push origin main