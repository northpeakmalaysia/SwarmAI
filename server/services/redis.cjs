/**
 * Redis Client
 *
 * Centralized Redis connection using ioredis.
 * Used for caching, session storage, and real-time data with TTL.
 */

const Redis = require('ioredis');
const { config } = require('../config/index.cjs');
const { logger } = require('./logger.cjs');

let redisClient = null;
let isConnected = false;

/**
 * Get or create Redis client
 * @returns {Redis|null} Redis client or null if not configured
 */
function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  // Check if Redis is configured
  if (!config.redisHost && !config.redisUrl) {
    logger.warn('Redis not configured - some features will be disabled');
    return null;
  }

  try {
    const redisOptions = {
      host: config.redisHost || 'localhost',
      port: config.redisPort || 6380,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true,
    };

    // Add password if configured
    if (config.redisPassword) {
      redisOptions.password = config.redisPassword;
    }

    // Use URL if provided (overrides host/port)
    if (config.redisUrl) {
      redisClient = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
      });
    } else {
      redisClient = new Redis(redisOptions);
    }

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
      isConnected = true;
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
      isConnected = false;
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
      isConnected = false;
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    // Note: With lazyConnect: true, ioredis auto-connects on first command
    // No need to call connect() explicitly - it causes "already connecting" errors
    // when multiple services call getRedisClient() during startup

    return redisClient;

  } catch (error) {
    logger.error(`Failed to create Redis client: ${error.message}`);
    return null;
  }
}

/**
 * Check if Redis is connected and available
 * @returns {boolean}
 */
function isRedisAvailable() {
  return redisClient && isConnected;
}

/**
 * Graceful shutdown
 */
async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis client disconnected');
    } catch (error) {
      logger.error(`Redis disconnect error: ${error.message}`);
    }
    redisClient = null;
    isConnected = false;
  }
}

// ============= Contact Caching Methods =============

const CONTACT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Get cached contacts for an agent
 * @param {string} agentId - Platform account ID
 * @returns {Promise<Array|null>} Contacts array or null if not cached
 */
async function getBulkContacts(agentId) {
  const client = getRedisClient();
  if (!client || !isConnected) return null;

  const key = `contacts:${agentId}`;
  try {
    const contactsHash = await client.hgetall(key);
    if (!contactsHash || Object.keys(contactsHash).length === 0) {
      return null;
    }

    // Convert hash values to array
    const contacts = Object.values(contactsHash).map(contact => JSON.parse(contact));
    return contacts;
  } catch (error) {
    logger.error(`[Redis] Error getting bulk contacts: ${error.message}`);
    return null;
  }
}

/**
 * Store contacts for an agent with TTL
 * @param {string} agentId - Platform account ID
 * @param {Array} contacts - Contacts array to store
 * @returns {Promise<boolean>} Success status
 */
async function storeBulkContacts(agentId, contacts) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  const key = `contacts:${agentId}`;
  try {
    // Clear existing hash
    await client.del(key);

    // Store each contact in hash
    if (contacts && contacts.length > 0) {
      const pipeline = client.pipeline();

      for (const contact of contacts) {
        const contactId = contact.id?._serialized || contact.id || contact.number;
        if (contactId) {
          pipeline.hset(key, contactId, JSON.stringify(contact));
        }
      }

      await pipeline.exec();
      // Set TTL for the entire hash (7 days)
      await client.expire(key, CONTACT_TTL);
    }

    // Store last sync time
    const syncKey = `contacts:${agentId}:lastSync`;
    await client.set(syncKey, Date.now().toString(), 'EX', CONTACT_TTL);

    return true;
  } catch (error) {
    logger.error(`[Redis] Error storing bulk contacts: ${error.message}`);
    return false;
  }
}

/**
 * Get last contact sync timestamp
 * @param {string} agentId - Platform account ID
 * @returns {Promise<number|null>} Timestamp or null
 */
