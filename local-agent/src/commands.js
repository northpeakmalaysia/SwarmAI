/**
 * Command handlers for Local Agent
 *
 * These are executed when the server sends a command via WebSocket.
 * Phase 5.1: systemInfo, notification
 * Phase 5.2: screenshot, shell, fileRead, fileList
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { loadConfig, getSecurityDefaults } = require('./config');

const http = require('http');
const https = require('https');

const MAX_SHELL_OUTPUT = 100 * 1024; // 100KB
const MAX_FILE_SIZE = 1024 * 1024;   // 1MB
const MAX_CLI_OUTPUT = 500 * 1024;      // 500KB
const MAX_TRANSFER_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CLIPBOARD_SIZE = 64 * 1024;   // 64KB

// Connection context (set by connection.js before command dispatch)
let _serverUrl = null;
let _apiKey = null;

// Socket reference for streaming output (set by connection.js)
let _socket = null;

// Active child processes for kill support
const _activeProcesses = new Map(); // commandId → child process

/**
 * Set the socket reference for streaming output.
 * Called by connection.js on connect.
 */
function setSocket(socket) {
  _socket = socket;
}

/**
 * Emit streaming output chunk to server
 */
function emitChunk(commandId, chunk, stream = 'stdout') {
  if (_socket && chunk) {
    _socket.emit('command:output', { commandId, chunk, stream });
  }
}

/**
 * Set the server connection context for HTTP uploads.
 * Called by connection.js on connect.
 */
function setConnectionContext(serverUrl, apiKey) {
  _serverUrl = serverUrl;
  _apiKey = apiKey;
}

/**
 * Upload a buffer to the server via HTTP POST (multipart/form-data).
 * Returns { downloadUrl, id, token, ... } on success, null on failure.
 */
