/**
 * Auth flow for Local Agent CLI
 *
 * 1. POST /api/local-agents/auth/init → get sessionId + authUrl
 * 2. Open authUrl in browser
 * 3. Poll GET /api/local-agents/auth/status/:sessionId until approved/denied/expired
 * 4. Save API key to config
 */

const http = require('http');
const https = require('https');
const os = require('os');
const { loadConfig, saveConfig } = require('./config');

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // 5 minutes at 2s intervals

/**
 * Make an HTTP(S) request (minimal, no external deps needed)
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      method: options.method || 'GET',
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = mod.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Initiate auth flow
 */
async function initAuth(serverUrl, deviceName) {
  const response = await request(`${serverUrl}/api/local-agents/auth/init`, {
    method: 'POST',
    body: {
      deviceName,
      hostname: os.hostname(),
      os: os.platform(),
      osVersion: os.release(),
    },
  });

  if (response.status !== 200) {
    throw new Error(`Auth init failed: ${response.data?.error || 'Unknown error'}`);
  }

  return response.data;
}

/**
 * Poll for auth status
 */
async function pollAuthStatus(serverUrl, sessionId, onPoll) {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      attempts++;

      if (attempts > MAX_POLL_ATTEMPTS) {
        reject(new Error('Auth timed out'));
        return;
      }

      try {
        const response = await request(`${serverUrl}/api/local-agents/auth/status/${sessionId}`);

        if (onPoll) onPoll(attempts);

        if (response.status !== 200) {
          reject(new Error(`Status check failed: ${response.data?.error || 'Unknown'}`));
          return;
        }

        const { status, apiKey, agentId } = response.data;

        if (status === 'approved') {
          if (!apiKey) {
            reject(new Error('API key already retrieved. Run login again to generate a new key.'));
          } else {
            resolve({ apiKey, agentId });
          }
          return;
        }

        if (status === 'denied') {
          reject(new Error('Authorization denied by user'));
          return;
        }

        if (status === 'expired') {
          reject(new Error('Authorization request expired'));
          return;
        }

        // status === 'pending' — schedule next poll
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        // Network error, retry
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    setTimeout(poll, POLL_INTERVAL_MS);
  });
}

/**
 * Full login flow
 */
async function login(serverUrl, deviceName) {
  // 1. Init auth challenge
  const { sessionId, authUrl } = await initAuth(serverUrl, deviceName);

  // 2. Open browser
  let opened = false;
  try {
    const open = require('open');
    await open(authUrl);
    opened = true;
  } catch {
    // open may fail in headless environments
  }

  // 3. Poll for result
  const result = await pollAuthStatus(serverUrl, sessionId);

  // 4. Save config
  const config = loadConfig();
  config.server = serverUrl;
  config.apiKey = result.apiKey;
  config.agentId = result.agentId;
  config.deviceName = deviceName;
  saveConfig(config);

  return { ...result, authUrl, opened };
}

module.exports = {
  initAuth,
  pollAuthStatus,
  login,
  request,
};
