/**
 * SwarmAI Multi-Platform Server
 * =============================
 * WhatsBots-style CommonJS server with multi-platform support
 *
 * Platforms: WhatsApp, Telegram Bot, Telegram User, Email
 *
 * Port: 3210 (API + Socket.io on same port)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server: SocketIOServer } = require('socket.io');
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');

// JWT configuration (must match auth.cjs)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TEST_BYPASS_TOKEN = process.env.TEST_BYPASS_TOKEN || 'swarm-test-bypass-2026';
const ENABLE_TEST_BYPASS = process.env.NODE_ENV !== 'production' &&
                           process.env.ENABLE_TEST_BYPASS !== 'false';

// Services
const { initDatabase, getDatabase } = require('./services/database.cjs');
const { AgentManager } = require('./agents/agentManager.cjs');
const { MessageRouter } = require('./agents/messageRouter.cjs');
const { logger } = require('./services/logger.cjs');
const { unifiedMessageService } = require('./services/unifiedMessageService.cjs');
const { mediaService } = require('./services/mediaService.cjs');
const { getFlowExecutionEngine } = require('./services/flow/FlowExecutionEngine.cjs');
const { registerTriggerNodes } = require('./services/flow/nodes/triggers/index.cjs');
const terminalService = require('./services/terminalService.cjs');
const { initializeSuperBrain, shutdownSuperBrain } = require('./services/ai/index.cjs');
const { getRedisClient, closeRedis } = require('./services/redis.cjs');

// Routes
const authRoutes = require('./routes/auth.cjs');
const agentRoutes = require('./routes/agents.cjs');
const messageRoutes = require('./routes/messages.cjs');
const platformRoutes = require('./routes/platforms.cjs');
const conversationRoutes = require('./routes/conversations.cjs');
const contactRoutes = require('./routes/contacts.cjs');
const dashboardRoutes = require('./routes/dashboard.cjs');
const swarmRoutes = require('./routes/swarm.cjs');
const flowRoutes = require('./routes/flows.cjs');
const aiRoutes = require('./routes/ai.cjs');
const knowledgeRoutes = require('./routes/knowledge.cjs');
const subscriptionRoutes = require('./routes/subscription.cjs');
const agenticRoutes = require('./routes/agentic.cjs');
const webhookRoutes = require('./routes/webhook.cjs');
const dataRoutes = require('./routes/data.cjs');
const ftpRoutes = require('./routes/ftp.cjs');
const databaseSourceRoutes = require('./routes/databaseSource.cjs');
const terminalRoutes = require('./routes/terminal.cjs');
const settingsRoutes = require('./routes/settings.cjs');
const agentLogRoutes = require('./routes/agent-logs.cjs');
const userRoutes = require('./routes/users.cjs');
const cliSessionRoutes = require('./routes/cli-sessions.cjs');
const cliSettingsRoutes = require('./routes/cli-settings.cjs');
const superbrainRoutes = require('./routes/superbrain.cjs');
const mediaRoutes = require('./routes/media.cjs');
const adminRoutes = require('./routes/admin.cjs');
const toolApiKeyRoutes = require('./routes/tool-api-keys.cjs');
const scheduledMessagesRoutes = require('./routes/scheduledMessages.cjs');
const publicWebhookRoutes = require('./routes/publicWebhook.cjs');
const athenaRoutes = require('./routes/athena.cjs');
const localAgentRoutes = require('./routes/local-agents.cjs');
const tempFileRoutes = require('./routes/temp-files.cjs');
const mobileAgentRoutes = require('./routes/mobile-agents.cjs');

// Configuration
const API_PORT = process.env.API_PORT || 3210;
// WS_PORT no longer needed - Socket.io runs on same port as API
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3202').split(',');

// ============================================
// Express App Setup
// ============================================
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for development
}));
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.includes('/health')) {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Health check (basic)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Enhanced health check
app.get('/api/health', (req, res) => {
  try {
    const db = getDatabase();

    // Database stats
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
    const activeAgents = db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'active'").get().count;
    const conversationCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;

    // Platform accounts
    const platformStats = db.prepare(`
      SELECT platform, status, COUNT(*) as count
      FROM platform_accounts
      GROUP BY platform, status
    `).all();

    const platforms = {};
    for (const stat of platformStats) {
      if (!platforms[stat.platform]) {
        platforms[stat.platform] = { connected: 0, disconnected: 0, pending: 0 };
      }
      platforms[stat.platform][stat.status] = stat.count;
    }

    // Model count
    let modelCount = 0;
    try {
      modelCount = db.prepare('SELECT COUNT(*) as count FROM openrouter_models').get().count;
    } catch (e) {
      // Table may not exist
    }

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      node: process.version,
      services: {
        database: {
          status: 'connected',
          users: userCount,
          agents: agentCount,
          conversations: conversationCount
        },
        platforms: platforms,
        models: {
          cached: modelCount
        }
      },
      agents: {
        total: agentCount,
        active: activeAgents
      },
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Detailed health check for infrastructure monitoring
app.get('/api/health/detailed', async (req, res) => {
  try {
    const db = getDatabase();
    const startTime = Date.now();

    // Database health check
    let databaseHealth = { status: 'unknown' };
    try {
      const dbStart = Date.now();
      const pragma = db.prepare('PRAGMA quick_check(1)').get();
      const dbLatency = Date.now() - dbStart;

      const dbVersion = db.prepare('SELECT sqlite_version() as version').get();
      const dbSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();

      databaseHealth = {
        status: pragma.quick_check === 'ok' ? 'healthy' : 'degraded',
        latency: dbLatency,
        version: dbVersion?.version || 'unknown',
        details: 'SQLite database operational',
        size: dbSize?.size ? formatBytes(dbSize.size) : 'unknown',
        connections: 1, // SQLite is single connection
      };
    } catch (dbError) {
      databaseHealth = {
        status: 'offline',
        details: dbError.message,
      };
    }

    // Redis health check
    let redisHealth = { status: 'unknown' };
    try {
      const redis = getRedisClient();
      if (redis) {
        const redisStart = Date.now();
        const pong = await redis.ping();
        const redisLatency = Date.now() - redisStart;

        const info = await redis.info();
        const infoLines = info.split('\r\n');
        const getInfo = (key) => {
          const line = infoLines.find(l => l.startsWith(key + ':'));
          return line ? line.split(':')[1] : null;
        };

        const memoryUsed = getInfo('used_memory_human');
        const connectedClients = getInfo('connected_clients');
        const uptimeSeconds = getInfo('uptime_in_seconds');
        const redisVersion = getInfo('redis_version');

        redisHealth = {
          status: pong === 'PONG' ? 'healthy' : 'degraded',
          latency: redisLatency,
          version: redisVersion || 'unknown',
          details: 'Redis cache operational',
          memory: memoryUsed || 'unknown',
          connections: parseInt(connectedClients) || 0,
          uptime: uptimeSeconds ? formatUptime(parseInt(uptimeSeconds)) : 'unknown',
        };
      } else {
        redisHealth = {
          status: 'offline',
          details: 'Redis not configured',
        };
      }
    } catch (redisError) {
      redisHealth = {
        status: 'offline',
        details: redisError.message,
      };
    }

    // Qdrant health check
    let qdrantHealth = { status: 'unknown' };
    try {
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const qdrantStart = Date.now();

      const response = await fetch(`${qdrantUrl}/collections`);
      const qdrantLatency = Date.now() - qdrantStart;

      if (response.ok) {
        const data = await response.json();
        const collections = data.result?.collections || [];

        qdrantHealth = {
          status: 'healthy',
          latency: qdrantLatency,
          version: 'unknown', // Would need separate /version endpoint
          details: `Qdrant operational with ${collections.length} collections`,
          collectionsSize: `${collections.length} collections`,
        };
      } else {
        qdrantHealth = {
          status: 'degraded',
          latency: qdrantLatency,
          details: `HTTP ${response.status}`,
        };
      }
    } catch (qdrantError) {
      qdrantHealth = {
        status: 'offline',
        details: qdrantError.message,
      };
    }

    // Storage health check
    let storageHealth = { status: 'unknown' };
    try {
      const fs = require('fs');
      const dataDir = path.join(__dirname, 'data');

      if (fs.existsSync(dataDir)) {
        // Calculate directory size
        const getDirSize = (dir) => {
          let size = 0;
          try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const filePath = path.join(dir, file);
              const stat = fs.statSync(filePath);
              if (stat.isDirectory()) {
                size += getDirSize(filePath);
              } else {
                size += stat.size;
              }
            }
          } catch (e) {
            // Ignore permission errors
          }
          return size;
        };

        const totalSize = getDirSize(dataDir);
        storageHealth = {
          status: 'healthy',
          details: 'File storage operational',
          size: formatBytes(totalSize),
        };
      } else {
        storageHealth = {
          status: 'degraded',
          details: 'Data directory not found',
        };
      }
    } catch (storageError) {
      storageHealth = {
        status: 'offline',
        details: storageError.message,
      };
    }

    res.json({
      database: databaseHealth,
      redis: redisHealth,
      qdrant: qdrantHealth,
      storage: storageHealth,
      timestamp: new Date().toISOString(),
      checkDuration: Date.now() - startTime,
    });

  } catch (error) {
    logger.error(`Health check failed: ${error.message}`);
    res.status(500).json({
      error: 'Health check failed',
      details: error.message,
    });
  }
});

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Public Routes (no authentication)
app.use('/public', publicWebhookRoutes);

// API Routes (authenticated)
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/swarm', swarmRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/agentic', agenticRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/ftp', ftpRoutes);
app.use('/api/database', databaseSourceRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/agent-logs', agentLogRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cli/sessions', cliSessionRoutes);
app.use('/api/cli', cliSettingsRoutes);
app.use('/api/superbrain', superbrainRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tool-api-keys', toolApiKeyRoutes);
app.use('/api/scheduled-messages', scheduledMessagesRoutes);
app.use('/api/athena', athenaRoutes);
app.use('/api/local-agents', localAgentRoutes);
app.use('/api/temp-files', tempFileRoutes);
app.use('/api/mobile-agents', mobileAgentRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ============================================
// Socket.io Server Setup (attached to HTTP server)
// ============================================
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 20 * 1024 * 1024, // 20MB — required for Local Agent screenshot/file transfer payloads (default 1MB is too small)
  pingTimeout: 60000,                   // 60s — allow large payloads to finish transmitting before considering connection dead
});

// Store connected clients
const wsClients = new Map();

// ============================================
// Socket.IO JWT Authentication Middleware
// ============================================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    // Allow connection but mark as unauthenticated (for backwards compatibility)
    socket.userId = null;
    logger.debug(`Socket.io client ${socket.id} connected without token`);
    return next();
  }

  // Check for test bypass token (localhost only, non-production)
  if (ENABLE_TEST_BYPASS && token === TEST_BYPASS_TOKEN) {
    const remoteAddress = socket.handshake.address;
    const isLocalhost = remoteAddress === '127.0.0.1' ||
                       remoteAddress === '::1' ||
                       remoteAddress === '::ffff:127.0.0.1';

    if (isLocalhost) {
      socket.userId = 'test-bypass-user';
      socket.userRole = 'admin';
      socket.isSuperuser = true;
      logger.info(`Socket.io client ${socket.id} authenticated via test bypass`);
      return next();
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user from database to verify they exist
    const db = getDatabase();
    const user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE id = ?')
      .get(decoded.userId);

    if (!user) {
      logger.warn(`Socket.io auth failed: user ${decoded.userId} not found`);
      socket.userId = null;
      return next();
    }

    // Store user info in socket for later use
    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userName = user.name;
    socket.userRole = user.role;
    socket.isSuperuser = !!user.is_superuser;

    logger.info(`Socket.io client ${socket.id} authenticated as user ${user.id} (${user.email})`);
    return next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.warn(`Socket.io auth failed: token expired for client ${socket.id}`);
    } else if (err.name === 'JsonWebTokenError') {
      logger.warn(`Socket.io auth failed: invalid token for client ${socket.id}`);
    } else {
      logger.error(`Socket.io auth error: ${err.message}`);
    }
    // Allow connection but mark as unauthenticated
    socket.userId = null;
    return next();
  }
});

io.on('connection', (socket) => {
  const clientId = socket.id;

  // Use userId from middleware authentication
  const authenticatedUserId = socket.userId || null;

  logger.info(`Socket.io client connected: ${clientId}${authenticatedUserId ? ` (user: ${authenticatedUserId})` : ' (unauthenticated)'}`);

  wsClients.set(clientId, {
    socket,
    userId: authenticatedUserId,
    agentIds: []
  });

  // Notify client of authentication status and join user room for targeted notifications
  if (authenticatedUserId) {
    socket.join(`user:${authenticatedUserId}`);
    socket.emit('authenticated', { success: true, userId: authenticatedUserId });
    logger.debug(`Socket ${clientId} joined user room: user:${authenticatedUserId}`);
  }

  // Handle manual authentication (backwards compatibility)
  socket.on('auth', (data) => {
    const client = wsClients.get(clientId);
    if (client) {
      // If already authenticated via middleware, just confirm
      if (socket.userId) {
        logger.info(`Socket.io client ${clientId} re-authenticated (already auth via middleware)`);
        socket.emit('authenticated', { success: true, userId: socket.userId });
        return;
      }

      // Manual auth with userId (legacy support)
      if (data.userId) {
        client.userId = data.userId;
        client.agentIds = data.agentIds || [];
        socket.join(`user:${data.userId}`);
        logger.info(`Socket.io client ${clientId} authenticated for user ${data.userId} (manual)`);
        socket.emit('authenticated', { success: true });
      }
    }
  });

  // Handle subscribe (legacy format with object)
  socket.on('subscribe', (data) => {
    const client = wsClients.get(clientId);
    if (client && data.agentId && !client.agentIds.includes(data.agentId)) {
      client.agentIds.push(data.agentId);
      socket.join(`agent:${data.agentId}`);
      logger.info(`Socket ${clientId} joined agent room: agent:${data.agentId}`);
    }
  });

  // Handle agent:subscribe (new format with string agentId)
  socket.on('agent:subscribe', (agentId) => {
    const client = wsClients.get(clientId);
    if (client && agentId && !client.agentIds.includes(agentId)) {
      client.agentIds.push(agentId);
      socket.join(`agent:${agentId}`);
      logger.info(`Socket ${clientId} joined agent room: agent:${agentId}`);
    }
  });

  // Handle unsubscribe (legacy format with object)
  socket.on('unsubscribe', (data) => {
    const client = wsClients.get(clientId);
    if (client) {
      client.agentIds = client.agentIds.filter(id => id !== data.agentId);
      socket.leave(`agent:${data.agentId}`);
    }
  });

  // Handle agent:unsubscribe (new format with string agentId)
  socket.on('agent:unsubscribe', (agentId) => {
    const client = wsClients.get(clientId);
    if (client) {
      client.agentIds = client.agentIds.filter(id => id !== agentId);
      socket.leave(`agent:${agentId}`);
    }
  });

  // Handle conversation:join (subscribe to conversation-specific events)
  socket.on('conversation:join', (conversationId) => {
    if (conversationId) {
      socket.join(`conversation:${conversationId}`);
      logger.info(`Socket ${clientId} joined conversation room: conversation:${conversationId}`);
    }
  });

  // Handle conversation:leave (unsubscribe from conversation-specific events)
  socket.on('conversation:leave', (conversationId) => {
    if (conversationId) {
      socket.leave(`conversation:${conversationId}`);
      logger.info(`Socket ${clientId} left conversation room: conversation:${conversationId}`);
    }
  });

  // ============================================
  // WebSocket-First Messaging Handlers
  // ============================================

  // Handle conversations:fetch - Stream all conversations via WebSocket
  socket.on('conversations:fetch', async (options = {}) => {
    const client = wsClients.get(clientId);
    const userId = client?.userId || socket.userId;

    if (!userId) {
      socket.emit('conversations:error', { error: 'Not authenticated' });
      return;
    }

    try {
      const db = getDatabase();
      const { agentId, platform, category, limit = 500 } = options;

      let query = `
        SELECT
          c.id,
          c.user_id as userId,
          c.agent_id as agentId,
          c.platform,
          c.external_id as externalId,
          c.contact_id as contactId,
          c.title,
          c.status,
          c.category,
          c.is_group as isGroup,
          c.is_pinned as isPinned,
          c.is_muted as isMuted,
          c.is_archived as isArchived,
          c.metadata,
          c.unread_count as unreadCount,
          c.created_at as createdAt,
          c.updated_at as updatedAt,
          cont.display_name as contactName,
          cont.avatar as contactAvatar,
          a.name as agentName,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as messageCount,
          (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as lastMessage,
          COALESCE(
            (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
            c.last_message_at
          ) as lastMessageAt
        FROM conversations c
        LEFT JOIN contacts cont ON c.contact_id = cont.id
        LEFT JOIN agents a ON c.agent_id = a.id
        WHERE c.user_id = ?
      `;

      const params = [userId];

      if (agentId) {
        query += ' AND c.agent_id = ?';
        params.push(agentId);
      }
      if (platform) {
        query += ' AND c.platform = ?';
        params.push(platform);
      }
      if (category) {
        query += ' AND c.category = ?';
        params.push(category);
      }

      query += ' ORDER BY COALESCE(lastMessageAt, c.last_message_at, c.updated_at) DESC LIMIT ?';
      params.push(parseInt(limit));

      const conversations = db.prepare(query).all(...params);

      // Format conversations
      const formattedConversations = conversations.map(c => ({
        ...c,
        metadata: c.metadata ? JSON.parse(c.metadata) : null,
        isGroup: !!c.isGroup,
        isPinned: !!c.isPinned,
        isMuted: !!c.isMuted,
        isArchived: !!c.isArchived,
        category: c.category || 'chat',
        createdAt: c.createdAt?.includes('T') ? c.createdAt : (c.createdAt?.replace(' ', 'T') + 'Z'),
        updatedAt: c.updatedAt?.includes('T') ? c.updatedAt : (c.updatedAt?.replace(' ', 'T') + 'Z'),
        lastMessageAt: c.lastMessageAt?.includes('T') ? c.lastMessageAt : (c.lastMessageAt?.replace(' ', 'T') + 'Z')
      }));

      socket.emit('conversations:initial', {
        conversations: formattedConversations,
        total: formattedConversations.length
      });

      logger.debug(`WebSocket: Sent ${formattedConversations.length} conversations to ${clientId}`);
    } catch (error) {
      logger.error(`WebSocket conversations:fetch error: ${error.message}`);
      socket.emit('conversations:error', { error: error.message });
    }
  });

  // Handle messages:fetch - Stream messages for a conversation via WebSocket
  socket.on('messages:fetch', async (options = {}) => {
    const client = wsClients.get(clientId);
    const userId = client?.userId || socket.userId;

    if (!userId) {
      socket.emit('messages:error', { error: 'Not authenticated' });
      return;
    }

    const { conversationId, limit = 50, before } = options;

    if (!conversationId) {
      socket.emit('messages:error', { error: 'conversationId is required' });
      return;
    }

    try {
      const db = getDatabase();

      // Verify user has access to this conversation
      const conversation = db.prepare(`
        SELECT id, agent_id, platform, external_id FROM conversations
        WHERE id = ? AND user_id = ?
      `).get(conversationId, userId);

      if (!conversation) {
        socket.emit('messages:error', { error: 'Conversation not found' });
        return;
      }

      // Join the conversation room for real-time updates
      socket.join(`conversation:${conversationId}`);

      // Get total message count
      const countResult = db.prepare(`
        SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?
      `).get(conversationId);
      const totalMessages = countResult?.total || 0;

      // Build query
      let messagesQuery;
      let queryParams;
      const parsedLimit = Math.min(parseInt(limit) || 50, 500);

      if (before) {
        messagesQuery = `
          SELECT
            id, conversation_id, direction, content_type, content,
            media_url, media_mime_type, external_id, sender_id, sender_name,
            reply_to_id, status, ai_generated, metadata, created_at
          FROM messages
          WHERE conversation_id = ? AND created_at < ?
          ORDER BY created_at DESC
          LIMIT ?
        `;
        queryParams = [conversationId, before, parsedLimit];
      } else {
        messagesQuery = `
          SELECT
            id, conversation_id, direction, content_type, content,
            media_url, media_mime_type, external_id, sender_id, sender_name,
            reply_to_id, status, ai_generated, metadata, created_at
          FROM messages
          WHERE conversation_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `;
        queryParams = [conversationId, parsedLimit];
      }

      const messages = db.prepare(messagesQuery).all(...queryParams);

      // Transform and reverse to chronological order
      const transformedMessages = messages.reverse().map(m => ({
        id: m.id,
        conversationId: m.conversation_id,
        direction: m.direction,
        contentType: m.content_type,
        content: m.content,
        mediaUrl: m.media_url,
        mediaMimeType: m.media_mime_type,
        externalId: m.external_id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        replyToId: m.reply_to_id,
        status: m.status,
        aiGenerated: !!m.ai_generated,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        createdAt: m.created_at?.includes('T') ? m.created_at : (m.created_at?.replace(' ', 'T') + 'Z')
      }));

      // Determine if there are more messages
      const oldestFetched = messages.length > 0 ? messages[messages.length - 1].created_at : null;
      const hasMore = messages.length === parsedLimit && totalMessages > parsedLimit;

      socket.emit('messages:initial', {
        conversationId,
        messages: transformedMessages,
        pagination: {
          hasMore,
          nextCursor: oldestFetched,
          total: totalMessages
        }
      });

      logger.debug(`WebSocket: Sent ${transformedMessages.length} messages for conversation ${conversationId} to ${clientId}`);
    } catch (error) {
      logger.error(`WebSocket messages:fetch error: ${error.message}`);
      socket.emit('messages:error', { error: error.message });
    }
  });

  // Handle ping
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // ============================================
  // Terminal WebSocket Handlers
  // ============================================

  // Handle terminal subscription
  socket.on('terminal:subscribe', (data) => {
    const { sessionId, token } = data;

    if (!sessionId) {
      socket.emit('terminal:error', { error: 'Session ID is required' });
      return;
    }

    const client = wsClients.get(clientId);
    const userId = client?.userId;

    if (!userId) {
      socket.emit('terminal:error', { error: 'Not authenticated' });
      return;
    }

    // Verify session ownership
    if (!terminalService.verifyOwnership(sessionId, userId)) {
      socket.emit('terminal:error', { error: 'Session not found or access denied', sessionId });
      return;
    }

    // Join terminal room
    socket.join(`terminal:${sessionId}`);

    // Store terminal session in client data
    if (client) {
      client.terminalSessionId = sessionId;
    }

    logger.info(`[Terminal] Client ${clientId} subscribed to session ${sessionId}`);

    // Send subscription confirmation
    socket.emit('terminal:subscribed', { sessionId });

    // Send buffered output for reconnection
    const bufferedOutput = terminalService.getBufferedOutput(sessionId);
    if (bufferedOutput) {
      socket.emit('terminal:buffer', { data: bufferedOutput });
    }
  });

  // Handle terminal input
  socket.on('terminal:write', (data) => {
    const { sessionId, input } = data;

    if (!sessionId || !input) {
      return;
    }

    const client = wsClients.get(clientId);
    const userId = client?.userId;

    if (!userId) {
      socket.emit('terminal:error', { error: 'Not authenticated' });
      return;
    }

    // Verify ownership before writing
    if (!terminalService.verifyOwnership(sessionId, userId)) {
      socket.emit('terminal:error', { error: 'Session not found or access denied' });
      return;
    }

    try {
      terminalService.write(sessionId, input);
    } catch (err) {
      socket.emit('terminal:error', { error: err.message });
    }
  });

  // Handle terminal resize
  socket.on('terminal:resize', (data) => {
    const { sessionId, cols, rows } = data;

    if (!sessionId || !cols || !rows) {
      return;
    }

    const client = wsClients.get(clientId);
    const userId = client?.userId;

    if (!userId) {
      return;
    }

    // Verify ownership
    if (!terminalService.verifyOwnership(sessionId, userId)) {
      return;
    }

    terminalService.resize(sessionId, cols, rows);
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    logger.info(`Socket.io client disconnected: ${clientId} (${reason})`);
    wsClients.delete(clientId);
  });

  // Send welcome message
  socket.emit('connected', {
    clientId,
    timestamp: new Date().toISOString()
  });
});

/**
 * Broadcast message to subscribed clients
 */
