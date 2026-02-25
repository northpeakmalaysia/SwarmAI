'use strict';

/**
 * Lightweight notification emitter for server-side → frontend bell notifications.
 * Uses Socket.io rooms to target specific users or broadcast to all.
 *
 * Payload shape matches frontend Notification type in frontend.ts:
 *   { type: 'success'|'error'|'warning'|'info', title: string, message?: string, duration?: number, dismissible?: boolean }
 */

const logger = require('./logger.cjs');

/**
 * Emit a notification to a specific user's dashboard bell.
 * @param {string} userId - Target user ID
 * @param {{ type: string, title: string, message?: string, duration?: number, dismissible?: boolean }} payload
 */
function emitUserNotification(userId, payload) {
  const io = global.io;
  if (!io || !userId) return;
  try {
    io.to(`user:${userId}`).emit('notification', {
      type: payload.type || 'info',
      title: payload.title || 'System Notification',
      message: payload.message,
      duration: payload.duration,
      dismissible: payload.dismissible ?? true,
    });
  } catch (e) {
    logger.debug(`[NotificationEmitter] Failed to emit to user ${userId}: ${e.message}`);
  }
}

/**
 * Emit a notification to all connected users.
 * @param {{ type: string, title: string, message?: string, duration?: number, dismissible?: boolean }} payload
 */
function emitBroadcastNotification(payload) {
  const io = global.io;
  if (!io) return;
  try {
    io.emit('notification', {
      type: payload.type || 'info',
      title: payload.title || 'System Notification',
      message: payload.message,
      duration: payload.duration,
      dismissible: payload.dismissible ?? true,
    });
  } catch (e) {
    logger.debug(`[NotificationEmitter] Failed to broadcast: ${e.message}`);
  }
}

module.exports = { emitUserNotification, emitBroadcastNotification };