async function getContactListLastSync(agentId) {
  const client = getRedisClient();
  if (!client || !isConnected) return null;

  const key = `contacts:${agentId}:lastSync`;
  try {
    const timestamp = await client.get(key);
    return timestamp ? parseInt(timestamp) : null;
  } catch (error) {
    logger.error(`[Redis] Error getting contact sync time: ${error.message}`);
    return null;
  }
}

/**
 * Clear cached contacts for an agent
 * @param {string} agentId - Platform account ID
 * @returns {Promise<boolean>} Success status
 */
async function clearContacts(agentId) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  try {
    await client.del(`contacts:${agentId}`);
    await client.del(`contacts:${agentId}:lastSync`);
    return true;
  } catch (error) {
    logger.error(`[Redis] Error clearing contacts: ${error.message}`);
    return false;
  }
}

/**
 * Get cached profile picture for a chat
 * @param {string} agentId - Platform account ID
 * @param {string} chatId - Chat ID
 * @returns {Promise<string|null>} Profile pic URL or null
 */
async function getProfilePic(agentId, chatId) {
  const client = getRedisClient();
  if (!client || !isConnected) return null;

  const key = `profilepic:${agentId}:${chatId}`;
  try {
    return await client.get(key);
  } catch (error) {
    logger.error(`[Redis] Error getting profile pic: ${error.message}`);
    return null;
  }
}

/**
 * Store profile picture URL for a chat
 * @param {string} agentId - Platform account ID
 * @param {string} chatId - Chat ID
 * @param {string} profilePicUrl - Profile picture URL
 * @returns {Promise<boolean>} Success status
 */
async function storeProfilePic(agentId, chatId, profilePicUrl) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  const key = `profilepic:${agentId}:${chatId}`;
  try {
    await client.set(key, profilePicUrl, 'EX', CONTACT_TTL);
    return true;
  } catch (error) {
    logger.error(`[Redis] Error storing profile pic: ${error.message}`);
    return false;
  }
}

/**
 * Get cached contact by ID
 * @param {string} agentId - Platform account ID
 * @param {string} contactId - Contact ID
 * @returns {Promise<Object|null>} Contact object or null
 */
async function getContact(agentId, contactId) {
  const client = getRedisClient();
  if (!client || !isConnected) return null;

  const key = `contacts:${agentId}`;
  try {
    const contactJson = await client.hget(key, contactId);
    return contactJson ? JSON.parse(contactJson) : null;
  } catch (error) {
    logger.error(`[Redis] Error getting contact: ${error.message}`);
    return null;
  }
}

/**
 * Store a single contact
 * @param {string} agentId - Platform account ID
 * @param {string} contactId - Contact ID
 * @param {Object} contact - Contact data
 * @returns {Promise<boolean>} Success status
 */
async function storeContact(agentId, contactId, contact) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  const key = `contacts:${agentId}`;
  try {
    await client.hset(key, contactId, JSON.stringify(contact));
    return true;
  } catch (error) {
    logger.error(`[Redis] Error storing contact: ${error.message}`);
    return false;
  }
}

// ============= Link Preview Caching Methods =============

const LINK_PREVIEW_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

// ============= Message Storage TTL Configuration =============
// These can be overridden via environment variables or settings
const MESSAGE_TTL = {
  chat: parseInt(process.env.MSG_TTL_CHAT || 7 * 24 * 60 * 60),       // 7 days default
  group: parseInt(process.env.MSG_TTL_GROUP || 7 * 24 * 60 * 60),     // 7 days default
  status: parseInt(process.env.MSG_TTL_STATUS || 24 * 60 * 60),       // 24 hours default
  newsletter: parseInt(process.env.MSG_TTL_NEWSLETTER || 30 * 24 * 60 * 60), // 30 days default
};

const MEDIA_TTL = parseInt(process.env.MSG_TTL_MEDIA || 48 * 60 * 60); // 48 hours default

/**
 * Get cached link preview for a URL
 * @param {string} url - URL to get preview for
 * @returns {Promise<Object|null>} Preview metadata or null
 */