function broadcast(eventType, data, agentId = null) {
  const payload = {
    data,
    timestamp: new Date().toISOString()
  };

  // Debug logging for message broadcasts
  if (eventType === 'message:new') {
    const roomName = agentId ? `agent:${agentId}` : 'all clients';
    const conversationId = data?.conversation?.id || data?.message?.conversationId;
    const socketsInRoom = agentId ? io.sockets.adapter.rooms.get(`agent:${agentId}`)?.size || 0 : io.sockets.sockets.size;
    logger.info(`[WS Broadcast] ${eventType} to ${roomName} (${socketsInRoom} sockets), conversation: ${conversationId}`);
  }

  if (agentId) {
    // Emit to specific agent room
    io.to(`agent:${agentId}`).emit(eventType, payload);
  } else {
    // Emit to all connected clients
    io.emit(eventType, payload);
  }

  // Also emit to conversation room if data contains a conversation/message reference
  if (eventType === 'message:new' && data) {
    const conversationId = data.conversation?.id || data.message?.conversationId || data.message?.conversation_id;
    if (conversationId) {
      io.to(`conversation:${conversationId}`).emit(eventType, payload);
    }
  }
}

// Export broadcast and io for use in other modules
global.wsBroadcast = broadcast;
global.io = io;

// ============================================
// Terminal Service Event Listeners
// ============================================

