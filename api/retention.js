// EGGMON CUM RETENTION leaderboard for Vercel.
// Reads EGGMON Transfer events where `to` is the lock contract and sums deposits by sender.
// Required env:
// - EGGMON_LOCK_ADDRESS: deployed EGGMONTimeLock contract address
// Required env:
// - EGGMON_LOCK_DEPLOY_BLOCK: block number where the lock contract was deployed
// Optional env:
// - MONAD_RPC_URL: your Monad mainnet RPC URL. Defaults to https://rpc.monad.xyz
// - EGGMON_RETENTION_LIMIT: leaderboard rows to return. Defaults to 25
// - EGGMON_LOG_BATCH_SIZE: eth_getLogs batch size. Defaults to 5000 blocks
// - EGGMON_RETENTION_CACHE_MS: in-memory serverless cache TTL. Defaults to 30000 ms

const EGGMON_TOKEN = '0xD10cf12099f5Fb424Bc77401DF49f0c785657777';
const TOKEN_DECIMALS = 18;
const DEFAULT_RPC_URL = 'https://rpc.monad.xyz';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BALANCE_OF_SELECTOR = '0x70a08231';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

let memoryCache = null;

function sendJson(res, status, payload, cacheSeconds = 0) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cacheSeconds > 0) {
    res.setHeader('Cache-Control', `s-maxage=${cacheSeconds}, stale-while-revalidate=${Math.max(cacheSeconds * 2, 30)}`);
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  res.status(status).json(payload);
}

function normalizeAddress(value) {
  const clean = String(value || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) return '';
  return `0x${clean.slice(2).toLowerCase()}`;
}

function displayAddress(value) {
  const clean = normalizeAddress(value);
  return clean || '';
}

function topicForAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('Invalid address for topic');
  return `0x${clean.slice(2).padStart(64, '0')}`;
}

function addressFromTopic(topic) {
  const clean = String(topic || '').toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(clean)) return '';
  return `0x${clean.slice(-40)}`;
}

function toHexBlock(blockNumber) {
  const value = BigInt(blockNumber);
  if (value < 0n) return '0x0';
  return `0x${value.toString(16)}`;
}

function parseBlockNumber(value, fallback = 0n) {
  if (value === undefined || value === null || value === '') return fallback;
  const clean = String(value).trim();
  try {
    if (/^0x[0-9a-fA-F]+$/.test(clean)) return BigInt(clean);
    if (/^[0-9]+$/.test(clean)) return BigInt(clean);
  } catch (_) {}
  return fallback;
}

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseHexBigInt(value) {
  const clean = String(value || '0x0');
  if (!/^0x[0-9a-fA-F]*$/.test(clean)) return 0n;
  return BigInt(clean || '0x0');
}

function formatUnits(value, decimals = 18, maxFractionDigits = 2) {
  const amount = BigInt(value || 0);
  const negative = amount < 0n;
  const base = 10n ** BigInt(decimals);
  const abs = negative ? -amount : amount;
  const whole = abs / base;
  const fraction = abs % base;

  let fractionText = fraction.toString().padStart(decimals, '0');
  if (maxFractionDigits >= 0) fractionText = fractionText.slice(0, maxFractionDigits);
  fractionText = fractionText.replace(/0+$/, '');

  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  return fractionText ? `${sign}${wholeText}.${fractionText}` : `${sign}${wholeText}`;
}

