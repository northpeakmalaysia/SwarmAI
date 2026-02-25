/**
 * Configuration management
 * Reads/writes ~/.swarmai/config.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.swarmai');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_SERVER = 'https://agents.northpeak.app';

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    // Corrupt config, start fresh
  }
  return {};
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

function getServer(opts) {
  const config = loadConfig();
  return opts?.server || config.server || DEFAULT_SERVER;
}

function isConfigured() {
  const config = loadConfig();
  return !!(config.apiKey && config.server);
}

/**
 * Get security config with defaults
 */
function getSecurityDefaults() {
  return {
    shellBlocklist: [],     // Additional patterns beyond built-in defaults
    fileRootPaths: [],      // Empty = allow all. Set paths to restrict file access.
    requireApprovalFor: ['cliSession', 'clipboard'],  // Phase 5.4: sensitive commands need approval. capture is handled by allowCapture gate instead (type-aware).
    allowCapture: false,    // Phase 5.4: camera/mic disabled by default, must opt-in
  };
}

/**
 * Get workspace config with OS-aware defaults.
 * Users can override in ~/.swarmai/config.json under "workspace" key.
 */
function getWorkspaceDefaults() {
  const platform = os.platform();
  return {
    rootPath: platform === 'win32' ? 'C:/SwarmAI' : path.join(os.homedir(), 'SwarmAI'),
    cleanupIntervalMs: 60 * 60 * 1000,           // 1 hour
    tempMaxAgeMs: 24 * 60 * 60 * 1000,           // 24 hours
    downloadsMaxAgeMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
  };
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_SERVER,
  loadConfig,
  saveConfig,
  getServer,
  isConfigured,
  getSecurityDefaults,
  getWorkspaceDefaults,
};
