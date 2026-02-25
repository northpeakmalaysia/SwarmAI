/**
 * AsyncCLIExecutionManager
 *
 * Manages long-running CLI tool executions (Claude, Gemini, OpenCode) that
 * exceed the 4-minute reasoning loop timeout. Instead of blocking the
 * reasoning loop, CLI processes run in the background and results are
 * delivered to the user via the DLQ when complete.
 *
 * Key features:
 * - Background child process management with in-memory tracking
 * - Stale detection: kills process if no stdout for configurable period
 * - 3-layer file detection (reused from CLIAIProvider pattern)
 * - Result delivery via TempFileService + DeliveryQueueService
 * - Crash recovery on server restart
 * - WebSocket progress events for dashboard
 *
 * Usage:
 *   const { getAsyncCLIExecutionManager } = require('./AsyncCLIExecutionManager.cjs');
 *   const manager = getAsyncCLIExecutionManager();
 *   const trackingId = await manager.startExecution('claude', command, workspacePath, options);
 */

const childProcess = require('child_process');
const { spawn } = childProcess;
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

// ── Constants ──
const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;   // 5 minutes no output → stale
const DEFAULT_MAX_TIMEOUT_MS = 60 * 60 * 1000;       // 60 minutes absolute max
const STALE_CHECK_INTERVAL_MS = 30 * 1000;            // Check every 30s
const PROGRESS_THROTTLE_MS = 30 * 1000;               // Emit progress max once per 30s
const MAX_CONCURRENT_PER_USER = 5;                     // Max concurrent async executions per user
const MAX_STDOUT_BUFFER = 2 * 1024 * 1024;            // 2MB stdout buffer (trimmed, not killed)

// ── MIME type inference (same map as SystemToolExecutors) ──
const MIME_MAP = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

function inferMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ── cliuser info (same pattern as CLIAIProvider) ──
let cliUserInfo = null;
try {
  const uid = parseInt(childProcess.execSync('id -u cliuser 2>/dev/null').toString().trim(), 10);
  const gid = parseInt(childProcess.execSync('id -g cliuser 2>/dev/null').toString().trim(), 10);
  if (!isNaN(uid) && !isNaN(gid)) {
    cliUserInfo = { uid, gid };
  }
} catch { /* Not in Docker or cliuser doesn't exist */ }


