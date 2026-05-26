// EGGMON CUM RETENTION leaderboard for Vercel.
// Smooth mode: uses Vercel KV / Upstash Redis REST as a persistent checkpoint.
// It reads EGGMON Transfer events where `to` is the lock contract and stores cumulative totals.
//
// Required env:
// - EGGMON_LOCK_ADDRESS: deployed EGGMONTimeLock contract address
// - EGGMON_LOCK_DEPLOY_BLOCK: block number where the lock contract was deployed
//
// Strongly recommended env for smooth mode:
// - KV_REST_API_URL + KV_REST_API_TOKEN
//   or
// - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//
// Optional env:
// - MONAD_RPC_URL: your Monad mainnet RPC URL. Defaults to https://rpc.monad.xyz
// - EGGMON_RETENTION_LIMIT: leaderboard rows to return. Defaults to 25
// - EGGMON_LOG_BATCH_SIZE: eth_getLogs batch size. Defaults to 25 blocks
// - EGGMON_LOG_RETRY_DELAY_MS: delay between RPC retries. Defaults to 500 ms
// - EGGMON_RETENTION_CACHE_MS: in-memory serverless cache TTL. Defaults to 30000 ms
// - EGGMON_MAX_SCAN_BLOCKS_PER_REQUEST: max new blocks scanned per request. Defaults to 2500
// - EGGMON_CONFIRMATION_BLOCKS: blocks to wait before indexing. Defaults to 0
// - EGGMON_RETENTION_STATE_KEY: optional custom Redis key

const EGGMON_TOKEN = '0xD10cf12099f5Fb424Bc77401DF49f0c785657777';
const TOKEN_DECIMALS = 18;
const DEFAULT_RPC_URL = 'https://rpc.monad.xyz';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BALANCE_OF_SELECTOR = '0x70a08231';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STATE_VERSION = 2;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getKvConfig() {
  const url = String(
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ''
  ).trim();

  const token = String(
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ''
  ).trim();

  if (!url || !token) return null;

  return {
    url: url.replace(/\/+$/, ''),
    token,
  };
}

function getStateKey(lockAddress) {
  const customKey = String(process.env.EGGMON_RETENTION_STATE_KEY || '').trim();
  if (customKey) return customKey;

  const cleanLock = normalizeAddress(lockAddress) || 'unknown-lock';
  return `eggmon:retention:v${STATE_VERSION}:${cleanLock}`;
}

async function kvCommand(command) {
  const config = getKvConfig();
  if (!config) return { configured: false, result: null };

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(command),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`KV returned non-JSON response: ${text.slice(0, 120)}`);
  }

  if (!response.ok || data.error) {
    const message = data.error || data.message || `KV request failed with status ${response.status}`;
    throw new Error(String(message));
  }

  return { configured: true, result: data.result };
}

async function loadPersistentState(lockAddress, deployBlock) {
  const key = getStateKey(lockAddress);
  const { configured, result } = await kvCommand(['GET', key]);

  if (!configured) return { configured: false, key, state: null };
  if (!result) return { configured: true, key, state: null };

  let state = null;
  try {
    state = typeof result === 'string' ? JSON.parse(result) : result;
  } catch (_) {
    return { configured: true, key, state: null };
  }

  if (!state || state.version !== STATE_VERSION) return { configured: true, key, state: null };
  if (normalizeAddress(state.lockContract) !== normalizeAddress(lockAddress)) return { configured: true, key, state: null };
  if (normalizeAddress(state.token) !== normalizeAddress(EGGMON_TOKEN)) return { configured: true, key, state: null };
  if (String(state.deployBlock) !== String(deployBlock)) return { configured: true, key, state: null };
  if (!state.totals || typeof state.totals !== 'object') state.totals = {};
  if (!state.lastScannedBlock) state.lastScannedBlock = (BigInt(deployBlock) - 1n).toString();
  if (!state.totalLogCount) state.totalLogCount = '0';

  return { configured: true, key, state };
}

