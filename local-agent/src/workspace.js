/**
 * Workspace Manager for Local Agent
 *
 * Manages structured workspace directories for agentic AI profiles:
 *   {root}/Workspace/{profileName}/  — per-profile workspace with CLAUDE.md
 *   {root}/temp/                     — screenshot/job outputs (auto-cleaned 24h)
 *   {root}/downloads/                — files from agentic AI (auto-cleaned 7d)
 *
 * Two-phase initialization:
 *   1. On connect: initSharedDirs() creates temp/ and downloads/
 *   2. On first cliSession: ensureProfileWorkspace() lazily creates profile dir
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class WorkspaceManager {
  /**
   * @param {object} config - Workspace config (merged defaults + user overrides)
   * @param {string} config.rootPath
   * @param {number} config.tempMaxAgeMs
   * @param {number} config.downloadsMaxAgeMs
   */
  constructor(config) {
    this._rootPath = config.rootPath;
    this._tempMaxAgeMs = config.tempMaxAgeMs;
    this._downloadsMaxAgeMs = config.downloadsMaxAgeMs;
    this._activeWorkspaces = new Map(); // profileName → workspacePath
  }

  getRootPath() {
    return this._rootPath;
  }

  getWorkspacePath(profileName) {
    return path.join(this._rootPath, 'Workspace', sanitizeProfileName(profileName));
  }

  getTempPath() {
    return path.join(this._rootPath, 'temp');
  }

  getDownloadsPath() {
    return path.join(this._rootPath, 'downloads');
  }

  /**
   * Create shared directories (temp, downloads). Called on agent connect.
   * @returns {{ rootPath: string, tempPath: string, downloadsPath: string }}
   */
  initSharedDirs() {
    const tempPath = this.getTempPath();
    const downloadsPath = this.getDownloadsPath();

    fs.mkdirSync(tempPath, { recursive: true });
    fs.mkdirSync(downloadsPath, { recursive: true });

    return {
      rootPath: this._rootPath,
      tempPath,
      downloadsPath,
    };
  }

  /**
   * Lazily create a profile workspace with CLAUDE.md context.
   * Cached — second call for same profile returns instantly.
   *
   * @param {string} profileName
   * @param {object} [contextData]
   * @param {string} [contextData.systemPrompt] - Agent system prompt for CLAUDE.md
   * @returns {string} workspacePath
   */
  ensureProfileWorkspace(profileName, contextData = {}) {
    const sanitized = sanitizeProfileName(profileName);
    const cached = this._activeWorkspaces.get(sanitized);
    if (cached) return cached;

    const wsPath = path.join(this._rootPath, 'Workspace', sanitized);
    fs.mkdirSync(wsPath, { recursive: true });

    // Write/update CLAUDE.md with profile context
    const claudeMdPath = path.join(wsPath, 'CLAUDE.md');
    const content = buildClaudeMd(profileName, contextData);
    fs.writeFileSync(claudeMdPath, content, 'utf-8');

    this._activeWorkspaces.set(sanitized, wsPath);
    return wsPath;
  }

  /**
   * Get cached workspace path for a profile, or null if not yet created.
   */
  getWorkspaceForProfile(profileName) {
    return this._activeWorkspaces.get(sanitizeProfileName(profileName)) || null;
  }

  /**
   * Delete files in temp/ older than threshold (default: 24h)
   */
  cleanupTemp(maxAgeMs) {
    const threshold = maxAgeMs ?? this._tempMaxAgeMs;
    return cleanupDir(this.getTempPath(), threshold);
  }

  /**
   * Delete files in downloads/ older than threshold (default: 7d)
   */
  cleanupDownloads(maxAgeMs) {
    const threshold = maxAgeMs ?? this._downloadsMaxAgeMs;
    return cleanupDir(this.getDownloadsPath(), threshold);
  }
}

// =====================================================
// Helpers
// =====================================================

/**
 * Sanitize profile name for use as a folder name.
 * Replace non-alphanumeric (except - and _) with _, trim, max 50 chars.
 */
function sanitizeProfileName(name) {
  return (name || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50) || 'unknown';
}

/**
 * Build CLAUDE.md content for a profile workspace.
 */
function buildClaudeMd(profileName, contextData = {}) {
  const timestamp = new Date().toISOString();
  const lines = [
    `# ${profileName} Workspace`,
    '',
    `Agent: ${profileName}`,
    `Initialized: ${timestamp}`,
    '',
  ];

  if (contextData.systemPrompt) {
    lines.push('## Instructions', '', contextData.systemPrompt, '');
  }

  return lines.join('\n');
}

/**
 * Delete files in a directory older than maxAgeMs.
 * Skips subdirectories (only cleans top-level files).
 * @returns {number} Number of files deleted
 */
function cleanupDir(dirPath, maxAgeMs) {
  if (!fs.existsSync(dirPath)) return 0;

  let deleted = 0;
  const now = Date.now();

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          deleted++;
        }
      } catch { /* skip files we can't stat/delete */ }
    }
  } catch { /* directory read failed, non-critical */ }

  return deleted;
}

// =====================================================
// Singleton
// =====================================================

let _instance = null;

function getWorkspaceManager() {
  return _instance;
}

function initWorkspaceManager(config) {
  _instance = new WorkspaceManager(config);
  return _instance;
}

module.exports = {
  WorkspaceManager,
  getWorkspaceManager,
  initWorkspaceManager,
  sanitizeProfileName,
};