class AsyncCLIExecutionManager {
  constructor() {
    /** @type {Map<string, Object>} trackingId → execution context */
    this._executions = new Map();

    /** @type {SocketIO.Server|null} */
    this._io = null;

    logger.info('[AsyncCLI] Manager constructed');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // initialize — run migration + crash recovery
  // ─────────────────────────────────────────────────────────────────────────

  initialize(io) {
    if (io) this._io = io;

    // Run migration
    try {
      const { migrate } = require('../../scripts/migrate-async-cli.cjs');
      migrate();
    } catch (e) {
      logger.warn(`[AsyncCLI] Migration failed (may already be applied): ${e.message}`);
    }

    // Crash recovery: mark any 'running' records as failed
    try {
      const db = getDatabase();
      const stale = db.prepare(
        "SELECT id, user_id, conversation_id, account_id, external_id, platform FROM async_cli_executions WHERE status = 'running'"
      ).all();

      if (stale.length > 0) {
        db.prepare(
          "UPDATE async_cli_executions SET status = 'failed', error = 'Server restarted during execution', completed_at = datetime('now') WHERE status = 'running'"
        ).run();
        logger.info(`[AsyncCLI] Crash recovery: marked ${stale.length} stale execution(s) as failed`);

        // Notify users about interrupted tasks
        for (const exec of stale) {
          this._notifyUser(exec, 'Your background task was interrupted by a server restart. Please try again.').catch(() => {});
        }
      }
    } catch (e) {
      logger.warn(`[AsyncCLI] Crash recovery failed: ${e.message}`);
    }

    logger.info('[AsyncCLI] Manager initialized');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startExecution — spawn CLI process in background
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start a background CLI execution.
   *
   * @param {string} cliType - 'claude' | 'gemini' | 'opencode'
   * @param {Object} command - { command: string, args: string[], env: Object }
   * @param {string} workspacePath - Workspace directory for CLI execution
   * @param {Object} options
   * @param {string} options.userId
   * @param {string} [options.agenticId]
   * @param {string} [options.conversationId]
   * @param {string} [options.accountId]
   * @param {string} [options.externalId]
   * @param {string} [options.platform]
   * @param {Set<string>} [options.workspaceSnapshot] - Pre-exec file snapshot for detection
   * @param {number} [options.timeoutMs] - Absolute timeout (default 60 min)
   * @param {number} [options.staleThresholdMs] - Stale detection threshold (default 5 min)
   * @returns {Promise<string>} trackingId
   */
  async startExecution(cliType, command, workspacePath, options = {}) {
    const userId = options.userId;
    if (!userId) throw new Error('userId is required for async CLI execution');

    // Enforce per-user concurrency limit
    let userCount = 0;
    for (const [, exec] of this._executions) {
      if (exec.userId === userId) userCount++;
    }
    if (userCount >= MAX_CONCURRENT_PER_USER) {
      throw new Error(`Too many concurrent background tasks (${MAX_CONCURRENT_PER_USER} max). Wait for one to finish or cancel an existing task.`);
    }

    const trackingId = uuidv4();
    const staleThresholdMs = options.staleThresholdMs || DEFAULT_STALE_THRESHOLD_MS;
    const timeoutMs = Math.min(options.timeoutMs || DEFAULT_MAX_TIMEOUT_MS, DEFAULT_MAX_TIMEOUT_MS);
    const startTime = Date.now();

    // Insert DB record
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO async_cli_executions
          (id, cli_type, source, user_id, agentic_profile_id, conversation_id, account_id,
           external_id, platform, workspace_path, status, stale_threshold_ms, max_timeout_ms, started_at)
        VALUES (?, ?, 'server', ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, datetime('now'))
      `).run(
        trackingId, cliType, userId, options.agenticId || null,
        options.conversationId || null, options.accountId || null,
        options.externalId || null, options.platform || null,
        workspacePath, staleThresholdMs, timeoutMs
      );
    } catch (e) {
      logger.warn(`[AsyncCLI] DB insert failed for ${trackingId}: ${e.message}`);
    }

    // Spawn child process
    const spawnOpts = {
      cwd: workspacePath,
      env: command.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    };
    if (cliUserInfo) {
      spawnOpts.uid = cliUserInfo.uid;
      spawnOpts.gid = cliUserInfo.gid;
    }

    const child = spawn(command.command, command.args, spawnOpts);
    child.stdin.end();

    // Build execution context
    const exec = {
      trackingId,
      cliType,
      process: child,
      userId,
      agenticId: options.agenticId || null,
      conversationId: options.conversationId || null,
      accountId: options.accountId || null,
      externalId: options.externalId || null,
      platform: options.platform || null,
      workspacePath,
      workspaceSnapshot: options.workspaceSnapshot || new Set(),
      startTime,
      lastOutputTime: startTime,
      lastProgressEmit: 0,
      stdout: '',
      stderr: '',
      staleThresholdMs,
      staleCheckInterval: null,
      absoluteTimeout: null,
    };

    this._executions.set(trackingId, exec);

    // ── stdout handler ──
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      exec.lastOutputTime = Date.now();

      // Buffer stdout (with cap to prevent memory exhaustion)
      if (exec.stdout.length < MAX_STDOUT_BUFFER) {
        exec.stdout += chunk;
      }

      // Throttled progress event + DB activity update (max once per 30s)
      const now = Date.now();
      if (now - exec.lastProgressEmit > PROGRESS_THROTTLE_MS) {
        exec.lastProgressEmit = now;
        this._updateLastActivity(trackingId);
        this._emitEvent('agentic:async-cli:progress', {
          trackingId,
          cliType,
          stdoutLength: exec.stdout.length,
          elapsedMs: now - exec.startTime,
          lastActivity: new Date(exec.lastOutputTime).toISOString(),
        });
      }
    });

    // ── stderr handler ──
    child.stderr.on('data', (data) => {
      exec.lastOutputTime = Date.now();
      const chunk = data.toString();
      if (exec.stderr.length < MAX_STDOUT_BUFFER) {
        exec.stderr += chunk;
      }
    });

    // ── Process close handler ──
    child.on('close', (code) => {
      this._onProcessComplete(trackingId, code);
    });

    child.on('error', (error) => {
      logger.error(`[AsyncCLI] Process error for ${trackingId}: ${error.message}`);
      this._onProcessComplete(trackingId, -1, error.message);
    });

    // ── Stale detection interval ──
    exec.staleCheckInterval = setInterval(() => {
      const now = Date.now();
      const silentMs = now - exec.lastOutputTime;
      if (silentMs > exec.staleThresholdMs) {
        logger.warn(`[AsyncCLI] Execution ${trackingId} stale for ${Math.round(silentMs / 1000)}s, killing`);
        this._killProcess(trackingId, 'stale_killed');
      }
    }, STALE_CHECK_INTERVAL_MS);

    // ── Absolute timeout ──
    exec.absoluteTimeout = setTimeout(() => {
      logger.warn(`[AsyncCLI] Execution ${trackingId} hit absolute timeout of ${timeoutMs}ms`);
      this._killProcess(trackingId, 'failed');
    }, timeoutMs);

    // Emit started event
    this._emitEvent('agentic:async-cli:started', {
      trackingId,
      cliType,
      agenticId: exec.agenticId,
      userId,
      startTime: new Date(startTime).toISOString(),
    });

    logger.info(`[AsyncCLI] Started background execution ${trackingId} (cli=${cliType}, timeout=${timeoutMs}ms, stale=${staleThresholdMs}ms)`);
    return trackingId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _onProcessComplete — handle CLI process exit
  // ─────────────────────────────────────────────────────────────────────────

  async _onProcessComplete(trackingId, exitCode, errorMsg) {
    const exec = this._executions.get(trackingId);
    if (!exec) return; // Already cleaned up (e.g., cancelled)

    // Clear timers
    if (exec.staleCheckInterval) clearInterval(exec.staleCheckInterval);
    if (exec.absoluteTimeout) clearTimeout(exec.absoluteTimeout);

    const duration = Date.now() - exec.startTime;
    const success = exitCode === 0;

    logger.info(`[AsyncCLI] Execution ${trackingId} completed (code=${exitCode}, duration=${Math.round(duration / 1000)}s, stdout=${exec.stdout.length} bytes)`);

    if (!success && !errorMsg) {
      errorMsg = `CLI exited with code ${exitCode}: ${(exec.stderr || '').substring(0, 500)}`;
    }

    // Run 3-layer file detection
    let outputFiles = [];
    if (success) {
      try {
        outputFiles = this._detectOutputFiles(exec.workspacePath, exec.workspaceSnapshot, exec.startTime, exec.stdout);
      } catch (e) {
        logger.warn(`[AsyncCLI] File detection failed for ${trackingId}: ${e.message}`);
      }
    }

    // Update DB
    const status = success ? 'completed' : 'failed';
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE async_cli_executions
        SET status = ?, stdout_length = ?, output_files = ?, error = ?,
            completed_at = datetime('now')
        WHERE id = ?
      `).run(status, exec.stdout.length, JSON.stringify(outputFiles.map(f => f.name)), errorMsg || null, trackingId);
    } catch (e) {
      logger.warn(`[AsyncCLI] DB update failed for ${trackingId}: ${e.message}`);
    }

    // Deliver results to user
    try {
      await this._deliverResults(trackingId, exec, {
        success,
        outputFiles,
        textOutput: exec.stdout,
        error: errorMsg,
        duration,
      });
    } catch (e) {
      logger.error(`[AsyncCLI] Result delivery failed for ${trackingId}: ${e.message}`);
      try {
        const db = getDatabase();
        db.prepare("UPDATE async_cli_executions SET delivery_status = 'failed', delivery_error = ? WHERE id = ?")
          .run(e.message, trackingId);
      } catch { /* non-fatal */ }
    }

    // Emit completed/failed event
    this._emitEvent(success ? 'agentic:async-cli:completed' : 'agentic:async-cli:failed', {
      trackingId,
      cliType: exec.cliType,
      duration,
      fileCount: outputFiles.length,
      error: errorMsg || undefined,
    });

    // Cleanup in-memory
    this._executions.delete(trackingId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _deliverResults — recall conversation + re-run reasoning loop with result
  //
  // Two delivery modes:
  // 1. RECALL MODE (preferred): If we have agenticId + conversation context,
  //    trigger a new reasoning loop run with the CLI output. The AI crafts
  //    an intelligent response ("Here's your report! It covers X, Y, Z...")
  //    and sends files via tools (sendWhatsAppMedia, etc.)
  //
  // 2. DIRECT MODE (fallback): If no agent context, deliver files/text
  //    directly via DLQ (raw delivery without AI reasoning).
  // ─────────────────────────────────────────────────────────────────────────

  async _deliverResults(trackingId, exec, result) {
    // Skip delivery if no conversation context at all
    if (!exec.accountId || !exec.externalId || !exec.platform) {
      logger.info(`[AsyncCLI] No delivery context for ${trackingId}, skipping user notification`);
      this._setDeliveryStatus(trackingId, 'not_needed');
      return;
    }

    this._setDeliveryStatus(trackingId, 'delivering');

    // ── RECALL MODE: Re-run reasoning loop with CLI results ──
    // This lets the AI craft an intelligent response and use tools (sendWhatsAppMedia)
    // to deliver files properly to the user.
    if (exec.agenticId && exec.conversationId) {
      try {
        const recalled = await this._recallAndRespond(trackingId, exec, result);
        if (recalled) {
          this._setDeliveryStatus(trackingId, 'delivered');
          return;
        }
        logger.warn(`[AsyncCLI] Recall mode failed for ${trackingId}, falling back to direct delivery`);
      } catch (e) {
        logger.warn(`[AsyncCLI] Recall mode error for ${trackingId}: ${e.message}, falling back to direct delivery`);
      }
    }

    // ── DIRECT MODE: Deliver files/text directly via DLQ ──
    const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();

    if (result.success && result.outputFiles.length > 0) {
      for (const file of result.outputFiles) {
        try {
          await this._deliverFile(exec, file, dlq);
        } catch (e) {
          logger.warn(`[AsyncCLI] File delivery failed for ${file.name}: ${e.message}`);
        }
      }

      const fileList = result.outputFiles.map(f => `${f.name} (${f.sizeHuman})`).join(', ');
      const durationStr = Math.round(result.duration / 1000);
      await this._notifyUser(exec, `Done! Generated ${result.outputFiles.length} file(s) in ${durationStr}s: ${fileList}`);
    } else if (result.success) {
      const textPreview = (result.textOutput || '').substring(0, 3000);
      await this._notifyUser(exec, textPreview || 'Background task completed (no output).');
    } else {
      await this._notifyUser(exec, `Background task failed: ${result.error || 'Unknown error'}. Please try again.`);
    }

    this._setDeliveryStatus(trackingId, 'delivered');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _recallAndRespond — trigger reasoning loop with CLI completion context
  //
  // Recalls the original conversation and feeds CLI results into a new
  // reasoning loop run so the AI can:
  // 1. Summarize what was generated
  // 2. Send files via sendWhatsAppMedia / sendTelegramMedia tools
  // 3. Craft a proper response ("Here's your 20-page report as requested!")
  // ─────────────────────────────────────────────────────────────────────────

  async _recallAndRespond(trackingId, exec, result) {
    const { getAgentReasoningLoop } = require('../agentic/AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();

    // Prepare file download URLs for the AI to use in sendWhatsAppMedia/sendTelegramMedia
    let fileUrls = [];
    if (result.success && result.outputFiles.length > 0) {
      const { getTempFileService } = require('../TempFileService.cjs');
      const tempService = getTempFileService();
      for (const file of result.outputFiles) {
        try {
          const buffer = fs.readFileSync(file.fullPath);
          const mimeType = inferMimeType(file.name);
          const stored = tempService.store(exec.userId, buffer, file.name, mimeType, {
            ttlHours: 72,
            source: 'async-cli-recall',
            metadata: { trackingId },
          });
          if (stored && stored.downloadUrl) {
            fileUrls.push({
              name: file.name,
              size: file.sizeHuman,
              downloadUrl: stored.downloadUrl,
              mimeType,
            });
          }
        } catch (e) {
          logger.warn(`[AsyncCLI] File prep for recall failed (${file.name}): ${e.message}`);
        }
      }
    }

    // Build the trigger context for the recalled conversation
    const durationStr = Math.round(result.duration / 1000);
    let completionSummary;
    if (result.success && fileUrls.length > 0) {
      const fileList = fileUrls.map(f => `- ${f.name} (${f.size}): downloadUrl="${f.downloadUrl}"`).join('\n');
      completionSummary = `A background CLI task (${exec.cliType}) has completed successfully after ${durationStr}s.\n\nGenerated files:\n${fileList}\n\nIMPORTANT: Send each file to the user using the appropriate send tool (sendWhatsAppMedia, sendTelegramMedia, etc.) with the downloadUrl as filePath. Then provide a brief summary of what was generated.`;
    } else if (result.success) {
      const textPreview = (result.textOutput || '').substring(0, 2000);
      completionSummary = `A background CLI task (${exec.cliType}) has completed successfully after ${durationStr}s.\n\nOutput:\n${textPreview}\n\nSummarize this result to the user using the respond tool.`;
    } else {
      completionSummary = `A background CLI task (${exec.cliType}) failed after ${durationStr}s.\n\nError: ${result.error || 'Unknown error'}\n\nInform the user about the failure and suggest they try again.`;
    }

    // Build the _onIntermediateRespond callback for this recalled conversation
    const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const onIntermediateRespond = async (responseMessage) => {
      if (!dlq) return;
      await dlq.enqueue({
        accountId: exec.accountId,
        recipient: exec.externalId,
        platform: exec.platform,
        content: responseMessage,
        source: 'async_cli_recall',
        conversationId: exec.conversationId,
        agentId: exec.agenticId,
        userId: exec.userId,
      });
    };

    // Trigger reasoning loop with async_cli_completion event
    logger.info(`[AsyncCLI] Recalling conversation for ${trackingId} (agent=${exec.agenticId}, conversation=${exec.conversationId})`);

    const loopResult = await loop.run(exec.agenticId, 'event', {
      event: 'async_cli_completion',
      platform: exec.platform,
      completionSummary,
      trackingId,
      cliType: exec.cliType,
      fileUrls,
      success: result.success,
      conversationId: exec.conversationId,
      accountId: exec.accountId,
      externalId: exec.externalId,
      _onIntermediateRespond: onIntermediateRespond,
    });

    logger.info(`[AsyncCLI] Recall reasoning loop completed for ${trackingId}: responded=${!!(loopResult?.responded)}`);
    return true; // Recall succeeded (even if AI had issues, it will have sent something)
  }

  /**
   * Deliver a single file to the user via TempFileService + DLQ
   */
  async _deliverFile(exec, file, dlq) {
    const { getTempFileService } = require('../TempFileService.cjs');
    const tempService = getTempFileService();

    // Store file and get download URL
    const buffer = fs.readFileSync(file.fullPath);
    const mimeType = inferMimeType(file.name);
    const stored = tempService.store(exec.userId, buffer, file.name, mimeType, {
      ttlHours: 72,
      source: 'async-cli',
      metadata: { trackingId: exec.trackingId, cliType: exec.cliType },
    });

    if (!stored || !stored.downloadUrl) {
      throw new Error(`TempFileService.store() returned no downloadUrl for ${file.name}`);
    }

    // Enqueue media delivery
    // DLQ → agentManager.sendMessage checks options.media to trigger sendMedia()
    // Use original file path (on disk) for WhatsApp/Telegram to read directly
    const mediaSource = file.fullPath;
    await dlq.enqueue({
      accountId: exec.accountId,
      recipient: exec.externalId,
      platform: exec.platform,
      content: `Generated: ${file.name} (${file.sizeHuman})`,
      contentType: 'media',
      options: JSON.stringify({
        media: mediaSource,
        caption: `Generated: ${file.name} (${file.sizeHuman})`,
        fileName: file.name,
        mimeType,
      }),
      source: 'async_cli_completion',
      conversationId: exec.conversationId,
      agentId: exec.agenticId,
      userId: exec.userId,
    });

    logger.info(`[AsyncCLI] File ${file.name} enqueued for delivery to ${exec.externalId}`);
  }

  /**
   * Send a text message to the user via DLQ
   */
  async _notifyUser(exec, message) {
    if (!exec.accountId || !exec.externalId || !exec.platform) return;

    try {
      const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
      const dlq = getDeliveryQueueService();
      if (!dlq) return;

      await dlq.enqueue({
        accountId: exec.accountId,
        recipient: exec.externalId,
        platform: exec.platform,
        content: message,
        source: 'async_cli_notification',
        conversationId: exec.conversationId,
        agentId: exec.agenticId,
        userId: exec.userId,
      });
    } catch (e) {
      logger.warn(`[AsyncCLI] User notification failed: ${e.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3-layer file detection (adapted from CLIAIProvider.cjs:918-996)
  // ─────────────────────────────────────────────────────────────────────────

  _detectOutputFiles(workspacePath, workspaceSnapshot, startTime, stdout) {
    const detectedPaths = new Set();

    // LAYER 1: Parse [FILE_GENERATED: /path/to/file] markers
    const FILE_MARKER_RE = /\[FILE_GENERATED:\s*([^\]]+)\]/g;
    let markerMatch;
    while ((markerMatch = FILE_MARKER_RE.exec(stdout)) !== null) {
      const markedPath = markerMatch[1].trim();
      if (fs.existsSync(markedPath) && fs.statSync(markedPath).isFile()) {
        detectedPaths.add(path.resolve(markedPath));
      }
    }

    // LAYER 2: Regex scan stdout for absolute paths within workspace
    const escapedWs = workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const PATH_RE = new RegExp(`(${escapedWs}[^\\s"'\\]\\)]+)`, 'g');
    let pathMatch;
    while ((pathMatch = PATH_RE.exec(stdout)) !== null) {
      const foundPath = pathMatch[1].trim().replace(/[.,;:]+$/, '');
      try {
        if (fs.existsSync(foundPath) && fs.statSync(foundPath).isFile()) {
          detectedPaths.add(path.resolve(foundPath));
        }
      } catch { /* skip invalid */ }
    }

    // LAYER 3: Directory diff — find new files not in pre-exec snapshot
    const scanDir = (dir) => {
      try {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const filePath = path.join(dir, entry.name);
          if (entry.name === 'media_input' || entry.name === 'node_modules' || entry.name === '.git') continue;
          if (entry.isDirectory()) { scanDir(filePath); continue; }
          if (!entry.isFile()) continue;
          const resolved = path.resolve(filePath);
          if (detectedPaths.has(resolved)) continue;
          try {
            const stats = fs.statSync(filePath);
            if (!workspaceSnapshot.has(filePath) || stats.mtimeMs >= startTime) {
              detectedPaths.add(resolved);
            }
          } catch { /* skip */ }
        }
      } catch { /* dir not accessible */ }
    };
    scanDir(workspacePath);

    // Build output array
    const outputFiles = [];
    for (const filePath of detectedPaths) {
      try {
        const stats = fs.statSync(filePath);
        const name = path.basename(filePath);
        const size = stats.size;
        outputFiles.push({
          name,
          size,
          sizeHuman: size < 1024 ? `${size}B` : size < 1048576 ? `${(size / 1024).toFixed(1)}KB` : `${(size / 1048576).toFixed(1)}MB`,
          fullPath: filePath,
        });
      } catch { /* skip */ }
    }

    if (outputFiles.length > 0) {
      logger.info(`[AsyncCLI] Detected ${outputFiles.length} output file(s): ${outputFiles.map(f => `${f.name} (${f.sizeHuman})`).join(', ')}`);
    }

    return outputFiles;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // handleLocalAgentResult — called when local agent reports async result
  // ─────────────────────────────────────────────────────────────────────────

  async handleLocalAgentResult(commandId, cmdRecord, result, error) {
    logger.info(`[AsyncCLI] Handling local agent result for ${commandId}`);

    const exec = {
      trackingId: commandId,
      userId: cmdRecord.user_id,
      agenticId: cmdRecord.agentic_profile_id,
      conversationId: null,
      accountId: null,
      externalId: null,
      platform: null,
    };

    // Try to get conversation context from the command params
    try {
      const params = JSON.parse(cmdRecord.params || '{}');
      exec.conversationId = params._conversationId || null;
      exec.accountId = params._accountId || null;
      exec.externalId = params._externalId || null;
      exec.platform = params._platform || null;
    } catch { /* ignore parse errors */ }

    if (error) {
      await this._notifyUser(exec, `Background task on your device failed: ${typeof error === 'string' ? error : error.message || 'Unknown error'}`);
      return;
    }

    // If result has files, try to deliver them
    // Local agent results typically include output text; files stay on the device
    const message = result?.output
      ? result.output.substring(0, 3000)
      : 'Background task on your device completed.';
    await this._notifyUser(exec, message);

    // Emit event
    this._emitEvent('agentic:async-cli:completed', {
      trackingId: commandId,
      source: 'local_agent',
      duration: result?.duration || 0,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // cancelExecution / getStatus
  // ─────────────────────────────────────────────────────────────────────────

  cancelExecution(trackingId) {
    const exec = this._executions.get(trackingId);
    if (!exec) {
      // Try DB
      try {
        const db = getDatabase();
        const record = db.prepare("SELECT status FROM async_cli_executions WHERE id = ?").get(trackingId);
        if (record && record.status === 'running') {
          db.prepare("UPDATE async_cli_executions SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?").run(trackingId);
          return { cancelled: true, note: 'Process not found in memory (may have already completed)' };
        }
        return { cancelled: false, reason: 'Execution not found or already completed' };
      } catch { return { cancelled: false, reason: 'Execution not found' }; }
    }

    this._killProcess(trackingId, 'cancelled');
    return { cancelled: true, trackingId };
  }

  getStatus(trackingId) {
    // Check in-memory first
    const exec = this._executions.get(trackingId);
    if (exec) {
      return {
        trackingId,
        status: 'running',
        cliType: exec.cliType,
        elapsedMs: Date.now() - exec.startTime,
        stdoutLength: exec.stdout.length,
        lastActivityMs: Date.now() - exec.lastOutputTime,
      };
    }

    // Check DB
    try {
      const db = getDatabase();
      const record = db.prepare("SELECT * FROM async_cli_executions WHERE id = ?").get(trackingId);
      if (!record) return null;
      return {
        trackingId,
        status: record.status,
        cliType: record.cli_type,
        deliveryStatus: record.delivery_status,
        outputFiles: JSON.parse(record.output_files || '[]'),
        error: record.error,
        startedAt: record.started_at,
        completedAt: record.completed_at,
      };
    } catch { return null; }
  }

  listActive(userId) {
    try {
      const db = getDatabase();
      return db.prepare(
        "SELECT id, cli_type, status, delivery_status, started_at, completed_at FROM async_cli_executions WHERE user_id = ? AND status IN ('running', 'completed') ORDER BY started_at DESC LIMIT 20"
      ).all(userId);
    } catch { return []; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  _killProcess(trackingId, status = 'failed') {
    const exec = this._executions.get(trackingId);
    if (!exec) return;

    // Clear timers first
    if (exec.staleCheckInterval) clearInterval(exec.staleCheckInterval);
    if (exec.absoluteTimeout) clearTimeout(exec.absoluteTimeout);

    // Kill process (SIGTERM → 5s → SIGKILL)
    try {
      exec.process.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!exec.process.killed) exec.process.kill('SIGKILL');
        } catch { /* already dead */ }
      }, 5000);
    } catch { /* already dead */ }

    // Update DB
    try {
      const db = getDatabase();
      db.prepare(
        "UPDATE async_cli_executions SET status = ?, error = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(status, `Process ${status} after ${Math.round((Date.now() - exec.startTime) / 1000)}s`, trackingId);
    } catch { /* non-fatal */ }

    // Note: _onProcessComplete will also fire from the 'close' event and handle cleanup
    // But since we've already cleared timers, it will just do the delivery/cleanup portion
  }

  _updateLastActivity(trackingId) {
    const exec = this._executions.get(trackingId);
    if (!exec) return;
    try {
      const db = getDatabase();
      db.prepare(
        "UPDATE async_cli_executions SET last_activity_at = datetime('now'), stdout_length = ? WHERE id = ?"
      ).run(exec.stdout.length, trackingId);
    } catch { /* non-fatal */ }
  }

  _setDeliveryStatus(trackingId, status) {
    try {
      const db = getDatabase();
      const delivered = status === 'delivered';
      db.prepare(
        `UPDATE async_cli_executions SET delivery_status = ?${delivered ? ", delivered_at = datetime('now')" : ''} WHERE id = ?`
      ).run(status, trackingId);
    } catch { /* non-fatal */ }
  }

  _emitEvent(event, data) {
    if (this._io) {
      try {
        this._io.emit(event, data);
      } catch { /* non-fatal */ }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // shutdown — clean up on server stop
  // ─────────────────────────────────────────────────────────────────────────

  shutdown() {
    logger.info(`[AsyncCLI] Shutting down, killing ${this._executions.size} active execution(s)`);
    for (const [trackingId] of this._executions) {
      this._killProcess(trackingId, 'failed');
    }
    this._executions.clear();
  }
}


// ── Singleton ──
let _instance = null;

function getAsyncCLIExecutionManager() {
  if (!_instance) {
    _instance = new AsyncCLIExecutionManager();
  }
  return _instance;
}

module.exports = { getAsyncCLIExecutionManager, AsyncCLIExecutionManager };