async function uploadToServer(buffer, fileName, mimeType) {
  if (!_serverUrl || !_apiKey) return null;

  const boundary = `----SwarmaiBoundary${Date.now()}`;
  const crlf = '\r\n';

  // Build multipart body manually (no dependency needed)
  const parts = [];
  parts.push(`--${boundary}${crlf}`);
  parts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"${crlf}`);
  parts.push(`Content-Type: ${mimeType}${crlf}${crlf}`);
  const header = Buffer.from(parts.join(''));
  const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);
  const body = Buffer.concat([header, buffer, footer]);

  const url = new URL('/api/temp-files/agent-upload', _serverUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${_apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        } else {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// Default dangerous shell patterns (merged with user config)
const DEFAULT_SHELL_BLOCKLIST = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  'format c:',
  'format d:',
  'del /s /q c:\\',
  'del /s /q d:\\',
  'mkfs',
  'dd if=',
  ':(){ :|:& };:',
  'shutdown',
  'reboot',
  'halt',
  'init 0',
  'init 6',
];

/**
 * Get security config (merged defaults + user overrides)
 */
function getSecurityConfig() {
  const config = loadConfig();
  const security = config.security || {};
  const defaults = getSecurityDefaults();
  return {
    shellBlocklist: [...DEFAULT_SHELL_BLOCKLIST, ...(security.shellBlocklist || [])],
    fileRootPaths: security.fileRootPaths || [], // empty = allow all
    requireApprovalFor: security.requireApprovalFor ?? defaults.requireApprovalFor,
    allowCapture: security.allowCapture ?? defaults.allowCapture,
  };
}

/**
 * Check if a shell command is blocked
 * Normalizes whitespace and strips common shell escape chars before checking
 */
function isShellBlocked(command, blocklist) {
  // Normalize: collapse whitespace, strip backslash escapes, lowercase
  const normalized = command
    .toLowerCase()
    .replace(/\\/g, '')        // strip backslash escapes
    .replace(/['"]/g, '')      // strip quotes
    .replace(/\$ifs/gi, ' ')   // replace $IFS with space
    .replace(/\s+/g, ' ')      // collapse whitespace
    .trim();

  for (const pattern of blocklist) {
    const normalizedPattern = pattern.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalized.includes(normalizedPattern)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Validate file path against allowed root paths
 */
function validateFilePath(filePath, rootPaths) {
  if (!rootPaths || rootPaths.length === 0) return true; // empty = allow all
  const resolved = path.resolve(filePath);
  for (const root of rootPaths) {
    const resolvedRoot = path.resolve(root);
    // Ensure separator boundary: /home/user/projects must not match /home/user/projects_secret
    const boundary = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
    if (resolved === resolvedRoot || resolved.startsWith(boundary)) return true;
  }
  return false;
}

// =====================================================
// COMMAND HANDLERS
// =====================================================

/**
 * Get system information
 */
function handleSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    hostname: os.hostname(),
    os: os.platform(),
    osVersion: os.release(),
    arch: os.arch(),
    cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
    cpuCores: cpus.length,
    totalMemoryMB: Math.round(totalMem / (1024 * 1024)),
    freeMemoryMB: Math.round(freeMem / (1024 * 1024)),
    usedMemoryPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
    uptimeHours: Math.round(os.uptime() / 3600 * 10) / 10,
    nodeVersion: process.version,
    username: os.userInfo().username,
  };
}

/**
 * Show a desktop notification (best effort)
 */
function handleNotification(params) {
  const { title = 'SwarmAI', message = 'Notification from SwarmAI' } = params || {};

  try {
    const notifier = require('node-notifier');
    notifier.notify({ title, message });
    return { sent: true, method: 'node-notifier' };
  } catch {
    console.log(`[Notification] ${title}: ${message}`);
    return { sent: true, method: 'console' };
  }
}

/**
 * Take a screenshot of the desktop (async — screenshot-desktop is promise-based)
 */
async function handleScreenshot(params) {
  // Default to jpeg for smaller payload size (PNG can be 5MB+, JPEG is typically 200-500KB)
  const { format = 'jpeg', quality = 70 } = params || {};
  const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024; // 10MB hard cap

  try {
    const screenshot = require('screenshot-desktop');
    const useFormat = format === 'png' ? 'png' : 'jpg';
    const imgBuffer = await screenshot({ format: useFormat });

    if (imgBuffer.length > MAX_SCREENSHOT_SIZE) {
      throw new Error(`Screenshot too large: ${(imgBuffer.length / (1024 * 1024)).toFixed(1)}MB (max: ${MAX_SCREENSHOT_SIZE / (1024 * 1024)}MB). Try format: "jpeg" for smaller size.`);
    }

    const actualFormat = useFormat === 'jpg' ? 'jpeg' : 'png';
    const sizeHuman = `${(imgBuffer.length / 1024).toFixed(0)}KB`;
    const fileName = `screenshot_${Date.now()}.${actualFormat === 'jpeg' ? 'jpg' : 'png'}`;

    // Upload via HTTP (lightweight metadata returned via WebSocket)
    const uploaded = await uploadToServer(imgBuffer, fileName, `image/${actualFormat}`);
    if (uploaded) {
      return {
        downloadUrl: uploaded.downloadUrl,
        fileName,
        format: actualFormat,
        size: imgBuffer.length,
        sizeHuman,
        timestamp: new Date().toISOString(),
        note: `Screenshot captured and uploaded. Download URL: ${uploaded.downloadUrl}`,
      };
    }

    // Fallback: return base64 if HTTP upload fails (old behavior)
    return {
      imageData: imgBuffer.toString('base64'),
      format: actualFormat,
      mimeType: `image/${actualFormat}`,
      size: imgBuffer.length,
      sizeHuman,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Screenshot failed: ${error.message}. Install screenshot-desktop: npm i screenshot-desktop`);
  }
}

/**
 * Execute a shell command with streaming output
 * Streams stdout/stderr chunks in real-time via WebSocket
 */
function handleShell(params, commandId) {
  const { command, cwd, timeout = 30000, workspaceProfile, workspaceSystemPrompt } = params || {};

  if (!command || typeof command !== 'string') {
    throw new Error('shell command is required');
  }

  // Security check
  const security = getSecurityConfig();
  const blocked = isShellBlocked(command, security.shellBlocklist);
  if (blocked) {
    throw new Error(`Command blocked by security policy: matches "${blocked}"`);
  }

  // Check if this shell command matches a restricted pattern
  if (security.requireApprovalFor.length > 0) {
    const needsApproval = security.requireApprovalFor.some(pattern =>
      command.toLowerCase().includes(pattern.toLowerCase())
    );
    if (needsApproval) {
      return {
        status: 'restricted',
        command,
        reason: 'This shell command is restricted by the local agent security config. The user can adjust security.requireApprovalFor in their config file to allow it.',
      };
    }
  }

  // Resolve effective cwd: explicit cwd > workspace profile > workspace root > process.cwd()
  let effectiveCwd = cwd;
  if (!effectiveCwd && workspaceProfile) {
    try {
      const { getWorkspaceManager } = require('./workspace');
      const wm = getWorkspaceManager();
      if (wm) {
        effectiveCwd = wm.ensureProfileWorkspace(workspaceProfile, {
          systemPrompt: workspaceSystemPrompt || '',
        });
      }
    } catch { /* fall through */ }
  }
  if (!effectiveCwd) {
    try {
      const { getWorkspaceManager } = require('./workspace');
      const wm = getWorkspaceManager();
      if (wm) effectiveCwd = wm.getRootPath();
    } catch { /* fall through */ }
  }
  if (!effectiveCwd) effectiveCwd = process.cwd();

  // Validate resolved cwd against security file root paths
  if (effectiveCwd !== process.cwd()) {
    if (!validateFilePath(effectiveCwd, security.fileRootPaths)) {
      throw new Error(`Access denied: cwd "${effectiveCwd}" is outside allowed directories`);
    }
  }

  const effectiveTimeout = Math.min(timeout, 60000); // Cap at 60s

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;

    const isWindows = os.platform() === 'win32';
    const shellCmd = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const child = spawn(shellCmd, shellArgs, {
      cwd: effectiveCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    // Track for kill support
    if (commandId) _activeProcesses.set(commandId, child);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Stream to dashboard
      if (commandId) emitChunk(commandId, chunk, 'stdout');
      if (stdout.length > MAX_SHELL_OUTPUT && !killed) {
        killed = true;
        child.kill('SIGTERM');
      }
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (commandId) emitChunk(commandId, chunk, 'stderr');
      if (stderr.length > MAX_SHELL_OUTPUT) {
        stderr = stderr.substring(0, MAX_SHELL_OUTPUT);
      }
    });

    const timeoutTimer = setTimeout(() => {
      if (!killed) {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* done */ } }, 5000);
      }
    }, effectiveTimeout);

    child.on('close', (code) => {
      clearTimeout(timeoutTimer);
      if (commandId) _activeProcesses.delete(commandId);
      const duration = Date.now() - startTime;
      const truncated = stdout.length >= MAX_SHELL_OUTPUT;

      if (stdout.length > MAX_SHELL_OUTPUT) {
        stdout = stdout.substring(0, MAX_SHELL_OUTPUT) + '\n... [output truncated at 100KB]';
      }

      resolve({
        stdout,
        stderr,
        exitCode: code,
        duration,
        truncated,
        error: killed && code !== 0 ? 'Command timed out or killed' : undefined,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      if (commandId) _activeProcesses.delete(commandId);
      reject(new Error(`Shell command failed: ${err.message}`));
    });
  });
}

/**
 * Read a file's contents
 */
function handleFileRead(params) {
  const { path: filePath, encoding = 'utf-8', maxBytes = MAX_FILE_SIZE } = params || {};

  if (!filePath) {
    throw new Error('fileRead path is required');
  }

  // Security check
  const security = getSecurityConfig();
  if (!validateFilePath(filePath, security.fileRootPaths)) {
    throw new Error(`Access denied: path "${filePath}" is outside allowed directories`);
  }

  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(resolvedPath);

  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file. Use fileList instead.`);
  }

  if (stat.size > maxBytes) {
    throw new Error(`File too large: ${stat.size} bytes (max: ${maxBytes}). Use shell "head" or "tail" instead.`);
  }

  // Detect binary files
  const ext = path.extname(resolvedPath).toLowerCase();
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.pdf',
    '.zip', '.gz', '.tar', '.exe', '.dll', '.so', '.dylib', '.wasm',
    '.mp3', '.mp4', '.avi', '.mov', '.wav'];

  if (binaryExts.includes(ext)) {
    const data = fs.readFileSync(resolvedPath);
    return {
      content: data.toString('base64'),
      encoding: 'base64',
      size: stat.size,
      mimeType: getMimeType(ext),
      path: resolvedPath,
    };
  }

  const content = fs.readFileSync(resolvedPath, encoding);
  return {
    content,
    encoding,
    size: stat.size,
    path: resolvedPath,
  };
}

/**
 * List directory contents
 */
function handleFileList(params) {
  const { path: dirPath, recursive = false, filter } = params || {};

  if (!dirPath) {
    throw new Error('fileList path is required');
  }

  // Security check
  const security = getSecurityConfig();
  if (!validateFilePath(dirPath, security.fileRootPaths)) {
    throw new Error(`Access denied: path "${dirPath}" is outside allowed directories`);
  }

  const resolvedPath = path.resolve(dirPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is a file, not a directory. Use fileRead instead.`);
  }

  const files = listDir(resolvedPath, recursive, filter, 500);

  return {
    files,
    total: files.length,
    path: resolvedPath,
    truncated: files.length >= 500,
  };
}

/**
 * List directory contents (helper)
 */
function listDir(dirPath, recursive, filter, maxItems) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= maxItems) break;

    // Skip hidden files by default (including .env for security)
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);

    // Apply filter
    if (filter && !entry.name.includes(filter)) {
      if (!entry.isDirectory() || !recursive) continue;
    }

    try {
      const stat = fs.statSync(fullPath);
      results.push({
        name: entry.name,
        path: fullPath,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isDirectory: entry.isDirectory(),
      });

      if (recursive && entry.isDirectory() && results.length < maxItems) {
        const children = listDir(fullPath, true, filter, maxItems - results.length);
        results.push(...children);
      }
    } catch {
      // Skip files we can't stat (permission issues)
    }
  }

  return results;
}

/**
 * Get MIME type from extension
 */
function getMimeType(ext) {
  const types = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.gz': 'application/gzip', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Handle MCP tool call from server
 * params: { action, server, tool, args }
 */
async function handleMcp(params) {
  const { getMcpManager } = require('./mcpManager');
  const mcpManager = getMcpManager();

  const action = params?.action || 'call';

  if (action === 'list') {
    return {
      servers: mcpManager.getConnectedServers(),
      tools: mcpManager.getAllTools(),
    };
  }

  if (action === 'status') {
    return {
      servers: mcpManager.getConnectedServers(),
      toolCount: mcpManager.getAllTools().length,
    };
  }

  // Default: call a tool
  const { server, tool, args = {} } = params || {};
  if (!server) throw new Error('mcp: server name is required');
  if (!tool) throw new Error('mcp: tool name is required');

  const result = await mcpManager.callTool(server, tool, args);
  return {
    server,
    tool,
    result,
    executedAt: new Date().toISOString(),
  };
}

// =====================================================
// PHASE 5.4 COMMAND HANDLERS
// =====================================================

/**
 * Kill a running command by its commandId
 */
function handleKill(params) {
  const { commandId } = params || {};
  if (!commandId) throw new Error('kill requires commandId parameter');

  const child = _activeProcesses.get(commandId);
  if (!child) {
    return { killed: false, reason: 'No active process found for this command' };
  }

  try {
    child.kill('SIGTERM');
    // Force kill after 3 seconds
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* done */ } }, 3000);
    return { killed: true, commandId };
  } catch (err) {
    return { killed: false, reason: err.message };
  }
}

/**
 * Run a CLI AI session (claude, gemini, opencode)
 * Non-interactive, spawns process with prompt argument.
 * Streams output in real-time via WebSocket.
 */
async function handleCliSession(params, commandId) {
  const { cliType, prompt, cwd, timeout, workspaceProfile, workspaceSystemPrompt } = params || {};

  const CLI_WHITELIST = ['claude', 'gemini', 'opencode'];
  if (!CLI_WHITELIST.includes(cliType)) {
    throw new Error(`Unsupported CLI type: "${cliType}". Allowed: ${CLI_WHITELIST.join(', ')}`);
  }

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('cliSession prompt is required and must be a non-empty string');
  }

  // Resolve effective cwd: explicit cwd > workspace profile > workspace root > process.cwd()
  let effectiveCwd = cwd;
  if (!effectiveCwd && workspaceProfile) {
    try {
      const { getWorkspaceManager } = require('./workspace');
      const wm = getWorkspaceManager();
      if (wm) {
        effectiveCwd = wm.ensureProfileWorkspace(workspaceProfile, {
          systemPrompt: workspaceSystemPrompt || '',
        });
      }
    } catch { /* fall through to next fallback */ }
  }
  if (!effectiveCwd) {
    try {
      const { getWorkspaceManager } = require('./workspace');
      const wm = getWorkspaceManager();
      if (wm) effectiveCwd = wm.getRootPath();
    } catch { /* fall through */ }
  }
  if (!effectiveCwd) effectiveCwd = process.cwd();

  // Validate working directory
  if (effectiveCwd && effectiveCwd !== process.cwd()) {
    const security = getSecurityConfig();
    if (!validateFilePath(effectiveCwd, security.fileRootPaths)) {
      throw new Error(`Access denied: cwd "${effectiveCwd}" is outside allowed directories`);
    }
    if (!fs.existsSync(effectiveCwd) || !fs.statSync(effectiveCwd).isDirectory()) {
      throw new Error(`cwd does not exist or is not a directory: ${effectiveCwd}`);
    }
  }

  // Build command and args based on CLI type
  const isWindows = os.platform() === 'win32';
  const suffix = isWindows ? '.cmd' : '';
  let executable;
  let args;

  switch (cliType) {
    case 'claude':
      executable = `claude${suffix}`;
      args = ['--print', prompt];
      break;
    case 'gemini':
      executable = `gemini${suffix}`;
      args = [prompt];
      break;
    case 'opencode':
      executable = `opencode${suffix}`;
      args = ['run', prompt];
      break;
  }

  // ── Async mode: extended timeout + stale detection for long-running tasks ──
  // When asyncMode is true (set by server for long CLI tasks), we:
  // 1. Allow up to 60 minutes instead of 5 minutes
  // 2. Add stale detection (kill if no output for staleThresholdMs)
  // 3. Report result via 'command:async-result' WebSocket event
  const isAsync = params.asyncMode === true;
  const effectiveTimeout = isAsync
    ? Math.min(timeout || 3600000, 3600000)   // Async: up to 60 min
    : Math.min(timeout || 120000, 300000);     // Sync: default 2min, cap 5min
  const staleThresholdMs = params.staleThresholdMs || (5 * 60 * 1000); // 5 min default

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;
    let killTimer = null;
    let lastOutputTime = Date.now();
    let staleCheckTimer = null;

    const child = spawn(executable, args, {
      cwd: effectiveCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    // Track for kill support
    if (commandId) _activeProcesses.set(commandId, child);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      lastOutputTime = Date.now();
      // Stream to dashboard (always, for both sync and async)
      if (commandId) emitChunk(commandId, chunk, 'stdout');
      if (stdout.length > MAX_CLI_OUTPUT) {
        stdout = stdout.substring(0, MAX_CLI_OUTPUT);
        if (!killed) {
          killed = true;
          child.kill('SIGTERM');
        }
      }
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      lastOutputTime = Date.now();
      if (commandId) emitChunk(commandId, chunk, 'stderr');
      if (stderr.length > MAX_CLI_OUTPUT) {
        stderr = stderr.substring(0, MAX_CLI_OUTPUT);
      }
    });

    // Stale detection for async mode: kill process if no output for staleThresholdMs
    if (isAsync) {
      staleCheckTimer = setInterval(() => {
        const silentMs = Date.now() - lastOutputTime;
        if (silentMs > staleThresholdMs && !killed) {
          killed = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch { /* already dead */ }
          }, 5000);
          if (staleCheckTimer) clearInterval(staleCheckTimer);
        }
      }, 30000); // Check every 30s
    }

    // Timeout handler
    const timeoutTimer = setTimeout(() => {
      if (!killed) {
        killed = true;
        child.kill('SIGTERM');
        // Force kill after 5 seconds if still alive
        killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }, 5000);
      }
    }, effectiveTimeout);

    child.on('close', (code) => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (staleCheckTimer) clearInterval(staleCheckTimer);
      if (commandId) _activeProcesses.delete(commandId);
      const duration = Date.now() - startTime;
      const truncated = stdout.length >= MAX_CLI_OUTPUT;

      const result = {
        cliType,
        output: stdout,
        stderr,
        exitCode: code,
        duration,
        truncated,
      };

      // In async mode, also report result back via command:async-result event
      // so the server can deliver to the user even if the sync promise already resolved
      if (isAsync && _socket && commandId) {
        _socket.emit('command:async-result', { commandId, result, error: code !== 0 ? `CLI exited with code ${code}` : null });
      }

      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (staleCheckTimer) clearInterval(staleCheckTimer);
      if (commandId) _activeProcesses.delete(commandId);
      reject(new Error(`Failed to start ${cliType}: ${err.message}. Is ${cliType} installed and in PATH?`));
    });
  });
}

/**
 * Transfer a file as base64 (up to 10MB)
 */
async function handleFileTransfer(params) {
  const { path: filePath } = params || {};

  if (!filePath) {
    throw new Error('fileTransfer path is required');
  }

  // Security check
  const security = getSecurityConfig();
  if (!validateFilePath(filePath, security.fileRootPaths)) {
    throw new Error(`Access denied: path "${filePath}" is outside allowed directories`);
  }

  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(resolvedPath);

  if (stat.isDirectory()) {
    throw new Error('Path is a directory, not a file. Cannot transfer directories.');
  }

  if (stat.size > MAX_TRANSFER_SIZE) {
    throw new Error(`File too large: ${stat.size} bytes (${(stat.size / (1024 * 1024)).toFixed(1)}MB). Max: ${MAX_TRANSFER_SIZE / (1024 * 1024)}MB`);
  }

  const buffer = fs.readFileSync(resolvedPath);
  const originalName = path.basename(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType = getMimeType(ext);

  // Upload via HTTP (lightweight metadata returned via WebSocket)
  const uploaded = await uploadToServer(buffer, originalName, mimeType);
  if (uploaded) {
    return {
      downloadUrl: uploaded.downloadUrl,
      originalName,
      mimeType,
      size: stat.size,
      sizeHuman: `${(stat.size / 1024).toFixed(0)}KB`,
      note: `File uploaded. Download URL: ${uploaded.downloadUrl}`,
    };
  }

  // Fallback: return base64 if HTTP upload fails (old behavior)
  return {
    content: buffer.toString('base64'),
    encoding: 'base64',
    originalName,
    mimeType,
    size: stat.size,
  };
}

/**
 * Read or write system clipboard
 */
function handleClipboard(params) {
  const { action, text } = params || {};

  if (action !== 'read' && action !== 'write') {
    throw new Error('clipboard action must be "read" or "write"');
  }

  const platform = os.platform();

  if (action === 'read') {
    try {
      let content;
      if (platform === 'win32') {
        content = execSync('powershell -NoProfile -Command "Get-Clipboard"', {
          encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        }).replace(/\r\n$/, '');
      } else if (platform === 'darwin') {
        content = execSync('pbpaste', {
          encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        });
      } else {
        // Linux: try xclip, then xsel
        try {
          content = execSync('xclip -selection clipboard -o', {
            encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch {
          content = execSync('xsel --clipboard --output', {
            encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
          });
        }
      }
      return { action: 'read', content, length: content.length };
    } catch (error) {
      throw new Error(`Clipboard read failed: ${error.message}. On Linux, install xclip or xsel.`);
    }
  }

  // action === 'write'
  if (typeof text !== 'string') {
    throw new Error('clipboard write requires "text" parameter as a string');
  }
  if (text.length > MAX_CLIPBOARD_SIZE) {
    throw new Error(`Text too large for clipboard: ${text.length} bytes (max: ${MAX_CLIPBOARD_SIZE})`);
  }

  try {
    if (platform === 'win32') {
      execSync('powershell -NoProfile -Command "Set-Clipboard -Value $input"', {
        input: text, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else if (platform === 'darwin') {
      execSync('pbcopy', {
        input: text, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      try {
        execSync('xclip -selection clipboard', {
          input: text, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        execSync('xsel --clipboard --input', {
          input: text, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        });
      }
    }
    return { action: 'write', success: true, length: text.length };
  } catch (error) {
    throw new Error(`Clipboard write failed: ${error.message}. On Linux, install xclip or xsel.`);
  }
}

/**
 * Capture from camera or microphone using ffmpeg
 */
async function handleCapture(params) {
  const { type, device, duration, format } = params || {};

  const ALLOWED_TYPES = ['camera', 'microphone', 'list_devices'];
  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error(`capture type must be one of: ${ALLOWED_TYPES.join(', ')}`);
  }

  // Check security config - capture must be explicitly allowed
  const security = getSecurityConfig();
  if (!security.allowCapture && type !== 'list_devices') {
    throw new Error('Capture (camera/microphone) is disabled by default. Set security.allowCapture = true in config to enable.');
  }

  // Validate device name to prevent argument injection
  if (device && !/^[\w\s:./\\()-]+$/.test(device)) {
    throw new Error(`Invalid device name: "${device}". Only alphanumeric, spaces, colons, dots, slashes, and parentheses are allowed.`);
  }

  // Check ffmpeg is installed
  try {
    execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    throw new Error('ffmpeg is not installed. Install it: https://ffmpeg.org/download.html');
  }

  const platform = os.platform();

  // --- LIST DEVICES ---
  if (type === 'list_devices') {
    try {
      let output = '';
      if (platform === 'win32') {
        try {
          execSync('ffmpeg -list_devices true -f dshow -i dummy', {
            encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (e) {
          // ffmpeg outputs device list to stderr and exits with error code
          output = (e.stderr || '').toString();
        }
      } else if (platform === 'darwin') {
        try {
          execSync('ffmpeg -f avfoundation -list_devices true -i ""', {
            encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (e) {
          output = (e.stderr || '').toString();
        }
      } else {
        // Linux: list video and audio devices
        const videoDevices = [];
        const audioDevices = [];
        try {
          const videoFiles = fs.readdirSync('/dev').filter(f => f.startsWith('video'));
          videoDevices.push(...videoFiles.map(f => `/dev/${f}`));
        } catch { /* no video devices */ }
        try {
          const audioOut = execSync('arecord -l', {
            encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
          });
          audioDevices.push(audioOut.trim());
        } catch { /* no audio devices */ }
        output = `Video devices: ${videoDevices.join(', ') || 'none found'}\nAudio devices: ${audioDevices.length ? audioDevices.join('\n') : 'none found'}`;
      }
      return { type: 'list_devices', output, platform };
    } catch (error) {
      throw new Error(`Failed to list devices: ${error.message}`);
    }
  }

  // Create temp directory for captures
  const captureDir = path.join(os.homedir(), '.swarmai', 'capture');
  if (!fs.existsSync(captureDir)) {
    fs.mkdirSync(captureDir, { recursive: true });
  }

  const timestamp = Date.now();

  // --- CAMERA CAPTURE ---
  if (type === 'camera') {
    const outputPath = path.join(captureDir, `capture_${timestamp}.jpg`);

    let ffmpegArgs;
    if (platform === 'win32') {
      ffmpegArgs = ['-f', 'dshow', '-i', 'video=' + (device || 'Integrated Camera'), '-frames:v', '1', '-y', outputPath];
    } else if (platform === 'darwin') {
      ffmpegArgs = ['-f', 'avfoundation', '-i', device || '0', '-frames:v', '1', '-y', outputPath];
    } else {
      ffmpegArgs = ['-f', 'v4l2', '-i', device || '/dev/video0', '-frames:v', '1', '-y', outputPath];
    }

    await runFfmpeg(ffmpegArgs, 30000);

    // Read result and clean up
    if (!fs.existsSync(outputPath)) {
      throw new Error('Camera capture failed: output file was not created');
    }
    const buffer = fs.readFileSync(outputPath);
    try { fs.unlinkSync(outputPath); } catch { /* cleanup best effort */ }

    return {
      type: 'camera',
      imageData: buffer.toString('base64'),
      format: 'jpeg',
      mimeType: 'image/jpeg',
      size: buffer.length,
      timestamp: new Date().toISOString(),
    };
  }

  // --- MICROPHONE CAPTURE ---
  if (type === 'microphone') {
    const effectiveDuration = Math.min(duration || 5, 30);
    const outputPath = path.join(captureDir, `capture_${timestamp}.wav`);

    let ffmpegArgs;
    if (platform === 'win32') {
      ffmpegArgs = ['-f', 'dshow', '-i', 'audio=' + (device || 'Microphone'), '-t', String(effectiveDuration), '-y', outputPath];
    } else if (platform === 'darwin') {
      ffmpegArgs = ['-f', 'avfoundation', '-i', ':' + (device || '0'), '-t', String(effectiveDuration), '-y', outputPath];
    } else {
      ffmpegArgs = ['-f', 'alsa', '-i', device || 'default', '-t', String(effectiveDuration), '-y', outputPath];
    }

    // Timeout = duration + 10s buffer
    await runFfmpeg(ffmpegArgs, (effectiveDuration + 10) * 1000);

    if (!fs.existsSync(outputPath)) {
      throw new Error('Microphone capture failed: output file was not created');
    }
    const buffer = fs.readFileSync(outputPath);
    try { fs.unlinkSync(outputPath); } catch { /* cleanup best effort */ }

    return {
      type: 'microphone',
      audioData: buffer.toString('base64'),
      format: 'wav',
      mimeType: 'audio/wav',
      duration: effectiveDuration,
      size: buffer.length,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Helper: Run ffmpeg as a spawned process with timeout
 */
function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.substring(0, 500)}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to run ffmpeg: ${err.message}`));
    });
  });
}

