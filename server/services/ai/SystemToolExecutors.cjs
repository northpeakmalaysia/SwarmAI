/**
 * System Tool Executors
 *
 * Implements the execution logic for all system tools.
 * Each executor is an async function that takes (params, context) and returns a result.
 *
 * This file registers all executors with the SystemToolsRegistry.
 */

const path = require('path');
const { logger } = require('../logger.cjs');
const { getSystemToolsRegistry } = require('./SystemToolsRegistry.cjs');
const toolApiKeyService = require('../ToolApiKeyService.cjs');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'data', 'media');

/**
 * Resolve a file path that may be just a filename.
 * Tries: absolute/relative path → media cache lookup by filename → scan media dir.
 */
function resolveFilePath(filePath, context = {}) {
  const fs = require('fs');

  // 1. If the path exists as-is, use it
  if (fs.existsSync(filePath)) return filePath;

  // 2. Try as absolute path inside media dir
  const inMediaDir = path.join(MEDIA_DIR, path.basename(filePath));
  if (fs.existsSync(inMediaDir)) return inMediaDir;

  // 3. Look up in media_cache by original filename or message context
  try {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    // Try matching by original filename in metadata or original_url
    const fileName = path.basename(filePath);
    const cached = db.prepare(`
      SELECT local_path FROM media_cache
      WHERE (original_url LIKE ? OR original_url LIKE ?)
      AND local_path IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${fileName}%`, `%${encodeURIComponent(fileName)}%`);

    if (cached?.local_path && fs.existsSync(cached.local_path)) {
      return cached.local_path;
    }

    // Try matching by message metadata containing the filename
    const msgRow = db.prepare(`
      SELECT mc.local_path FROM messages m
      JOIN media_cache mc ON mc.message_id = m.id
      WHERE m.metadata LIKE ?
      AND mc.local_path IS NOT NULL
      ORDER BY m.created_at DESC LIMIT 1
    `).get(`%${fileName}%`);

    if (msgRow?.local_path && fs.existsSync(msgRow.local_path)) {
      return msgRow.local_path;
    }
  } catch (dbErr) {
    logger.debug(`resolveFilePath DB lookup failed: ${dbErr.message}`);
  }

  // 4. Scan media dir for files with matching extension
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext && fs.existsSync(MEDIA_DIR)) {
      const files = fs.readdirSync(MEDIA_DIR)
        .filter(f => f.toLowerCase().endsWith(ext))
        .map(f => ({ name: f, path: path.join(MEDIA_DIR, f), mtime: fs.statSync(path.join(MEDIA_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        logger.info(`resolveFilePath: resolved "${filePath}" to most recent "${files[0].name}" in media dir`);
        return files[0].path;
      }
    }
  } catch (scanErr) {
    logger.debug(`resolveFilePath scan failed: ${scanErr.message}`);
  }

  // Return original - will fail with ENOENT giving a clear error
  return filePath;
}

/**
 * Resolve a file path within an agent's workspace.
 * Tries: absolute within workspace → workspace/output/{basename} → workspace/{basename} → fallback to resolveFilePath()
 * Security: validates path stays within workspace boundary.
 */
function resolveWorkspaceFilePath(filePath, context = {}) {
  const fs = require('fs');

  // 1. If the path is absolute, verify it's within a safe directory (workspace or temp-files)
  //    SECURITY: Do NOT accept arbitrary absolute paths — prevents path traversal
  //    (e.g., AI sending /app/data/media/<incoming-file>.pdf as its own "generated" file)
  if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
    const resolved = path.resolve(filePath);
    const safeRoots = [
      path.resolve('/app/data/workspaces'),
      path.resolve('/app/data/temp-files'),
      // Also allow Windows paths for local dev
      path.resolve(path.join(process.cwd(), 'server', 'data', 'workspaces')),
      path.resolve(path.join(process.cwd(), 'server', 'data', 'temp-files')),
    ];
    const isInSafeRoot = safeRoots.some(root => resolved.startsWith(root));
    if (isInSafeRoot) return filePath;
    // Log blocked path traversal attempt
    logger.warn(`[resolveWorkspaceFilePath] BLOCKED unsafe absolute path: ${filePath} (not in workspace or temp-files)`);
  }

  // 2. Try to find the agent's workspace
  let workspacePath = null;
  try {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    if (context.agenticId) {
      const ws = db.prepare(`
        SELECT workspace_path FROM agentic_workspaces
        WHERE id = ? AND status = 'active'
        LIMIT 1
      `).get(context.agenticId);
      if (ws?.workspace_path) workspacePath = ws.workspace_path;
    }

    if (!workspacePath && context.userId) {
      const ws = db.prepare(`
        SELECT workspace_path FROM agentic_workspaces
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `).get(context.userId);
      if (ws?.workspace_path) workspacePath = ws.workspace_path;
    }
  } catch (e) {
    logger.debug(`resolveWorkspaceFilePath DB lookup failed: ${e.message}`);
  }

  if (workspacePath) {
    const basename = path.basename(filePath);

    // Try workspace/output/{basename}
    const inOutput = path.join(workspacePath, 'output', basename);
    if (fs.existsSync(inOutput)) {
      // Security: verify path stays within workspace
      const resolved = path.resolve(inOutput);
      if (resolved.startsWith(path.resolve(workspacePath))) return resolved;
    }

    // Try workspace/{basename}
    const inWorkspace = path.join(workspacePath, basename);
    if (fs.existsSync(inWorkspace)) {
      const resolved = path.resolve(inWorkspace);
      if (resolved.startsWith(path.resolve(workspacePath))) return resolved;
    }
  }

  // 3. Fallback to general resolveFilePath
  return resolveFilePath(filePath, context);
}

/**
 * Get or create the workspace output directory for an agent.
 * Returns the output dir path, creating it if needed.
 */
function getOrCreateWorkspaceOutputDir(context = {}) {
  const fs = require('fs');

  let workspacePath = null;
  try {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    if (context.agenticId) {
      const ws = db.prepare(`
        SELECT workspace_path FROM agentic_workspaces
        WHERE id = ? AND status = 'active'
        LIMIT 1
      `).get(context.agenticId);
      if (ws?.workspace_path) workspacePath = ws.workspace_path;
    }

    if (!workspacePath && context.userId) {
      const ws = db.prepare(`
        SELECT workspace_path FROM agentic_workspaces
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `).get(context.userId);
      if (ws?.workspace_path) workspacePath = ws.workspace_path;
    }
  } catch (e) {
    logger.debug(`getOrCreateWorkspaceOutputDir DB lookup failed: ${e.message}`);
  }

  if (!workspacePath) {
    // Fallback to temp workspace
    workspacePath = path.join(__dirname, '..', '..', 'data', 'workspaces', 'temp');
  }

  const outputDir = path.join(workspacePath, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return outputDir;
}

/**
 * Sanitize a filename to be safe for filesystem use.
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100) || 'document';
}

/**
 * Find a connected platform account for the given context.
 * Reuses the same lookup logic from sendWhatsApp/sendTelegram executors.
 */
function findPlatformAccount(platform, context) {
  const { getDatabase } = require('../database.cjs');
  const db = getDatabase();
  let accountId = null;

  if (context.agenticId) {
    const profile = db.prepare(
      'SELECT agent_id, response_agent_ids FROM agentic_profiles WHERE id = ?'
    ).get(context.agenticId);

    if (profile) {
      const responseAgentIds = JSON.parse(profile.response_agent_ids || '[]');
      const agentIdsToCheck = [...responseAgentIds];
      if (profile.agent_id) agentIdsToCheck.push(profile.agent_id);

      for (const agId of agentIdsToCheck) {
        const acct = db.prepare(`
          SELECT id FROM platform_accounts
          WHERE agent_id = ? AND platform = ? AND status = 'connected'
          LIMIT 1
        `).get(agId, platform);
        if (acct) {
          accountId = acct.id;
          break;
        }
      }
    }
  }

  if (!accountId && context.userId) {
    const acct = db.prepare(`
      SELECT pa.id FROM platform_accounts pa
      JOIN agents a ON a.id = pa.agent_id
      WHERE a.user_id = ? AND pa.platform = ? AND pa.status = 'connected'
      LIMIT 1
    `).get(context.userId, platform);
    if (acct) accountId = acct.id;
  }

  return accountId;
}

/**
 * Initialize all tool executors
 * Call this during server startup.
 */
function initializeToolExecutors() {
  const registry = getSystemToolsRegistry();

  // ============================================================
  // MESSAGING EXECUTORS
  // ============================================================

  registry.registerExecutor('sendWhatsApp', async (params, context) => {
    const { recipient, message, quotedMessageId } = params;
    const { getDatabase } = require('../database.cjs');
    const { AgentManager } = require('../../agents/agentManager.cjs');
    const db = getDatabase();
    const agentManager = AgentManager.getInstance();

    // Find a WhatsApp account to send from using context
    let accountId = null;

    if (context.agenticId) {
      // Path 1: Agentic profile → response_agent_ids → their WhatsApp accounts
      const profile = db.prepare(
        'SELECT agent_id, response_agent_ids FROM agentic_profiles WHERE id = ?'
      ).get(context.agenticId);

      if (profile) {
        // Check response agents first (they own the WhatsApp accounts)
        const responseAgentIds = JSON.parse(profile.response_agent_ids || '[]');
        const agentIdsToCheck = [...responseAgentIds];
        // Also check the profile's own agent_id
        if (profile.agent_id) agentIdsToCheck.push(profile.agent_id);

        for (const agId of agentIdsToCheck) {
          const wa = db.prepare(`
            SELECT id FROM platform_accounts
            WHERE agent_id = ? AND platform = 'whatsapp' AND status = 'connected'
            LIMIT 1
          `).get(agId);
          if (wa) {
            accountId = wa.id;
            break;
          }
        }
      }
    }

    if (!accountId && context.userId) {
      // Path 2: Find any connected WhatsApp account for this user
      const wa = db.prepare(`
        SELECT pa.id FROM platform_accounts pa
        JOIN agents a ON a.id = pa.agent_id
        WHERE a.user_id = ? AND pa.platform = 'whatsapp' AND pa.status = 'connected'
        LIMIT 1
      `).get(context.userId);
      if (wa) accountId = wa.id;
    }

    if (!accountId) {
      throw new Error('No connected WhatsApp account found for this agent');
    }

    // Format recipient
    const chatId = recipient.includes('@') ? recipient : `${recipient}@c.us`;

    // Send via Delivery Queue (DLQ) for retry safety
    const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const dlqResult = await dlq.enqueue({
      accountId,
      recipient: chatId,
      platform: 'whatsapp',
      content: message,
      options: { quotedMessageId },
      source: 'system_tool',
      sourceContext: 'sendWhatsApp',
      agentId: context.agenticId || null,
      userId: context.userId || null,
    });

    return {
      messageId: dlqResult.deliveryId,
      to: chatId,
      sent: dlqResult.sent,
      queued: dlqResult.queued,
      accountId,
    };
  });

  registry.registerExecutor('sendTelegram', async (params, context) => {
    const { chatId, message, parseMode } = params;
    const { getDatabase } = require('../database.cjs');
    const { AgentManager } = require('../../agents/agentManager.cjs');
    const db = getDatabase();
    const agentManager = AgentManager.getInstance();

    // Find a Telegram account to send from using context
    let accountId = null;

    if (context.agenticId) {
      const profile = db.prepare(
        'SELECT agent_id, response_agent_ids FROM agentic_profiles WHERE id = ?'
      ).get(context.agenticId);

      if (profile) {
        const responseAgentIds = JSON.parse(profile.response_agent_ids || '[]');
        const agentIdsToCheck = [...responseAgentIds];
        if (profile.agent_id) agentIdsToCheck.push(profile.agent_id);

        for (const agId of agentIdsToCheck) {
          const tg = db.prepare(`
            SELECT id FROM platform_accounts
            WHERE agent_id = ? AND platform = 'telegram' AND status = 'connected'
            LIMIT 1
          `).get(agId);
          if (tg) {
            accountId = tg.id;
            break;
          }
        }
      }
    }

    if (!accountId && context.userId) {
      const tg = db.prepare(`
        SELECT pa.id FROM platform_accounts pa
        JOIN agents a ON a.id = pa.agent_id
        WHERE a.user_id = ? AND pa.platform = 'telegram' AND pa.status = 'connected'
        LIMIT 1
      `).get(context.userId);
      if (tg) accountId = tg.id;
    }

    if (!accountId) {
      throw new Error('No connected Telegram account found for this agent');
    }

    // Send via Delivery Queue (DLQ) for retry safety
    const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const dlqResult = await dlq.enqueue({
      accountId,
      recipient: chatId,
      platform: 'telegram',
      content: message,
      options: { parse_mode: parseMode || 'HTML' },
      source: 'system_tool',
      sourceContext: 'sendTelegram',
      agentId: context.agenticId || null,
      userId: context.userId || null,
    });

    return {
      messageId: dlqResult.deliveryId,
      chatId,
      sent: dlqResult.sent,
      queued: dlqResult.queued,
      accountId,
    };
  });

  registry.registerExecutor('sendEmail', async (params, context) => {
    const { to, subject, body, isHtml } = params;

    // Use email service
    const { getEmailService } = require('../emailService.cjs');
    const emailService = getEmailService();

    if (!emailService) {
      throw new Error('Email service not configured');
    }

    await emailService.send({
      to,
      subject,
      text: isHtml ? undefined : body,
      html: isHtml ? body : undefined,
    });

    return {
      to,
      subject,
      sent: true,
    };
  });

  // ============================================================
  // SEND MESSAGE TO CONTACT (by name lookup)
  // ============================================================
  registry.registerExecutor('sendMessageToContact', async (params, context) => {
    const { contactName, message, platform: preferredPlatform } = params;
    const { getDatabase } = require('../database.cjs');
    const { AgentManager } = require('../../agents/agentManager.cjs');
    const db = getDatabase();
    const agentManager = AgentManager.getInstance();

    if (!contactName || !message) {
      throw new Error('Both contactName and message are required');
    }

    // 1. Look up contact by name (fuzzy match)
    const contacts = db.prepare(`
      SELECT c.id, c.display_name, c.user_id
      FROM contacts c
      WHERE c.user_id = ? AND c.display_name LIKE ?
      ORDER BY
        CASE WHEN LOWER(c.display_name) = LOWER(?) THEN 0 ELSE 1 END,
        c.display_name
      LIMIT 5
    `).all(context.userId || 'system', `%${contactName}%`, contactName);

    if (contacts.length === 0) {
      throw new Error(`No contact found matching "${contactName}". Check the name and try again.`);
    }

    const contact = contacts[0]; // Best match

    // 2. Get contact identifiers (phone, email, telegram)
    const identifiers = db.prepare(`
      SELECT identifier_type, identifier_value, platform FROM contact_identifiers WHERE contact_id = ?
    `).all(contact.id);

    if (identifiers.length === 0) {
      throw new Error(`Contact "${contact.display_name}" has no phone/email/telegram identifiers. Cannot send message.`);
    }

    // 3. Determine which platform to use
    const platformOrder = preferredPlatform
      ? [preferredPlatform, 'whatsapp', 'telegram', 'email']
      : ['whatsapp', 'telegram', 'email'];

    let targetPlatform = null;
    let targetIdentifier = null;

    for (const plat of platformOrder) {
      const matchType = plat === 'whatsapp' ? 'phone' : plat;
      const found = identifiers.find(i =>
        i.identifier_type === matchType || i.identifier_type === plat || i.platform === plat
      );
      if (found) {
        targetPlatform = plat;
        targetIdentifier = found.identifier_value;
        break;
      }
    }

    if (!targetPlatform || !targetIdentifier) {
      const availableTypes = identifiers.map(i => i.identifier_type).join(', ');
      throw new Error(`Contact "${contact.display_name}" has identifiers: [${availableTypes}] but none match a connected platform. Cannot send.`);
    }

    // 4. Find a connected platform account
    let accountId = null;
    const platformType = targetPlatform === 'email' ? 'email' : targetPlatform;

    // Check agentic profile first
    if (context.agenticId) {
      const profile = db.prepare(
        'SELECT agent_id, response_agent_ids FROM agentic_profiles WHERE id = ?'
      ).get(context.agenticId);

      if (profile) {
        const responseAgentIds = JSON.parse(profile.response_agent_ids || '[]');
        const agentIdsToCheck = [...responseAgentIds];
        if (profile.agent_id) agentIdsToCheck.push(profile.agent_id);

        for (const agId of agentIdsToCheck) {
          const acct = db.prepare(`
            SELECT id FROM platform_accounts
            WHERE agent_id = ? AND platform = ? AND status = 'connected'
            LIMIT 1
          `).get(agId, platformType);
          if (acct) {
            accountId = acct.id;
            break;
          }
        }
      }
    }

    // Fallback to any connected account for this user
    if (!accountId && context.userId) {
      const acct = db.prepare(`
        SELECT pa.id FROM platform_accounts pa
        JOIN agents a ON a.id = pa.agent_id
        WHERE a.user_id = ? AND pa.platform = ? AND pa.status = 'connected'
        LIMIT 1
      `).get(context.userId, platformType);
      if (acct) accountId = acct.id;
    }

    if (!accountId) {
      throw new Error(`No connected ${targetPlatform} account available to send messages. Please connect a ${targetPlatform} account first.`);
    }

    // 5. Send the message
    if (targetPlatform === 'whatsapp') {
      const chatId = targetIdentifier.includes('@') ? targetIdentifier : `${targetIdentifier.replace(/[^0-9]/g, '')}@c.us`;
      const result = await agentManager.sendMessage(accountId, chatId, message);
      return {
        sent: true,
        to: contact.display_name,
        platform: 'whatsapp',
        identifier: targetIdentifier,
        messageId: result?.id?._serialized || result?.id || 'sent',
        accountId,
      };
    } else if (targetPlatform === 'telegram') {
      const result = await agentManager.sendMessage(accountId, targetIdentifier, message);
      return {
        sent: true,
        to: contact.display_name,
        platform: 'telegram',
        identifier: targetIdentifier,
        messageId: result?.id || 'sent',
        accountId,
      };
    } else if (targetPlatform === 'email') {
      const { getEmailService } = require('../emailService.cjs');
      const emailService = getEmailService();
      if (!emailService) throw new Error('Email service not configured');
      await emailService.send({
        to: targetIdentifier,
        subject: `Message from ${context.agentName || 'AI Agent'}`,
        text: message,
      });
      return {
        sent: true,
        to: contact.display_name,
        platform: 'email',
        identifier: targetIdentifier,
      };
    }

    throw new Error(`Unsupported platform: ${targetPlatform}`);
  });

  registry.registerExecutor('respond', async (params, context) => {
    return {
      message: params.message,
    };
  });

  registry.registerExecutor('clarify', async (params, context) => {
    return {
      question: params.question,
      options: params.options,
      requiresClarification: true,
    };
  });

  // ============================================================
  // WEB EXECUTORS
  // ============================================================

  registry.registerExecutor('searchWeb', async (params, context) => {
    const { query, maxResults = 5 } = params;
    const fetch = (await import('node-fetch')).default;

    // Try to use MCP search if available
    if (global.mcpTools?.search) {
      const results = await global.mcpTools.search(query, maxResults);
      return { results, provider: 'mcp' };
    }

    // Multi-provider search with fallback
    // Get user's configured API keys, ordered by priority
    const keys = context.userId ? toolApiKeyService.getKeysForTool(context.userId, 'searchWeb') : [];
    const errors = [];

    // Try each configured provider in priority order
    for (const keyRecord of keys) {
      if (!keyRecord.is_active) continue;

      try {
        let result;
        switch (keyRecord.provider) {
          case 'brave':
            result = await searchBrave(query, maxResults, keyRecord.api_key, fetch);
            break;
          case 'serper':
            result = await searchSerper(query, maxResults, keyRecord.api_key, fetch);
            break;
          default:
            continue; // Skip unknown providers
        }

        if (result && result.results) {
          // Record successful usage
          toolApiKeyService.recordKeyUsage(keyRecord.id);
          return { ...result, provider: keyRecord.provider };
        }
      } catch (error) {
        logger.warn(`Search provider ${keyRecord.provider} failed: ${error.message}`);
        errors.push({ provider: keyRecord.provider, error: error.message });
        toolApiKeyService.recordKeyError(keyRecord.id, error.message);
        continue; // Try next provider
      }
    }

    // Fallback to DuckDuckGo (no API key required)
    try {
      const result = await searchDuckDuckGo(query, maxResults, fetch);
      return { ...result, provider: 'duckduckgo', fallback: true };
    } catch (error) {
      errors.push({ provider: 'duckduckgo', error: error.message });
    }

    // All providers failed
    if (errors.length > 0) {
      logger.error(`All search providers failed: ${JSON.stringify(errors)}`);
      return {
        results: [],
        provider: null,
        error: `All providers failed. Configure API keys in Settings > Integrations > Tool API Keys.`,
        errors,
      };
    }

    return { results: [], provider: null };
  });

  // Brave Search implementation
  async function searchBrave(query, maxResults, apiKey, fetch) {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      results: (data.web?.results || []).slice(0, maxResults).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      })),
    };
  }

  // Serper.dev implementation
  async function searchSerper(query, maxResults, apiKey, fetch) {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: maxResults }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      results: (data.organic || []).slice(0, maxResults).map(r => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      })),
    };
  }

  // DuckDuckGo Instant Answer API (free, limited)
  async function searchDuckDuckGo(query, maxResults, fetch) {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const results = [];

    // Extract topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, maxResults)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
      }
    }

    // Add abstract if available
    if (data.AbstractText && data.AbstractURL) {
      results.unshift({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    return { results: results.slice(0, maxResults) };
  }

  registry.registerExecutor('fetchWebPage', async (params, context) => {
    const { url, extractText = true } = params;

    const fetch = (await import('node-fetch')).default;

    // Browser-like headers to avoid 403 blocks
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };

    // Retry logic for transient failures
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          headers: browserHeaders,
          timeout: 30000,
          redirect: 'follow',
          compress: true,
        });

        if (!response.ok) {
          // Handle specific status codes
          if (response.status === 403) {
            throw new Error(`HTTP 403: Access forbidden - site may have anti-bot protection`);
          } else if (response.status === 429) {
            // Rate limited - wait and retry
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 2000 * attempt));
              continue;
            }
            throw new Error(`HTTP 429: Rate limited after ${attempt} attempts`);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        if (!extractText) {
          return { html, url };
        }

        // Simple text extraction
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return { text: text.substring(0, 50000), url };
      } catch (error) {
        lastError = error;
        if (attempt < 3 && !error.message.includes('403')) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  });

  registry.registerExecutor('fetchJsPage', async (params, context) => {
    const { url, waitSelector, timeout = 30000 } = params;

    // Try MCP Playwright if available
    if (global.mcpTools?.browserNavigate) {
      await global.mcpTools.browserNavigate(url);

      if (waitSelector) {
        await global.mcpTools.browserWaitFor({ text: waitSelector, time: timeout / 1000 });
      }

      const snapshot = await global.mcpTools.browserSnapshot();
      return { content: snapshot, url };
    }

    // Fallback to regular fetch
    logger.warn('JavaScript rendering not available, falling back to regular fetch');
    return await registry.executeTool('fetchWebPage', params, context);
  });

  registry.registerExecutor('scrapeWebPage', async (params, context) => {
    const { url, selectors, extractAll = false } = params;

    // Fetch the page with browser-like headers
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Simple selector-based extraction using regex
    // For full CSS selector support, would need cheerio or similar
    const extracted = {};

    for (const [field, selector] of Object.entries(selectors || {})) {
      // Simple class/id extraction
      if (selector.startsWith('.')) {
        const className = selector.slice(1);
        const regex = new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]+)`, 'gi');
        const matches = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
          matches.push(match[1].trim());
        }
        extracted[field] = extractAll ? matches : (matches[0] || null);
      } else if (selector.startsWith('#')) {
        const id = selector.slice(1);
        const regex = new RegExp(`id="${id}"[^>]*>([^<]+)`, 'i');
        const match = html.match(regex);
        extracted[field] = match ? match[1].trim() : null;
      } else {
        // Tag name
        const regex = new RegExp(`<${selector}[^>]*>([^<]+)</${selector}>`, 'gi');
        const matches = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
          matches.push(match[1].trim());
        }
        extracted[field] = extractAll ? matches : (matches[0] || null);
      }
    }

    return { data: extracted, url };
  });

  registry.registerExecutor('httpRequest', async (params, context) => {
    const { url, method = 'GET', headers = {}, body } = params;

    const fetch = (await import('node-fetch')).default;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (body && method !== 'GET') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';

    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    };
  });

  // ============================================================
  // AI EXECUTORS
  // ============================================================

  registry.registerExecutor('aiChat', async (params, context) => {
    const { prompt, systemPrompt, model, temperature = 0.7 } = params;

    const { getSuperBrainRouter } = require('./SuperBrainRouter.cjs');
    const router = getSuperBrainRouter();

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const result = await router.process({
      messages,
      userId: context.userId,
      temperature,
    });

    return {
      response: result.content,
      model: result.model,
      usage: result.usage,
    };
  });

  registry.registerExecutor('aiClassify', async (params, context) => {
    const { text, categories } = params;

    const systemPrompt = `You are a text classifier. Classify the following text into one of these categories: ${categories.join(', ')}.
Respond with ONLY a JSON object: {"category": "chosen_category", "confidence": 0.0-1.0}`;

    const { getSuperBrainRouter } = require('./SuperBrainRouter.cjs');
    const router = getSuperBrainRouter();

    const result = await router.process({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      userId: context.userId,
      temperature: 0.3,
    });

    try {
      const parsed = JSON.parse(result.content);
      return {
        category: parsed.category,
        confidence: parsed.confidence,
        text: text.substring(0, 100),
      };
    } catch {
      return {
        category: result.content.trim(),
        confidence: 0.5,
        text: text.substring(0, 100),
      };
    }
  });

  registry.registerExecutor('aiExtract', async (params, context) => {
    const { text, schema } = params;

    const systemPrompt = `Extract the following information from the text: ${JSON.stringify(schema)}.
Respond with ONLY a JSON object matching this schema. Use null for missing values.`;

    const { getSuperBrainRouter } = require('./SuperBrainRouter.cjs');
    const router = getSuperBrainRouter();

    const result = await router.process({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      userId: context.userId,
      temperature: 0.2,
    });

    try {
      const extracted = JSON.parse(result.content);
      return { extracted };
    } catch {
      return { extracted: {}, raw: result.content };
    }
  });

  registry.registerExecutor('aiTranslate', async (params, context) => {
    const { text, targetLanguage, sourceLanguage } = params;

    const systemPrompt = sourceLanguage
      ? `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Respond with ONLY the translation.`
      : `Translate the following text to ${targetLanguage}. Respond with ONLY the translation.`;

    const { getSuperBrainRouter } = require('./SuperBrainRouter.cjs');
    const router = getSuperBrainRouter();

    const result = await router.process({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      userId: context.userId,
      temperature: 0.3,
    });

    return {
      translation: result.content.trim(),
      targetLanguage,
      sourceLanguage: sourceLanguage || 'auto',
    };
  });

  registry.registerExecutor('aiSummarize', async (params, context) => {
    const { text, maxLength, style = 'brief' } = params;

    let instruction;
    switch (style) {
      case 'bullet':
        instruction = 'Summarize in bullet points';
        break;
      case 'detailed':
        instruction = 'Provide a detailed summary';
        break;
      default:
        instruction = 'Provide a brief summary';
    }

    if (maxLength) {
      instruction += ` in about ${maxLength} words`;
    }

    const { getSuperBrainRouter } = require('./SuperBrainRouter.cjs');
    const router = getSuperBrainRouter();

    const result = await router.process({
      messages: [
        { role: 'system', content: `${instruction}. Be concise and accurate.` },
        { role: 'user', content: text },
      ],
      userId: context.userId,
      temperature: 0.5,
    });

    return {
      summary: result.content.trim(),
      style,
      originalLength: text.length,
    };
  });

  // ============================================================
  // CLI AI EXECUTORS (Agentic)
  // ============================================================

  registry.registerExecutor('claudeCliPrompt', async (params, context) => {
    const { prompt, mediaFiles, workspaceId, timeout = 300, model } = params;
    return await executeCLITool('claude', prompt, {
      mediaFiles, workspaceId, timeout, model, userId: context.userId,
      _triggerContext: context._triggerContext || null, // Forward for async CLI delivery
    });
  });

  registry.registerExecutor('geminiCliPrompt', async (params, context) => {
    const { prompt, mediaFiles, workspaceId, timeout = 300, model } = params;
    return await executeCLITool('gemini', prompt, {
      mediaFiles, workspaceId, timeout, model, userId: context.userId,
      _triggerContext: context._triggerContext || null,
    });
  });

  registry.registerExecutor('opencodeCliPrompt', async (params, context) => {
    const { prompt, mediaFiles, workspaceId, timeout = 300, model } = params;
    return await executeCLITool('opencode', prompt, {
      mediaFiles, workspaceId, timeout, model, userId: context.userId,
      _triggerContext: context._triggerContext || null,
    });
  });

  /**
   * Infer MIME type from file extension for createdFiles enrichment.
   */
  function _inferMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
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
    return MIME_MAP[ext] || 'application/octet-stream';
  }

  /**
   * Execute a CLI AI tool
   * @param {string} cliType - CLI type (claude, gemini, opencode)
   * @param {string} prompt - The prompt/task
   * @param {Object} options - Execution options
   * @returns {Promise<Object>}
   */
  async function executeCLITool(cliType, prompt, options = {}) {
    const fs = require('fs');
    const { getCLIAIProvider, CLI_CONFIGS } = require('./providers/CLIAIProvider.cjs');
    const cliProvider = getCLIAIProvider();

    // Check authentication using direct method (not getAuthStatus which returns all CLIs)
    if (!cliProvider.isAuthenticated(cliType)) {
      return {
        success: false,
        error: `${cliType} CLI not authenticated. Please authenticate in Settings > CLI Tools.`,
        authRequired: true,
        cliType,
      };
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return {
        success: false,
        error: 'prompt is required and must be a non-empty string.',
        cliType,
      };
    }

    const config = CLI_CONFIGS[cliType];
    const timeoutMs = Math.min((options.timeout || 300) * 1000, 3600000); // Max 1 hour
    const startTime = Date.now();
    logger.info(`[CLITool] Starting ${cliType} CLI (timeout: ${timeoutMs}ms, prompt length: ${prompt.length} chars)`);

    // ── ASYNC CLI DETECTION ──
    // If the requested timeout exceeds the reasoning loop's safe budget (3.5 min),
    // switch to async background execution so the reasoning loop can return immediately.
    // The CLI process runs in background and results are delivered to the user via
    // a recalled reasoning loop + DLQ when complete.
    const SYNC_THRESHOLD_MS = 3.5 * 60 * 1000; // 3.5 min (leave 30s buffer before 4-min hard timeout)
    const shouldGoAsync = options.async === true || timeoutMs > SYNC_THRESHOLD_MS;

    if (shouldGoAsync && options._triggerContext) {
      try {
        return await _executeAsyncCLI(cliType, prompt, options, timeoutMs, cliProvider, config);
      } catch (asyncErr) {
        logger.warn(`[CLITool] Async CLI setup failed, falling back to sync: ${asyncErr.message}`);
        // Fall through to synchronous path (with original timeout, may hit reasoning loop timeout)
      }
    }

    try {
      // ── Media file bridge: copy server-side media files into CLI workspace ──
      // CLI tools run in /app/data/workspaces/{userId}/{agentId}/ but media files
      // are stored at /app/data/media/. Copy them so the CLI process can see them.
      let modifiedPrompt = prompt;
      let effectiveWorkspaceId = options.workspaceId;

      if (options.mediaFiles && Array.isArray(options.mediaFiles) && options.mediaFiles.length > 0) {
        // Pre-create workspace so we can copy files BEFORE CLI execution starts.
        // IMPORTANT: Save the workspace ID so execute() reuses the SAME workspace.
        const workspace = await cliProvider.getOrCreateWorkspace(options.userId, options.workspaceId, cliType);
        effectiveWorkspaceId = workspace.id;

        const mediaTargetDir = path.join(workspace.path, 'media_input');
        if (!fs.existsSync(mediaTargetDir)) {
          fs.mkdirSync(mediaTargetDir, { recursive: true });
        }

        const copiedFiles = [];
        for (const srcPath of options.mediaFiles) {
          const resolved = resolveFilePath(srcPath);
          if (fs.existsSync(resolved)) {
            const destPath = path.join(mediaTargetDir, path.basename(resolved));
            fs.copyFileSync(resolved, destPath);
            copiedFiles.push({ original: srcPath, local: destPath, relativeName: `media_input/${path.basename(resolved)}` });
            logger.info(`[CLITool] Copied media file to workspace: ${resolved} → ${destPath}`);
          } else {
            logger.warn(`[CLITool] Media file not found, skipping: ${srcPath}`);
          }
        }

        // Append file location info to the prompt so the CLI knows where to find them
        if (copiedFiles.length > 0) {
          const fileList = copiedFiles.map(f => `- ${f.relativeName}`).join('\n');
          modifiedPrompt += `\n\nThe following files have been placed in the workspace for you to access:\n${fileList}\nThey are in the media_input/ subdirectory of your working directory.`;
          logger.info(`[CLITool] Bridged ${copiedFiles.length} media file(s) into workspace ${effectiveWorkspaceId}`);
        }
      }

      // ── FILE OUTPUT INSTRUCTION (WhatsBots pattern) ──
      // Inject mandatory rules so the CLI knows WHERE to save files and how to announce them.
      // This enables 3-layer detection in CLIAIProvider.execute() to find created files.
      // Use a sentinel marker instead of checking for '[FILE_GENERATED:' which could false-match user input.
      const FILE_RULES_SENTINEL = '<!-- swarm_file_rules_injected -->';
      if (!modifiedPrompt.includes(FILE_RULES_SENTINEL)) {
        let wsPath = null;
        try {
          const workspace = await cliProvider.getOrCreateWorkspace(options.userId, effectiveWorkspaceId, cliType);
          wsPath = workspace.path;
          effectiveWorkspaceId = workspace.id; // ensure same workspace is reused
        } catch (e) {
          logger.debug(`[CLITool] Could not resolve workspace for file instruction: ${e.message}`);
        }

        if (wsPath) {
          const outputDir = path.join(wsPath, 'output');
          // Ensure output dir exists
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          const uniquePrefix = `swarm_${Date.now()}`;
          modifiedPrompt += `
${FILE_RULES_SENTINEL}
## FILE GENERATION RULES (MANDATORY)
- Save ALL generated files to: ${outputDir}/
- Use the filename prefix "${uniquePrefix}_" for all generated files
- After creating ANY file, you MUST output EXACTLY this line:
  [FILE_GENERATED: ${outputDir}/${uniquePrefix}_<actualfilename.ext>]
- Example: [FILE_GENERATED: ${outputDir}/${uniquePrefix}_report.docx]
- Do NOT skip this marker — it is required for the system to detect your output.
- Do NOT show raw source code to the user — execute code yourself and deliver the final result.
`;
          logger.debug(`[CLITool] Injected file output instruction (prefix: ${uniquePrefix})`);
        }
      }

      // execute(task, options) — task is the prompt string, options has cliType/userId/etc.
      // Use effectiveWorkspaceId so execute() reuses the same workspace where media files were copied.
      // Forward model via context so buildCommand() can pass --model flag to CLI.
      const result = await cliProvider.execute(modifiedPrompt, {
        cliType,
        userId: options.userId,
        workspaceId: effectiveWorkspaceId,
        timeout: timeoutMs,
        context: {
          model: options.model || undefined,
        },
      });

      const elapsed = Date.now() - startTime;
      logger.info(`[CLITool] ${cliType} CLI completed in ${elapsed}ms, content length: ${(result.content || '').length}, outputFiles: ${(result.outputFiles || []).length}`);

      // Build response — execute() returns {content, outputFiles, workspace, duration, ...}
      const response = {
        success: true,
        response: result.content || '(no text output)',
        cliType,
        model: result.provider || `cli-${cliType}`,
        duration: result.duration || elapsed,
        workspace: result.workspace,
      };

      // ── Script filtering + createdFiles enrichment ──
      // If CLI created both scripts (.py/.js) AND document files (.docx/.pdf), filter out scripts.
      let detectedFiles = result.outputFiles || [];
      if (detectedFiles.length > 0) {
        const SCRIPT_EXTS = new Set(['.py', '.js', '.ts', '.sh', '.rb', '.go', '.rs', '.java']);
        const DOCUMENT_EXTS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.html', '.json', '.zip']);
        const hasScripts = detectedFiles.some(f => SCRIPT_EXTS.has(path.extname(f.name).toLowerCase()));
        const hasDocuments = detectedFiles.some(f => DOCUMENT_EXTS.has(path.extname(f.name).toLowerCase()));

        if (hasScripts && hasDocuments) {
          const before = detectedFiles.length;
          detectedFiles = detectedFiles.filter(f => !SCRIPT_EXTS.has(path.extname(f.name).toLowerCase()));
          logger.info(`[CLITool] Script filtering: removed ${before - detectedFiles.length} script(s), kept ${detectedFiles.length} document(s)`);
        }

        // Build createdFiles with MIME type enrichment
        response.createdFiles = detectedFiles.map(f => ({
          name: f.name,
          size: f.sizeHuman,
          filePath: f.fullPath,
          mimeType: _inferMimeType(f.name),
        }));
        // Keep generatedFiles for backward compatibility
        response.generatedFiles = response.createdFiles;
        response.response += `\n\nGenerated files:\n${detectedFiles.map(f => `- ${f.name} (${f.sizeHuman}) at ${f.fullPath}`).join('\n')}`;

        // ── AUTO-DELIVER FILES TO USER (Synchronous CLI path) ──
        // The async CLI path has its own _deliverFile() mechanism.
        // For synchronous execution, we auto-deliver detected files via DLQ
        // because the reasoning loop's summarizeToolResult() truncation and
        // respond cap may prevent the AI from calling sendWhatsAppMedia separately.
        const triggerCtx = options._triggerContext || {};
        const acctId = triggerCtx.accountId;
        const extId = triggerCtx.externalId;
        const plat = triggerCtx.platform || 'whatsapp';

        if (acctId && extId) {
          try {
            const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
            const { getTempFileService } = require('../TempFileService.cjs');
            const dlq = getDeliveryQueueService();
            const tempService = getTempFileService();
            let autoDelivered = 0;

            for (const file of detectedFiles) {
              try {
                const fileBuffer = fs.readFileSync(file.fullPath);
                const mimeType = _inferMimeType(file.name);
                const stored = tempService.store(options.userId, fileBuffer, file.name, mimeType, {
                  ttlHours: 72,
                  source: 'cli-sync-auto',
                  metadata: { cliType },
                });

                if (stored) {
                  // DLQ → agentManager.sendMessage checks options.media to trigger sendMedia()
                  // Use the original workspace file path directly (it's on disk, fast for WhatsApp/Telegram)
                  const mediaSource = file.fullPath;
                  await dlq.enqueue({
                    accountId: acctId,
                    recipient: extId,
                    platform: plat,
                    content: `${file.name} (${file.sizeHuman})`,
                    contentType: 'media',
                    options: JSON.stringify({
                      media: mediaSource,
                      caption: `${file.name} (${file.sizeHuman})`,
                      fileName: file.name,
                      mimeType,
                    }),
                    source: 'cli_sync_auto_delivery',
                    conversationId: triggerCtx.conversationId || null,
                    agentId: triggerCtx.agenticId || null,
                    userId: options.userId,
                  });
                  autoDelivered++;
                  logger.info(`[CLITool] Auto-delivered file ${file.name} via DLQ to ${extId}`);
                }
              } catch (fileErr) {
                logger.warn(`[CLITool] Auto-delivery failed for ${file.name}: ${fileErr.message}`);
              }
            }

            if (autoDelivered > 0) {
              response.autoDelivered = autoDelivered;
              response.response += `\n\n[${autoDelivered} FILE(S) AUTO-DELIVERED TO USER — do NOT call sendWhatsAppMedia/sendTelegramMedia again for these files]`;
            }
          } catch (dlqErr) {
            logger.warn(`[CLITool] Auto-delivery setup error: ${dlqErr.message}`);
          }
        }
      }

      return response;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error(`[CLITool] ${cliType} CLI failed after ${elapsed}ms: ${error.message}`);
      return {
        success: false,
        error: error.message,
        cliType,
        duration: elapsed,
      };
    }
  }

  /**
   * Execute a CLI tool asynchronously in the background.
   * Returns immediately with a tracking ID; actual process runs in background.
   * When the process completes, results are delivered to the user via a recalled
   * reasoning loop + DLQ.
   *
   * @param {string} cliType - CLI type (claude, gemini, opencode)
   * @param {string} prompt - The prompt/task
   * @param {Object} options - Execution options (including _triggerContext)
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {Object} cliProvider - CLIAIProvider instance
   * @param {Object} config - CLI_CONFIGS entry
   * @returns {Promise<Object>} Immediate result with async:true and trackingId
   */
  async function _executeAsyncCLI(cliType, prompt, options, timeoutMs, cliProvider, config) {
    const { getAsyncCLIExecutionManager } = require('./AsyncCLIExecutionManager.cjs');
    const manager = getAsyncCLIExecutionManager();
    const fs = require('fs');
    const triggerCtx = options._triggerContext || {};

    logger.info(`[CLITool] Switching to ASYNC mode for ${cliType} CLI (timeout: ${timeoutMs}ms)`);

    // ── Same workspace + media prep as sync path ──
    let modifiedPrompt = prompt;
    let effectiveWorkspaceId = options.workspaceId;

    // Media file bridge
    if (options.mediaFiles && Array.isArray(options.mediaFiles) && options.mediaFiles.length > 0) {
      const workspace = await cliProvider.getOrCreateWorkspace(options.userId, options.workspaceId, cliType);
      effectiveWorkspaceId = workspace.id;
      const mediaTargetDir = path.join(workspace.path, 'media_input');
      if (!fs.existsSync(mediaTargetDir)) fs.mkdirSync(mediaTargetDir, { recursive: true });
      const copiedFiles = [];
      for (const srcPath of options.mediaFiles) {
        const resolved = resolveFilePath(srcPath);
        if (fs.existsSync(resolved)) {
          const destPath = path.join(mediaTargetDir, path.basename(resolved));
          fs.copyFileSync(resolved, destPath);
          copiedFiles.push({ relativeName: `media_input/${path.basename(resolved)}` });
        }
      }
      if (copiedFiles.length > 0) {
        modifiedPrompt += `\n\nThe following files have been placed in the workspace for you to access:\n${copiedFiles.map(f => `- ${f.relativeName}`).join('\n')}\nThey are in the media_input/ subdirectory of your working directory.`;
      }
    }

    // File output instruction injection
    const FILE_RULES_SENTINEL = '<!-- swarm_file_rules_injected -->';
    if (!modifiedPrompt.includes(FILE_RULES_SENTINEL)) {
      try {
        const workspace = await cliProvider.getOrCreateWorkspace(options.userId, effectiveWorkspaceId, cliType);
        effectiveWorkspaceId = workspace.id;
        const outputDir = path.join(workspace.path, 'output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const uniquePrefix = `swarm_${Date.now()}`;
        modifiedPrompt += `\n${FILE_RULES_SENTINEL}\n## FILE GENERATION RULES (MANDATORY)\n- Save ALL generated files to: ${outputDir}/\n- Use the filename prefix "${uniquePrefix}_" for all generated files\n- After creating ANY file, you MUST output EXACTLY this line:\n  [FILE_GENERATED: ${outputDir}/${uniquePrefix}_<actualfilename.ext>]\n- Example: [FILE_GENERATED: ${outputDir}/${uniquePrefix}_report.docx]\n- Do NOT skip this marker — it is required for the system to detect your output.\n- Do NOT show raw source code to the user — execute code yourself and deliver the final result.\n`;
      } catch (e) {
        logger.debug(`[CLITool] Async: Could not inject file rules: ${e.message}`);
      }
    }

    // Get workspace and build command
    const workspace = await cliProvider.getOrCreateWorkspace(options.userId, effectiveWorkspaceId, cliType);
    const command = cliProvider.buildCommand(modifiedPrompt, cliType, workspace, {
      model: options.model || undefined,
    });

    // Take workspace snapshot for 3-layer file detection
    const workspaceSnapshot = new Set();
    const _snap = (dir) => {
      try {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile()) workspaceSnapshot.add(fullPath);
          else if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') _snap(fullPath);
        }
      } catch { /* best-effort */ }
    };
    _snap(workspace.path);

    // Send immediate notification to user
    if (typeof triggerCtx._onIntermediateRespond === 'function') {
      try {
        const cliName = cliType.charAt(0).toUpperCase() + cliType.slice(1);
        await triggerCtx._onIntermediateRespond(
          `Working on your request using ${cliName} CLI. This may take several minutes — I'll send you the result when it's ready.`
        );
      } catch (_) {}
    }

    // Start background execution
    const trackingId = await manager.startExecution(cliType, command, workspace.path, {
      userId: options.userId,
      agenticId: triggerCtx.agenticId || null,
      conversationId: triggerCtx.conversationId || null,
      accountId: triggerCtx.accountId || null,
      externalId: triggerCtx.externalId || null,
      platform: triggerCtx.platform || null,
      workspaceSnapshot,
      timeoutMs,
      staleThresholdMs: options.staleThresholdMs || 5 * 60 * 1000,
    });

    logger.info(`[CLITool] Async execution started: ${trackingId} (cli=${cliType})`);

    // Return immediately to reasoning loop
    return {
      success: true,
      async: true,
      trackingId,
      cliType,
      response: `Background task started (tracking: ${trackingId}). The ${cliType} CLI is now working on your request. Results will be delivered automatically when complete.`,
      message: `IMPORTANT: The CLI task is running in the background. The result will be delivered to the user automatically — do NOT wait for it. Proceed with "done" or handle other tasks.`,
    };
  }

  // ============================================================
  // FILE EXECUTORS
  // ============================================================

  registry.registerExecutor('readPdf', async (params, context) => {
    const { filePath, pages } = params;

    try {
      const fs = require('fs').promises;
      const pdfParse = require('pdf-parse');

      const resolvedPath = resolveFilePath(filePath, context);
      logger.info(`readPdf: resolved "${filePath}" → "${resolvedPath}"`);

      const buffer = await fs.readFile(resolvedPath);
      const data = await pdfParse(buffer);

      return {
        text: data.text,
        numPages: data.numpages,
        info: data.info,
      };
    } catch (error) {
      throw new Error(`Failed to read PDF: ${error.message}`);
    }
  });

  registry.registerExecutor('readExcel', async (params, context) => {
    const { filePath, sheet, range } = params;

    try {
      const xlsx = require('xlsx');

      const resolvedPath = resolveFilePath(filePath, context);
      logger.info(`readExcel: resolved "${filePath}" → "${resolvedPath}"`);

      const workbook = xlsx.readFile(resolvedPath);
      const sheetName = sheet || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      const jsonData = xlsx.utils.sheet_to_json(worksheet, { range });

      return {
        data: jsonData,
        sheet: sheetName,
        sheets: workbook.SheetNames,
      };
    } catch (error) {
      throw new Error(`Failed to read Excel: ${error.message}`);
    }
  });

  registry.registerExecutor('readDocx', async (params, context) => {
    const { filePath } = params;

    try {
      const fs = require('fs');
      const mammoth = require('mammoth');

      const resolvedPath = resolveFilePath(filePath, context);
      logger.info(`readDocx: resolved "${filePath}" → "${resolvedPath}"`);

      const buffer = fs.readFileSync(resolvedPath);
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        messages: result.messages.filter(m => m.type === 'warning').map(m => m.message),
      };
    } catch (error) {
      throw new Error(`Failed to read Word document: ${error.message}`);
    }
  });

  registry.registerExecutor('readText', async (params, context) => {
    const { filePath, encoding } = params;

    try {
      const fs = require('fs');

      const resolvedPath = resolveFilePath(filePath, context);
      logger.info(`readText: resolved "${filePath}" → "${resolvedPath}"`);

      const content = fs.readFileSync(resolvedPath, encoding || 'utf-8');

      // Try to detect if it's JSON and parse it
      const ext = resolvedPath.split('.').pop()?.toLowerCase();
      if (ext === 'json') {
        try {
          const parsed = JSON.parse(content);
          return { text: content, parsed, format: 'json' };
        } catch {
          // Not valid JSON, return as text
        }
      }

      return {
        text: content,
        format: ext || 'text',
        size: Buffer.byteLength(content, encoding || 'utf-8'),
      };
    } catch (error) {
      throw new Error(`Failed to read text file: ${error.message}`);
    }
  });

  registry.registerExecutor('readCsv', async (params, context) => {
    const { filePath, delimiter, maxRows } = params;

    try {
      const fs = require('fs');

      const resolvedPath = resolveFilePath(filePath, context);
      logger.info(`readCsv: resolved "${filePath}" → "${resolvedPath}"`);

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const lines = content.split(/\r?\n/).filter(line => line.trim());

      // Auto-detect delimiter
      const firstLine = lines[0] || '';
      const detectedDelimiter = delimiter ||
        (firstLine.includes('\t') ? '\t' :
         firstLine.includes(';') ? ';' : ',');

      // Parse header
      const headers = firstLine.split(detectedDelimiter).map(h => h.trim().replace(/^"|"$/g, ''));

      // Parse rows
      const limit = Math.min(maxRows || 1000, lines.length - 1);
      const rows = [];
      for (let i = 1; i <= limit; i++) {
        if (!lines[i]) continue;
        const values = lines[i].split(detectedDelimiter).map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        rows.push(row);
      }

      return {
        data: rows,
        headers,
        totalRows: lines.length - 1,
        delimiter: detectedDelimiter === '\t' ? 'TAB' : detectedDelimiter,
      };
    } catch (error) {
      throw new Error(`Failed to read CSV: ${error.message}`);
    }
  });

  registry.registerExecutor('generatePdf', async (params, context) => {
    const { content, title = 'document', isHtml } = params;
    const fs = require('fs');
    const outputDir = getOrCreateWorkspaceOutputDir(context);
    const fileName = `${sanitizeFilename(title)}.pdf`;
    const fullPath = path.join(outputDir, fileName);

    try {
      if (isHtml) {
        // HTML → PDF via puppeteer
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        try {
          const page = await browser.newPage();
          // Block external resources for security
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font'].includes(type) && req.url().startsWith('data:')) {
              req.continue();
            } else if (req.url().startsWith('data:') || req.url().startsWith('about:')) {
              req.continue();
            } else if (['document', 'stylesheet', 'font', 'image'].includes(type)) {
              // Allow inline and local resources only
              req.continue();
            } else {
              req.continue();
            }
          });
          await page.setContent(content, { waitUntil: 'networkidle0', timeout: 15000 });
          await page.pdf({
            path: fullPath,
            format: 'A4',
            margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
            printBackground: true,
          });
        } finally {
          await browser.close();
        }
      } else {
        // Plain text → PDF via pdf-lib
        const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 11;
        const margin = 50;
        const lineHeight = fontSize * 1.4;

        // Word-wrap and paginate
        const lines = [];
        for (const paragraph of content.split('\n')) {
          if (paragraph.trim() === '') {
            lines.push('');
            continue;
          }
          const words = paragraph.split(/\s+/);
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const width = font.widthOfTextAtSize(testLine, fontSize);
            if (width > 595 - 2 * margin) { // A4 width in points
              if (currentLine) lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const linesPerPage = Math.floor((842 - 2 * margin) / lineHeight); // A4 height
        for (let i = 0; i < lines.length; i += linesPerPage) {
          const page = pdfDoc.addPage([595, 842]); // A4
          const pageLines = lines.slice(i, i + linesPerPage);
          let y = 842 - margin;
          for (const line of pageLines) {
            page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
            y -= lineHeight;
          }
        }

        if (pdfDoc.getPageCount() === 0) {
          pdfDoc.addPage([595, 842]); // Add blank page if no content
        }

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(fullPath, pdfBytes);
      }

      const stats = fs.statSync(fullPath);
      logger.info(`Generated PDF: ${fullPath} (${stats.size} bytes)`);

      return {
        filePath: fileName,
        fullPath,
        size: stats.size,
        sizeHuman: stats.size < 1024 ? `${stats.size}B` : stats.size < 1048576 ? `${(stats.size / 1024).toFixed(1)}KB` : `${(stats.size / 1048576).toFixed(1)}MB`,
        message: `PDF "${fileName}" generated successfully (${stats.size < 1024 ? stats.size + 'B' : (stats.size / 1024).toFixed(1) + 'KB'}). Use sendWhatsAppMedia, sendTelegramMedia, or sendEmailAttachment to deliver it.`,
      };
    } catch (error) {
      logger.error(`Failed to generate PDF: ${error.message}`);
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  });

  // ============================================================
  // GENERATE EXCEL EXECUTOR
  // ============================================================
  registry.registerExecutor('generateExcel', async (params, context) => {
    const { data, sheetName = 'Sheet1', title = 'export' } = params;
    const fs = require('fs');
    const XLSX = require('xlsx');

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('data must be a non-empty array of objects');
    }

    const outputDir = getOrCreateWorkspaceOutputDir(context);
    const fileName = `${sanitizeFilename(title)}.xlsx`;
    const fullPath = path.join(outputDir, fileName);

    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, fullPath);

      const stats = fs.statSync(fullPath);
      const columnCount = Object.keys(data[0] || {}).length;

      logger.info(`Generated Excel: ${fullPath} (${data.length} rows, ${columnCount} cols, ${stats.size} bytes)`);

      return {
        filePath: fileName,
        fullPath,
        size: stats.size,
        sizeHuman: stats.size < 1024 ? `${stats.size}B` : stats.size < 1048576 ? `${(stats.size / 1024).toFixed(1)}KB` : `${(stats.size / 1048576).toFixed(1)}MB`,
        rowCount: data.length,
        columnCount,
        message: `Excel "${fileName}" generated (${data.length} rows, ${columnCount} columns). Use sendWhatsAppMedia, sendTelegramMedia, or sendEmailAttachment to deliver it.`,
      };
    } catch (error) {
      logger.error(`Failed to generate Excel: ${error.message}`);
      throw new Error(`Excel generation failed: ${error.message}`);
    }
  });

  // ============================================================
  // GENERATE CSV EXECUTOR
  // ============================================================
  registry.registerExecutor('generateCsv', async (params, context) => {
    const { data, title = 'export', delimiter = ',' } = params;
    const fs = require('fs');

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('data must be a non-empty array of objects');
    }

    const outputDir = getOrCreateWorkspaceOutputDir(context);
    const fileName = `${sanitizeFilename(title)}.csv`;
    const fullPath = path.join(outputDir, fileName);

    try {
      // Build CSV with proper quoting
      const headers = Object.keys(data[0]);
      const escapeCell = (val) => {
        const str = val == null ? '' : String(val);
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const lines = [headers.map(escapeCell).join(delimiter)];
      for (const row of data) {
        lines.push(headers.map(h => escapeCell(row[h])).join(delimiter));
      }

      fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');

      const stats = fs.statSync(fullPath);

      logger.info(`Generated CSV: ${fullPath} (${data.length} rows, ${stats.size} bytes)`);

      return {
        filePath: fileName,
        fullPath,
        size: stats.size,
        sizeHuman: stats.size < 1024 ? `${stats.size}B` : stats.size < 1048576 ? `${(stats.size / 1024).toFixed(1)}KB` : `${(stats.size / 1048576).toFixed(1)}MB`,
        rowCount: data.length,
        message: `CSV "${fileName}" generated (${data.length} rows). Use sendWhatsAppMedia, sendTelegramMedia, or sendEmailAttachment to deliver it.`,
      };
    } catch (error) {
      logger.error(`Failed to generate CSV: ${error.message}`);
      throw new Error(`CSV generation failed: ${error.message}`);
    }
  });

  // ============================================================
  // GENERATE DOCX EXECUTOR
  // ============================================================
  registry.registerExecutor('generateDocx', async (params, context) => {
    const { title = 'document' } = params;
    let { content } = params;
    const fs = require('fs');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } = require('docx');

    if (!content) {
      throw new Error('content is required. Pass a plain text string OR an array of block objects like [{"type":"heading1","text":"Title"}, {"type":"paragraph","text":"Body text"}]');
    }

    // Auto-convert plain text string to structured blocks
    if (typeof content === 'string') {
      const lines = content.split('\n');
      content = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue; // skip empty lines
        // Auto-detect headings by common patterns (# Markdown, ALL CAPS short lines, numbered sections like "1. Title")
        if (/^#{1,3}\s+/.test(trimmed)) {
          const level = trimmed.match(/^(#{1,3})/)[1].length;
          content.push({ type: `heading${level}`, text: trimmed.replace(/^#{1,3}\s+/, '') });
        } else if (/^\d+\.\s+[A-Z]/.test(trimmed) && trimmed.length < 80) {
          content.push({ type: 'heading2', text: trimmed });
        } else if (/^[-•]\s+/.test(trimmed)) {
          content.push({ type: 'bullet', text: trimmed.replace(/^[-•]\s+/, '') });
        } else {
          content.push({ type: 'paragraph', text: trimmed });
        }
      }
      if (content.length === 0) {
        throw new Error('content string was empty after parsing. Provide actual text content.');
      }
    }

    if (!Array.isArray(content) || content.length === 0) {
      throw new Error('content must be a non-empty string or array of block objects, e.g. [{"type":"heading1","text":"Title"}, {"type":"paragraph","text":"Body text"}]');
    }

    const outputDir = getOrCreateWorkspaceOutputDir(context);
    const fileName = `${sanitizeFilename(title)}.docx`;
    const fullPath = path.join(outputDir, fileName);

    try {
      const children = [];

      for (const block of content) {
        const type = (block.type || 'paragraph').toLowerCase();
        const text = block.text || '';

        switch (type) {
          case 'heading1':
          case 'h1':
            children.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1 }));
            break;
          case 'heading2':
          case 'h2':
            children.push(new Paragraph({ text, heading: HeadingLevel.HEADING_2 }));
            break;
          case 'heading3':
          case 'h3':
            children.push(new Paragraph({ text, heading: HeadingLevel.HEADING_3 }));
            break;
          case 'paragraph':
          case 'p':
            children.push(new Paragraph({ children: [new TextRun(text)] }));
            break;
          case 'bullet': {
            const items = Array.isArray(text) ? text : [text];
            for (const item of items) {
              children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
            }
            break;
          }
          case 'numbered': {
            const items = Array.isArray(text) ? text : [text];
            for (const item of items) {
              children.push(new Paragraph({ text: item, numbering: { reference: 'default-numbering', level: 0 } }));
            }
            break;
          }
          case 'pagebreak':
          case 'page_break':
            children.push(new Paragraph({ children: [new PageBreak()] }));
            break;
          default:
            children.push(new Paragraph({ children: [new TextRun(text)] }));
        }
      }

      const doc = new Document({
        numbering: {
          config: [{
            reference: 'default-numbering',
            levels: [{
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
            }],
          }],
        },
        sections: [{ children }],
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(fullPath, buffer);

      const stats = fs.statSync(fullPath);

      logger.info(`Generated DOCX: ${fullPath} (${content.length} blocks, ${stats.size} bytes)`);

      return {
        filePath: fileName,
        fullPath,
        size: stats.size,
        sizeHuman: stats.size < 1024 ? `${stats.size}B` : stats.size < 1048576 ? `${(stats.size / 1024).toFixed(1)}KB` : `${(stats.size / 1048576).toFixed(1)}MB`,
        blockCount: content.length,
        message: `Word document "${fileName}" generated (${content.length} content blocks). Use sendWhatsAppMedia, sendTelegramMedia, or sendEmailAttachment to deliver it.`,
      };
    } catch (error) {
      logger.error(`Failed to generate DOCX: ${error.message}`);
      throw new Error(`DOCX generation failed: ${error.message}`);
    }
  });

  // ============================================================
  // LIST WORKSPACE FILES EXECUTOR
  // ============================================================
  registry.registerExecutor('listWorkspaceFiles', async (params, context) => {
    const { pattern } = params;
    const fs = require('fs');
    const outputDir = getOrCreateWorkspaceOutputDir(context);

    try {
      const entries = fs.readdirSync(outputDir);
      let files = entries
        .map(name => {
          const filePath = path.join(outputDir, name);
          try {
            const stats = fs.statSync(filePath);
            if (!stats.isFile()) return null;
            return {
              name,
              size: stats.size,
              sizeHuman: stats.size < 1024 ? `${stats.size}B` : stats.size < 1048576 ? `${(stats.size / 1024).toFixed(1)}KB` : `${(stats.size / 1048576).toFixed(1)}MB`,
              modified: stats.mtime.toISOString(),
              extension: path.extname(name).toLowerCase(),
            };
          } catch { return null; }
        })
        .filter(Boolean);

      // Filter by extension pattern if provided
      if (pattern) {
        const ext = pattern.startsWith('.') ? pattern.toLowerCase() : `.${pattern.toLowerCase()}`;
        files = files.filter(f => f.extension === ext);
      }

      // Sort by modified desc
      files.sort((a, b) => new Date(b.modified) - new Date(a.modified));

      return {
        files,
        count: files.length,
        directory: outputDir,
      };
    } catch (error) {
      return { files: [], count: 0, directory: outputDir };
    }
  });

  // ============================================================
  // SEND WHATSAPP MEDIA EXECUTOR
  // ============================================================
  registry.registerExecutor('sendWhatsAppMedia', async (params, context) => {
    const { recipient, filePath: rawFilePath, caption } = params;
    const fs = require('fs');

    // Check if the filePath is a download URL (from Local Agent uploads or temp files)
    const isUrl = rawFilePath.startsWith('http://') || rawFilePath.startsWith('https://') || rawFilePath.startsWith('/api/temp-files/');
    let mediaPath;
    let fileName;

    if (isUrl) {
      if (rawFilePath.startsWith('/api/temp-files/download/')) {
        // Resolve temp file directly from disk (avoid HTTP roundtrip within same server)
        const token = rawFilePath.replace('/api/temp-files/download/', '');
        const { getTempFileService } = require('../TempFileService.cjs');
        const tempService = getTempFileService();
        const fileInfo = tempService.getByToken(token);
        if (!fileInfo || !fs.existsSync(fileInfo.local_path)) {
          throw new Error(`Temp file not found or expired. Token: ${token}`);
        }
        mediaPath = fileInfo.local_path;
        fileName = fileInfo.original_name || 'file';
      } else if (rawFilePath.startsWith('http://') || rawFilePath.startsWith('https://')) {
        mediaPath = rawFilePath;
        fileName = rawFilePath.split('/').pop() || 'file';
      } else {
        throw new Error(`Unsupported URL format: "${rawFilePath}"`);
      }
    } else {
      // Resolve as workspace file path
      const resolvedPath = resolveWorkspaceFilePath(rawFilePath, context);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: "${rawFilePath}". Generate a document first using generatePdf, generateDocx, generateExcel, or generateCsv, or provide a download URL.`);
      }

      // Check file size (WhatsApp limit: 64MB)
      const stats = fs.statSync(resolvedPath);
      if (stats.size > 64 * 1024 * 1024) {
        throw new Error(`File too large (${(stats.size / 1048576).toFixed(1)}MB). WhatsApp limit is 64MB.`);
      }
      mediaPath = resolvedPath;
      fileName = path.basename(resolvedPath);
    }

    // Find WhatsApp account — prefer conversation's account if available
    const accountId = context.accountId || findPlatformAccount('whatsapp', context);
    if (!accountId) {
      throw new Error('No connected WhatsApp account found for this agent');
    }

    // Resolve recipient: prefer conversation's external_id (the actual chat ID)
    // AI often passes a contact name (e.g., "Lupes") instead of a phone number
    let chatId;
    if (recipient && recipient.includes('@')) {
      // Already a valid chat ID (e.g., "6281234567890@c.us")
      chatId = recipient;
    } else if (context.externalId) {
      // Use the originating conversation's chat ID (most reliable)
      chatId = context.externalId;
    } else if (recipient && /^\d+$/.test(recipient)) {
      // Pure digits — treat as phone number
      chatId = `${recipient}@c.us`;
    } else {
      // Name-based recipient — try to resolve from conversation context
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      if (context.conversationId) {
        const conv = db.prepare('SELECT external_id FROM conversations WHERE id = ?').get(context.conversationId);
        if (conv?.external_id) {
          chatId = conv.external_id;
        }
      }
      if (!chatId) {
        // Last resort: try contact lookup by name
        const contact = db.prepare(
          "SELECT ci.identifier FROM contacts c JOIN contact_identifiers ci ON c.id = ci.contact_id WHERE ci.platform = 'whatsapp' AND (c.display_name LIKE ? OR c.display_name = ?) LIMIT 1"
        ).get(`%${recipient}%`, recipient);
        chatId = contact?.identifier ? `${contact.identifier}@c.us` : `${recipient}@c.us`;
      }
    }

    // Send via DLQ with media option
    const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const dlqResult = await dlq.enqueue({
      accountId,
      recipient: chatId,
      platform: 'whatsapp',
      content: caption || fileName,
      options: { media: mediaPath },
      source: 'system_tool',
      sourceContext: 'sendWhatsAppMedia',
      agentId: context.agenticId || null,
      userId: context.userId || null,
    });

    return {
      messageId: dlqResult.deliveryId,
      to: chatId,
      sent: dlqResult.sent,
      queued: dlqResult.queued,
      accountId,
      fileName,
    };
  });

  // ============================================================
  // SEND TELEGRAM MEDIA EXECUTOR
  // ============================================================
  registry.registerExecutor('sendTelegramMedia', async (params, context) => {
    const { chatId, filePath: rawFilePath, caption } = params;
    const fs = require('fs');

    // Resolve the file path within workspace
    const resolvedPath = resolveWorkspaceFilePath(rawFilePath, context);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: "${rawFilePath}". Generate a document first using generatePdf, generateDocx, generateExcel, or generateCsv.`);
    }

    // Check file size (Telegram limit: 50MB)
    const stats = fs.statSync(resolvedPath);
    if (stats.size > 50 * 1024 * 1024) {
      throw new Error(`File too large (${(stats.size / 1048576).toFixed(1)}MB). Telegram limit is 50MB.`);
    }

    // Find Telegram account
    const accountId = findPlatformAccount('telegram', context);
    if (!accountId) {
      throw new Error('No connected Telegram account found for this agent');
    }

    // Send via DLQ with media option
    const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const dlqResult = await dlq.enqueue({
      accountId,
      recipient: chatId,
      platform: 'telegram',
      content: caption || path.basename(resolvedPath),
      options: { media: resolvedPath, mediaType: 'document' },
      source: 'system_tool',
      sourceContext: 'sendTelegramMedia',
      agentId: context.agenticId || null,
      userId: context.userId || null,
    });

    return {
      messageId: dlqResult.deliveryId,
      chatId,
      sent: dlqResult.sent,
      queued: dlqResult.queued,
      accountId,
      fileName: path.basename(resolvedPath),
      fileSize: stats.size,
    };
  });

  // ============================================================
  // SEND EMAIL ATTACHMENT EXECUTOR
  // ============================================================
  registry.registerExecutor('sendEmailAttachment', async (params, context) => {
    const { to, subject, body, filePath: rawFilePath, isHtml } = params;
    const fs = require('fs');

    // Resolve the file path within workspace
    const resolvedPath = resolveWorkspaceFilePath(rawFilePath, context);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: "${rawFilePath}". Generate a document first using generatePdf, generateDocx, generateExcel, or generateCsv.`);
    }

    const { sendEmailWithAttachments } = require('../emailService.cjs');
    const fileName = path.basename(resolvedPath);

    await sendEmailWithAttachments(
      to,
      subject,
      isHtml ? body : undefined,
      isHtml ? undefined : body,
      [{ filename: fileName, path: resolvedPath }]
    );

    return {
      to,
      subject,
      sent: true,
      fileName,
      fileSize: fs.statSync(resolvedPath).size,
    };
  });

  // ============================================================
  // VISION EXECUTORS (OCR)
  // ============================================================

  registry.registerExecutor('extractTextFromImage', async (params, context) => {
    const { imagePath, languages } = params;

    const { visionService } = require('../vision/VisionAnalysisService.cjs');

    // Get user's preferred OCR languages from settings if not specified
    let ocrLanguages = languages;
    if (!ocrLanguages && context.userId) {
      try {
        const { getDatabase } = require('../database.cjs');
        const db = getDatabase();
        const settings = db.prepare(`
          SELECT ocr_languages FROM superbrain_settings WHERE user_id = ?
        `).get(context.userId);
        if (settings?.ocr_languages) {
          ocrLanguages = settings.ocr_languages;
        }
      } catch (e) {
        logger.debug(`Could not load OCR settings for user: ${e.message}`);
      }
    }

    const result = await visionService.extractTextFromUrl(imagePath, {
      languages: ocrLanguages,
    });

    return {
      text: result.text,
      confidence: result.confidence,
      language: result.language,
      duration: result.duration,
    };
  });

  registry.registerExecutor('analyzeImageMessage', async (params, context) => {
    const { messageId, mediaUrl, languages, minConfidence = 0.3 } = params;

    const { visionService } = require('../vision/VisionAnalysisService.cjs');
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    // Get message if messageId provided
    let imagePath = mediaUrl;
    let message;

    if (messageId) {
      message = db.prepare(`
        SELECT id, content, media_url, media_local_path, content_type
        FROM messages WHERE id = ?
      `).get(messageId);

      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      imagePath = message.media_local_path || message.media_url;
    }

    if (!imagePath) {
      throw new Error('No image path available for OCR');
    }

    // Get user's preferred OCR languages from settings if not specified
    let ocrLanguages = languages;
    if (!ocrLanguages && context.userId) {
      try {
        const settings = db.prepare(`
          SELECT ocr_languages FROM superbrain_settings WHERE user_id = ?
        `).get(context.userId);
        if (settings?.ocr_languages) {
          ocrLanguages = settings.ocr_languages;
        }
      } catch (e) {
        logger.debug(`Could not load OCR settings for user: ${e.message}`);
      }
    }

    const result = await visionService.analyzeImageMessage(
      { mediaUrl: imagePath, mediaLocalPath: message?.media_local_path },
      { languages: ocrLanguages, minConfidence }
    );

    // Update message content if OCR successful and message exists
    if (result.shouldUpdate && messageId && result.extractedText) {
      try {
        // Update message content with OCR text (preserve original type as image)
        db.prepare(`
          UPDATE messages
          SET content = ?,
              metadata = json_set(COALESCE(metadata, '{}'), '$.ocrExtracted', 1, '$.ocrConfidence', ?, '$.ocrLanguage', ?)
          WHERE id = ?
        `).run(result.extractedText, result.confidence, result.language, messageId);

        logger.info(`Updated message ${messageId} with OCR text (${result.extractedText.length} chars, confidence: ${result.confidence})`);
      } catch (e) {
        logger.error(`Failed to update message with OCR text: ${e.message}`);
      }
    }

    return {
      messageId,
      extractedText: result.extractedText,
      confidence: result.confidence,
      language: result.language,
      duration: result.duration,
      updated: result.shouldUpdate && !!messageId,
    };
  });

  // ============================================================
  // SCHEDULING EXECUTORS
  // ============================================================

  registry.registerExecutor('createReminder', async (params, context) => {
    const { message, datetime, recipient } = params;

    // Parse datetime
    let reminderTime;
    if (datetime.startsWith('in ')) {
      // Relative time like "in 1 hour"
      const match = datetime.match(/in (\d+) (minute|hour|day)s?/i);
      if (match) {
        const amount = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const ms = unit === 'minute' ? 60000 : unit === 'hour' ? 3600000 : 86400000;
        reminderTime = new Date(Date.now() + amount * ms);
      }
    } else {
      reminderTime = new Date(datetime);
    }

    if (!reminderTime || isNaN(reminderTime.getTime())) {
      throw new Error(`Invalid datetime: ${datetime}`);
    }

    // Store reminder (simplified - would use database)
    const reminder = {
      id: require('uuid').v4(),
      message,
      scheduledFor: reminderTime.toISOString(),
      recipient: recipient || context.userId,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    // TODO: Store in database and schedule with node-cron

    return {
      reminder,
      message: `Reminder set for ${reminderTime.toLocaleString()}`,
    };
  });

  registry.registerExecutor('listReminders', async (params, context) => {
    const { status = 'pending' } = params;

    // TODO: Fetch from database
    return {
      reminders: [],
      count: 0,
      status,
    };
  });

  registry.registerExecutor('cancelReminder', async (params, context) => {
    const { reminderId } = params;

    // TODO: Cancel in database

    return {
      cancelled: true,
      reminderId,
    };
  });

  // ============================================================
  // DATA TRANSFORM EXECUTORS
  // ============================================================

  registry.registerExecutor('jsonParse', async (params, context) => {
    const { text, path } = params;

    const parsed = JSON.parse(text);

    if (path) {
      // Simple JSONPath-like access
      const parts = path.split('.');
      let value = parsed;
      for (const part of parts) {
        if (value === undefined) break;
        value = value[part];
      }
      return { value, path };
    }

    return { parsed };
  });

  registry.registerExecutor('jsonStringify', async (params, context) => {
    const { data, pretty } = params;
    const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    return { json };
  });

  registry.registerExecutor('regexExtract', async (params, context) => {
    const { text, pattern, flags = 'g' } = params;

    const regex = new RegExp(pattern, flags);
    const matches = [];
    let match;

    if (flags.includes('g')) {
      while ((match = regex.exec(text)) !== null) {
        matches.push(match[0]);
      }
    } else {
      match = text.match(regex);
      if (match) {
        matches.push(match[0]);
      }
    }

    return { matches, count: matches.length };
  });

  registry.registerExecutor('templateString', async (params, context) => {
    const { template, data } = params;

    const result = template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const parts = path.split('.');
      let value = data;
      for (const part of parts) {
        if (value === undefined) return match;
        value = value[part];
      }
      return value !== undefined ? String(value) : match;
    });

    return { result };
  });

  // ============================================================
  // FLOW EXECUTORS
  // ============================================================

  registry.registerExecutor('triggerFlow', async (params, context) => {
    const { flowId, inputs } = params;

    const { getFlowExecutionEngine } = require('../flow/FlowExecutionEngine.cjs');
    const { getDatabase } = require('../database.cjs');

    const db = getDatabase();
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId);

    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const engine = getFlowExecutionEngine();
    const result = await engine.execute(flow, {
      input: inputs,
      userId: context.userId,
      trigger: { type: 'tool', source: 'triggerFlow' },
    });

    return {
      executionId: result.id,
      status: result.status,
      output: result.output,
    };
  });

  // ============================================================
  // RAG EXECUTORS
  // ============================================================

  registry.registerExecutor('ragQuery', async (params, context) => {
    const { query, libraryId, libraryIds, topK = 5, minScore = 0.3, generateResponse = true } = params;

    const { getRetrievalService } = require('../rag/index.cjs');
    const { getDatabase } = require('../database.cjs');
    const retrieval = getRetrievalService();
    const db = getDatabase();

    // Determine target libraries
    let targetLibraryIds = libraryIds || (libraryId ? [libraryId] : []);

    // If no libraries specified, use all of the user's libraries
    if (targetLibraryIds.length === 0 && context.userId) {
      const userLibraries = db.prepare(
        'SELECT id FROM knowledge_libraries WHERE user_id = ?'
      ).all(context.userId);
      targetLibraryIds = userLibraries.map(l => l.id);
    }

    if (targetLibraryIds.length === 0) {
      return {
        query,
        chunks: [],
        totalResults: 0,
        searchedLibraries: 0,
        response: generateResponse ? 'No knowledge libraries available. Please add documents to a knowledge library first.' : undefined,
      };
    }

    // Execute RAG retrieval
    const result = await retrieval.retrieve(query, {
      libraryIds: targetLibraryIds,
      topK: parseInt(topK),
      minScore: parseFloat(minScore),
      userId: context.userId,
    });

    // Generate context-aware response from chunks if requested
    let aiResponse = undefined;
    if (generateResponse && result.chunks.length > 0) {
      const ragContext = retrieval.generateContext(
        result.chunks.map(c => ({ content: c.text, ...c })),
        { maxTokens: 2000 }
      );

      // Build a response that includes source information
      const sourceList = result.chunks.slice(0, 3).map(c =>
        `- ${c.document?.fileName || 'Unknown'} (score: ${c.score?.toFixed(2)})`
      ).join('\n');

      aiResponse = `Based on ${result.chunks.length} knowledge base result(s):\n\n${ragContext}\n\nSources:\n${sourceList}`;
    } else if (generateResponse) {
      aiResponse = `No relevant information found in the knowledge base for: "${query}"`;
    }

    return {
      query: result.query,
      chunks: result.chunks,
      totalResults: result.totalResults,
      searchedLibraries: result.searchedLibraries,
      response: aiResponse,
    };
  });

  // ============================================================
  // SWARM EXECUTORS
  // ============================================================

  /**
   * Helper: Get all available handoff/broadcast candidates (team members + AI agents)
   */
  function _getAvailableCandidates(agenticId, userId, targetType = 'all') {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const candidates = [];

    // Get human team members
    if (targetType === 'all' || targetType === 'team') {
      try {
        const teamMembers = db.prepare(`
          SELECT tm.*, c.display_name as contact_name, c.avatar
          FROM agentic_team_members tm
          LEFT JOIN contacts c ON tm.contact_id = c.id
          WHERE tm.agentic_id = ? AND tm.user_id = ? AND tm.is_active = 1
        `).all(agenticId, userId);

        for (const tm of teamMembers) {
          let skills = [];
          try { skills = JSON.parse(tm.skills || '[]'); } catch (e) { /* skip */ }

          candidates.push({
            id: tm.id,
            type: 'team_member',
            name: tm.contact_name || 'Unknown',
            role: tm.role || '',
            skills: Array.isArray(skills) ? skills : [],
            department: tm.department || '',
            contactId: tm.contact_id,
            isAvailable: tm.is_available === 1,
            preferredChannel: tm.preferred_channel || 'email',
            maxConcurrentTasks: tm.max_concurrent_tasks || 3,
            tasksCompleted: tm.tasks_completed || 0,
            rating: tm.rating || 5.0,
          });
        }
      } catch (e) {
        logger.debug(`[Handoff] Failed to fetch team members: ${e.message}`);
      }
    }

    // Get AI agents (other agentic profiles for the same user)
    if (targetType === 'all' || targetType === 'agent') {
      try {
        const agenticProfiles = db.prepare(`
          SELECT ap.id, ap.name, ap.role, ap.description, ap.agent_id,
                 ap.agent_type, ap.status
          FROM agentic_profiles ap
          WHERE ap.user_id = ? AND ap.id != ? AND ap.status != 'archived'
        `).all(userId, agenticId);

        for (const ap of agenticProfiles) {
          // Get agent skills from agentic_agent_skills
          let skills = [];
          try {
            const agentSkills = db.prepare(`
              SELECT asc2.name FROM agentic_agent_skills aas
              JOIN agentic_skills_catalog asc2 ON aas.skill_id = asc2.id
              WHERE aas.agentic_id = ?
            `).all(ap.id);
            skills = agentSkills.map(s => s.name);
          } catch (e) { /* skills table may not exist */ }

          candidates.push({
            id: ap.id,
            type: 'agentic_agent',
            name: ap.name,
            role: ap.role || '',
            skills,
            department: '',
            agentId: ap.agent_id,
            agentType: ap.agent_type,
            description: ap.description || '',
            status: ap.status || 'active',
          });
        }
      } catch (e) {
        logger.debug(`[Handoff] Failed to fetch agentic profiles: ${e.message}`);
      }

      // Also get regular agents (non-agentic)
      try {
        const agents = db.prepare(`
          SELECT a.id, a.name, a.description, a.status
          FROM agents a
          WHERE a.user_id = ?
            AND a.id NOT IN (SELECT agent_id FROM agentic_profiles WHERE agent_id IS NOT NULL AND user_id = ?)
        `).all(userId, userId);

        for (const agent of agents) {
          candidates.push({
            id: agent.id,
            type: 'agent',
            name: agent.name,
            role: '',
            skills: [],
            department: '',
            description: agent.description || '',
            status: agent.status || 'active',
          });
        }
      } catch (e) {
        logger.debug(`[Handoff] Failed to fetch agents: ${e.message}`);
      }
    }

    return candidates;
  }

  /**
   * Helper: Score candidates against task description and required skills using keyword matching
   */
  function _scoreCandidates(candidates, taskDescription, requiredSkills) {
    const taskWords = (taskDescription || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const reqSkills = (requiredSkills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

    return candidates.map(candidate => {
      let score = 0;
      const matchedOn = [];

      // Build searchable text from candidate fields
      const candidateRole = (candidate.role || '').toLowerCase();
      const candidateSkills = (candidate.skills || []).map(s => s.toLowerCase());
      const candidateDept = (candidate.department || '').toLowerCase();
      const candidateDesc = (candidate.description || '').toLowerCase();
      const candidateName = (candidate.name || '').toLowerCase();

      // Match required skills against candidate skills (highest weight)
      for (const req of reqSkills) {
        if (candidateSkills.some(s => s.includes(req) || req.includes(s))) {
          score += 30;
          matchedOn.push(`skill:${req}`);
        }
        if (candidateRole.includes(req)) {
          score += 15;
          matchedOn.push(`role:${req}`);
        }
      }

      // Match task words against candidate attributes
      for (const word of taskWords) {
        if (candidateSkills.some(s => s.includes(word))) {
          score += 10;
          if (!matchedOn.includes(`task-skill:${word}`)) matchedOn.push(`task-skill:${word}`);
        }
        if (candidateRole.includes(word)) {
          score += 8;
          if (!matchedOn.includes(`task-role:${word}`)) matchedOn.push(`task-role:${word}`);
        }
        if (candidateDept.includes(word)) {
          score += 5;
          if (!matchedOn.includes(`task-dept:${word}`)) matchedOn.push(`task-dept:${word}`);
        }
        if (candidateDesc.includes(word)) {
          score += 3;
          if (!matchedOn.includes(`task-desc:${word}`)) matchedOn.push(`task-desc:${word}`);
        }
        if (candidateName.includes(word)) {
          score += 2;
          if (!matchedOn.includes(`task-name:${word}`)) matchedOn.push(`task-name:${word}`);
        }
      }

      // Availability bonus for team members
      if (candidate.type === 'team_member' && candidate.isAvailable) {
        score += 5;
      }

      // Rating bonus
      if (candidate.rating && candidate.rating >= 4.0) {
        score += Math.floor(candidate.rating);
      }

      return { ...candidate, score, matchedOn };
    }).sort((a, b) => b.score - a.score);
  }

  // ---------- handoffToAgent executor ----------
  registry.registerExecutor('handoffToAgent', async (params, context) => {
    const {
      taskDescription,
      targetName,
      targetId,
      requiredSkills,
      reason,
      context: handoffContext,
      conversationId,
      targetType = 'all',
    } = params;

    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const userId = context.userId;

    // Find the calling agentic profile
    let agenticId = context.agenticId;
    if (!agenticId && context.agentId) {
      // Direct match: agentic profile linked to this agent
      const profile = db.prepare(
        'SELECT id FROM agentic_profiles WHERE agent_id = ? AND user_id = ?'
      ).get(context.agentId, userId);
      agenticId = profile?.id;

      // Fallback: find agentic profile that monitors this agent (via response_agent_ids)
      if (!agenticId) {
        try {
          const profiles = db.prepare(
            "SELECT id, response_agent_ids FROM agentic_profiles WHERE user_id = ? AND response_agent_ids IS NOT NULL"
          ).all(userId);
          for (const p of profiles) {
            const responseAgentIds = JSON.parse(p.response_agent_ids || '[]');
            if (responseAgentIds.includes(context.agentId)) {
              agenticId = p.id;
              break;
            }
          }
        } catch (e) { /* parse error, skip */ }
      }
    }

    if (!agenticId) {
      return { error: 'No agentic profile found for this agent. Handoff requires an agentic profile.' };
    }

    // Get all candidates
    const candidates = _getAvailableCandidates(agenticId, userId, targetType);

    if (candidates.length === 0) {
      return {
        error: 'No team members or agents available for handoff.',
        suggestion: 'Add team members in the Agentic profile settings, or create additional AI agents.',
      };
    }

    let selectedCandidate = null;

    // Direct target by ID
    if (targetId) {
      selectedCandidate = candidates.find(c => c.id === targetId);
      if (!selectedCandidate) {
        return { error: `Target with ID "${targetId}" not found among available candidates.` };
      }
    }

    // Direct target by name (fuzzy match)
    if (!selectedCandidate && targetName) {
      const nameLower = targetName.toLowerCase();
      selectedCandidate = candidates.find(c => c.name.toLowerCase() === nameLower);
      if (!selectedCandidate) {
        // Partial match
        selectedCandidate = candidates.find(c => c.name.toLowerCase().includes(nameLower));
      }
      if (!selectedCandidate) {
        // Return available options
        const available = candidates.map(c => `${c.name} (${c.type}, role: ${c.role || 'N/A'})`).join(', ');
        return {
          error: `No candidate matching name "${targetName}" found.`,
          availableCandidates: available,
        };
      }
    }

    // Auto-select best match based on skills/role scoring
    if (!selectedCandidate) {
      const scored = _scoreCandidates(candidates, taskDescription, requiredSkills);
      selectedCandidate = scored[0];

      if (scored[0].score === 0) {
        // No keyword matches found - log and add alternatives to result
        logger.info(`[Handoff] No skill matches found, selecting first available: ${selectedCandidate.name}`);
        selectedCandidate._noMatch = true;
        selectedCandidate._alternatives = scored.slice(1, 5).map(c => ({
          name: c.name, type: c.type, role: c.role,
        }));
      } else {
        logger.info(`[Handoff] Best match: ${selectedCandidate.name} (score: ${selectedCandidate.score}, matched: ${selectedCandidate.matchedOn.join(', ')})`);
      }
    }

    // Create the handoff record
    const handoffId = require('uuid').v4();
    try {
      const fromAgentId = context.agentId || null;
      const toAgentId = selectedCandidate.type === 'agent' ? selectedCandidate.id :
                        selectedCandidate.type === 'agentic_agent' ? selectedCandidate.agentId :
                        null; // team_member has no agent ID

      // For agent targets, use HandoffService (requires valid agent IDs)
      // For team members, skip handoff record (to_agent_id is NOT NULL in DB)
      let handoff = null;
      if (toAgentId) {
        const { getHandoffService } = require('../swarm/HandoffService.cjs');
        const handoffService = getHandoffService();
        handoff = await handoffService.createHandoff({
          userId,
          conversationId: conversationId || context.conversationId || null,
          fromAgentId: fromAgentId,
          toAgentId: toAgentId,
          reason: reason || taskDescription,
          context: handoffContext || taskDescription,
          autoAccept: true,
        });
      } else {
        // Team member handoff - create a lightweight record in activity log only
        handoff = { id: handoffId, status: 'completed' };
      }

      // Log to agentic activity
      try {
        db.prepare(`
          INSERT INTO agentic_activity_log (id, agentic_id, user_id, activity_type, trigger_type, details, created_at)
          VALUES (?, ?, ?, 'handoff', 'tool_call', ?, datetime('now'))
        `).run(
          require('uuid').v4(),
          agenticId,
          userId,
          JSON.stringify({
            handoffId: handoff.id,
            targetName: selectedCandidate.name,
            targetType: selectedCandidate.type,
            targetRole: selectedCandidate.role,
            taskDescription,
            requiredSkills,
            matchScore: selectedCandidate.score || 0,
          })
        );
      } catch (e) { /* activity log optional */ }

      // If target is a team member, send task message via their preferred channel
      if (selectedCandidate.type === 'team_member' && selectedCandidate.contactId) {
        try {
          const { AgentManager } = require('../../agents/agentManager.cjs');
          const agentManager = AgentManager.getInstance();
          const taskMsg = `*Task Assigned to You*\n\n${taskDescription}\n\n_Reason: ${reason || 'Auto-assigned based on your skills'}_`;

          // Get all contact identifiers for this team member
          const identifiers = db.prepare(`
            SELECT identifier_type, identifier_value FROM contact_identifiers
            WHERE contact_id = ?
          `).all(selectedCandidate.contactId);

          // Build lookup map: { whatsapp: '628...', telegram: '123456', email: 'a@b.com', phone: '628...' }
          const idMap = {};
          for (const id of identifiers) { idMap[id.identifier_type] = id.identifier_value; }

          // Resolve response agents' platform accounts for sending
          const profile = db.prepare('SELECT response_agent_ids FROM agentic_profiles WHERE id = ?').get(agenticId);
          const responseAgentIds = JSON.parse(profile?.response_agent_ids || '[]');

          const findAccount = (platform) => {
            // Prefer the account that received the original message
            if (context.accountId) {
              const acc = db.prepare('SELECT id, platform FROM platform_accounts WHERE id = ? AND platform = ? AND status = ?')
                .get(context.accountId, platform, 'connected');
              if (acc) return acc.id;
            }
            // Search through response agents
            for (const agId of responseAgentIds) {
              const acc = db.prepare('SELECT id FROM platform_accounts WHERE agent_id = ? AND platform = ? AND status = ? LIMIT 1')
                .get(agId, platform, 'connected');
              if (acc) return acc.id;
            }
            // Fallback: any connected account for this user
            const acc = db.prepare(`
              SELECT pa.id FROM platform_accounts pa JOIN agents a ON a.id = pa.agent_id
              WHERE a.user_id = ? AND pa.platform = ? AND pa.status = 'connected' LIMIT 1
            `).get(userId, platform);
            return acc?.id || null;
          };

          // Try channels in priority order: preferred > whatsapp > telegram > email
          const preferred = selectedCandidate.preferredChannel || 'whatsapp';
          const channelOrder = [preferred, 'whatsapp', 'telegram', 'email'].filter((v, i, a) => a.indexOf(v) === i);
          let sent = false;

          for (const channel of channelOrder) {
            if (sent) break;
            try {
              if (channel === 'whatsapp' && (idMap.whatsapp || idMap.phone)) {
                const phone = idMap.whatsapp || idMap.phone;
                const accountId = findAccount('whatsapp');
                if (accountId) {
                  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
                  await agentManager.sendMessage(accountId, chatId, taskMsg);
                  logger.info(`[Handoff] Task sent to ${selectedCandidate.name} via WhatsApp`);
                  sent = true;
                }
              } else if (channel === 'telegram' && idMap.telegram) {
                const accountId = findAccount('telegram');
                if (accountId) {
                  await agentManager.sendMessage(accountId, idMap.telegram, taskMsg);
                  logger.info(`[Handoff] Task sent to ${selectedCandidate.name} via Telegram`);
                  sent = true;
                }
              } else if (channel === 'email' && idMap.email) {
                const { getEmailService } = require('../emailService.cjs');
                const emailService = getEmailService();
                if (emailService) {
                  await emailService.send({
                    to: idMap.email,
                    subject: `Task Assigned: ${taskDescription.substring(0, 80)}`,
                    text: taskMsg.replace(/[*_]/g, ''),
                  });
                  logger.info(`[Handoff] Task sent to ${selectedCandidate.name} via Email`);
                  sent = true;
                }
              }
            } catch (channelErr) {
              logger.debug(`[Handoff] Failed to send via ${channel}: ${channelErr.message}`);
            }
          }

          if (!sent) {
            logger.warn(`[Handoff] Could not notify team member ${selectedCandidate.name} - no available channel`);
          }
        } catch (e) {
          logger.debug(`[Handoff] Failed to notify team member: ${e.message}`);
        }
      }

      const result = {
        handoffId: handoff.id,
        status: handoff.status,
        target: {
          id: selectedCandidate.id,
          name: selectedCandidate.name,
          type: selectedCandidate.type,
          role: selectedCandidate.role,
          skills: selectedCandidate.skills,
          matchScore: selectedCandidate.score || 0,
          matchedOn: selectedCandidate.matchedOn || [],
        },
        taskDescription,
        message: `Task handed off to ${selectedCandidate.name} (${selectedCandidate.type === 'team_member' ? 'Team Member' : 'AI Agent'}, role: ${selectedCandidate.role || 'N/A'})`,
      };

      // Add warning if no skill match was found
      if (selectedCandidate._noMatch) {
        result.warning = `No skill/role match found for this task. Selected first available candidate. Other options: ${(selectedCandidate._alternatives || []).map(a => `${a.name} (${a.role || a.type})`).join(', ')}`;
      }

      return result;
    } catch (error) {
      logger.error(`[Handoff] Failed to create handoff: ${error.message}`);
      return { error: `Handoff failed: ${error.message}` };
    }
  });

  // ---------- broadcastToSwarm executor ----------
  registry.registerExecutor('broadcastToSwarm', async (params, context) => {
    const {
      message,
      targetType = 'all',
      targetRoles,
      targetSkills,
      targetIds,
      priority = 'normal',
    } = params;

    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const userId = context.userId;

    // Find the calling agentic profile
    let agenticId = context.agenticId;
    if (!agenticId && context.agentId) {
      // Direct match: agentic profile linked to this agent
      const profile = db.prepare(
        'SELECT id FROM agentic_profiles WHERE agent_id = ? AND user_id = ?'
      ).get(context.agentId, userId);
      agenticId = profile?.id;

      // Fallback: find agentic profile that monitors this agent (via response_agent_ids)
      if (!agenticId) {
        try {
          const profiles = db.prepare(
            "SELECT id, response_agent_ids FROM agentic_profiles WHERE user_id = ? AND response_agent_ids IS NOT NULL"
          ).all(userId);
          for (const p of profiles) {
            const responseAgentIds = JSON.parse(p.response_agent_ids || '[]');
            if (responseAgentIds.includes(context.agentId)) {
              agenticId = p.id;
              break;
            }
          }
        } catch (e) { /* parse error, skip */ }
      }
    }

    if (!agenticId) {
      return { error: 'No agentic profile found for this agent. Broadcast requires an agentic profile.' };
    }

    // Get all candidates
    let candidates = _getAvailableCandidates(agenticId, userId, targetType);

    if (candidates.length === 0) {
      return {
        error: 'No team members or agents available for broadcast.',
        suggestion: 'Add team members or create additional AI agents.',
      };
    }

    // Filter by specific IDs
    if (targetIds) {
      const ids = targetIds.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        candidates = candidates.filter(c => ids.includes(c.id));
      }
    }

    // Filter by roles
    if (targetRoles) {
      const roles = targetRoles.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (roles.length > 0) {
        candidates = candidates.filter(c => {
          const candidateRole = (c.role || '').toLowerCase();
          return roles.some(r => candidateRole.includes(r) || r.includes(candidateRole));
        });
      }
    }

    // Filter by skills
    if (targetSkills) {
      const skills = targetSkills.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (skills.length > 0) {
        candidates = candidates.filter(c => {
          const candidateSkills = (c.skills || []).map(s => s.toLowerCase());
          return skills.some(sk => candidateSkills.some(cs => cs.includes(sk) || sk.includes(cs)));
        });
      }
    }

    if (candidates.length === 0) {
      return {
        error: 'No matching recipients found after applying filters.',
        filters: { targetType, targetRoles, targetSkills, targetIds },
      };
    }

    // Send broadcast to each recipient
    const results = [];
    const broadcastId = require('uuid').v4();

    for (const candidate of candidates) {
      try {
        if (candidate.type === 'team_member' && candidate.contactId) {
          // Notify human team member
          try {
            const { getMasterNotificationService } = require('../agentic/MasterNotificationService.cjs');
            const notifier = getMasterNotificationService();
            if (notifier) {
              await notifier.sendNotification({
                agenticId,
                userId,
                type: 'broadcast',
                title: `Broadcast (${priority})`,
                message: message,
                priority: priority,
                contactId: candidate.contactId,
              });
            }
          } catch (e) {
            logger.debug(`[Broadcast] Failed to notify ${candidate.name}: ${e.message}`);
          }
          results.push({ id: candidate.id, name: candidate.name, type: 'team_member', status: 'notified' });
        } else if (candidate.type === 'agentic_agent' || candidate.type === 'agent') {
          // For AI agents, emit via swarm orchestrator
          try {
            const { getSwarmOrchestrator } = require('../swarm/SwarmOrchestrator.cjs');
            const orchestrator = getSwarmOrchestrator();
            if (orchestrator) {
              orchestrator.emit('broadcast', {
                agentId: candidate.agentId || candidate.id,
                message,
                channel: 'default',
                priority,
              });
            }
          } catch (e) {
            logger.debug(`[Broadcast] Failed to broadcast to agent ${candidate.name}: ${e.message}`);
          }
          results.push({ id: candidate.id, name: candidate.name, type: candidate.type, status: 'broadcast' });
        }
      } catch (e) {
        results.push({ id: candidate.id, name: candidate.name, type: candidate.type, status: 'failed', error: e.message });
      }
    }

    // Log to activity
    try {
      db.prepare(`
        INSERT INTO agentic_activity_log (id, agentic_id, user_id, activity_type, trigger_type, details, created_at)
        VALUES (?, ?, ?, 'broadcast', 'tool_call', ?, datetime('now'))
      `).run(
        broadcastId,
        agenticId,
        userId,
        JSON.stringify({
          message: message.substring(0, 200),
          priority,
          recipientCount: results.length,
          filters: { targetType, targetRoles, targetSkills },
          recipients: results.map(r => ({ name: r.name, type: r.type, status: r.status })),
        })
      );
    } catch (e) { /* activity log optional */ }

    const sent = results.filter(r => r.status !== 'failed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return {
      broadcastId,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      priority,
      totalRecipients: results.length,
      sent,
      failed,
      recipients: results,
      summary: `Broadcast sent to ${sent} recipient(s)${failed > 0 ? ` (${failed} failed)` : ''}: ${results.map(r => `${r.name} (${r.type})`).join(', ')}`,
    };
  });

  // ============================================================
  // AGENTIC REASONING TOOL EXECUTORS
  // ============================================================

  registry.registerExecutor('notifyMaster', async (params, context) => {
    const { message, priority = 'normal', type: rawType = 'info' } = params;
    const { masterNotificationService } = require('../agentic/MasterNotificationService.cjs');

    if (!context.agenticId) {
      return { sent: false, error: 'No agentic profile context - cannot determine master' };
    }

    // Validate notification type against allowed values
    const ALLOWED_TYPES = new Set([
      'approval_needed', 'approval_reminder', 'daily_report', 'weekly_report',
      'critical_error', 'budget_warning', 'budget_exceeded',
      'agent_created', 'agent_terminated', 'escalation', 'status_update',
      'test', 'new_email', 'platform_disconnect', 'task_completed', 'task_failed',
      'health_summary', 'agent_status_change', 'startup', 'info',
    ]);
    const type = ALLOWED_TYPES.has(rawType) ? rawType : 'info';

    const result = await masterNotificationService.sendNotification({
      agenticId: context.agenticId,
      userId: context.userId,
      type,
      title: type === 'critical_error' ? 'Agent Alert' : 'Agent Update',
      message: message,
      priority: priority,
      forceSend: true,
    });

    return { sent: true, notificationId: result?.id || null };
  });

  registry.registerExecutor('checkAgentStatuses', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    // Get agents and their platform connection status
    const agents = db.prepare(`
      SELECT a.id, a.name, a.status, a.description,
        (SELECT COUNT(*) FROM platform_accounts pa WHERE pa.agent_id = a.id AND pa.status = 'connected') as connected_platforms,
        (SELECT GROUP_CONCAT(pa.platform || ':' || pa.status, ', ')
         FROM platform_accounts pa WHERE pa.agent_id = a.id) as platform_details
      FROM agents a WHERE a.user_id = ?
      ORDER BY a.name
    `).all(context.userId || 'system');

    return {
      totalAgents: agents.length,
      agents: agents.map(a => ({
        name: a.name,
        status: a.status || 'unknown',
        description: (a.description || '').substring(0, 100),
        connectedPlatforms: a.connected_platforms || 0,
        platformDetails: a.platform_details || 'none',
      })),
    };
  });

  registry.registerExecutor('saveMemory', async (params, context) => {
    const { content, memoryType = 'context', importance = 0.5 } = params;

    try {
      const { getAgenticMemoryService } = require('../agentic/AgenticMemoryService.cjs');
      const memService = getAgenticMemoryService();

      const result = await memService.createMemory({
        agenticId: context.agenticId,
        userId: context.userId,
        content: content,
        memoryType: memoryType,
        importanceScore: Math.min(1, Math.max(0, importance)),
      });

      return { saved: true, memoryId: result?.id || null };
    } catch (e) {
      return { saved: false, error: e.message };
    }
  });

  registry.registerExecutor('checkGoalProgress', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const goals = db.prepare(`
        SELECT id, title, description, goal_type, target_metric, target_value,
               current_value, priority, status, deadline_at
        FROM agentic_goals
        WHERE agentic_id = ? AND status = 'active'
        ORDER BY priority DESC, deadline_at ASC
      `).all(context.agenticId);

      return {
        totalGoals: goals.length,
        goals: goals.map(g => ({
          id: g.id,
          title: g.title,
          type: g.goal_type,
          priority: g.priority,
          progress: g.target_value ? `${g.current_value || 0}/${g.target_value}` : 'not measured',
          deadline: g.deadline_at || 'none',
        })),
      };
    } catch (e) {
      return { totalGoals: 0, goals: [], error: e.message };
    }
  });

  // --- Self-Awareness Executors ---

  registry.registerExecutor('getMyProfile', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    const profile = db.prepare(`
      SELECT name, role, description, autonomy_level, status,
             master_contact_id, master_contact_channel, notify_master_on,
             ai_provider, ai_model, temperature, daily_budget, daily_budget_used,
             hierarchy_level, agent_type, can_create_children
      FROM agentic_profiles WHERE id = ?
    `).get(context.agenticId);

    if (!profile) return { error: 'Profile not found' };

    // Count monitoring sources, schedules, skills
    const monitorCount = db.prepare('SELECT COUNT(*) as c FROM agentic_monitoring WHERE agentic_id = ? AND is_active = 1').get(context.agenticId)?.c || 0;
    const scheduleCount = db.prepare('SELECT COUNT(*) as c FROM agentic_schedules WHERE agentic_id = ? AND is_active = 1').get(context.agenticId)?.c || 0;
    const skillCount = db.prepare('SELECT COUNT(*) as c FROM agentic_agent_skills WHERE agentic_id = ?').get(context.agenticId)?.c || 0;
    const goalCount = db.prepare("SELECT COUNT(*) as c FROM agentic_goals WHERE agentic_id = ? AND status = 'active'").get(context.agenticId)?.c || 0;
    const taskCount = db.prepare("SELECT COUNT(*) as c FROM agentic_tasks WHERE agentic_id = ? AND status IN ('pending','in_progress')").get(context.agenticId)?.c || 0;

    return {
      ...profile,
      activeSources: monitorCount,
      activeSchedules: scheduleCount,
      skills: skillCount,
      activeGoals: goalCount,
      pendingTasks: taskCount,
    };
  });

  registry.registerExecutor('listMySkills', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const skills = db.prepare(`
        SELECT s.id, c.name, c.category, c.description, s.current_level,
               s.experience_points, s.points_to_next_level, s.usage_count, s.last_used_at
        FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.agentic_id = ?
        ORDER BY c.category, c.name
      `).all(context.agenticId);

      return { totalSkills: skills.length, skills };
    } catch (e) {
      return { totalSkills: 0, skills: [], error: e.message };
    }
  });

  registry.registerExecutor('listRecentMemories', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const limit = Math.min(params.limit || 10, 20);
    const typeFilter = params.memoryType ? 'AND memory_type = ?' : '';

    try {
      const args = [context.agenticId];
      if (params.memoryType) args.push(params.memoryType);
      args.push(limit);

      const memories = db.prepare(`
        SELECT id, title, content, memory_type, importance_score, tags, created_at
        FROM agentic_memory
        WHERE agentic_id = ? ${typeFilter}
        ORDER BY created_at DESC LIMIT ?
      `).all(...args);

      return { count: memories.length, memories: memories.map(m => ({
        id: m.id, title: m.title, content: (m.content || '').substring(0, 300),
        type: m.memory_type, importance: m.importance_score, tags: m.tags, date: m.created_at,
      })) };
    } catch (e) {
      return { count: 0, memories: [], error: e.message };
    }
  });

  registry.registerExecutor('searchMemory', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const limit = Math.min(params.limit || 5, 10);

    try {
      // Simple keyword search (vector search via AgenticMemoryService is optional)
      const memories = db.prepare(`
        SELECT id, title, content, memory_type, importance_score, tags, created_at
        FROM agentic_memory
        WHERE agentic_id = ? AND (content LIKE ? OR title LIKE ?)
        ORDER BY importance_score DESC, created_at DESC LIMIT ?
      `).all(context.agenticId, `%${params.query}%`, `%${params.query}%`, limit);

      return { query: params.query, count: memories.length, memories: memories.map(m => ({
        id: m.id, title: m.title, content: (m.content || '').substring(0, 300),
        type: m.memory_type, importance: m.importance_score, date: m.created_at,
      })) };
    } catch (e) {
      return { query: params.query, count: 0, memories: [], error: e.message };
    }
  });

  // --- Schedule Management Executors ---

  registry.registerExecutor('listMySchedules', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const schedules = db.prepare(`
        SELECT id, title, description, schedule_type, action_type, is_active,
               cron_expression, interval_minutes, next_run_at, last_run_at, custom_prompt
        FROM agentic_schedules
        WHERE agentic_id = ?
        ORDER BY is_active DESC, next_run_at ASC
      `).all(context.agenticId);

      return { count: schedules.length, schedules };
    } catch (e) {
      return { count: 0, schedules: [], error: e.message };
    }
  });

  registry.registerExecutor('createSchedule', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    // Deduplication: check if an active schedule with same title already exists
    const existing = db.prepare(`
      SELECT id, title, is_active FROM agentic_schedules
      WHERE agentic_id = ? AND title = ? AND is_active = 1
    `).get(context.agenticId, params.title);

    if (existing) {
      return {
        created: false,
        existingScheduleId: existing.id,
        message: `Schedule "${params.title}" already exists (id: ${existing.id}). Use updateSchedule to modify it.`
      };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    let nextRunAt = now;

    // Calculate next run time
    if (params.scheduleType === 'interval' && params.intervalMinutes) {
      nextRunAt = new Date(Date.now() + params.intervalMinutes * 60000).toISOString();
    } else if (params.scheduleType === 'cron' && params.cronExpression) {
      // Simple next-run calculation: just set to now (scheduler will compute properly)
      nextRunAt = now;
    }

    try {
      db.prepare(`
        INSERT INTO agentic_schedules (
          id, agentic_id, user_id, title, schedule_type, action_type,
          cron_expression, interval_minutes, custom_prompt,
          is_active, next_run_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        id, context.agenticId, context.userId,
        params.title, params.scheduleType, params.actionType,
        params.cronExpression || null, params.intervalMinutes || null,
        params.customPrompt || null, nextRunAt, now, now
      );

      return { created: true, scheduleId: id, title: params.title, nextRunAt };
    } catch (e) {
      return { created: false, error: e.message };
    }
  });

  registry.registerExecutor('updateSchedule', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      // Verify ownership
      const schedule = db.prepare('SELECT id FROM agentic_schedules WHERE id = ? AND agentic_id = ?')
        .get(params.scheduleId, context.agenticId);
      if (!schedule) return { updated: false, error: 'Schedule not found or not yours' };

      const updates = [];
      const values = [];
      if (params.isActive !== undefined) { updates.push('is_active = ?'); values.push(params.isActive ? 1 : 0); }
      if (params.cronExpression) { updates.push('cron_expression = ?'); values.push(params.cronExpression); }
      if (params.intervalMinutes) { updates.push('interval_minutes = ?'); values.push(params.intervalMinutes); }
      if (params.customPrompt) { updates.push('custom_prompt = ?'); values.push(params.customPrompt); }
      updates.push("updated_at = datetime('now')");

      if (updates.length <= 1) return { updated: false, error: 'No changes specified' };

      values.push(params.scheduleId);
      db.prepare(`UPDATE agentic_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      return { updated: true, scheduleId: params.scheduleId };
    } catch (e) {
      return { updated: false, error: e.message };
    }
  });

  registry.registerExecutor('deleteSchedule', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const result = db.prepare('DELETE FROM agentic_schedules WHERE id = ? AND agentic_id = ?')
        .run(params.scheduleId, context.agenticId);
      return { deleted: result.changes > 0, scheduleId: params.scheduleId };
    } catch (e) {
      return { deleted: false, error: e.message };
    }
  });

  // --- Task Management Executors ---

  registry.registerExecutor('listMyTasks', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const statusFilter = params.status && params.status !== 'all' ? 'AND status = ?' : '';

    try {
      const args = [context.agenticId];
      if (statusFilter) args.push(params.status);

      const tasks = db.prepare(`
        SELECT id, title, description, status, priority, task_type,
               assigned_to, due_at, created_at, ai_summary
        FROM agentic_tasks
        WHERE agentic_id = ? ${statusFilter}
        ORDER BY
          CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
          due_at ASC NULLS LAST
        LIMIT 20
      `).all(...args);

      return { count: tasks.length, tasks };
    } catch (e) {
      return { count: 0, tasks: [], error: e.message };
    }
  });

  registry.registerExecutor('createTask', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO agentic_tasks (
          id, agentic_id, user_id, title, description, status, priority,
          assigned_to, due_at, parent_task_id, plan_item_type, plan_order,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, context.agenticId, context.userId,
        params.title, params.description || null,
        params.priority || 'normal', params.assignTo || null,
        params.dueAt || null,
        params.parentTaskId || null,
        params.planItemType || null,
        params.planOrder != null ? params.planOrder : null,
        now, now
      );

      return { created: true, taskId: id, title: params.title };
    } catch (e) {
      return { created: false, error: e.message };
    }
  });

  registry.registerExecutor('updateTaskStatus', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const task = db.prepare('SELECT id FROM agentic_tasks WHERE id = ? AND agentic_id = ?')
        .get(params.taskId, context.agenticId);
      if (!task) return { updated: false, error: 'Task not found or not yours' };

      const updates = ["status = ?", "updated_at = datetime('now')"];
      const values = [params.status];

      if (params.status === 'in_progress') { updates.push("started_at = COALESCE(started_at, datetime('now'))"); }
      if (params.status === 'completed') { updates.push("completed_at = datetime('now')"); }
      if (params.notes) { updates.push('ai_summary = ?'); values.push(params.notes); }

      values.push(params.taskId);
      db.prepare(`UPDATE agentic_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      return { updated: true, taskId: params.taskId, status: params.status };
    } catch (e) {
      return { updated: false, error: e.message };
    }
  });

  // --- Plan-Driven Reasoning Executors ---

  registry.registerExecutor('generatePlan', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    const { goal, steps } = params;
    if (!goal || !steps || !Array.isArray(steps) || steps.length === 0) {
      return { created: false, error: 'Must provide goal and at least one step' };
    }

    const now = new Date().toISOString();

    try {
      // 1. Create root "plan" task
      const planId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_tasks (
          id, agentic_id, user_id, title, description, status, priority,
          task_type, plan_item_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'in_progress', 'normal', 'plan', 'synthesis', ?, ?)
      `).run(planId, context.agenticId, context.userId, `Plan: ${goal}`, goal, now, now);

      // 2. Create subtasks for each step
      const createdSteps = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = crypto.randomUUID();
        const planContext = JSON.stringify({
          expectedTool: step.expectedTool || null,
          dependsOn: step.dependsOn || null,
        });

        db.prepare(`
          INSERT INTO agentic_tasks (
            id, agentic_id, user_id, title, description, status, priority,
            parent_task_id, plan_item_type, plan_order, plan_context,
            original_requester_conversation_id, original_requester_account_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', 'normal', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          stepId, context.agenticId, context.userId,
          step.title, step.description || null,
          planId,
          step.type || 'tool_action',
          i + 1,
          planContext,
          context.conversationId || null,
          context.accountId || null,
          now, now
        );

        createdSteps.push({
          id: stepId,
          title: step.title,
          type: step.type || 'tool_action',
          order: i + 1,
        });
      }

      return {
        created: true,
        planId,
        goal,
        steps: createdSteps,
        totalSteps: createdSteps.length,
      };
    } catch (e) {
      return { created: false, error: e.message };
    }
  });

  registry.registerExecutor('requestHumanInput', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    const { question, taskId, targetContactId, channel, urgency } = params;

    if (!question || !taskId) {
      return { sent: false, error: 'Must provide question and taskId' };
    }

    try {
      // 1. Verify the task exists and belongs to this agent
      const task = db.prepare('SELECT id, agentic_id, parent_task_id FROM agentic_tasks WHERE id = ? AND agentic_id = ?')
        .get(taskId, context.agenticId);
      if (!task) return { sent: false, error: 'Task not found or not yours' };

      // 2. Resolve target contact - use specified or fall back to master
      let resolvedContactId = targetContactId;
      if (!resolvedContactId) {
        const profile = db.prepare('SELECT master_contact_id FROM agentic_profiles WHERE id = ?')
          .get(context.agenticId);
        resolvedContactId = profile?.master_contact_id;
      }

      if (!resolvedContactId) {
        return { sent: false, error: 'No target contact or master contact configured' };
      }

      // 3. Update the task to blocked + human_input
      db.prepare(`
        UPDATE agentic_tasks SET
          status = 'blocked',
          plan_item_type = COALESCE(plan_item_type, 'human_input'),
          awaiting_from_contact_id = ?,
          awaiting_response_message = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(resolvedContactId, question, taskId);

      // 4. Send notification to the target human via MasterNotificationService
      let notificationSent = false;
      try {
        const { masterNotificationService } = require('../agentic/MasterNotificationService.cjs');
        await masterNotificationService.sendNotification({
          agenticId: context.agenticId,
          userId: context.userId,
          type: 'human_input_needed',
          title: 'Input needed for task',
          message: question,
          priority: urgency || 'normal',
          targetContactId: resolvedContactId,
          channel: channel || undefined,
        });
        notificationSent = true;
      } catch (notifyErr) {
        logger.debug(`Could not send human input request: ${notifyErr.message}`);
      }

      // 5. Get contact name for response
      let contactName = 'unknown';
      try {
        const contact = db.prepare('SELECT display_name FROM contacts WHERE id = ?').get(resolvedContactId);
        contactName = contact?.display_name || resolvedContactId;
      } catch (e) { /* optional */ }

      return {
        sent: true,
        notificationSent,
        taskId,
        question,
        awaitingFrom: contactName,
        awaitingContactId: resolvedContactId,
      };
    } catch (e) {
      return { sent: false, error: e.message };
    }
  });

  // --- Goal Management Executors ---

  registry.registerExecutor('createGoal', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO agentic_goals (
          id, agentic_id, user_id, title, description, goal_type, priority,
          target_metric, target_value, current_value, status,
          deadline_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)
      `).run(
        id, context.agenticId, context.userId,
        params.title, params.description || null,
        params.goalType || 'ongoing', params.priority || 'normal',
        params.targetMetric || null, params.targetValue || null,
        params.deadlineAt || null, now, now
      );

      return { created: true, goalId: id, title: params.title };
    } catch (e) {
      return { created: false, error: e.message };
    }
  });

  registry.registerExecutor('updateGoalProgress', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const goal = db.prepare('SELECT id, target_value FROM agentic_goals WHERE id = ? AND agentic_id = ?')
        .get(params.goalId, context.agenticId);
      if (!goal) return { updated: false, error: 'Goal not found or not yours' };

      const updates = ["current_value = ?", "updated_at = datetime('now')"];
      const values = [params.currentValue];

      // Auto-complete if target reached
      if (goal.target_value && params.currentValue >= goal.target_value) {
        updates.push("status = 'completed'");
      }

      values.push(params.goalId);
      db.prepare(`UPDATE agentic_goals SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      return { updated: true, goalId: params.goalId, currentValue: params.currentValue,
               completed: goal.target_value ? params.currentValue >= goal.target_value : false };
    } catch (e) {
      return { updated: false, error: e.message };
    }
  });

  // --- Team & Inter-Agent Communication Executors ---

  registry.registerExecutor('listTeamMembers', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const members = db.prepare(`
        SELECT tm.id, tm.contact_id, tm.role, tm.department, tm.skills,
               tm.gender, tm.is_available, tm.tasks_completed, tm.rating,
               c.display_name as name, c.gender as contactGender
        FROM agentic_team_members tm
        LEFT JOIN contacts c ON tm.contact_id = c.id
        WHERE tm.agentic_id = ? AND tm.is_active = 1
        ORDER BY tm.role, c.display_name
      `).all(context.agenticId);

      return {
        count: members.length,
        members: members.map(m => ({
          ...m,
          gender: m.gender || m.contactGender || null,
          skills: (() => { try { return JSON.parse(m.skills || '[]'); } catch { return []; } })(),
        })),
      };
    } catch (e) {
      return { count: 0, members: [], error: e.message };
    }
  });

  // ============================================================
  // SEARCH TEAM MEMBERS (by role, department, skills, gender)
  // ============================================================
  registry.registerExecutor('searchTeamMembers', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const { query, role, department, skill, gender, isAvailable } = params;

      let sql = `
        SELECT tm.id, tm.contact_id, tm.role, tm.department, tm.skills,
               tm.gender, tm.is_available, tm.tasks_completed, tm.rating,
               tm.preferred_channel, tm.timezone,
               c.display_name as name, c.gender as contactGender, c.company
        FROM agentic_team_members tm
        LEFT JOIN contacts c ON tm.contact_id = c.id
        WHERE tm.agentic_id = ? AND tm.is_active = 1
      `;
      const sqlParams = [context.agenticId];

      // Free-text search across name, role, department, skills
      if (query && query.trim()) {
        const searchTerm = `%${query.trim()}%`;
        sql += ` AND (
          c.display_name LIKE ?
          OR tm.role LIKE ?
          OR tm.department LIKE ?
          OR tm.skills LIKE ?
        )`;
        sqlParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      // Specific filters
      if (role) {
        sql += ' AND tm.role LIKE ?';
        sqlParams.push(`%${role}%`);
      }
      if (department) {
        sql += ' AND tm.department LIKE ?';
        sqlParams.push(`%${department}%`);
      }
      if (skill) {
        sql += ' AND tm.skills LIKE ?';
        sqlParams.push(`%${skill}%`);
      }
      if (gender) {
        sql += ' AND (tm.gender = ? OR c.gender = ?)';
        sqlParams.push(gender, gender);
      }
      if (isAvailable === true || isAvailable === 'true') {
        sql += ' AND tm.is_available = 1';
      }

      sql += ' ORDER BY tm.role, c.display_name LIMIT 20';

      const members = db.prepare(sql).all(...sqlParams);

      return {
        count: members.length,
        members: members.map(m => ({
          id: m.id,
          contactId: m.contact_id,
          name: m.name,
          role: m.role,
          department: m.department,
          skills: (() => { try { return JSON.parse(m.skills || '[]'); } catch { return []; } })(),
          gender: m.gender || m.contactGender || null,
          isAvailable: m.is_available === 1,
          preferredChannel: m.preferred_channel,
          timezone: m.timezone,
          company: m.company,
          rating: m.rating,
          tasksCompleted: m.tasks_completed,
        })),
      };
    } catch (e) {
      return { count: 0, members: [], error: e.message };
    }
  });

  registry.registerExecutor('sendAgentMessage', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    try {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_messages (
          id, user_id, sender_id, receiver_id, subject, content,
          message_type, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
      `).run(
        id, context.userId, context.agenticId, params.toAgenticId,
        params.subject, params.content, params.messageType || 'notification'
      );

      return { sent: true, messageId: id };
    } catch (e) {
      return { sent: false, error: e.message };
    }
  });

  registry.registerExecutor('delegateTask', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    try {
      const task = db.prepare('SELECT id, title FROM agentic_tasks WHERE id = ? AND agentic_id = ?')
        .get(params.taskId, context.agenticId);
      if (!task) return { delegated: false, error: 'Task not found or not yours' };

      db.prepare(`
        UPDATE agentic_tasks SET assigned_to = ?, status = 'assigned',
          ai_summary = COALESCE(ai_summary, '') || ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(params.toAgenticId, params.instructions ? `\nDelegation note: ${params.instructions}` : '', params.taskId);

      // Also send inter-agent message about the delegation
      const crypto = require('crypto');
      db.prepare(`
        INSERT INTO agentic_messages (
          id, user_id, sender_id, receiver_id, subject, content,
          message_type, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'request', 'pending', datetime('now'))
      `).run(
        crypto.randomUUID(), context.userId, context.agenticId, params.toAgenticId,
        `Task delegated: ${task.title}`,
        `You have been assigned task "${task.title}". ${params.instructions || ''}`,
      );

      return { delegated: true, taskId: params.taskId, delegatedTo: params.toAgenticId };
    } catch (e) {
      return { delegated: false, error: e.message };
    }
  });

  // --- Heartbeat Executor ---

  registry.registerExecutor('heartbeat_ok', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    try {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_activity_log (
          id, agentic_id, user_id, activity_type, activity_description,
          trigger_type, status, metadata, created_at
        ) VALUES (?, ?, ?, 'heartbeat_ok', 'Agent confirmed operational', 'heartbeat', 'success', ?, datetime('now'))
      `).run(
        id,
        context.agenticId,
        context.userId,
        JSON.stringify({ status: params.status || 'operational', timestamp: Date.now() })
      );

      return { confirmed: true, status: params.status || 'operational', timestamp: Date.now() };
    } catch (e) {
      return { confirmed: false, error: e.message };
    }
  });

  // --- Self-Management Executors ---

  registry.registerExecutor('selfReflect', async (params, context) => {
    try {
      const { getAgenticMemoryService } = require('../agentic/AgenticMemoryService.cjs');
      const memService = getAgenticMemoryService();

      const result = await memService.createMemory({
        agenticId: context.agenticId,
        userId: context.userId,
        title: `Self-reflection: ${params.category || 'general'}`,
        content: params.reflection,
        memoryType: 'reflection',
        importanceScore: 0.7,
        tags: JSON.stringify([params.category || 'self-reflection']),
      });

      return { saved: true, memoryId: result?.id || null };
    } catch (e) {
      return { saved: false, error: e.message };
    }
  });

  registry.registerExecutor('requestApproval', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    // Anti-fabrication guard: reject approval requests that look like cover-ups for failed commands
    const suspiciousPatterns = [
      /screen\s*record/i, /record\s*screen/i, /screen\s*capture/i,
      /dashboard\s*approval/i, /security\s*setting/i, /authorization\s*first/i,
      /permission\s*required/i, /not\s*enabled/i, /needs?\s*to\s*be\s*enabled/i,
    ];
    const titleAndDesc = `${params.title || ''} ${params.description || ''}`;
    const isSuspicious = suspiciousPatterns.some(p => p.test(titleAndDesc));

    if (isSuspicious) {
      logger.warn(`[requestApproval] BLOCKED suspicious fabrication: "${params.title}" — "${params.description}"`);
      return {
        queued: false,
        error: 'This approval request was blocked because it appears to be covering up a failed command or non-existent feature. If a command failed, tell the user honestly. Do NOT create fake approval requests.',
        note: 'IMPORTANT: Tell the user the truth — the feature is not supported. Do NOT say it needs approval.',
      };
    }

    try {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_approval_queue (
          id, agentic_id, user_id, action_type, action_title,
          action_description, status, priority, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
      `).run(
        id, context.agenticId, context.userId,
        params.actionType, params.title, params.description,
        params.priority || 'normal'
      );

      // Notify master about pending approval
      try {
        const { masterNotificationService } = require('../agentic/MasterNotificationService.cjs');
        await masterNotificationService.sendNotification({
          agenticId: context.agenticId,
          userId: context.userId,
          type: 'approval_needed',
          title: `Approval needed: ${params.title}`,
          message: params.description,
          priority: params.priority || 'normal',
        });
      } catch (notifyErr) {
        logger.debug(`Could not notify master about approval: ${notifyErr.message}`);
      }

      return { queued: true, approvalId: id };
    } catch (e) {
      return { queued: false, error: e.message };
    }
  });

  // --- Orchestration Executors ---

  registry.registerExecutor('orchestrate', async (params, context) => {
    const { getOrchestratorEngine } = require('../agentic/OrchestratorEngine.cjs');
    const engine = getOrchestratorEngine();
    return await engine.orchestrate(params, context);
  });

  registry.registerExecutor('createSpecialist', async (params, context) => {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const crypto = require('crypto');

    const parentId = context.agenticId;
    const userId = context.userId;

    if (!parentId) {
      return { success: false, error: 'No agentic profile found. Cannot create specialist.' };
    }

    // Verify parent can create children
    const parent = db.prepare(
      'SELECT can_create_children, max_children, hierarchy_level, hierarchy_path, children_autonomy_cap FROM agentic_profiles WHERE id = ? AND user_id = ?'
    ).get(parentId, userId);

    if (!parent || !parent.can_create_children) {
      return { success: false, error: 'This agent does not have permission to create sub-agents.' };
    }

    // Check limit
    const existing = db.prepare(
      "SELECT COUNT(*) as cnt FROM agentic_profiles WHERE parent_agentic_id = ? AND status != 'deleted'"
    ).get(parentId);

    if (existing.cnt >= (parent.max_children || 5)) {
      return { success: false, error: `Maximum sub-agent limit (${parent.max_children || 5}) reached.` };
    }

    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO agentic_profiles (
          id, user_id, name, role, description,
          agent_type, parent_agentic_id, hierarchy_level, hierarchy_path,
          created_by_type, created_by_agentic_id, creation_reason,
          inherit_team, inherit_knowledge, inherit_monitoring, inherit_routing,
          ai_provider, temperature, max_tokens,
          autonomy_level, can_create_children,
          status, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          'sub', ?, ?, ?,
          'agentic', ?, ?,
          1, 1, 0, 1,
          'task-routing', 0.7, 2000,
          ?, 0,
          'active', ?, ?
        )
      `).run(
        id, userId, params.name,
        params.role,
        params.description || `Specialist agent: ${params.role}`,
        parentId,
        (parent.hierarchy_level || 0) + 1,
        `${parent.hierarchy_path || ''}/${id}`,
        parentId,
        `Created by manager: ${params.role}`,
        parent.children_autonomy_cap || 'semi-autonomous',
        now, now
      );

      return {
        success: true,
        specialistId: id,
        name: params.name,
        role: params.role,
        message: `Specialist "${params.name}" created successfully and ready for orchestration.`,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // COLLABORATION TOOLS (Phase 6: Agent Collaboration Protocol)
  // ============================================================

  registry.registerExecutor('consultAgent', async (params, context) => {
    const { targetAgentId, question, context: additionalContext } = params;
    if (!targetAgentId || !question) {
      return { success: false, error: 'targetAgentId and question are required' };
    }

    try {
      const { getCollaborationProtocol } = require('../agentic/CollaborationProtocol.cjs');
      const collab = getCollaborationProtocol();
      const result = await collab.startConsultation(
        context.agenticId, targetAgentId, context.userId,
        { question, context: additionalContext }
      );
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('requestConsensus', async (params, context) => {
    const { agentIds, topic, options, context: additionalContext } = params;
    if (!agentIds || !topic || !options || options.length < 2) {
      return { success: false, error: 'agentIds, topic, and at least 2 options are required' };
    }

    try {
      const { getCollaborationProtocol } = require('../agentic/CollaborationProtocol.cjs');
      const collab = getCollaborationProtocol();
      const result = await collab.requestConsensus(
        context.agenticId, agentIds, context.userId,
        { topic, options, context: additionalContext }
      );
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('shareKnowledge', async (params, context) => {
    const { learning, tags, importance } = params;
    if (!learning) {
      return { success: false, error: 'learning content is required' };
    }

    try {
      const { getCollaborationProtocol } = require('../agentic/CollaborationProtocol.cjs');
      const collab = getCollaborationProtocol();
      const result = await collab.propagateKnowledge(
        context.agenticId, context.userId,
        { learning, tags: tags || [], importance: importance || 0.6 }
      );
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // PHASE 7: Async Consensus + Conflict Resolution
  // ============================================================

  registry.registerExecutor('requestAsyncConsensus', async (params, context) => {
    const { agentIds, topic, options, deadlineMinutes } = params;
    if (!agentIds || !topic) {
      return { success: false, error: 'agentIds and topic are required' };
    }

    try {
      const { getCollaborationProtocol } = require('../agentic/CollaborationProtocol.cjs');
      const collab = getCollaborationProtocol();
      const result = await collab.requestAsyncConsensus(
        context.agenticId, agentIds, context.userId,
        { topic, options: options || [], deadlineMinutes: deadlineMinutes || 5 }
      );
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('resolveConflict', async (params, context) => {
    const { agentIds, topic, positions, escalateToAgentId } = params;
    if (!agentIds || !topic || !positions || positions.length < 2) {
      return { success: false, error: 'agentIds, topic, and at least 2 positions are required' };
    }

    try {
      const { getCollaborationProtocol } = require('../agentic/CollaborationProtocol.cjs');
      const collab = getCollaborationProtocol();
      const result = await collab.resolveConflict(
        context.agenticId, agentIds, context.userId,
        { topic, positions, escalateToAgentId }
      );
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // AGENTIC MEMORY TOOLS (Phase 2)
  // ============================================================

  registry.registerExecutor('updateMemory', async (params, context) => {
    const { memoryId, content, tags, importance } = params;
    if (!memoryId) return { success: false, error: 'memoryId is required' };

    try {
      const { getAgenticMemoryService } = require('../agentic/AgenticMemoryService.cjs');
      const memService = getAgenticMemoryService();

      const updates = {};
      if (content) updates.content = content;
      if (tags) updates.tags = tags;
      if (importance !== undefined) updates.importanceScore = Math.min(1, Math.max(0, importance / 10));

      const result = await memService.updateMemory(memoryId, context.userId, updates);
      return result ? { success: true, memoryId, updated: true } : { success: false, error: 'Memory not found or not owned by you' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('forgetMemory', async (params, context) => {
    const { memoryId, reason } = params;
    if (!memoryId || !reason) return { success: false, error: 'memoryId and reason are required' };

    try {
      const { getAgenticMemoryService } = require('../agentic/AgenticMemoryService.cjs');
      const memService = getAgenticMemoryService();

      // Log the deletion reason
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      try {
        db.prepare(`
          INSERT INTO agentic_activity_log (id, agentic_id, user_id, activity_type, activity_description, trigger_type, status, created_at)
          VALUES (?, ?, ?, 'memory_delete', ?, 'tool', 'success', datetime('now'))
        `).run(require('crypto').randomUUID(), context.agenticId, context.userId, `Deleted memory ${memoryId}: ${reason}`);
      } catch (_) { /* audit log optional */ }

      const deleted = await memService.deleteMemory(memoryId, context.userId);
      return { success: deleted, memoryId, reason };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('consolidateMemories', async (params, context) => {
    const { topic, maxMemories = 10 } = params;
    if (!topic) return { success: false, error: 'topic is required' };

    try {
      const { getAgenticMemoryService } = require('../agentic/AgenticMemoryService.cjs');
      const memService = getAgenticMemoryService();

      const result = await memService.consolidateMemories(context.agenticId, {
        maxMemoriesToProcess: maxMemories,
      });

      return {
        success: true,
        topic,
        processed: result?.processed || 0,
        archived: result?.archived || 0,
        importanceAdjusted: result?.importanceAdjusted || 0,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // AGENTIC KNOWLEDGE / SELF-LEARNING TOOLS (Phase 2)
  // ============================================================

  registry.registerExecutor('learnFromConversation', async (params, context) => {
    const { conversationId, libraryId, focus } = params;
    if (!conversationId) return { success: false, error: 'conversationId is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Get conversation messages
      const messages = db.prepare(`
        SELECT content, sender_type, created_at FROM messages
        WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 100
      `).all(conversationId);

      if (!messages.length) return { success: false, error: 'Conversation not found or empty' };

      // Compile conversation text
      let text = messages.map(m => `[${m.sender_type}] ${m.content}`).join('\n');
      if (focus) {
        text = `[Focus: ${focus}]\n\n${text}`;
      }

      // Find or use the specified library
      const targetLib = libraryId || await _findOrCreateAgentLibrary(context.agenticId, context.userId);
      if (!targetLib) return { success: false, error: 'No knowledge library available' };

      // Ingest via RAG pipeline
      const { getChunkingService } = require('../rag/ChunkingService.cjs');
      const { getVectorStoreService } = require('../rag/VectorStoreService.cjs');
      const chunker = getChunkingService();
      const vectorStore = getVectorStoreService();

      const chunks = chunker.chunkText(text, { maxChunkSize: 500, overlap: 50 });
      let ingested = 0;

      for (const chunk of chunks) {
        try {
          await vectorStore.addDocument(targetLib, {
            content: chunk.text,
            metadata: { source: 'conversation', conversationId, focus: focus || '', agenticId: context.agenticId },
          });
          ingested++;
        } catch (_) { /* continue on single chunk failure */ }
      }

      return { success: true, conversationId, chunksIngested: ingested, totalChunks: chunks.length, libraryId: targetLib };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('learnFromUrl', async (params, context) => {
    const { url, libraryId, title } = params;
    if (!url) return { success: false, error: 'url is required' };

    try {
      // Fetch the URL content
      const fetchResult = await (async () => {
        try {
          const { default: fetch } = await import('node-fetch');
          const resp = await fetch(url, { timeout: 15000 });
          return await resp.text();
        } catch (_) {
          // Fallback: try with built-in https
          return new Promise((resolve, reject) => {
            const lib = url.startsWith('https') ? require('https') : require('http');
            lib.get(url, { timeout: 15000 }, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => resolve(data));
            }).on('error', reject);
          });
        }
      })();

      if (!fetchResult || fetchResult.length < 50) {
        return { success: false, error: 'URL returned empty or very short content' };
      }

      // Strip HTML tags for plain text
      const text = fetchResult.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      const targetLib = libraryId || await _findOrCreateAgentLibrary(context.agenticId, context.userId);
      if (!targetLib) return { success: false, error: 'No knowledge library available' };

      const { getChunkingService } = require('../rag/ChunkingService.cjs');
      const { getVectorStoreService } = require('../rag/VectorStoreService.cjs');
      const chunker = getChunkingService();
      const vectorStore = getVectorStoreService();

      const chunks = chunker.chunkText(text.substring(0, 50000), { maxChunkSize: 500, overlap: 50 });
      let ingested = 0;

      for (const chunk of chunks) {
        try {
          await vectorStore.addDocument(targetLib, {
            content: chunk.text,
            metadata: { source: 'url', url, title: title || url, agenticId: context.agenticId },
          });
          ingested++;
        } catch (_) { /* continue */ }
      }

      return { success: true, url, title: title || url, chunksIngested: ingested, totalChunks: chunks.length, libraryId: targetLib };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('learnFromText', async (params, context) => {
    const { text, title, libraryId, tags } = params;
    if (!text || !title) return { success: false, error: 'text and title are required' };

    try {
      const targetLib = libraryId || await _findOrCreateAgentLibrary(context.agenticId, context.userId);
      if (!targetLib) return { success: false, error: 'No knowledge library available' };

      const { getChunkingService } = require('../rag/ChunkingService.cjs');
      const { getVectorStoreService } = require('../rag/VectorStoreService.cjs');
      const chunker = getChunkingService();
      const vectorStore = getVectorStoreService();

      const chunks = chunker.chunkText(text, { maxChunkSize: 500, overlap: 50 });
      let ingested = 0;

      for (const chunk of chunks) {
        try {
          await vectorStore.addDocument(targetLib, {
            content: chunk.text,
            metadata: { source: 'text', title, tags: (tags || []).join(','), agenticId: context.agenticId },
          });
          ingested++;
        } catch (_) { /* continue */ }
      }

      return { success: true, title, chunksIngested: ingested, totalChunks: chunks.length, libraryId: targetLib };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('listKnowledgeLibraries', async (params, context) => {
    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Get libraries the agent has access to
      const libraries = db.prepare(`
        SELECT kl.id, kl.name, kl.description, kl.created_at,
               (SELECT COUNT(*) FROM knowledge_documents WHERE library_id = kl.id) as doc_count
        FROM agentic_knowledge ak
        JOIN knowledge_libraries kl ON ak.library_id = kl.id
        WHERE ak.agentic_id = ?
        ORDER BY kl.name
      `).all(context.agenticId);

      return {
        success: true,
        totalLibraries: libraries.length,
        libraries: libraries.map(l => ({
          id: l.id,
          name: l.name,
          description: l.description,
          documentCount: l.doc_count,
          createdAt: l.created_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message, libraries: [] };
    }
  });

  registry.registerExecutor('getLibraryStats', async (params, context) => {
    const { libraryId } = params;
    if (!libraryId) return { success: false, error: 'libraryId is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      const lib = db.prepare('SELECT id, name, description FROM knowledge_libraries WHERE id = ?').get(libraryId);
      if (!lib) return { success: false, error: 'Library not found' };

      const stats = db.prepare(`
        SELECT COUNT(*) as doc_count,
               SUM(chunk_count) as total_chunks,
               MAX(created_at) as last_added
        FROM knowledge_documents WHERE library_id = ?
      `).get(libraryId);

      return {
        success: true,
        library: lib.name,
        documentCount: stats.doc_count || 0,
        totalChunks: stats.total_chunks || 0,
        lastDocumentAdded: stats.last_added || 'never',
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('suggestLearningTopics', async (params, context) => {
    const { maxSuggestions = 5 } = params;

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Get recent activity to identify gaps
      const recentActivity = db.prepare(`
        SELECT activity_description FROM agentic_activity_log
        WHERE agentic_id = ? ORDER BY created_at DESC LIMIT 20
      `).all(context.agenticId);

      const recentMemories = db.prepare(`
        SELECT content FROM agentic_memory
        WHERE agentic_id = ? ORDER BY created_at DESC LIMIT 10
      `).all(context.agenticId);

      // Simple keyword-frequency analysis to suggest topics
      const allText = [
        ...recentActivity.map(a => a.activity_description || ''),
        ...recentMemories.map(m => m.content || ''),
      ].join(' ').toLowerCase();

      const wordFreq = {};
      const stopWords = new Set(['the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'been', 'was', 'are', 'not', 'but', 'what', 'all', 'were', 'when']);
      allText.split(/\s+/).forEach(w => {
        const clean = w.replace(/[^a-z]/g, '');
        if (clean.length > 3 && !stopWords.has(clean)) {
          wordFreq[clean] = (wordFreq[clean] || 0) + 1;
        }
      });

      const topics = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxSuggestions)
        .map(([word, count]) => ({ topic: word, mentionCount: count }));

      return {
        success: true,
        suggestions: topics,
        basedOn: { activities: recentActivity.length, memories: recentMemories.length },
      };
    } catch (e) {
      return { success: false, error: e.message, suggestions: [] };
    }
  });

  // ============================================================
  // AGENTIC SUB-AGENT MANAGEMENT TOOLS (Phase 2)
  // ============================================================

  registry.registerExecutor('listSubAgents', async (params, context) => {
    const { statusFilter = 'all' } = params;

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      let query = `
        SELECT id, name, role, description, status, autonomy_level, created_at, updated_at
        FROM agentic_profiles
        WHERE parent_agentic_id = ? AND user_id = ?
      `;
      const queryParams = [context.agenticId, context.userId];

      if (statusFilter !== 'all') {
        query += ' AND status = ?';
        queryParams.push(statusFilter);
      }
      query += " AND status != 'deleted' ORDER BY created_at DESC";

      const agents = db.prepare(query).all(...queryParams);

      return {
        success: true,
        count: agents.length,
        agents: agents.map(a => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
          autonomyLevel: a.autonomy_level,
          createdAt: a.created_at,
          lastActive: a.updated_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message, agents: [] };
    }
  });

  registry.registerExecutor('checkSubAgentStatus', async (params, context) => {
    const { agentId } = params;
    if (!agentId) return { success: false, error: 'agentId is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      const agent = db.prepare(`
        SELECT id, name, role, description, status, autonomy_level, created_at, updated_at
        FROM agentic_profiles
        WHERE id = ? AND parent_agentic_id = ? AND user_id = ?
      `).get(agentId, context.agenticId, context.userId);

      if (!agent) return { success: false, error: 'Sub-agent not found or not your child' };

      // Get recent activity
      const recentActivity = db.prepare(`
        SELECT activity_type, activity_description, created_at
        FROM agentic_activity_log
        WHERE agentic_id = ? ORDER BY created_at DESC LIMIT 5
      `).all(agentId);

      // Get task count
      const taskCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM agentic_tasks WHERE agentic_id = ?
      `).get(agentId);

      return {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          autonomyLevel: agent.autonomy_level,
          createdAt: agent.created_at,
          lastActive: agent.updated_at,
        },
        taskCount: taskCount?.cnt || 0,
        recentActivity: recentActivity.map(a => ({
          type: a.activity_type,
          description: a.activity_description,
          at: a.created_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('recallSubAgent', async (params, context) => {
    const { agentId, reason } = params;
    if (!agentId) return { success: false, error: 'agentId is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Verify ownership
      const agent = db.prepare(`
        SELECT id, name FROM agentic_profiles
        WHERE id = ? AND parent_agentic_id = ? AND user_id = ?
      `).get(agentId, context.agenticId, context.userId);

      if (!agent) return { success: false, error: 'Sub-agent not found or not your child' };

      db.prepare(`
        UPDATE agentic_profiles SET status = 'inactive', updated_at = datetime('now')
        WHERE id = ?
      `).run(agentId);

      // Log the recall
      try {
        db.prepare(`
          INSERT INTO agentic_activity_log (id, agentic_id, user_id, activity_type, activity_description, trigger_type, status, created_at)
          VALUES (?, ?, ?, 'sub_agent_recall', ?, 'tool', 'success', datetime('now'))
        `).run(require('crypto').randomUUID(), context.agenticId, context.userId, `Recalled sub-agent "${agent.name}" (${agentId}): ${reason || 'no reason given'}`);
      } catch (_) { /* audit optional */ }

      return { success: true, agentId, name: agent.name, message: `Sub-agent "${agent.name}" has been deactivated.` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // AGENTIC SELF-IMPROVEMENT TOOLS (Phase 3)
  // ============================================================

  registry.registerExecutor('acquireSkill', async (params, context) => {
    const { skillName } = params;
    if (!skillName) return { success: false, error: 'skillName is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Find skill in catalog
      const skill = db.prepare(`
        SELECT id, name, category, description FROM agentic_skills_catalog
        WHERE name = ? OR id = ?
      `).get(skillName, skillName);

      if (!skill) return { success: false, error: `Skill "${skillName}" not found in catalog` };

      // Check if already acquired
      const existing = db.prepare(`
        SELECT id FROM agentic_agent_skills WHERE agentic_id = ? AND skill_id = ?
      `).get(context.agenticId, skill.id);

      if (existing) return { success: false, error: `You already have the "${skill.name}" skill` };

      const id = require('crypto').randomUUID();
      db.prepare(`
        INSERT INTO agentic_agent_skills (id, agentic_id, skill_id, current_level, current_xp, acquired_at)
        VALUES (?, ?, ?, 1, 0, datetime('now'))
      `).run(id, context.agenticId, skill.id);

      return { success: true, skillId: id, name: skill.name, category: skill.category, level: 1, message: `Acquired "${skill.name}" at beginner level.` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('upgradeSkill', async (params, context) => {
    const { skillId, xpAmount = 10, context: xpContext } = params;
    if (!skillId) return { success: false, error: 'skillId is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      const skill = db.prepare(`
        SELECT s.id, s.current_level, s.current_xp, s.skill_id,
               c.name, c.xp_per_level
        FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.id = ? AND s.agentic_id = ?
      `).get(skillId, context.agenticId);

      if (!skill) return { success: false, error: 'Skill not found or not yours' };

      const xpPerLevel = skill.xp_per_level ? JSON.parse(skill.xp_per_level) : [100, 300, 600, 1000];
      const newXp = (skill.current_xp || 0) + xpAmount;
      let newLevel = skill.current_level;

      // Check for level up
      const threshold = xpPerLevel[newLevel - 1] || xpPerLevel[xpPerLevel.length - 1];
      if (newXp >= threshold && newLevel < 4) {
        newLevel++;
      }

      db.prepare(`
        UPDATE agentic_agent_skills SET current_xp = ?, current_level = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newXp, newLevel, skillId);

      // Log history
      try {
        db.prepare(`
          INSERT INTO agentic_skill_history (id, skill_assignment_id, agentic_id, event_type, old_value, new_value, context, created_at)
          VALUES (?, ?, ?, 'xp_gain', ?, ?, ?, datetime('now'))
        `).run(require('crypto').randomUUID(), skillId, context.agenticId, String(skill.current_xp), String(newXp), xpContext || 'tool upgrade');
      } catch (_) { /* history optional */ }

      const leveledUp = newLevel > skill.current_level;
      return {
        success: true,
        name: skill.name,
        xpAdded: xpAmount,
        totalXp: newXp,
        level: newLevel,
        leveledUp,
        message: leveledUp ? `Level up! "${skill.name}" is now level ${newLevel}.` : `Added ${xpAmount} XP to "${skill.name}".`,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('evaluatePerformance', async (params, context) => {
    const { period = 'week' } = params;

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Calculate date range
      const now = new Date();
      const cutoff = new Date();
      if (period === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (period === 'week') cutoff.setDate(cutoff.getDate() - 7);
      else if (period === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
      const cutoffStr = cutoff.toISOString();

      const activities = db.prepare(`
        SELECT status, COUNT(*) as cnt FROM agentic_activity_log
        WHERE agentic_id = ? AND created_at >= ?
        GROUP BY status
      `).all(context.agenticId, cutoffStr);

      const totalActivities = activities.reduce((sum, a) => sum + a.cnt, 0);
      const successCount = activities.find(a => a.status === 'success')?.cnt || 0;

      const taskStats = db.prepare(`
        SELECT status, COUNT(*) as cnt FROM agentic_tasks
        WHERE agentic_id = ? AND created_at >= ?
        GROUP BY status
      `).all(context.agenticId, cutoffStr);

      const totalTasks = taskStats.reduce((sum, t) => sum + t.cnt, 0);
      const completedTasks = taskStats.find(t => t.status === 'completed')?.cnt || 0;

      return {
        success: true,
        period,
        metrics: {
          totalActivities,
          successRate: totalActivities > 0 ? Math.round((successCount / totalActivities) * 100) : 0,
          totalTasks,
          taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('suggestImprovements', async (params, context) => {
    const { focusArea = 'all' } = params;

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      const suggestions = [];

      // Check task completion rate
      const taskStats = db.prepare(`
        SELECT status, COUNT(*) as cnt FROM agentic_tasks
        WHERE agentic_id = ? AND created_at >= datetime('now', '-7 days')
        GROUP BY status
      `).all(context.agenticId);
      const totalTasks = taskStats.reduce((s, t) => s + t.cnt, 0);
      const completedTasks = taskStats.find(t => t.status === 'completed')?.cnt || 0;
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      if (completionRate < 70 && totalTasks > 0) {
        suggestions.push({ area: 'accuracy', priority: 'high', suggestion: `Task completion rate is ${Math.round(completionRate)}%. Focus on completing tasks before taking new ones.` });
      }

      // Check skill levels
      const skills = db.prepare(`
        SELECT c.name, s.current_level FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.agentic_id = ?
      `).all(context.agenticId);

      const lowSkills = skills.filter(s => s.current_level < 2);
      if (lowSkills.length > 0) {
        suggestions.push({ area: 'skills', priority: 'medium', suggestion: `${lowSkills.length} skills at beginner level: ${lowSkills.map(s => s.name).join(', ')}. Use them more to level up.` });
      }

      // Check for errors in recent activity
      const errorCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM agentic_activity_log
        WHERE agentic_id = ? AND status = 'error' AND created_at >= datetime('now', '-7 days')
      `).get(context.agenticId);

      if (errorCount?.cnt > 3) {
        suggestions.push({ area: 'accuracy', priority: 'high', suggestion: `${errorCount.cnt} errors in the past week. Review error patterns and adjust approach.` });
      }

      if (suggestions.length === 0) {
        suggestions.push({ area: 'general', priority: 'low', suggestion: 'Performance looks good! Keep up the current approach.' });
      }

      return { success: true, focusArea, suggestions };
    } catch (e) {
      return { success: false, error: e.message, suggestions: [] };
    }
  });

  registry.registerExecutor('updateSelfPrompt', async (params, context) => {
    const { section, newContent, reason } = params;
    if (!section || !newContent || !reason) {
      return { success: false, error: 'section, newContent, and reason are all required' };
    }

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Queue the self-prompt update for approval
      const id = require('crypto').randomUUID();
      db.prepare(`
        INSERT INTO agentic_self_prompts (id, agentic_id, user_id, prompt_type, prompt_content, reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
      `).run(id, context.agenticId, context.userId, section, newContent, reason);

      return {
        success: true,
        promptId: id,
        status: 'pending',
        message: 'Self-prompt update queued for approval. Your master/admin will review it.',
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // AGENTIC OBSERVATION TOOLS (Phase 3)
  // ============================================================

  registry.registerExecutor('getMyUsageStats', async (params, context) => {
    const { period = 'today' } = params;

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      const profile = db.prepare(`
        SELECT daily_budget, daily_budget_used, name FROM agentic_profiles WHERE id = ?
      `).get(context.agenticId);

      // Get cost tracking data
      let costs = { totalCost: 0, totalTokens: 0 };
      try {
        const { costTrackingService } = require('../agentic/CostTrackingService.cjs');
        costs = costTrackingService.getUsageSummary(context.agenticId, period) || costs;
      } catch (_) { /* cost tracking optional */ }

      return {
        success: true,
        period,
        budget: profile?.daily_budget || 0,
        budgetUsed: profile?.daily_budget_used || 0,
        budgetRemaining: Math.max(0, (profile?.daily_budget || 0) - (profile?.daily_budget_used || 0)),
        totalCost: costs.totalCost,
        totalTokens: costs.totalTokens,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('getMyAuditLog', async (params, context) => {
    const { limit = 20, activityType = 'all' } = params;

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      let query = `
        SELECT activity_type, activity_description, trigger_type, status, created_at
        FROM agentic_activity_log WHERE agentic_id = ?
      `;
      const queryParams = [context.agenticId];

      if (activityType !== 'all') {
        query += ' AND activity_type = ?';
        queryParams.push(activityType);
      }

      query += ` ORDER BY created_at DESC LIMIT ?`;
      queryParams.push(Math.min(limit, 50));

      const entries = db.prepare(query).all(...queryParams);

      return {
        success: true,
        count: entries.length,
        entries: entries.map(e => ({
          type: e.activity_type,
          description: e.activity_description,
          trigger: e.trigger_type,
          status: e.status,
          at: e.created_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message, entries: [] };
    }
  });

  registry.registerExecutor('checkAlerts', async (params, context) => {
    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      const alerts = [];

      // Check pending approvals
      try {
        const pendingApprovals = db.prepare(`
          SELECT COUNT(*) as cnt FROM agentic_approvals
          WHERE agentic_id = ? AND status = 'pending'
        `).get(context.agenticId);
        if (pendingApprovals?.cnt > 0) {
          alerts.push({ type: 'approval', severity: 'warning', message: `${pendingApprovals.cnt} pending approval(s)` });
        }
      } catch (_) { /* table optional */ }

      // Check failed tasks
      try {
        const failedTasks = db.prepare(`
          SELECT COUNT(*) as cnt FROM agentic_tasks
          WHERE agentic_id = ? AND status = 'failed' AND created_at >= datetime('now', '-1 day')
        `).get(context.agenticId);
        if (failedTasks?.cnt > 0) {
          alerts.push({ type: 'task', severity: 'error', message: `${failedTasks.cnt} failed task(s) in last 24h` });
        }
      } catch (_) { /* table optional */ }

      // Check budget
      try {
        const profile = db.prepare(`
          SELECT daily_budget, daily_budget_used FROM agentic_profiles WHERE id = ?
        `).get(context.agenticId);
        if (profile?.daily_budget > 0) {
          const used = profile.daily_budget_used || 0;
          const pct = (used / profile.daily_budget) * 100;
          if (pct >= 90) {
            alerts.push({ type: 'budget', severity: 'critical', message: `Budget ${Math.round(pct)}% used (${used.toFixed(4)}/${profile.daily_budget.toFixed(4)})` });
          } else if (pct >= 70) {
            alerts.push({ type: 'budget', severity: 'warning', message: `Budget ${Math.round(pct)}% used` });
          }
        }
      } catch (_) { /* profile optional */ }

      // Check unread messages
      try {
        const unread = db.prepare(`
          SELECT COUNT(*) as cnt FROM agentic_messages
          WHERE recipient_agentic_id = ? AND is_read = 0
        `).get(context.agenticId);
        if (unread?.cnt > 0) {
          alerts.push({ type: 'message', severity: 'info', message: `${unread.cnt} unread message(s)` });
        }
      } catch (_) { /* table optional */ }

      return {
        success: true,
        alertCount: alerts.length,
        alerts,
      };
    } catch (e) {
      return { success: false, error: e.message, alerts: [] };
    }
  });

  // ============================================================
  // SELF-HEALING TOOLS
  // ============================================================

  registry.registerExecutor('getMyErrorHistory', async (params, context) => {
    try {
      const { getSelfHealingService } = require('../agentic/SelfHealingService.cjs');
      const healer = getSelfHealingService();
      const result = healer.getErrorHistory(context.agenticId, {
        hours: params.hours || 24,
        limit: params.limit || 20,
        toolId: params.toolId || null,
      });
      return {
        success: true,
        ...result,
      };
    } catch (e) {
      return { success: false, error: e.message, errors: [], totalCount: 0 };
    }
  });

  registry.registerExecutor('getMyHealthReport', async (params, context) => {
    try {
      const { getSelfHealingService } = require('../agentic/SelfHealingService.cjs');
      const healer = getSelfHealingService();
      const result = healer.getHealthReport(context.agenticId, {
        period: params.period || '24h',
      });
      return {
        success: true,
        ...result,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('diagnoseSelf', async (params, context) => {
    try {
      const { getSelfHealingService } = require('../agentic/SelfHealingService.cjs');
      const healer = getSelfHealingService();
      const result = await healer.diagnoseSelf(context.agenticId, context.userId);
      return {
        success: true,
        ...result,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('proposeSelfFix', async (params, context) => {
    const { fixType, description, proposedChange } = params;
    if (!fixType || !description || !proposedChange) {
      return { success: false, error: 'Missing required parameters: fixType, description, proposedChange' };
    }

    try {
      // Parse proposedChange if it's a string
      let change;
      try {
        change = typeof proposedChange === 'string' ? JSON.parse(proposedChange) : proposedChange;
      } catch {
        return { success: false, error: 'proposedChange must be valid JSON' };
      }

      const { getSelfHealingService } = require('../agentic/SelfHealingService.cjs');
      const healer = getSelfHealingService();
      const result = await healer.proposeFix(
        context.agenticId, context.userId,
        fixType, description, change
      );
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // AGENTIC COMMUNICATION TOOLS (Phase 3)
  // ============================================================

  registry.registerExecutor('broadcastTeam', async (params, context) => {
    const { message, channelFilter = 'all', roleFilter } = params;
    if (!message) return { success: false, error: 'message is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Get team members
      let query = `
        SELECT tm.id, tm.member_name, tm.member_role, tm.contact_channel, tm.contact_identifier
        FROM agentic_team_members tm
        WHERE tm.agentic_id = ? AND tm.is_active = 1
      `;
      const queryParams = [context.agenticId];

      if (roleFilter) {
        query += ' AND tm.member_role LIKE ?';
        queryParams.push(`%${roleFilter}%`);
      }

      const members = db.prepare(query).all(...queryParams);

      if (!members.length) return { success: false, error: 'No team members found' };

      let sent = 0;
      const results = [];

      for (const member of members) {
        const channel = member.contact_channel || 'internal';
        if (channelFilter !== 'all' && channel !== channelFilter) continue;

        try {
          // Use the existing messaging tools via the registry
          if (channel === 'whatsapp' && member.contact_identifier) {
            const executor = registry.executors.get('sendWhatsApp');
            if (executor) {
              await executor({ to: member.contact_identifier, message }, context);
              sent++;
              results.push({ name: member.member_name, channel, status: 'sent' });
              continue;
            }
          }
          if (channel === 'telegram' && member.contact_identifier) {
            const executor = registry.executors.get('sendTelegram');
            if (executor) {
              await executor({ chatId: member.contact_identifier, message }, context);
              sent++;
              results.push({ name: member.member_name, channel, status: 'sent' });
              continue;
            }
          }
          if (channel === 'email' && member.contact_identifier) {
            const executor = registry.executors.get('sendEmail');
            if (executor) {
              await executor({ to: member.contact_identifier, subject: 'Team Broadcast', body: message }, context);
              sent++;
              results.push({ name: member.member_name, channel, status: 'sent' });
              continue;
            }
          }
          // Internal or unknown channel - log as activity
          results.push({ name: member.member_name, channel, status: 'skipped_no_channel' });
        } catch (e) {
          results.push({ name: member.member_name, channel, status: 'failed', error: e.message });
        }
      }

      return { success: true, sentCount: sent, totalMembers: members.length, results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // LOCAL AGENT TOOLS (Phase 5.2 — Device command execution)
  // ============================================================

  registry.registerExecutor('executeOnLocalAgent', async (params, context) => {
    const { agentName, command, params: cmdParams = {} } = params;

    if (!agentName) throw new Error('agentName is required');
    if (!command) throw new Error('command is required');

    // Validate command against known Local Agent commands
    const VALID_COMMANDS = ['shell', 'fileRead', 'fileList', 'fileTransfer', 'screenshot', 'capture', 'systemInfo', 'notification', 'mcp', 'mcpToolCall', 'cliSession', 'clipboard', 'aiChat'];
    if (!VALID_COMMANDS.includes(command)) {
      return {
        success: false,
        error: `"${command}" is NOT a valid Local Agent command. Valid commands: ${VALID_COMMANDS.join(', ')}. To run CLI/terminal commands, use command="shell" with params={command: "your command here"}. Do NOT invent commands. Tell the user honestly if something is not supported.`,
      };
    }

    const { getLocalAgentGateway } = require('../LocalAgentGateway.cjs');
    const { getDatabase } = require('../database.cjs');
    const gateway = getLocalAgentGateway();
    const db = getDatabase();

    // 1. Find agent by exact name + user_id
    let agent = db.prepare(
      "SELECT id, name FROM local_agents WHERE user_id = ? AND LOWER(name) = LOWER(?) AND status = 'active'"
    ).get(context.userId, agentName);

    // 2. Try fuzzy match if exact fails (escape SQL wildcards to prevent IDOR)
    if (!agent) {
      const safeName = agentName.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const candidates = db.prepare(
        "SELECT id, name FROM local_agents WHERE user_id = ? AND status = 'active' AND LOWER(name) LIKE LOWER(?) ESCAPE '\\'"
      ).all(context.userId, `%${safeName}%`);

      if (candidates.length === 0) {
        // List available agents for the AI to suggest
        const allAgents = db.prepare(
          "SELECT name FROM local_agents WHERE user_id = ? AND status = 'active'"
        ).all(context.userId);
        const names = allAgents.map(a => a.name).join(', ');
        return {
          success: false,
          error: `No Local Agent named "${agentName}" found. Available agents: ${names || 'none registered'}. User may need to run: swarmai-agent start`,
        };
      }
      if (candidates.length > 1) {
        return {
          success: false,
          error: `Multiple agents match "${agentName}": ${candidates.map(a => a.name).join(', ')}. Please specify the exact name.`,
        };
      }
      agent = candidates[0];
    }

    // 3. Check online
    if (!gateway.isOnline(agent.id)) {
      return {
        success: false,
        error: `Local Agent "${agent.name}" is currently offline. Ask the user to start it with: swarmai-agent start`,
      };
    }

    // 4a. Validate capture subtypes (prevent AI from inventing unsupported types)
    if (command === 'capture') {
      const captureType = cmdParams?.type || '';
      const VALID_CAPTURE_TYPES = ['camera', 'microphone', 'list_devices'];
      if (captureType && !VALID_CAPTURE_TYPES.includes(captureType)) {
        return {
          success: false,
          error: `Capture type "${captureType}" is NOT supported. Only these types work: ${VALID_CAPTURE_TYPES.join(', ')}. Screen recording is NOT available. Tell the user honestly that this feature is not supported.`,
          note: 'Do NOT create an approval request or fabricate excuses. Just tell the user it is not supported.',
        };
      }
    }

    // 4b. Auto-inject workspace profile for cliSession/shell (so local agent uses correct cwd)
    if ((command === 'cliSession' || command === 'shell') && !cmdParams.cwd) {
      if (context.agenticId) {
        try {
          const profile = db.prepare(
            'SELECT name, system_prompt FROM agentic_profiles WHERE id = ?'
          ).get(context.agenticId);
          if (profile) {
            cmdParams.workspaceProfile = profile.name;
            cmdParams.workspaceSystemPrompt = (profile.system_prompt || '').substring(0, 1000);
          }
        } catch (e) { /* non-critical, local agent will use workspace root */ }
      }
    }

    // 4c. Send command with audit logging (Phase 5.4: extended timeouts for new commands)
    let timeout = 30000; // default 30s
    if (command === 'screenshot') timeout = 30000;                        // 30s (screenshot capture + large payload transfer)
    if (command === 'fileTransfer') timeout = 60000;                      // 60s (up to 10MB file)
    if (command === 'shell' || command === 'mcp') timeout = 60000;        // 60s
    if (command === 'capture') timeout = 60000;                            // 60s (ffmpeg)
    if (command === 'cliSession') timeout = 180000;                        // 3 min (must be < reasoning loop's 4-min timeout)

    // ── ASYNC MODE for long-running cliSession ──
    // If the requested timeout exceeds the sync threshold, dispatch as async command.
    // The local agent runs the CLI in background and reports back via command:async-result.
    const SYNC_THRESHOLD_MS = 3.5 * 60 * 1000;
    const requestedTimeout = cmdParams.timeout || timeout;
    if (command === 'cliSession' && requestedTimeout > SYNC_THRESHOLD_MS) {
      const asyncTrackingId = require('uuid').v4();
      const triggerCtx = context._triggerContext || {};

      // Inject conversation context into params so async-result handler can deliver
      cmdParams._conversationId = triggerCtx.conversationId || context.conversationId || null;
      cmdParams._accountId = triggerCtx.accountId || context.accountId || null;
      cmdParams._externalId = triggerCtx.externalId || context.externalId || null;
      cmdParams._platform = triggerCtx.platform || context.platform || null;
      cmdParams.asyncTrackingId = asyncTrackingId;
      cmdParams.timeout = Math.min(requestedTimeout, 3600000); // Cap at 60 min

      gateway.sendAsyncCommand(agent.id, command, cmdParams, context.userId, context.agenticId);

      // Notify user via intermediate respond
      if (typeof triggerCtx._onIntermediateRespond === 'function') {
        try {
          await triggerCtx._onIntermediateRespond(
            `Started ${cmdParams.cliType || 'CLI'} on ${agent.name}. This may take several minutes — I'll send you the result when it's ready.`
          );
        } catch (_) {}
      }

      return {
        success: true,
        async: true,
        trackingId: asyncTrackingId,
        agentName: agent.name,
        command,
        message: `Background task started on ${agent.name}. Results will be delivered automatically. Do NOT wait — proceed with "done".`,
      };
    }

    try {
      const result = await gateway.sendCommandWithLogging(
        agent.id, command, cmdParams, context.userId, context.agenticId, timeout
      );

      // Intercept "restricted" / "approval_required" responses from Local Agent security gate
      // Translate into honest error messages so the AI doesn't fabricate "dashboard approval" excuses
      if (result && (result.status === 'approval_required' || result.status === 'restricted')) {
        return {
          success: false,
          agentName: agent.name,
          command,
          error: `Command "${command}" is restricted by the local agent's security settings. ${result.reason || ''}. Tell the user this command is disabled in their local agent config — NOT that it "needs dashboard approval."`,
          note: 'This is a security restriction, not an approval workflow. Do NOT use requestApproval. Tell the user honestly that this is disabled in their local agent settings.',
        };
      }

      // If the local agent already uploaded via HTTP and returned a downloadUrl, pass through directly.
      // This is the preferred path (new agents). No base64 touches the server at all.
      if (result && result.downloadUrl && (command === 'screenshot' || command === 'capture' || command === 'fileTransfer')) {
        return {
          success: true,
          agentName: agent.name,
          command,
          result: {
            ...result,
            note: `File ready. IMPORTANT: Use sendWhatsAppMedia (or sendTelegramMedia) with filePath="${result.downloadUrl}" to send this to the user. Do NOT just paste the URL in a text response.`,
          },
          executedAt: new Date().toISOString(),
        };
      }

      // Backward compat: old agents still send base64 via WebSocket. Auto-upload to TempFileService
      // so the AI gets a small download URL instead of megabytes of base64 (which would blow up LLM context).
      if (result && result.imageData && (command === 'screenshot' || command === 'capture')) {
        try {
          const { getTempFileService } = require('../TempFileService.cjs');
          const tempService = getTempFileService();
          const buffer = Buffer.from(result.imageData, 'base64');
          const ext = result.format || 'jpeg';
          const fileName = `${command}_${agent.name}_${Date.now()}.${ext}`;
          const stored = await tempService.store(
            context.userId,
            buffer,
            fileName,
            result.mimeType || `image/${ext}`,
            { ttlHours: 24, source: 'local-agent', metadata: { agenticId: context.agenticId, command } }
          );
          return {
            success: true,
            agentName: agent.name,
            command,
            result: {
              downloadUrl: stored.downloadUrl,
              fileName,
              format: result.format,
              size: result.size,
              sizeHuman: result.sizeHuman,
              timestamp: result.timestamp,
              note: `Screenshot captured. IMPORTANT: Use sendWhatsAppMedia (or sendTelegramMedia) with filePath="${stored.downloadUrl}" to send this to the user. Do NOT just paste the URL in a text response.`,
            },
            executedAt: new Date().toISOString(),
          };
        } catch (uploadErr) {
          // If upload fails, strip the base64 and report error (never pass raw base64 to LLM)
          return {
            success: true,
            agentName: agent.name,
            command,
            result: {
              note: `Screenshot was captured (${result.sizeHuman}) but failed to upload for sharing: ${uploadErr.message}. Ask the user to try again.`,
              size: result.size,
              timestamp: result.timestamp,
            },
            executedAt: new Date().toISOString(),
          };
        }
      }

      // Backward compat: old agents send fileTransfer as base64 content — auto-upload
      if (result && result.content && result.encoding === 'base64' && command === 'fileTransfer') {
        try {
          const { getTempFileService } = require('../TempFileService.cjs');
          const tempService = getTempFileService();
          const buffer = Buffer.from(result.content, 'base64');
          const stored = await tempService.store(
            context.userId, buffer, result.originalName || 'file',
            result.mimeType || 'application/octet-stream',
            { ttlHours: 24, source: 'local-agent', metadata: { agenticId: context.agenticId, command } }
          );
          return {
            success: true, agentName: agent.name, command,
            result: {
              downloadUrl: stored.downloadUrl, originalName: result.originalName,
              mimeType: result.mimeType, size: result.size,
              note: `File transferred. IMPORTANT: Use sendWhatsAppMedia (or sendTelegramMedia) with filePath="${stored.downloadUrl}" to send this to the user as media. Do NOT just paste the URL in a text response.`,
            },
            executedAt: new Date().toISOString(),
          };
        } catch (uploadErr) {
          return {
            success: true, agentName: agent.name, command,
            result: { note: `File transferred but upload failed: ${uploadErr.message}`, size: result.size },
            executedAt: new Date().toISOString(),
          };
        }
      }

      return {
        success: true,
        agentName: agent.name,
        command,
        result,
        executedAt: new Date().toISOString(),
      };
    } catch (execError) {
      return {
        success: false,
        agentName: agent.name,
        command,
        error: execError.message,
        note: 'Command failed. Tell the user honestly what happened. Do NOT fabricate excuses about approvals, dashboards, or pending actions. If the feature is not supported, say so.',
      };
    }
  });

  // ============================================================
  // CONTACT SCOPE MANAGEMENT TOOLS
  // ============================================================

  /**
   * Helper: Resolve scope row with per-platform cascade
   */
  function _resolveScopeRow(db, agenticId, platformAccountId) {
    let scope = null;
    if (platformAccountId) {
      scope = db.prepare(
        'SELECT * FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id = ?'
      ).get(agenticId, platformAccountId);
    }
    if (!scope) {
      scope = db.prepare(
        'SELECT * FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id IS NULL'
      ).get(agenticId);
    }
    return scope;
  }

  /**
   * Helper: Ensure a scope row exists, create if not
   */
  function _ensureScopeRow(db, agenticId, userId, platformAccountId) {
    let scope = _resolveScopeRow(db, agenticId, platformAccountId);
    if (!scope) {
      const { v4: uuidv4 } = require('uuid');
      const scopeId = uuidv4();
      const pAccountId = platformAccountId || null;
      db.prepare(`
        INSERT INTO agentic_contact_scope (
          id, agentic_id, user_id, platform_account_id, scope_type,
          whitelist_contact_ids, whitelist_tags, whitelist_group_ids,
          allow_team_members, allow_master_contact, notify_on_out_of_scope,
          auto_add_approved, log_all_communications
        ) VALUES (?, ?, ?, ?, 'team_only', '[]', '[]', '[]', 1, 1, 1, 0, 1)
      `).run(scopeId, agenticId, userId, pAccountId);
      scope = db.prepare('SELECT * FROM agentic_contact_scope WHERE id = ?').get(scopeId);
    }
    return scope;
  }

  registry.registerExecutor('getMyScope', async (params, context) => {
    const { platformAccountId } = params;
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const userId = context.userId;

    // Find agentic profile
    let agenticId = context.agenticId;
    if (!agenticId && context.agentId) {
      const profile = db.prepare(
        'SELECT id FROM agentic_profiles WHERE agent_id = ? AND user_id = ?'
      ).get(context.agentId, userId);
      if (!profile) {
        const profiles = db.prepare(
          "SELECT id, response_agent_ids FROM agentic_profiles WHERE user_id = ? AND response_agent_ids IS NOT NULL"
        ).all(userId);
        for (const p of profiles) {
          try { if (JSON.parse(p.response_agent_ids || '[]').includes(context.agentId)) { agenticId = p.id; break; } } catch {}
        }
      } else {
        agenticId = profile.id;
      }
    }
    if (!agenticId) return { error: 'No agentic profile found for this agent.' };

    const scope = _resolveScopeRow(db, agenticId, platformAccountId);
    if (!scope) {
      return {
        scopeType: 'none_configured',
        message: 'No contact scope is configured. All contacts are allowed by default.',
      };
    }

    return {
      scopeType: scope.scope_type,
      platformAccountId: scope.platform_account_id || 'global',
      whitelistContactIds: JSON.parse(scope.whitelist_contact_ids || '[]'),
      whitelistTags: JSON.parse(scope.whitelist_tags || '[]'),
      whitelistGroupIds: JSON.parse(scope.whitelist_group_ids || '[]'),
      allowTeamMembers: scope.allow_team_members === 1,
      allowMasterContact: scope.allow_master_contact === 1,
      notifyOnOutOfScope: scope.notify_on_out_of_scope === 1,
      autoAddApproved: scope.auto_add_approved === 1,
    };
  });

  registry.registerExecutor('addContactToScope', async (params, context) => {
    const { contactId, platformAccountId } = params;
    if (!contactId) throw new Error('contactId is required');

    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const userId = context.userId;

    // Validate contact belongs to user
    const contact = db.prepare('SELECT id, display_name FROM contacts WHERE id = ? AND user_id = ?')
      .get(contactId, userId);
    if (!contact) return { error: 'Contact not found or does not belong to you.' };

    // Find agentic profile
    let agenticId = context.agenticId;
    if (!agenticId && context.agentId) {
      const profile = db.prepare('SELECT id FROM agentic_profiles WHERE agent_id = ? AND user_id = ?').get(context.agentId, userId);
      if (!profile) {
        const profiles = db.prepare("SELECT id, response_agent_ids FROM agentic_profiles WHERE user_id = ? AND response_agent_ids IS NOT NULL").all(userId);
        for (const p of profiles) { try { if (JSON.parse(p.response_agent_ids || '[]').includes(context.agentId)) { agenticId = p.id; break; } } catch {} }
      } else { agenticId = profile.id; }
    }
    if (!agenticId) return { error: 'No agentic profile found.' };

    const scope = _ensureScopeRow(db, agenticId, userId, platformAccountId);
    const whitelist = JSON.parse(scope.whitelist_contact_ids || '[]');

    if (whitelist.includes(contactId)) {
      return { message: `${contact.display_name} is already in your whitelist.`, contactId };
    }

    whitelist.push(contactId);
    if (scope.platform_account_id) {
      db.prepare('UPDATE agentic_contact_scope SET whitelist_contact_ids = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id = ?')
        .run(JSON.stringify(whitelist), agenticId, scope.platform_account_id);
    } else {
      db.prepare('UPDATE agentic_contact_scope SET whitelist_contact_ids = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id IS NULL')
        .run(JSON.stringify(whitelist), agenticId);
    }

    return {
      message: `Added ${contact.display_name} to your whitelist. They can now message you.`,
      contactId,
      contactName: contact.display_name,
      whitelistSize: whitelist.length,
    };
  });

  registry.registerExecutor('removeContactFromScope', async (params, context) => {
    const { contactId, platformAccountId } = params;
    if (!contactId) throw new Error('contactId is required');

    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const userId = context.userId;

    let agenticId = context.agenticId;
    if (!agenticId && context.agentId) {
      const profile = db.prepare('SELECT id FROM agentic_profiles WHERE agent_id = ? AND user_id = ?').get(context.agentId, userId);
      if (!profile) {
        const profiles = db.prepare("SELECT id, response_agent_ids FROM agentic_profiles WHERE user_id = ? AND response_agent_ids IS NOT NULL").all(userId);
        for (const p of profiles) { try { if (JSON.parse(p.response_agent_ids || '[]').includes(context.agentId)) { agenticId = p.id; break; } } catch {} }
      } else { agenticId = profile.id; }
    }
    if (!agenticId) return { error: 'No agentic profile found.' };

    const scope = _resolveScopeRow(db, agenticId, platformAccountId);
    if (!scope) return { error: 'No scope configured to remove from.' };

    const whitelist = JSON.parse(scope.whitelist_contact_ids || '[]');
    const idx = whitelist.indexOf(contactId);
    if (idx === -1) return { message: 'Contact is not in your whitelist.', contactId };

    whitelist.splice(idx, 1);
    if (scope.platform_account_id) {
      db.prepare('UPDATE agentic_contact_scope SET whitelist_contact_ids = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id = ?')
        .run(JSON.stringify(whitelist), agenticId, scope.platform_account_id);
    } else {
      db.prepare('UPDATE agentic_contact_scope SET whitelist_contact_ids = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id IS NULL')
        .run(JSON.stringify(whitelist), agenticId);
    }

    const contact = db.prepare('SELECT display_name FROM contacts WHERE id = ?').get(contactId);
    return {
      message: `Removed ${contact?.display_name || contactId} from your whitelist.`,
      contactId,
      whitelistSize: whitelist.length,
    };
  });

  registry.registerExecutor('addGroupToScope', async (params, context) => {
    const { conversationId, platformAccountId } = params;
    if (!conversationId) throw new Error('conversationId is required');

    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();
    const userId = context.userId;

    // Validate conversation exists and is a group
    const conv = db.prepare('SELECT id, title, is_group FROM conversations WHERE id = ? AND user_id = ?')
      .get(conversationId, userId);
    if (!conv) return { error: 'Conversation not found or does not belong to you.' };
    if (!conv.is_group) return { error: 'This conversation is not a group. Use addContactToScope for individual contacts.' };

    let agenticId = context.agenticId;
    if (!agenticId && context.agentId) {
      const profile = db.prepare('SELECT id FROM agentic_profiles WHERE agent_id = ? AND user_id = ?').get(context.agentId, userId);
      if (!profile) {
        const profiles = db.prepare("SELECT id, response_agent_ids FROM agentic_profiles WHERE user_id = ? AND response_agent_ids IS NOT NULL").all(userId);
        for (const p of profiles) { try { if (JSON.parse(p.response_agent_ids || '[]').includes(context.agentId)) { agenticId = p.id; break; } } catch {} }
      } else { agenticId = profile.id; }
    }
    if (!agenticId) return { error: 'No agentic profile found.' };

    const scope = _ensureScopeRow(db, agenticId, userId, platformAccountId);
    const groupList = JSON.parse(scope.whitelist_group_ids || '[]');

    if (groupList.includes(conversationId)) {
      return { message: `Group "${conv.title}" is already in your whitelist.`, conversationId };
    }

    groupList.push(conversationId);
    if (scope.platform_account_id) {
      db.prepare('UPDATE agentic_contact_scope SET whitelist_group_ids = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id = ?')
        .run(JSON.stringify(groupList), agenticId, scope.platform_account_id);
    } else {
      db.prepare('UPDATE agentic_contact_scope SET whitelist_group_ids = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id IS NULL')
        .run(JSON.stringify(groupList), agenticId);
    }

    return {
      message: `Added group "${conv.title}" to your whitelist. You will respond when mentioned by name in this group.`,
      conversationId,
      groupName: conv.title,
      whitelistGroupCount: groupList.length,
    };
  });

  // ============================================================
  // TEMP FILE STORAGE (Phase 5.4 — File transfer with TTL)
  // ============================================================

  registry.registerExecutor('uploadToTempStorage', async (params, context) => {
    const { data, fileName, mimeType = 'application/octet-stream', ttlHours = 24 } = params;

    if (!data) throw new Error('data (base64) is required');
    if (!fileName) throw new Error('fileName is required');

    try {
      const { getTempFileService } = require('../TempFileService.cjs');
      const tempService = getTempFileService();

      // Decode base64 to buffer
      const buffer = Buffer.from(data, 'base64');

      const result = await tempService.store(
        context.userId,
        buffer,
        fileName,
        mimeType,
        { ttlHours, source: 'ai-tool', metadata: { agenticId: context.agenticId } }
      );

      return {
        success: true,
        downloadUrl: result.downloadUrl,
        fileName: result.originalName,
        mimeType: result.mimeType,
        size: result.size,
        expiresAt: result.expiresAt,
        note: `File stored. Use sendWhatsAppMedia (or sendTelegramMedia) with filePath="${result.downloadUrl}" to send this to the user as media. Do NOT just paste the URL in a text response. (expires in ${ttlHours}h)`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // ============================================================
  // PLATFORM DATA TOOLS (Read-only access to contacts, conversations, messages)
  // ============================================================

  registry.registerExecutor('searchContacts', async (params, context) => {
    const { query, platform, isFavorite, limit: rawLimit } = params;
    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      const maxLimit = Math.min(parseInt(rawLimit) || 10, 50);

      // Enhanced: also search team member role/department/skills
      let sql = `
        SELECT DISTINCT
          c.id, c.display_name, c.company, c.avatar, c.gender, c.is_blocked, c.is_favorite,
          c.tags, c.notes, c.created_at,
          (SELECT identifier_value FROM contact_identifiers
           WHERE contact_id = c.id AND identifier_type IN ('phone', 'whatsapp')
           AND is_primary = 1 LIMIT 1) as primaryPhone,
          (SELECT identifier_value FROM contact_identifiers
           WHERE contact_id = c.id AND identifier_type = 'email'
           AND is_primary = 1 LIMIT 1) as primaryEmail,
          (SELECT identifier_value FROM contact_identifiers
           WHERE contact_id = c.id AND identifier_type = 'telegram'
           AND is_primary = 1 LIMIT 1) as primaryTelegram,
          (SELECT COUNT(*) FROM conversations WHERE contact_id = c.id) as conversationCount,
          tm.role as teamRole,
          tm.department as teamDepartment,
          tm.skills as teamSkills,
          COALESCE(tm.gender, c.gender) as resolvedGender
        FROM contacts c
        LEFT JOIN agentic_team_members tm ON tm.contact_id = c.id AND tm.is_active = 1
        WHERE c.user_id = ?
      `;
      const sqlParams = [context.userId];

      if (query && query.trim()) {
        const searchTerm = `%${query.trim()}%`;
        sql += ` AND (
          c.display_name LIKE ?
          OR c.company LIKE ?
          OR EXISTS (
            SELECT 1 FROM contact_identifiers ci
            WHERE ci.contact_id = c.id AND ci.identifier_value LIKE ?
          )
          OR tm.role LIKE ?
          OR tm.department LIKE ?
          OR tm.skills LIKE ?
        )`;
        sqlParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (platform) {
        sql += ` AND EXISTS (
          SELECT 1 FROM contact_identifiers ci
          WHERE ci.contact_id = c.id AND ci.platform = ?
        )`;
        sqlParams.push(platform);
      }

      if (isFavorite === true || isFavorite === 'true') {
        sql += ' AND c.is_favorite = 1';
      }

      sql += ` ORDER BY
        CASE WHEN tm.role IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN c.display_name LIKE '+%' OR c.display_name GLOB '[0-9]*' THEN 1 ELSE 0 END,
        c.display_name COLLATE NOCASE
        LIMIT ?`;
      sqlParams.push(maxLimit);

      const contacts = db.prepare(sql).all(...sqlParams);

      return {
        success: true,
        count: contacts.length,
        contacts: contacts.map(c => ({
          id: c.id,
          name: c.display_name || 'Unknown',
          company: c.company || null,
          gender: c.resolvedGender || null,
          phone: c.primaryPhone || null,
          email: c.primaryEmail || null,
          telegram: c.primaryTelegram || null,
          isFavorite: !!c.is_favorite,
          isBlocked: !!c.is_blocked,
          conversationCount: c.conversationCount || 0,
          // Team member info (if applicable)
          teamRole: c.teamRole || null,
          teamDepartment: c.teamDepartment || null,
          teamSkills: c.teamSkills ? (() => { try { return JSON.parse(c.teamSkills); } catch { return []; } })() : null,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('getContactDetails', async (params, context) => {
    const { contactId } = params;
    if (!contactId) return { success: false, error: 'contactId is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      const contact = db.prepare(`
        SELECT c.id, c.display_name, c.company, c.avatar, c.notes, c.tags,
               c.is_blocked, c.is_favorite, c.metadata, c.created_at, c.updated_at
        FROM contacts c
        WHERE c.id = ? AND c.user_id = ?
      `).get(contactId, context.userId);

      if (!contact) {
        return { success: false, error: `Contact not found: ${contactId}` };
      }

      const identifiers = db.prepare(`
        SELECT identifier_type, identifier_value, platform, is_primary
        FROM contact_identifiers WHERE contact_id = ?
      `).all(contactId);

      const conversations = db.prepare(`
        SELECT c.id, c.platform, c.title, c.status, c.unread_count,
               c.updated_at, a.name as agentName,
               (SELECT content FROM messages WHERE conversation_id = c.id
                ORDER BY created_at DESC LIMIT 1) as lastMessage
        FROM conversations c
        LEFT JOIN agents a ON c.agent_id = a.id
        WHERE c.contact_id = ? AND c.user_id = ?
        ORDER BY c.updated_at DESC LIMIT 10
      `).all(contactId, context.userId);

      let tags = [];
      try { tags = JSON.parse(contact.tags || '[]'); } catch (_) {}

      return {
        success: true,
        id: contact.id,
        name: contact.display_name || 'Unknown',
        company: contact.company || null,
        notes: contact.notes || null,
        tags: tags.map(t => typeof t === 'string' ? t : t.name),
        isFavorite: !!contact.is_favorite,
        isBlocked: !!contact.is_blocked,
        createdAt: contact.created_at,
        identifiers: identifiers.map(i => ({
          type: i.identifier_type,
          value: i.identifier_value,
          platform: i.platform,
          isPrimary: !!i.is_primary,
        })),
        conversations: conversations.map(conv => ({
          id: conv.id,
          platform: conv.platform,
          title: conv.title,
          unreadCount: conv.unread_count || 0,
          lastMessage: (conv.lastMessage || '').substring(0, 200),
          agentName: conv.agentName,
          updatedAt: conv.updated_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('getConversations', async (params, context) => {
    const { contactId, contactName, platform, agentId, hasUnread, limit: rawLimit } = params;
    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      const maxLimit = Math.min(parseInt(rawLimit) || 20, 100);

      let sql = `
        SELECT
          c.id, c.platform, c.title, c.status, c.category, c.is_group,
          c.unread_count, c.created_at, c.updated_at,
          cont.display_name as contactName,
          a.name as agentName,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as messageCount,
          (SELECT content FROM messages WHERE conversation_id = c.id
           ORDER BY created_at DESC LIMIT 1) as lastMessage,
          COALESCE(
            (SELECT created_at FROM messages WHERE conversation_id = c.id
             ORDER BY created_at DESC LIMIT 1),
            c.updated_at
          ) as lastMessageAt
        FROM conversations c
        LEFT JOIN contacts cont ON c.contact_id = cont.id
        LEFT JOIN agents a ON c.agent_id = a.id
        WHERE c.user_id = ?
      `;
      const sqlParams = [context.userId];

      if (contactId) {
        sql += ' AND c.contact_id = ?';
        sqlParams.push(contactId);
      }

      if (contactName) {
        sql += ' AND cont.display_name LIKE ?';
        sqlParams.push(`%${contactName}%`);
      }

      if (platform) {
        sql += ' AND c.platform = ?';
        sqlParams.push(platform);
      }

      if (agentId) {
        sql += ' AND c.agent_id = ?';
        sqlParams.push(agentId);
      }

      if (hasUnread === true || hasUnread === 'true') {
        sql += ' AND c.unread_count > 0';
      }

      sql += ' ORDER BY lastMessageAt DESC LIMIT ?';
      sqlParams.push(maxLimit);

      const conversations = db.prepare(sql).all(...sqlParams);

      const totalUnread = db.prepare(`
        SELECT COALESCE(SUM(unread_count), 0) as total FROM conversations WHERE user_id = ?
      `).get(context.userId);

      return {
        success: true,
        count: conversations.length,
        totalUnread: totalUnread?.total || 0,
        conversations: conversations.map(conv => ({
          id: conv.id,
          platform: conv.platform,
          title: conv.title || conv.contactName || 'Unknown',
          contactName: conv.contactName || null,
          agentName: conv.agentName || null,
          status: conv.status,
          isGroup: !!conv.is_group,
          unreadCount: conv.unread_count || 0,
          messageCount: conv.messageCount || 0,
          lastMessage: (conv.lastMessage || '').substring(0, 200),
          lastMessageAt: conv.lastMessageAt,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('getMessages', async (params, context) => {
    const { conversationId, limit: rawLimit, before } = params;
    if (!conversationId) return { success: false, error: 'conversationId is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();

      // Verify user owns this conversation
      const conversation = db.prepare(`
        SELECT c.id, c.title, c.platform, cont.display_name as contactName
        FROM conversations c
        LEFT JOIN contacts cont ON c.contact_id = cont.id
        WHERE c.id = ? AND c.user_id = ?
      `).get(conversationId, context.userId);

      if (!conversation) {
        return { success: false, error: `Conversation not found or access denied: ${conversationId}` };
      }

      const maxLimit = Math.min(parseInt(rawLimit) || 20, 100);

      let sql = `
        SELECT
          m.id, m.direction, m.content_type, m.content,
          m.sender_id, m.sender_name, m.status,
          m.ai_generated, m.created_at
        FROM messages m
        WHERE m.conversation_id = ?
      `;
      const sqlParams = [conversationId];

      if (before) {
        sql += ' AND m.created_at < ?';
        sqlParams.push(before);
      }

      sql += ' ORDER BY m.created_at DESC LIMIT ?';
      sqlParams.push(maxLimit);

      const messages = db.prepare(sql).all(...sqlParams);
      messages.reverse(); // Chronological order

      const totalCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?'
      ).get(conversationId);

      return {
        success: true,
        conversationId,
        conversationTitle: conversation.title || conversation.contactName || 'Unknown',
        platform: conversation.platform,
        totalMessages: totalCount?.cnt || 0,
        returnedCount: messages.length,
        messages: messages.map(m => ({
          id: m.id,
          direction: m.direction,
          contentType: m.content_type,
          content: (m.content || '').substring(0, 1000),
          senderName: m.sender_name || (m.direction === 'outgoing' ? 'Me (Agent)' : 'Unknown'),
          isAiGenerated: !!m.ai_generated,
          status: m.status,
          createdAt: m.created_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('searchMessages', async (params, context) => {
    const { query, contactName, conversationId, platform, direction, daysBack: rawDays, limit: rawLimit } = params;
    if (!query) return { success: false, error: 'query is required' };

    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      const maxLimit = Math.min(parseInt(rawLimit) || 20, 50);
      const daysBack = Math.min(parseInt(rawDays) || 30, 365);

      let sql = `
        SELECT
          m.id, m.conversation_id, m.direction, m.content_type, m.content,
          m.sender_name, m.ai_generated, m.created_at,
          c.title as convTitle, c.platform,
          cont.display_name as contactName
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        LEFT JOIN contacts cont ON c.contact_id = cont.id
        WHERE c.user_id = ?
          AND m.content LIKE ?
          AND m.created_at >= datetime('now', ?)
      `;
      const searchTerm = `%${query}%`;
      const sqlParams = [context.userId, searchTerm, `-${daysBack} days`];

      if (contactName) {
        sql += ' AND (cont.display_name LIKE ? OR m.sender_name LIKE ?)';
        sqlParams.push(`%${contactName}%`, `%${contactName}%`);
      }

      if (conversationId) {
        sql += ' AND m.conversation_id = ?';
        sqlParams.push(conversationId);
      }

      if (platform) {
        sql += ' AND c.platform = ?';
        sqlParams.push(platform);
      }

      if (direction) {
        sql += ' AND m.direction = ?';
        sqlParams.push(direction);
      }

      sql += ' ORDER BY m.created_at DESC LIMIT ?';
      sqlParams.push(maxLimit);

      const messages = db.prepare(sql).all(...sqlParams);

      return {
        success: true,
        query,
        count: messages.length,
        searchPeriod: `last ${daysBack} days`,
        messages: messages.map(m => ({
          id: m.id,
          conversationId: m.conversation_id,
          conversationTitle: m.convTitle || m.contactName || 'Unknown',
          contactName: m.contactName || null,
          platform: m.platform,
          direction: m.direction,
          content: (m.content || '').substring(0, 500),
          senderName: m.sender_name || (m.direction === 'outgoing' ? 'Me (Agent)' : 'Unknown'),
          isAiGenerated: !!m.ai_generated,
          createdAt: m.created_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // MOBILE AGENT TOOLS
  // ============================================================

  registry.registerExecutor('queryMobileEvents', async (params, context) => {
    try {
      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      const userId = context.userId;

      const { eventType, sender, search, since, limit: rawLimit, importantOnly } = params;
      const conditions = ['me.user_id = ?'];
      const sqlParams = [userId];

      if (eventType) {
        conditions.push('me.event_type = ?');
        sqlParams.push(eventType);
      }
      if (sender) {
        conditions.push('me.sender LIKE ?');
        sqlParams.push(`%${sender}%`);
      }
      if (search) {
        conditions.push('(me.title LIKE ? OR me.body LIKE ?)');
        sqlParams.push(`%${search}%`, `%${search}%`);
      }
      if (since) {
        conditions.push('me.created_at > ?');
        sqlParams.push(since);
      } else {
        conditions.push("me.created_at > datetime('now', '-1 day')");
      }
      if (importantOnly) {
        conditions.push('me.is_important = 1');
      }

      const maxLimit = Math.min(parseInt(rawLimit) || 20, 100);
      sqlParams.push(maxLimit);

      const events = db.prepare(`
        SELECT me.id, me.event_type, me.source_app, me.sender, me.title, me.body,
               me.metadata, me.is_important, me.is_read, me.device_timestamp, me.created_at,
               ma.name as device_name
        FROM mobile_events me
        LEFT JOIN mobile_agents ma ON me.mobile_agent_id = ma.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY me.created_at DESC
        LIMIT ?
      `).all(...sqlParams);

      return {
        success: true,
        count: events.length,
        events: events.map(e => ({
          id: e.id,
          eventType: e.event_type,
          sourceApp: e.source_app,
          sender: e.sender,
          title: e.title,
          body: (e.body || '').substring(0, 500),
          metadata: JSON.parse(e.metadata || '{}'),
          isImportant: !!e.is_important,
          isRead: !!e.is_read,
          deviceTimestamp: e.device_timestamp,
          createdAt: e.created_at,
          deviceName: e.device_name,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('getMobileDeviceStatus', async (params, context) => {
    try {
      const { getMobileAgentGateway } = require('../MobileAgentGateway.cjs');
      const { getDatabase } = require('../database.cjs');
      const gateway = getMobileAgentGateway();
      const db = getDatabase();
      const userId = context.userId;

      const devices = db.prepare(
        "SELECT id, name, phone_number, device_model, is_online, last_heartbeat_at, health_metrics FROM mobile_agents WHERE user_id = ? AND status = 'active'"
      ).all(userId);

      if (devices.length === 0) {
        return { success: false, error: 'No paired mobile devices found' };
      }

      // If deviceName specified, filter
      let target = devices;
      if (params.deviceName) {
        target = devices.filter(d => d.name.toLowerCase().includes(params.deviceName.toLowerCase()));
        if (target.length === 0) {
          return { success: false, error: `No device matching "${params.deviceName}" found` };
        }
      }

      const results = target.map(d => {
        const liveStatus = gateway.getDeviceStatus(d.id);
        const storedMetrics = JSON.parse(d.health_metrics || '{}');
        const status = liveStatus || storedMetrics;

        return {
          deviceName: d.name,
          deviceModel: d.device_model,
          phoneNumber: d.phone_number,
          isOnline: gateway.isOnline(d.id),
          lastHeartbeat: d.last_heartbeat_at,
          batteryLevel: status.batteryLevel,
          batteryCharging: status.batteryCharging,
          wifiConnected: status.wifiConnected,
          cellularType: status.cellularType,
          screenOn: status.screenOn,
          storageAvailableMb: status.storageAvailableMb,
        };
      });

      return { success: true, devices: results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('getMobileDeviceLocation', async (params, context) => {
    try {
      const { getMobileAgentGateway } = require('../MobileAgentGateway.cjs');
      const { getDatabase } = require('../database.cjs');
      const gateway = getMobileAgentGateway();
      const db = getDatabase();
      const userId = context.userId;

      const devices = db.prepare(
        "SELECT id, name, device_model FROM mobile_agents WHERE user_id = ? AND status = 'active'"
      ).all(userId);

      if (devices.length === 0) {
        return { success: false, error: 'No paired mobile devices found' };
      }

      let target = devices;
      if (params.deviceName) {
        target = devices.filter(d => d.name.toLowerCase().includes(params.deviceName.toLowerCase()));
        if (target.length === 0) {
          return { success: false, error: `No device matching "${params.deviceName}" found` };
        }
      }

      const results = target.map(d => {
        const liveStatus = gateway.getDeviceStatus(d.id);

        if (liveStatus?.latitude != null && liveStatus?.longitude != null) {
          return {
            deviceName: d.name,
            latitude: liveStatus.latitude,
            longitude: liveStatus.longitude,
            accuracy: liveStatus.locationAccuracy,
            timestamp: liveStatus.locationTimestamp,
            source: 'live',
          };
        }

        // Fallback: check last location_update event
        const lastLocation = db.prepare(`
          SELECT metadata, device_timestamp, created_at
          FROM mobile_events
          WHERE mobile_agent_id = ? AND event_type = 'location_update'
          ORDER BY created_at DESC LIMIT 1
        `).get(d.id);

        if (lastLocation) {
          const meta = JSON.parse(lastLocation.metadata || '{}');
          return {
            deviceName: d.name,
            latitude: meta.latitude,
            longitude: meta.longitude,
            accuracy: meta.accuracy,
            timestamp: lastLocation.device_timestamp || lastLocation.created_at,
            source: 'historical',
          };
        }

        return { deviceName: d.name, error: 'No location data available' };
      });

      return { success: true, locations: results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('sendSmsViaDevice', async (params, context) => {
    try {
      const { recipient, message, deviceName } = params;
      if (!recipient || !message) {
        return { success: false, error: 'recipient and message are required' };
      }
      if (message.length > 1600) {
        return { success: false, error: 'Message exceeds 1600 character limit' };
      }

      const { getMobileAgentGateway } = require('../MobileAgentGateway.cjs');
      const { getDatabase } = require('../database.cjs');
      const gateway = getMobileAgentGateway();
      const db = getDatabase();
      const userId = context.userId;

      // Find online mobile device
      const devices = db.prepare(
        "SELECT id, name FROM mobile_agents WHERE user_id = ? AND status = 'active'"
      ).all(userId);

      let targetDevice = null;
      if (deviceName) {
        targetDevice = devices.find(d => d.name.toLowerCase().includes(deviceName.toLowerCase()));
        if (!targetDevice) {
          return { success: false, error: `No device matching "${deviceName}" found` };
        }
      } else {
        targetDevice = devices.find(d => gateway.isOnline(d.id));
        if (!targetDevice) {
          return { success: false, error: 'No online mobile device found' };
        }
      }

      if (!gateway.isOnline(targetDevice.id)) {
        return { success: false, error: `Device "${targetDevice.name}" is offline` };
      }

      const result = await gateway.sendCommand(targetDevice.id, 'send_sms', { recipient, message });
      return { success: true, deviceName: targetDevice.name, result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('markMobileEventRead', async (params, context) => {
    try {
      const { eventIds } = params;
      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return { success: false, error: 'eventIds array is required' };
      }

      const { getDatabase } = require('../database.cjs');
      const db = getDatabase();
      const userId = context.userId;

      const placeholders = eventIds.map(() => '?').join(',');
      const result = db.prepare(`
        UPDATE mobile_events SET is_read = 1
        WHERE id IN (${placeholders}) AND user_id = ?
      `).run(...eventIds, userId);

      return { success: true, updatedCount: result.changes };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  registry.registerExecutor('notifyMasterMobile', async (params, context) => {
    try {
      const { title, message, priority } = params;
      if (!title || !message) {
        return { success: false, error: 'title and message are required' };
      }

      const validPriorities = ['low', 'normal', 'high', 'urgent'];
      const safePriority = validPriorities.includes(priority) ? priority : 'normal';

      const { getMobileAgentGateway } = require('../MobileAgentGateway.cjs');
      const gateway = getMobileAgentGateway();

      const result = gateway.pushAlert(context.userId, {
        alertType: 'custom',
        title,
        body: message,
        priority: safePriority,
        agenticId: context.agenticId || null,
      });

      if (result.pending) {
        return {
          success: true,
          note: 'Alert stored but no mobile devices are currently online. It will be delivered when a device connects.',
          alertId: result.alertId,
        };
      }

      return {
        success: true,
        alertId: result.alertId,
        deliveredTo: result.deliveredTo.length,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // HELPER: Find or create agent's default knowledge library
  // ============================================================

  logger.info('SystemToolExecutors: All tool executors registered');
}

/**
 * Helper: Find or create an agent's default knowledge library.
 * @param {string} agenticId
 * @param {string} userId
 * @returns {string|null} Library ID
 */
async function _findOrCreateAgentLibrary(agenticId, userId) {
  try {
    const { getDatabase } = require('../database.cjs');
    const db = getDatabase();

    // Check existing linked library
    const linked = db.prepare(`
      SELECT library_id FROM agentic_knowledge WHERE agentic_id = ? LIMIT 1
    `).get(agenticId);

    if (linked) return linked.library_id;

    // Create a new library for this agent
    const crypto = require('crypto');
    const libId = crypto.randomUUID();
    const agentName = db.prepare('SELECT name FROM agentic_profiles WHERE id = ?').get(agenticId)?.name || 'Agent';

    db.prepare(`
      INSERT INTO knowledge_libraries (id, user_id, name, description, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(libId, userId, `${agentName} Knowledge`, `Auto-created knowledge library for ${agentName}`);

    // Link it
    db.prepare(`
      INSERT INTO agentic_knowledge (id, agentic_id, library_id, access_type, created_at)
      VALUES (?, ?, ?, 'read_write', datetime('now'))
    `).run(crypto.randomUUID(), agenticId, libId);

    return libId;
  } catch (e) {
    const { logger } = require('../logger.cjs');
    logger.debug(`_findOrCreateAgentLibrary failed: ${e.message}`);
    return null;
  }
}

module.exports = {
  initializeToolExecutors,
};