async function getLinkPreview(url) {
  const client = getRedisClient();
  if (!client || !isConnected) return null;

  const key = `linkpreview:${encodeURIComponent(url)}`;
  try {
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.error(`[Redis] Error getting link preview: ${error.message}`);
    return null;
  }
}

/**
 * Store link preview for a URL with 30-day TTL
 * @param {string} url - URL
 * @param {Object} preview - Preview metadata (title, description, image, etc.)
 * @returns {Promise<boolean>} Success status
 */
async function storeLinkPreview(url, preview) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  const key = `linkpreview:${encodeURIComponent(url)}`;
  try {
    await client.set(key, JSON.stringify(preview), 'EX', LINK_PREVIEW_TTL);
    return true;
  } catch (error) {
    logger.error(`[Redis] Error storing link preview: ${error.message}`);
    return false;
  }
}

/**
 * Clear all cached link previews (admin operation)
 * @returns {Promise<number>} Number of keys deleted
 */
async function clearAllLinkPreviews() {
  const client = getRedisClient();
  if (!client || !isConnected) return 0;

  try {
    const keys = await client.keys('linkpreview:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    return keys.length;
  } catch (error) {
    logger.error(`[Redis] Error clearing link previews: ${error.message}`);
    return 0;
  }
}

// ============= Message Storage Methods (WhatsBots-style) =============

/**
 * Determine message type from chat ID and platform
 * @param {string} chatId - Chat identifier
 * @param {string} platform - Platform name (whatsapp, telegram, email)
 * @returns {string} Message type: 'chat', 'group', 'status', 'newsletter', 'email'
 */
function getMessageType(chatId, platform = null) {
  if (!chatId) return 'chat';

  // Platform-specific handling
  if (platform === 'email') return 'email';
  if (platform === 'telegram') {
    // Telegram group chats have negative IDs or contain 'group'/'supergroup'
    if (chatId.startsWith('-') || chatId.includes('group')) return 'group';
    return 'chat';
  }

  // WhatsApp-specific patterns
  if (chatId.includes('@g.us') || chatId.includes('@lid')) return 'group';
  if (chatId.includes('@newsletter')) return 'newsletter';
  if (chatId.includes('status@broadcast') || chatId.includes('@broadcast')) return 'status';
  return 'chat';
}

/**
 * Get Redis key for message storage
 * @param {string} accountId - Platform account ID
 * @param {string} type - Message type
 * @param {string} chatId - Chat identifier
 * @returns {string} Redis key
 */
function getMessageKey(accountId, type, chatId) {
  return `messages:${accountId}:${type}:${chatId}`;
}

/**
 * Store a message in Redis with TTL
 * Uses sorted sets for efficient time-based retrieval
 * @param {string} accountId - Platform account ID
 * @param {Object} message - Message object
 * @param {Object} media - Optional media data (base64)
 * @returns {Promise<boolean>} Success status
 */
async function storeMessage(accountId, message, media = null) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  try {
    const platform = message.platform || null;

    // Determine chat identifier based on message direction
    let chatId;
    if (message.fromMe) {
      chatId = message.to || message.from;
    } else {
      chatId = message.from;
    }

    // Handle WhatsApp group messages specifically
    if (message.from?.includes('@g.us') || message.to?.includes('@g.us')) {
      chatId = message.from?.includes('@g.us') ? message.from : message.to;
    }

    const messageType = getMessageType(chatId, platform);
    const messageKey = getMessageKey(accountId, messageType, chatId);
    const ttl = MESSAGE_TTL[messageType] || MESSAGE_TTL.chat;

    // Store media separately if present
    if (media && media.data) {
      const mediaKey = `media:${accountId}:${message.id}`;
      await client.set(mediaKey, JSON.stringify({
        mimetype: media.mimetype,
        filename: media.filename,
        data: media.data,
        caption: media.caption || ''
      }), 'EX', MEDIA_TTL);
      logger.debug(`[Redis] Media stored: ${mediaKey}`);
    }

    // Prepare message data (without embedded media to save space)
    const messageData = {
      id: message.id,
      from: message.from,
      to: message.to,
      fromName: message.fromName || message.senderName,
      body: message.body,
      timestamp: message.timestamp || Math.floor(Date.now() / 1000),
      type: message.type,
      hasMedia: !!media || message.hasMedia,
      mediaType: message.mediaType,
      caption: message.caption,
      author: message.author,
      fromMe: message.fromMe,
      isStatus: messageType === 'status',
      isNewsletter: messageType === 'newsletter',
      isGroup: messageType === 'group',
    };

    // Store in sorted set with timestamp as score
    const score = messageData.timestamp;
    await client.zadd(messageKey, score, JSON.stringify(messageData));

    // Set/refresh TTL
    await client.expire(messageKey, ttl);

    logger.debug(`[Redis] Message stored: ${messageKey} (TTL: ${ttl}s)`);
    return true;

  } catch (error) {
    logger.error(`[Redis] Error storing message: ${error.message}`);
    return false;
  }
}