// =====================================================
// AI CHAT — Proxy AI requests to local Ollama / LM Studio
// =====================================================

const AI_CHAT_TIMEOUT_MS = 120000; // 120s — local inference can be slow

/**
 * Proxy an AI chat request to a local provider (Ollama or LM Studio).
 * Called by SwarmAI server via WebSocket when routing through this Local Agent.
 *
 * @param {object} params - { provider, baseUrl, model, messages, options }
 * @returns {{ content, model, usage, metadata }}
 */
async function handleAiChat(params) {
  const { provider, baseUrl, model, messages, options = {} } = params || {};

  if (!provider) throw new Error('aiChat: provider is required (ollama or lmstudio)');
  if (!model) throw new Error('aiChat: model is required');
  if (!messages || !Array.isArray(messages)) throw new Error('aiChat: messages array is required');

  const effectiveBaseUrl = baseUrl || (provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234');

  if (provider === 'ollama') {
    return await _chatOllama(effectiveBaseUrl, model, messages, options);
  } else if (provider === 'lmstudio') {
    return await _chatLmStudio(effectiveBaseUrl, model, messages, options);
  } else {
    throw new Error(`aiChat: unsupported provider "${provider}". Use "ollama" or "lmstudio".`);
  }
}

/**
 * Call Ollama's /api/chat endpoint
 */
async function _chatOllama(baseUrl, model, messages, options) {
  // Inject system prompt as first message if provided
  const fullMessages = [...messages];
  if (options.systemPrompt && !fullMessages.find(m => m.role === 'system')) {
    fullMessages.unshift({ role: 'system', content: options.systemPrompt });
  }

  const payload = JSON.stringify({
    model,
    messages: fullMessages,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      num_predict: options.maxTokens || 2048,
    },
  });

  const data = await _httpPost(`${baseUrl}/api/chat`, payload, AI_CHAT_TIMEOUT_MS);

  if (!data || !data.message) {
    throw new Error(`Ollama returned empty response for model "${model}"`);
  }

  return {
    content: data.message.content,
    model: data.model || model,
    usage: {
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    },
    metadata: {
      provider: 'ollama',
      totalDuration: data.total_duration,
      evalDuration: data.eval_duration,
      loadDuration: data.load_duration,
    },
  };
}