// Forward terminal output to WebSocket clients
terminalService.on('data', (sessionId, data) => {
  io.to(`terminal:${sessionId}`).emit('terminal:data', { data });
});

// Forward terminal exit events
terminalService.on('exit', (sessionId, exitCode, signal) => {
  io.to(`terminal:${sessionId}`).emit('terminal:exit', { exitCode, signal });
});

// Forward terminal errors
terminalService.on('error', (sessionId, error) => {
  io.to(`terminal:${sessionId}`).emit('terminal:error', {
    error: error.message,
    sessionId
  });
});

// Handle session closed
terminalService.on('closed', (sessionId) => {
  io.to(`terminal:${sessionId}`).emit('terminal:exit', { exitCode: 0 });
});

// ============================================
// Initialize Services
// ============================================
async function initialize() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🚀 SwarmAI Multi-Platform Server');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Initialize database
    logger.info('📦 Initializing database...');
    await initDatabase();
    logger.info('✅ Database initialized');

    // Initialize Redis (optional, for SuperBrain activity logging)
    logger.info('📊 Initializing Redis connection...');
    const redis = getRedisClient();
    if (redis) {
      logger.info('✅ Redis client initialized');
    } else {
      logger.warn('⚠️ Redis not configured - SuperBrain activity logging disabled');
    }

    // Initialize SuperBrain AI System
    logger.info('🧠 Initializing SuperBrain AI system...');
    initializeSuperBrain({
      terminalService,
      broadcast,
    });
    logger.info('✅ SuperBrain initialized');

    // Initialize agent manager
    logger.info('🤖 Initializing agent manager...');
    const agentManager = AgentManager.getInstance();
    await agentManager.initialize();
    logger.info('✅ Agent manager initialized');

    // Initialize message router
    logger.info('📨 Initializing message router...');
    const messageRouter = MessageRouter.getInstance();
    messageRouter.initialize(agentManager, broadcast);
    logger.info('✅ Message router initialized');

    // Initialize unified message service
    logger.info('📬 Initializing unified message service...');
    unifiedMessageService.initialize(broadcast);
    unifiedMessageService.setAgentManager(agentManager);

    // Initialize flow execution engine and register trigger nodes
    logger.info('🔄 Initializing flow execution engine...');
    const flowEngine = getFlowExecutionEngine();
    registerTriggerNodes(flowEngine);
    unifiedMessageService.setFlowEngine(flowEngine);
    logger.info('✅ Flow engine initialized with message triggers');

    // Initialize FlowBuilder Schema RAG (self-updating knowledge base)
    logger.info('📚 Initializing FlowBuilder Schema RAG...');
    const { getFlowSchemaRAG } = require('./services/flow/FlowSchemaRAG.cjs');
    const flowSchemaRAG = getFlowSchemaRAG();
    flowSchemaRAG.initialize().then(() => {
      logger.info('✅ FlowBuilder Schema RAG initialized');
    }).catch(err => {
      logger.warn(`FlowBuilder Schema RAG init failed (non-critical): ${err.message}`);
    });

    // Initialize Agentic AI Schema RAG (teaches AI how to create other AIs)
    logger.info('🤖 Initializing Agentic AI Schema RAG...');
    const { getAgenticSchemaRAG } = require('./services/agentic/AgenticSchemaRAG.cjs');
    const agenticSchemaRAG = getAgenticSchemaRAG();
    agenticSchemaRAG.initialize().then(() => {
      logger.info('✅ Agentic AI Schema RAG initialized');
    }).catch(err => {
      logger.warn(`Agentic AI Schema RAG init failed (non-critical): ${err.message}`);
    });

    // Set up media cleanup interval (every hour)
    logger.info('🗑️ Setting up media cleanup scheduler...');
    setInterval(() => {
      try {
        const cleaned = mediaService.cleanupExpired();
        if (cleaned > 0) {
          logger.info(`Media cleanup: removed ${cleaned} expired files`);
        }
      } catch (error) {
        logger.error(`Media cleanup failed: ${error.message}`);
      }
    }, 60 * 60 * 1000); // 1 hour
    logger.info('✅ Media cleanup scheduler started');

    // Set up temp file cleanup interval (Phase 5.4 — every hour)
    try {
      const { getTempFileService } = require('./services/TempFileService.cjs');
      const tempFileService = getTempFileService();
      tempFileService.startCleanupInterval(60 * 60 * 1000); // 1 hour
      logger.info('✅ Temp file cleanup scheduler started');
    } catch (error) {
      logger.warn(`Temp file cleanup init failed (non-critical): ${error.message}`);
    }

    // Completed task cleanup — 48-hour TTL for completed agentic tasks
    try {
      const ttlDb = getDatabase();
      // Create performance index for TTL queries
      ttlDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_agentic_task_completed_ttl
        ON agentic_tasks(status, completed_at);
      `);
      // Also create partial unique index for schedule deduplication
      ttlDb.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_agentic_schedule_unique_title
        ON agentic_schedules(agentic_id, title) WHERE is_active = 1;
      `);
      logger.info('✅ Task TTL and schedule dedup indexes ensured');
    } catch (idxErr) {
      logger.debug(`Index creation skipped: ${idxErr.message}`);
    }

    setInterval(() => {
      try {
        const db = getDatabase();
        const result = db.prepare(`
          DELETE FROM agentic_tasks
          WHERE status = 'completed'
            AND completed_at IS NOT NULL
            AND completed_at <= datetime('now', '-2 days')
        `).run();
        if (result.changes > 0) {
          logger.info(`[TaskTTL] Cleaned up ${result.changes} completed tasks older than 48h`);
        }
      } catch (error) {
        logger.error(`[TaskTTL] Cleanup failed: ${error.message}`);
      }
    }, 60 * 60 * 1000); // Every hour
    logger.info('✅ Completed task TTL scheduler started (48h)');

    // Mobile Agent daily cleanup (expire old events + pairing codes)
    setInterval(() => {
      try {
        const db = getDatabase();
        // Expire pending pairing codes
        db.prepare("UPDATE mobile_pairing_codes SET status = 'expired' WHERE status = 'pending' AND expires_at < datetime('now')").run();
        // Delete events older than 30 days (90 if important)
        const deleted30 = db.prepare("DELETE FROM mobile_events WHERE is_important = 0 AND created_at < datetime('now', '-30 days')").run();
        const deleted90 = db.prepare("DELETE FROM mobile_events WHERE is_important = 1 AND created_at < datetime('now', '-90 days')").run();
        const total = (deleted30.changes || 0) + (deleted90.changes || 0);
        if (total > 0) {
          logger.info(`[MobileAgent] Cleanup: removed ${total} old events`);
        }
      } catch (e) {
        logger.warn(`[MobileAgent] Cleanup failed: ${e.message}`);
      }
    }, 24 * 60 * 60 * 1000); // Every 24h

    // Cleanup orphaned WhatsApp sessions on startup
    logger.info('🧹 Checking for orphaned WhatsApp sessions...');
    try {
      const { sessionCleanupService } = require('./services/sessionCleanupService.cjs');
      const orphaned = sessionCleanupService.getOrphanedSessions();
      if (orphaned.length > 0) {
        logger.info(`Found ${orphaned.length} orphaned sessions, cleaning up...`);
        const result = sessionCleanupService.cleanupAllOrphaned();
        logger.info(`✅ Cleaned up ${result.deleted}/${result.total} orphaned sessions`);
      } else {
        logger.info('✅ No orphaned sessions found');
      }
    } catch (error) {
      logger.warn(`Orphaned session cleanup failed: ${error.message}`);
    }

    // Start HTTP server FIRST so health checks pass and API is reachable
    // Agent reconnection happens after (can take minutes for WhatsApp/Puppeteer)
    httpServer.listen(API_PORT, () => {
      logger.info(`📡 API Server running on port ${API_PORT}`);
      logger.info(`🔌 Socket.io attached to same port ${API_PORT}`);
    });

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('✨ Server ready! (agent reconnection starting in background...)');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Start message scheduler
    const { startScheduler } = require('./services/schedulerService.cjs');
    startScheduler();
    logger.info('⏰ Message scheduler started');

    // Initialize Delivery Queue (DLQ + send retry for agentic messages)
    const { getDeliveryQueueService } = require('./services/deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    dlq.initialize(agentManager);

    // Phase 3a: Initialize Channel Health Monitor (per-platform health tracking)
    try {
      const { getChannelHealthMonitor } = require('./services/ChannelHealthMonitor.cjs');
      const channelHealth = getChannelHealthMonitor();
      channelHealth.initialize({ agentManager, broadcast });
      logger.info('🩺 Channel Health Monitor started');
    } catch (channelHealthError) {
      logger.warn(`🩺 Channel Health Monitor init skipped: ${channelHealthError.message}`);
    }

    // Start Agentic SchedulerService (background job scheduler for all agentic profiles)
    try {
      const { getSchedulerService } = require('./services/agentic/SchedulerService.cjs');
      const { getSuperBrainRouter } = require('./services/ai/SuperBrainRouter.cjs');
      const agenticScheduler = getSchedulerService();
      agenticScheduler.initialize({ superBrain: getSuperBrainRouter() });
      agenticScheduler.start();
      logger.info('📅 Agentic SchedulerService started');

      // Log AI concurrency guard settings
      const { getAIConcurrencyGuard } = require('./services/agentic/AIConcurrencyGuard.cjs');
      const aiGuard = getAIConcurrencyGuard();
      logger.info(`🛡️ AI Concurrency Guard: max ${aiGuard.maxConcurrent} simultaneous background AI tasks (set AI_MAX_CONCURRENT_BACKGROUND to change)`);
    } catch (schedulerError) {
      logger.warn(`📅 Agentic SchedulerService init skipped: ${schedulerError.message}`);
    }

    // Initialize Hook Registry + built-in hooks (event-driven extensibility)
    try {
      const { getHookRegistry } = require('./services/agentic/HookRegistry.cjs');
      const hookRegistry = getHookRegistry();
      const { registerSessionLoggerHook } = require('./services/agentic/hooks/SessionLoggerHook.cjs');
      const { registerSoulSwapHook } = require('./services/agentic/hooks/SoulSwapHook.cjs');
      const { registerSelfHealingHook } = require('./services/agentic/hooks/SelfHealingHook.cjs');
      const { registerAuditLogHook } = require('./services/agentic/hooks/AuditLogHook.cjs');
      registerSessionLoggerHook(hookRegistry);
      registerSoulSwapHook(hookRegistry);
      registerSelfHealingHook(hookRegistry);
      registerAuditLogHook(hookRegistry);
      logger.info('🪝 Hook Registry initialized with built-in hooks');
    } catch (hookError) {
      logger.warn(`🪝 Hook Registry init skipped: ${hookError.message}`);
    }

    // Initialize Audit Log TTL cleanup (purges audit entries older than 48h)
    try {
      const { getAuditLogService } = require('./services/agentic/AuditLogService.cjs');
      getAuditLogService().startTTLCleanup();
    } catch (auditErr) {
      logger.warn(`[AuditLog] TTL cleanup init skipped: ${auditErr.message}`);
    }

    // Initialize Heartbeat Service (periodic agent health checks)
    try {
      const { getHeartbeatService } = require('./services/agentic/HeartbeatService.cjs');
      const heartbeat = getHeartbeatService();
      heartbeat.start();
      logger.info('💓 Heartbeat Service started');
    } catch (heartbeatError) {
      logger.warn(`💓 Heartbeat Service init skipped: ${heartbeatError.message}`);
    }

    // Phase 7: Initialize Reasoning Job Queue (Bull + Redis)
    try {
      const { getReasoningJobQueue } = require('./services/agentic/ReasoningJobQueue.cjs');
      const jobQueue = getReasoningJobQueue();
      jobQueue.initialize();
      jobQueue.startWorker(3);
      logger.info('Bull reasoning job queue started (concurrency=3)');
    } catch (queueError) {
      logger.warn(`Job queue init skipped: ${queueError.message}`);
    }

    // Phase 5.1: Initialize Local Agent Gateway (WebSocket namespace for CLI agents)
    try {
      const { getLocalAgentGateway } = require('./services/LocalAgentGateway.cjs');
      const localAgentGateway = getLocalAgentGateway();
      localAgentGateway.initialize(io);
      logger.info('Local Agent Gateway initialized');
    } catch (lagError) {
      logger.warn(`Local Agent Gateway init skipped: ${lagError.message}`);
    }

    // Mobile Agent Gateway (WebSocket namespace for Android mobile agents)
    try {
      const { getMobileAgentGateway } = require('./services/MobileAgentGateway.cjs');
      const mobileAgentGateway = getMobileAgentGateway();
      mobileAgentGateway.initialize(io);
      logger.info('Mobile Agent Gateway initialized');
    } catch (magError) {
      logger.warn(`Mobile Agent Gateway init skipped: ${magError.message}`);
    }

    // Initialize Async CLI Execution Manager (background CLI task tracking + crash recovery)
    try {
      const { getAsyncCLIExecutionManager } = require('./services/ai/AsyncCLIExecutionManager.cjs');
      const asyncCliManager = getAsyncCLIExecutionManager();
      asyncCliManager.initialize(io);
      logger.info('Async CLI Execution Manager initialized');
    } catch (asyncCliError) {
      logger.warn(`Async CLI Manager init skipped: ${asyncCliError.message}`);
    }

    // Auto-reconnect active agents (background - don't block server startup)
    // WhatsApp/Puppeteer can take minutes to initialize Chrome instances
    logger.info('🔄 Reconnecting active agents (background)...');
    agentManager.reconnectActiveAgents().then(() => {
      logger.info('✅ Agent reconnection complete');

      // Initialize Athena Personal Assistant (after platforms reconnected)
      try {
        const { getAthenaMonitorService } = require('./services/agentic/AthenaMonitorService.cjs');
        const athena = getAthenaMonitorService();
        athena.initialize({ agentManager }).then(initialized => {
          if (initialized) {
            athena.start().then(() => logger.info('🦉 Athena Personal Assistant started'));
          } else {
            logger.info('🦉 Athena: No active profile found (run setup-athena.cjs to create)');
          }
        });
      } catch (athenaError) {
        logger.warn(`🦉 Athena init skipped: ${athenaError.message}`);
      }
    }).catch(err => {
      logger.error(`Agent reconnection failed: ${err.message}`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    async function shutdown(signal) {
      logger.info(`\n${signal} received, shutting down gracefully...`);

      // Set a maximum shutdown timeout
      const forceExitTimeout = setTimeout(() => {
        logger.warn('Graceful shutdown timeout - forcing exit');
        process.exit(1);
      }, 15000); // 15 second timeout

      try {
        // Close Socket.io connections
        io.close();

        // Stop Heartbeat Service
        try {
          const { getHeartbeatService } = require('./services/agentic/HeartbeatService.cjs');
          getHeartbeatService().stop();
        } catch (e) { /* ignore */ }

        // Stop Athena
        try {
          const { getAthenaMonitorService } = require('./services/agentic/AthenaMonitorService.cjs');
          await getAthenaMonitorService().stop();
        } catch (e) { /* ignore */ }

        // Phase 7: Stop Job Queue
        try {
          const { getReasoningJobQueue } = require('./services/agentic/ReasoningJobQueue.cjs');
          await getReasoningJobQueue().stop();
        } catch (e) { /* ignore */ }

        // Stop Async CLI Execution Manager (kill background CLI processes)
        try {
          const { getAsyncCLIExecutionManager } = require('./services/ai/AsyncCLIExecutionManager.cjs');
          getAsyncCLIExecutionManager().shutdown();
        } catch (e) { /* ignore */ }

        // Stop Local Agent Gateway
        try {
          const { getLocalAgentGateway } = require('./services/LocalAgentGateway.cjs');
          getLocalAgentGateway().stop();
        } catch (e) { /* ignore */ }

        // Stop Mobile Agent Gateway
        try {
          const { getMobileAgentGateway } = require('./services/MobileAgentGateway.cjs');
          getMobileAgentGateway().stop();
        } catch (e) { /* ignore */ }

        // Stop Channel Health Monitor
        try {
          const { getChannelHealthMonitor } = require('./services/ChannelHealthMonitor.cjs');
          getChannelHealthMonitor().stop();
        } catch (e) { /* ignore */ }

        // Stop Delivery Queue retry timer
        try {
          const { getDeliveryQueueService } = require('./services/deliveryQueueService.cjs');
          getDeliveryQueueService().shutdown();
        } catch (e) { /* ignore */ }

        // Shutdown SuperBrain
        shutdownSuperBrain();

        // Close Redis connection
        await closeRedis();

        // Disconnect all agents gracefully
        await agentManager.disconnectAll(true);

        // Close HTTP server
        httpServer.close();

        clearTimeout(forceExitTimeout);
        logger.info('Goodbye!');
        process.exit(0);

      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }
    }

  } catch (error) {
    logger.error(`Failed to initialize server: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Start the server
initialize();