async function savePersistentState(key, state) {
  const payload = JSON.stringify(state);
  const { configured } = await kvCommand(['SET', key, payload]);
  return configured;
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
  let dynamicBatchSize = BigInt(batchSize);
  const maxBatchSize = BigInt(batchSize);
  const retryDelayMs = parsePositiveInt(process.env.EGGMON_LOG_RETRY_DELAY_MS, 500, 0, 5000);

  while (cursor <= toBlock) {
    const end = cursor + dynamicBatchSize - 1n > toBlock
      ? toBlock
      : cursor + dynamicBatchSize - 1n;

    let batchSucceeded = false;
    let lastError = null;

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const batchLogs = await rpcCall(rpcUrl, 'eth_getLogs', [{
          address: EGGMON_TOKEN,
          fromBlock: toHexBlock(cursor),
          toBlock: toHexBlock(end),
          topics: [TRANSFER_TOPIC, null, lockTopic],
        }]);

        if (Array.isArray(batchLogs)) logs.push(...batchLogs);

        cursor = end + 1n;
        batchSucceeded = true;
        lastError = null;

        if (dynamicBatchSize < maxBatchSize) {
          dynamicBatchSize = dynamicBatchSize * 2n > maxBatchSize
            ? maxBatchSize
            : dynamicBatchSize * 2n;
        }

        break;
      } catch (error) {
        lastError = error;
        if (retryDelayMs > 0) {
          await sleep(retryDelayMs * attempt);
        }
      }
    }

    if (batchSucceeded) continue;

    if (dynamicBatchSize > 1n) {
      dynamicBatchSize = dynamicBatchSize / 2n;
      if (dynamicBatchSize < 1n) dynamicBatchSize = 1n;
      continue;
    }

    lastError.message = `${lastError.message} while scanning block ${cursor.toString()}`;
    throw lastError;
  }

  return logs;
}

function makeInitialState(lockAddress, deployBlock) {
  return {
    version: STATE_VERSION,
    token: displayAddress(EGGMON_TOKEN),
    lockContract: displayAddress(lockAddress),
    deployBlock: String(deployBlock),
    lastScannedBlock: (BigInt(deployBlock) - 1n).toString(),
    totalLogCount: '0',
    totals: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function applyLogsToState(state, logs) {
  let newTotal = BigInt(state.totalLogCount || 0);

  for (const log of logs) {
    if (!Array.isArray(log.topics) || log.topics.length < 3) continue;
    const from = addressFromTopic(log.topics[1]);
    if (!from || from === ZERO_ADDRESS) continue;

    const amount = parseHexBigInt(log.data);
    if (amount <= 0n) continue;

    const previous = BigInt(state.totals[from] || '0');
    state.totals[from] = (previous + amount).toString();
    newTotal += 1n;
  }

  state.totalLogCount = newTotal.toString();
  state.updatedAt = new Date().toISOString();
}

function buildRowsFromTotals(totals, limit) {
  const entries = Object.entries(totals || {})
    .map(([address, raw]) => [displayAddress(address), BigInt(raw || '0')])
    .filter(([address, amount]) => Boolean(address) && amount > 0n);

  return entries
    .sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] > b[1] ? -1 : 1))
    .slice(0, limit)
    .map(([address, amount], index) => ({
      rank: index + 1,
      address: displayAddress(address),
      raw: amount.toString(),
      formatted: formatUnits(amount, TOKEN_DECIMALS, 2),
    }));
}

function totalFromState(state) {
  return Object.values(state.totals || {}).reduce((sum, raw) => sum + BigInt(raw || '0'), 0n);
}