/**
 * Call LM Studio's OpenAI-compatible /v1/chat/completions endpoint
 */
async function _chatLmStudio(baseUrl, model, messages, options) {
  const fullMessages = [...messages];
  if (options.systemPrompt && !fullMessages.find(m => m.role === 'system')) {
    fullMessages.unshift({ role: 'system', content: options.systemPrompt });
  }

  const payload = JSON.stringify({
    model,
    messages: fullMessages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens || 2048,
    stream: false,
  });

  const data = await _httpPost(`${baseUrl}/v1/chat/completions`, payload, AI_CHAT_TIMEOUT_MS);

  if (!data || !data.choices || !data.choices[0]) {
    throw new Error(`LM Studio returned empty response for model "${model}"`);
  }

  return {
    content: data.choices[0].message?.content || '',
    model: data.model || model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    metadata: {
      provider: 'lmstudio',
      finishReason: data.choices[0].finish_reason,
    },
  };
}

/**
 * Simple HTTP POST helper (JSON body, JSON response)
 */
function _httpPost(urlStr, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { reject(new Error(`Invalid JSON from ${urlStr}`)); }
        } else {
          reject(new Error(`${urlStr} returned HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Failed to connect to ${urlStr}: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error(`Request to ${urlStr} timed out after ${timeoutMs}ms`)); });
    req.write(body);
    req.end();
  });
}

// =====================================================
// REGISTRY
// =====================================================

// Commands that receive commandId for streaming/kill support
const STREAMING_COMMANDS = new Set(['shell', 'cliSession']);

const commandHandlers = {
  systemInfo: handleSystemInfo,
  notification: handleNotification,
  screenshot: handleScreenshot,
  shell: handleShell,
  fileRead: handleFileRead,
  fileList: handleFileList,
  mcp: handleMcp,
  cliSession: handleCliSession,      // Phase 5.4
  fileTransfer: handleFileTransfer,   // Phase 5.4
  clipboard: handleClipboard,         // Phase 5.4
  capture: handleCapture,             // Phase 5.4
  aiChat: handleAiChat,              // AI proxy to local Ollama/LM Studio
  kill: handleKill,                  // Phase 5.5 — kill running command
};

/**
 * Execute a command by name
 * Pre-dispatch: checks requireApprovalFor list (Phase 5.4 security gate)
 * @param {string} command - Command name
 * @param {object} params - Command parameters
 * @param {string} [commandId] - For streaming commands, the unique command ID
 */
function executeCommand(command, params, commandId) {
  const handler = commandHandlers[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }

  // Phase 5.4: Check if command is restricted by local agent security policy
  const security = getSecurityConfig();
  if (security.requireApprovalFor.includes(command)) {
    return {
      status: 'restricted',
      command,
      reason: `Command "${command}" is restricted by the local agent's security config. The user can enable it by removing "${command}" from security.requireApprovalFor in their local agent config file.`,
    };
  }

  // Pass commandId to streaming-capable commands (shell, cliSession)
  if (STREAMING_COMMANDS.has(command) && commandId) {
    return handler(params, commandId);
  }

  return handler(params);
}

/**
 * Get list of supported commands
 */
function getCapabilities() {
  return Object.keys(commandHandlers);
}

module.exports = {
  executeCommand,
  getCapabilities,
  commandHandlers,
  setConnectionContext,
  setSocket,
};