/**
 * Get messages for a chat from Redis
 * @param {string} accountId - Platform account ID
 * @param {string} chatId - Chat identifier
 * @param {number} limit - Maximum messages to retrieve (default 50)
 * @param {number} offset - Offset for pagination (default 0)
 * @param {string} platform - Platform name (whatsapp, telegram, email)
 * @returns {Promise<Array>} Array of messages (newest first)
 */
async function getMessages(accountId, chatId, limit = 50, offset = 0, platform = null) {
  const client = getRedisClient();
  if (!client || !isConnected) return [];

  try {
    const messageType = getMessageType(chatId, platform);
    const messageKey = getMessageKey(accountId, messageType, chatId);

    // Get messages in reverse order (newest first)
    const messages = await client.zrevrange(messageKey, offset, offset + limit - 1);

    // Parse and optionally fetch media
    const parsedMessages = await Promise.all(messages.map(async (msgStr) => {
      const msg = JSON.parse(msgStr);

      // Fetch media if exists
      if (msg.hasMedia) {
        const mediaKey = `media:${accountId}:${msg.id}`;
        try {
          const mediaData = await client.get(mediaKey);
          if (mediaData) {
            const media = JSON.parse(mediaData);
            msg.mediaUrl = `data:${media.mimetype};base64,${media.data}`;
            msg.mediaMimetype = media.mimetype;
            msg.mediaFilename = media.filename;
            if (media.caption) msg.caption = media.caption;
          }
        } catch (e) {
          // Media not available - that's ok
        }
      }

      return msg;
    }));

    return parsedMessages;

  } catch (error) {
    logger.error(`[Redis] Error getting messages: ${error.message}`);
    return [];
  }
}

/**
 * Get message by ID from a chat
 * @param {string} accountId - Platform account ID
 * @param {string} chatId - Chat identifier
 * @param {string} messageId - Message ID to find
 * @returns {Promise<Object|null>} Message object or null
 */
async function getMessageById(accountId, chatId, messageId) {
  const client = getRedisClient();
  if (!client || !isConnected) return null;

  try {
    const messageType = getMessageType(chatId);
    const messageKey = getMessageKey(accountId, messageType, chatId);

    // Get all messages and find by ID (not ideal but Redis doesn't support secondary index)
    const messages = await client.zrange(messageKey, 0, -1);

    for (const msgStr of messages) {
      const msg = JSON.parse(msgStr);
      if (msg.id === messageId) {
        return msg;
      }
    }

    return null;

  } catch (error) {
    logger.error(`[Redis] Error getting message by ID: ${error.message}`);
    return null;
  }
}

/**
 * Get all chat IDs for an account (for listing conversations)
 * @param {string} accountId - Platform account ID
 * @param {string} type - Optional filter by type ('chat', 'group', 'status', 'newsletter')
 * @returns {Promise<Array>} Array of chat IDs
 */