async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`RPC returned non-JSON response: ${text.slice(0, 120)}`);
  }

  if (!response.ok || data.error) {
    const message = data.error?.message || `RPC request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data.result;
}

async function getLockedBalance(rpcUrl, lockAddress) {
  const data = `${BALANCE_OF_SELECTOR}${topicForAddress(lockAddress).slice(2)}`;
  const result = await rpcCall(rpcUrl, 'eth_call', [{ to: EGGMON_TOKEN, data }, 'latest']);
  return parseHexBigInt(result);
}

async function getLogsInBatches(rpcUrl, lockAddress, fromBlock, toBlock, batchSize) {
  const logs = [];
  let cursor = fromBlock;
  const lockTopic = topicForAddress(lockAddress);

  while (cursor <= toBlock) {
    const end = cursor + BigInt(batchSize - 1) > toBlock ? toBlock : cursor + BigInt(batchSize - 1);
    const batchLogs = await rpcCall(rpcUrl, 'eth_getLogs', [{
      address: EGGMON_TOKEN,
      fromBlock: toHexBlock(cursor),
      toBlock: toHexBlock(end),
      topics: [TRANSFER_TOPIC, null, lockTopic],
    }]);

    if (Array.isArray(batchLogs)) logs.push(...batchLogs);
    cursor = end + 1n;
  }

  return logs;
}

async function buildLeaderboard() {
  const lockAddress = normalizeAddress(process.env.EGGMON_LOCK_ADDRESS);
  if (!lockAddress) {
    const err = new Error('EGGMON_LOCK_ADDRESS is not configured in Vercel Environment Variables. Add the deployed lock contract address and redeploy.');
    err.code = 'LOCK_NOT_CONFIGURED';
    throw err;
  }

  const rpcUrl = String(process.env.MONAD_RPC_URL || DEFAULT_RPC_URL).trim();
  if (!/^https?:\/\//i.test(rpcUrl)) {
    const err = new Error('MONAD_RPC_URL must start with https:// or http://');
    err.code = 'BAD_RPC_URL';
    throw err;
  }

  if (!process.env.EGGMON_LOCK_DEPLOY_BLOCK) {
    const err = new Error('EGGMON_LOCK_DEPLOY_BLOCK is not configured in Vercel Environment Variables. Add the lock deployment block number so the leaderboard does not scan the whole chain.');
    err.code = 'DEPLOY_BLOCK_NOT_CONFIGURED';
    throw err;
  }

  const latestBlock = parseHexBigInt(await rpcCall(rpcUrl, 'eth_blockNumber', []));
  const fromBlock = parseBlockNumber(process.env.EGGMON_LOCK_DEPLOY_BLOCK, 0n);
  const safeFromBlock = fromBlock > latestBlock ? latestBlock : fromBlock;
  const batchSize = parsePositiveInt(process.env.EGGMON_LOG_BATCH_SIZE, 5000, 100, 50000);
  const limit = parsePositiveInt(process.env.EGGMON_RETENTION_LIMIT, 25, 1, 100);

  const [logs, lockedBalance] = await Promise.all([
    getLogsInBatches(rpcUrl, lockAddress, safeFromBlock, latestBlock, batchSize),
    getLockedBalance(rpcUrl, lockAddress),
  ]);

  const totals = new Map();
  let totalDeposited = 0n;

  for (const log of logs) {
    if (!Array.isArray(log.topics) || log.topics.length < 3) continue;
    const from = addressFromTopic(log.topics[1]);
    if (!from || from === ZERO_ADDRESS) continue;

    const amount = parseHexBigInt(log.data);
    if (amount <= 0n) continue;

    totals.set(from, (totals.get(from) || 0n) + amount);
    totalDeposited += amount;
  }

  const rows = Array.from(totals.entries())
    .sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] > b[1] ? -1 : 1))
    .slice(0, limit)
    .map(([address, amount], index) => ({
      rank: index + 1,
      address: displayAddress(address),
      raw: amount.toString(),
      formatted: formatUnits(amount, TOKEN_DECIMALS, 2),
    }));

  return {
    ok: true,
    token: EGGMON_TOKEN,
    lockContract: displayAddress(lockAddress),
    fromBlock: safeFromBlock.toString(),
    toBlock: latestBlock.toString(),
    scannedBlocks: (latestBlock - safeFromBlock + 1n).toString(),
    logCount: logs.length,
    uniqueWallets: totals.size,
    totalRaw: totalDeposited.toString(),
    totalFormatted: formatUnits(totalDeposited, TOKEN_DECIMALS, 2),
    lockedBalanceRaw: lockedBalance.toString(),
    lockedBalanceFormatted: formatUnits(lockedBalance, TOKEN_DECIMALS, 2),
    leaderboard: rows,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const cacheMs = parsePositiveInt(process.env.EGGMON_RETENTION_CACHE_MS, 30000, 0, 300000);
  const now = Date.now();

  if (memoryCache && cacheMs > 0 && now - memoryCache.createdAt < cacheMs) {
    sendJson(res, 200, { ...memoryCache.payload, cached: true }, Math.ceil(cacheMs / 1000));
    return;
  }

  try {
    const payload = await buildLeaderboard();
    memoryCache = { createdAt: now, payload };
    sendJson(res, 200, { ...payload, cached: false }, Math.ceil(cacheMs / 1000));
  } catch (error) {
    console.error('[EGGMON retention]', error);
    const status = error.code === 'LOCK_NOT_CONFIGURED' || error.code === 'DEPLOY_BLOCK_NOT_CONFIGURED' || error.code === 'BAD_RPC_URL' ? 500 : 502;
    sendJson(res, status, {
      ok: false,
      error: error.message,
      code: error.code || 'RETENTION_API_ERROR',
      token: EGGMON_TOKEN,
      lockContract: displayAddress(process.env.EGGMON_LOCK_ADDRESS),
      leaderboard: [],
    });
  }
};