function payloadFromState({
  state,
  lockedBalance,
  latestBlock,
  targetBlock,
  scannedFrom,
  scannedTo,
  scannedLogCount,
  limit,
  cacheMode,
  kvConfigured,
  stateKey,
  stale = false,
  syncError = '',
}) {
  const totalDeposited = totalFromState(state);
  const rows = buildRowsFromTotals(state.totals, limit);
  const lastScannedBlock = parseBlockNumber(state.lastScannedBlock, parseBlockNumber(state.deployBlock, 0n) - 1n);
  const target = BigInt(targetBlock);
  const catchingUp = lastScannedBlock < target;

  return {
    ok: true,
    token: EGGMON_TOKEN,
    lockContract: displayAddress(state.lockContract),
    fromBlock: String(state.deployBlock),
    toBlock: lastScannedBlock.toString(),
    latestBlock: BigInt(latestBlock).toString(),
    targetBlock: target.toString(),
    lastScannedBlock: lastScannedBlock.toString(),
    catchingUp,
    syncing: catchingUp,
    scannedBlocksThisRequest: scannedFrom && scannedTo && scannedTo >= scannedFrom
      ? (scannedTo - scannedFrom + 1n).toString()
      : '0',
    scannedFromBlockThisRequest: scannedFrom ? scannedFrom.toString() : '',
    scannedToBlockThisRequest: scannedTo ? scannedTo.toString() : '',
    scannedLogsThisRequest: scannedLogCount,
    logCount: Number(state.totalLogCount || 0),
    uniqueWallets: Object.keys(state.totals || {}).length,
    totalRaw: totalDeposited.toString(),
    totalFormatted: formatUnits(totalDeposited, TOKEN_DECIMALS, 2),
    lockedBalanceRaw: lockedBalance.toString(),
    lockedBalanceFormatted: formatUnits(lockedBalance, TOKEN_DECIMALS, 2),
    leaderboard: rows,
    cacheMode,
    kvConfigured,
    stateKey,
    stale,
    syncError,
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
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
  const deployBlock = parseBlockNumber(process.env.EGGMON_LOCK_DEPLOY_BLOCK, 0n);
  const confirmationBlocks = BigInt(parsePositiveInt(process.env.EGGMON_CONFIRMATION_BLOCKS, 0, 0, 1000));
  const targetBlock = latestBlock > confirmationBlocks ? latestBlock - confirmationBlocks : latestBlock;
  const safeTargetBlock = targetBlock < deployBlock ? deployBlock - 1n : targetBlock;

  const batchSize = parsePositiveInt(process.env.EGGMON_LOG_BATCH_SIZE, 25, 1, 20000);
  const limit = parsePositiveInt(process.env.EGGMON_RETENTION_LIMIT, 25, 1, 100);
  const maxScanBlocks = BigInt(parsePositiveInt(process.env.EGGMON_MAX_SCAN_BLOCKS_PER_REQUEST, 2500, 1, 100000));

  const persistent = await loadPersistentState(lockAddress, deployBlock.toString());

  // If KV/Upstash is not configured, keep the old stateless behavior as a fallback.
  if (!persistent.configured) {
    const state = makeInitialState(lockAddress, deployBlock.toString());
    const logs = safeTargetBlock >= deployBlock
      ? await getLogsInBatches(rpcUrl, lockAddress, deployBlock, safeTargetBlock, batchSize)
      : [];

    applyLogsToState(state, logs);
    state.lastScannedBlock = safeTargetBlock.toString();

    const lockedBalance = await getLockedBalance(rpcUrl, lockAddress);

    return payloadFromState({
      state,
      lockedBalance,
      latestBlock,
      targetBlock: safeTargetBlock,
      scannedFrom: deployBlock,
      scannedTo: safeTargetBlock,
      scannedLogCount: logs.length,
      limit,
      cacheMode: 'memory_only_no_kv',
      kvConfigured: false,
      stateKey: persistent.key,
    });
  }

  const state = persistent.state || makeInitialState(lockAddress, deployBlock.toString());
  const previousLastScannedBlock = parseBlockNumber(state.lastScannedBlock, deployBlock - 1n);
  const scanFrom = previousLastScannedBlock + 1n;
  const scanTo = scanFrom <= safeTargetBlock
    ? (scanFrom + maxScanBlocks - 1n > safeTargetBlock ? safeTargetBlock : scanFrom + maxScanBlocks - 1n)
    : previousLastScannedBlock;

  let logs = [];
  if (scanFrom <= scanTo) {
    logs = await getLogsInBatches(rpcUrl, lockAddress, scanFrom, scanTo, batchSize);
    applyLogsToState(state, logs);
    state.lastScannedBlock = scanTo.toString();
    await savePersistentState(persistent.key, state);
  }

  const lockedBalance = await getLockedBalance(rpcUrl, lockAddress);

  return payloadFromState({
    state,
    lockedBalance,
    latestBlock,
    targetBlock: safeTargetBlock,
    scannedFrom: scanFrom <= scanTo ? scanFrom : null,
    scannedTo: scanFrom <= scanTo ? scanTo : null,
    scannedLogCount: logs.length,
    limit,
    cacheMode: 'persistent_kv_incremental',
    kvConfigured: true,
    stateKey: persistent.key,
  });
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

    // Smooth failure mode: keep showing the last known good leaderboard instead of breaking the page.
    if (memoryCache?.payload) {
      sendJson(res, 200, {
        ...memoryCache.payload,
        cached: true,
        stale: true,
        syncError: error.message,
      }, Math.ceil(Math.max(cacheMs, 30000) / 1000));
      return;
    }

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