async function getChatIds(accountId, type = null) {
  const client = getRedisClient();
  if (!client || !isConnected) return [];

  try {
    const pattern = type
      ? `messages:${accountId}:${type}:*`
      : `messages:${accountId}:*`;

    // Use SCAN for safe iteration
    const keys = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    // Extract chat IDs from keys
    const chatIds = keys.map(key => {
      const parts = key.split(':');
      return parts.slice(3).join(':'); // Handle chat IDs with colons
    });

    return [...new Set(chatIds)]; // Remove duplicates

  } catch (error) {
    logger.error(`[Redis] Error getting chat IDs: ${error.message}`);
    return [];
  }
}

/**
 * Get message count for a chat
 * @param {string} accountId - Platform account ID
 * @param {string} chatId - Chat identifier
 * @returns {Promise<number>} Message count
 */
async function getMessageCount(accountId, chatId) {
  const client = getRedisClient();
  if (!client || !isConnected) return 0;

  try {
    const messageType = getMessageType(chatId);
    const messageKey = getMessageKey(accountId, messageType, chatId);
    return await client.zcard(messageKey);
  } catch (error) {
    logger.error(`[Redis] Error getting message count: ${error.message}`);
    return 0;
  }
}

/**
 * Clear messages for a chat
 * @param {string} accountId - Platform account ID
 * @param {string} chatId - Chat identifier
 * @returns {Promise<boolean>} Success status
 */
async function clearMessages(accountId, chatId) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  try {
    const messageType = getMessageType(chatId);
    const messageKey = getMessageKey(accountId, messageType, chatId);
    await client.del(messageKey);
    return true;
  } catch (error) {
    logger.error(`[Redis] Error clearing messages: ${error.message}`);
    return false;
  }
}

/**
 * Store media separately
 * @param {string} accountId - Platform account ID
 * @param {string} messageId - Message ID
 * @param {Object} media - Media object with mimetype, filename, data
 * @returns {Promise<boolean>} Success status
 */
async function storeMedia(accountId, messageId, media) {
  const client = getRedisClient();
  if (!client || !isConnected) return false;

  try {
    const mediaKey = `media:${accountId}:${messageId}`;
    await client.set(mediaKey, JSON.stringify(media), 'EX', MEDIA_TTL);
    return true;
  } catch (error) {
    logger.error(`[Redis] Error storing media: ${error.message}`);
    return false;
  }
}

/**
 * Get media by message ID
 * @param {string} accountId - Platform account ID
 * @param {string} messageId - Message ID
 * @returns {Promise<Object|null>} Media object or null
 */
async function getMedia(accountId, messageId) {
  const client = getRedisClient();
  if (!client || !isConnected) return null;

  try {
    const mediaKey = `media:${accountId}:${messageId}`;
    const mediaData = await client.get(mediaKey);
    return mediaData ? JSON.parse(mediaData) : null;
  } catch (error) {
    logger.error(`[Redis] Error getting media: ${error.message}`);
    return null;
  }
}

/**
 * Get TTL configuration
 * @returns {Object} Current TTL settings
 */
function getMessageTTLConfig() {
  return {
    chat: MESSAGE_TTL.chat,
    group: MESSAGE_TTL.group,
    status: MESSAGE_TTL.status,
    newsletter: MESSAGE_TTL.newsletter,
    media: MEDIA_TTL,
  };
}

module.exports = {
  getRedisClient,
  isRedisAvailable,
  closeRedis,
  // Contact caching
  getBulkContacts,
  storeBulkContacts,
  getContactListLastSync,
  clearContacts,
  getContact,
  storeContact,
  // Profile pic caching
  getProfilePic,
  storeProfilePic,
  // Link preview caching
  getLinkPreview,
  storeLinkPreview,
  clearAllLinkPreviews,
  // Message storage (WhatsBots-style)
  storeMessage,
  getMessages,
  getMessageById,
  getChatIds,
  getMessageCount,
  clearMessages,
  storeMedia,
  getMedia,
  getMessageTTLConfig,
  getMessageType,
};
