/**
 * Admin Routes
 * User management and system settings (superadmin only)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate, requireSuperadmin } = require('./auth.cjs');

const router = express.Router();

// All routes require authentication and superadmin access
router.use(authenticate);
router.use(requireSuperadmin);

// ========================================
// User Management
// ========================================

/**
 * GET /api/admin/users
 * List all users with pagination and search
 */
router.get('/users', (req, res) => {
  try {
    const db = getDatabase();
    const {
      page = 1,
      limit = 20,
      search = '',
      role = '',
      status = '',
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`(u.email LIKE ? OR u.name LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    if (status === 'active') {
      conditions.push(`u.is_suspended = 0`);
    } else if (status === 'suspended') {
      conditions.push(`u.is_suspended = 1`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort column
    const validSortColumns = ['email', 'name', 'role', 'created_at', 'updated_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
    const { total } = db.prepare(countQuery).get(...params);

    // Get users with subscription info
    const usersQuery = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.avatar,
        u.role,
        u.is_superuser as isSuperuser,
        COALESCE(u.is_suspended, 0) as isSuspended,
        u.created_at as createdAt,
        u.updated_at as updatedAt,
        s.plan as subscriptionPlan,
        s.status as subscriptionStatus,
        (SELECT COUNT(*) FROM agents WHERE user_id = u.id) as agentCount,
        (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) as conversationCount
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      ${whereClause}
      ORDER BY u.${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;

    const users = db.prepare(usersQuery).all(...params, parseInt(limit), offset);

    res.json({
      users: users.map(u => ({
        ...u,
        isSuperuser: Boolean(u.isSuperuser),
        isSuspended: Boolean(u.isSuspended),
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    logger.error(`Failed to list users: ${error.message}`);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * GET /api/admin/users/:id
 * Get detailed user information
 */
router.get('/users/:id', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.params.id;

    const user = db.prepare(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.avatar,
        u.role,
        u.is_superuser as isSuperuser,
        COALESCE(u.is_suspended, 0) as isSuspended,
        u.created_at as createdAt,
        u.updated_at as updatedAt
      FROM users u
      WHERE u.id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get subscription
    const subscription = db.prepare(`
      SELECT plan, status, agent_slots as agentSlots, features, created_at as createdAt
      FROM subscriptions WHERE user_id = ?
    `).get(userId);

    // Get stats
    const stats = {
      agents: db.prepare(`SELECT COUNT(*) as count FROM agents WHERE user_id = ?`).get(userId).count,
      conversations: db.prepare(`SELECT COUNT(*) as count FROM conversations WHERE user_id = ?`).get(userId).count,
      messages: db.prepare(`
        SELECT COUNT(*) as count FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.user_id = ?
      `).get(userId).count,
      flows: db.prepare(`SELECT COUNT(*) as count FROM flows WHERE user_id = ?`).get(userId).count,
      knowledgeLibraries: db.prepare(`SELECT COUNT(*) as count FROM knowledge_libraries WHERE user_id = ?`).get(userId).count,
    };

    // Get AI usage summary
    const aiUsage = db.prepare(`
      SELECT
        SUM(input_tokens) as totalInputTokens,
        SUM(output_tokens) as totalOutputTokens,
        SUM(cost) as totalCost,
        COUNT(*) as totalRequests
      FROM ai_usage WHERE user_id = ?
    `).get(userId);

    res.json({
      user: {
        ...user,
        isSuperuser: Boolean(user.isSuperuser),
        isSuspended: Boolean(user.isSuspended),
      },
      subscription: subscription || { plan: 'free', status: 'active' },
      stats,
      aiUsage: {
        totalInputTokens: aiUsage?.totalInputTokens || 0,
        totalOutputTokens: aiUsage?.totalOutputTokens || 0,
        totalCost: aiUsage?.totalCost || 0,
        totalRequests: aiUsage?.totalRequests || 0,
      },
    });

  } catch (error) {
    logger.error(`Failed to get user details: ${error.message}`);
    res.status(500).json({ error: 'Failed to get user details' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user details (role, name, etc.)
 */
router.patch('/users/:id', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.params.id;
    const { name, role, isSuperuser } = req.body;

    // Check user exists
    const user = db.prepare(`SELECT id, email FROM users WHERE id = ?`).get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-demotion from superadmin
    if (userId === req.user.id && isSuperuser === false) {
      return res.status(400).json({ error: 'Cannot remove your own superadmin status' });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be "user" or "admin"' });
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (isSuperuser !== undefined) {
      updates.push('is_superuser = ?');
      params.push(isSuperuser ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = datetime('now')`);
    params.push(userId);

    db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    logger.info(`Admin ${req.user.id} updated user ${userId}`);

    // Return updated user
    const updated = db.prepare(`
      SELECT id, email, name, avatar, role, is_superuser as isSuperuser,
             COALESCE(is_suspended, 0) as isSuspended, created_at as createdAt
      FROM users WHERE id = ?
    `).get(userId);

    res.json({
      user: {
        ...updated,
        isSuperuser: Boolean(updated.isSuperuser),
        isSuspended: Boolean(updated.isSuspended),
      },
      message: 'User updated successfully',
    });

  } catch (error) {
    logger.error(`Failed to update user: ${error.message}`);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * POST /api/admin/users/:id/suspend
 * Suspend a user account
 */
router.post('/users/:id/suspend', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.params.id;
    const { reason } = req.body;

    // Check user exists
    const user = db.prepare(`SELECT id, email FROM users WHERE id = ?`).get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-suspension
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot suspend your own account' });
    }

    // Add is_suspended column if it doesn't exist (migration)
    try {
      db.prepare(`ALTER TABLE users ADD COLUMN is_suspended INTEGER DEFAULT 0`).run();
    } catch (e) { /* column may already exist */ }

    try {
      db.prepare(`ALTER TABLE users ADD COLUMN suspended_reason TEXT`).run();
    } catch (e) { /* column may already exist */ }

    try {
      db.prepare(`ALTER TABLE users ADD COLUMN suspended_at TEXT`).run();
    } catch (e) { /* column may already exist */ }

    try {
      db.prepare(`ALTER TABLE users ADD COLUMN suspended_by TEXT`).run();
    } catch (e) { /* column may already exist */ }

    // Suspend the user
    db.prepare(`
      UPDATE users
      SET is_suspended = 1,
          suspended_reason = ?,
          suspended_at = datetime('now'),
          suspended_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(reason || null, req.user.id, userId);

    logger.info(`Admin ${req.user.id} suspended user ${userId}. Reason: ${reason || 'Not specified'}`);

    res.json({
      success: true,
      message: 'User suspended successfully',
    });

  } catch (error) {
    logger.error(`Failed to suspend user: ${error.message}`);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

/**
 * POST /api/admin/users/:id/activate
 * Activate a suspended user account
 */
router.post('/users/:id/activate', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.params.id;

    // Check user exists
    const user = db.prepare(`SELECT id, email FROM users WHERE id = ?`).get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Activate the user
    db.prepare(`
      UPDATE users
      SET is_suspended = 0,
          suspended_reason = NULL,
          suspended_at = NULL,
          suspended_by = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(userId);

    logger.info(`Admin ${req.user.id} activated user ${userId}`);

    res.json({
      success: true,
      message: 'User activated successfully',
    });

  } catch (error) {
    logger.error(`Failed to activate user: ${error.message}`);
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

/**
 * PATCH /api/admin/users/:id/subscription
 * Override user's subscription plan
 */
router.patch('/users/:id/subscription', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.params.id;
    const { plan, agentSlots, features } = req.body;

    // Check user exists
    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate plan
    const validPlans = ['free', 'starter', 'pro', 'enterprise'];
    if (plan && !validPlans.includes(plan)) {
      return res.status(400).json({ error: `Invalid plan. Must be one of: ${validPlans.join(', ')}` });
    }

    // Check if subscription exists
    const existing = db.prepare(`SELECT id FROM subscriptions WHERE user_id = ?`).get(userId);

    if (existing) {
      // Build update query
      const updates = [];
      const params = [];

      if (plan) {
        updates.push('plan = ?');
        params.push(plan);
      }

      if (agentSlots !== undefined) {
        updates.push('agent_slots = ?');
        params.push(agentSlots);
      }

      if (features !== undefined) {
        updates.push('features = ?');
        params.push(JSON.stringify(features));
      }

      if (updates.length > 0) {
        updates.push(`updated_at = datetime('now')`);
        params.push(userId);

        db.prepare(`
          UPDATE subscriptions SET ${updates.join(', ')} WHERE user_id = ?
        `).run(...params);
      }
    } else {
      // Create new subscription
      const id = uuidv4();
      db.prepare(`
        INSERT INTO subscriptions (id, user_id, plan, agent_slots, features)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        plan || 'free',
        agentSlots || 2,
        features ? JSON.stringify(features) : null
      );
    }

    logger.info(`Admin ${req.user.id} updated subscription for user ${userId}`);

    // Return updated subscription
    const subscription = db.prepare(`
      SELECT plan, status, agent_slots as agentSlots, features
      FROM subscriptions WHERE user_id = ?
    `).get(userId);

    res.json({
      subscription: {
        ...subscription,
        features: subscription.features ? JSON.parse(subscription.features) : null,
      },
      message: 'Subscription updated successfully',
    });

  } catch (error) {
    logger.error(`Failed to update subscription: ${error.message}`);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// ========================================
// System Settings
// ========================================

/**
 * GET /api/admin/system-settings
 * Get all system settings
 */
router.get('/system-settings', (req, res) => {
  try {
    const db = getDatabase();

    const settings = db.prepare(`
      SELECT key, value, description, updated_at as updatedAt
      FROM system_settings
      ORDER BY key
    `).all();

    // Parse JSON values
    const parsed = {};
    for (const setting of settings) {
      try {
        parsed[setting.key] = {
          value: JSON.parse(setting.value),
          description: setting.description,
          updatedAt: setting.updatedAt,
        };
      } catch {
        parsed[setting.key] = {
          value: setting.value,
          description: setting.description,
          updatedAt: setting.updatedAt,
        };
      }
    }

    res.json({ settings: parsed });

  } catch (error) {
    logger.error(`Failed to get system settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get system settings' });
  }
});

/**
 * PATCH /api/admin/system-settings/:key
 * Update a system setting
 */
router.patch('/system-settings/:key', (req, res) => {
  try {
    const db = getDatabase();
    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    // Check if setting exists
    const existing = db.prepare(`SELECT id FROM system_settings WHERE key = ?`).get(key);

    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (existing) {
      db.prepare(`
        UPDATE system_settings
        SET value = ?, description = COALESCE(?, description), updated_by = ?, updated_at = datetime('now')
        WHERE key = ?
      `).run(valueStr, description || null, req.user.id, key);
    } else {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO system_settings (id, key, value, description, updated_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, key, valueStr, description || null, req.user.id);
    }

    logger.info(`Admin ${req.user.id} updated system setting: ${key}`);

    res.json({
      key,
      value: typeof value === 'object' ? value : valueStr,
      description,
      message: 'Setting updated successfully',
    });

  } catch (error) {
    logger.error(`Failed to update system setting: ${error.message}`);
    res.status(500).json({ error: 'Failed to update system setting' });
  }
});

/**
 * DELETE /api/admin/system-settings/:key
 * Delete a system setting
 */
router.delete('/system-settings/:key', (req, res) => {
  try {
    const db = getDatabase();
    const { key } = req.params;

    const result = db.prepare(`DELETE FROM system_settings WHERE key = ?`).run(key);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    logger.info(`Admin ${req.user.id} deleted system setting: ${key}`);

    res.json({
      success: true,
      message: 'Setting deleted successfully',
    });

  } catch (error) {
    logger.error(`Failed to delete system setting: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete system setting' });
  }
});

// ========================================
// Dashboard Stats (Admin Overview)
// ========================================

/**
 * GET /api/admin/stats
 * Get admin dashboard statistics
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();

    const stats = {
      users: {
        total: db.prepare(`SELECT COUNT(*) as count FROM users`).get().count,
        active: db.prepare(`SELECT COUNT(*) as count FROM users WHERE COALESCE(is_suspended, 0) = 0`).get().count,
        suspended: db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_suspended = 1`).get().count,
        admins: db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`).get().count,
        superadmins: db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_superuser = 1`).get().count,
      },
      subscriptions: {
        free: db.prepare(`SELECT COUNT(*) as count FROM subscriptions WHERE plan = 'free'`).get().count,
        starter: db.prepare(`SELECT COUNT(*) as count FROM subscriptions WHERE plan = 'starter'`).get().count,
        pro: db.prepare(`SELECT COUNT(*) as count FROM subscriptions WHERE plan = 'pro'`).get().count,
        enterprise: db.prepare(`SELECT COUNT(*) as count FROM subscriptions WHERE plan = 'enterprise'`).get().count,
      },
      agents: {
        total: db.prepare(`SELECT COUNT(*) as count FROM agents`).get().count,
        active: db.prepare(`SELECT COUNT(*) as count FROM agents WHERE status != 'offline'`).get().count,
      },
      conversations: {
        total: db.prepare(`SELECT COUNT(*) as count FROM conversations`).get().count,
        active: db.prepare(`SELECT COUNT(*) as count FROM conversations WHERE status = 'active'`).get().count,
      },
      messages: {
        total: db.prepare(`SELECT COUNT(*) as count FROM messages`).get().count,
        today: db.prepare(`SELECT COUNT(*) as count FROM messages WHERE date(created_at) = date('now')`).get().count,
      },
      aiUsage: {
        totalTokens: db.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM ai_usage`).get().total,
        totalCost: db.prepare(`SELECT COALESCE(SUM(cost), 0) as total FROM ai_usage`).get().total,
      },
    };

    res.json({ stats });

  } catch (error) {
    logger.error(`Failed to get admin stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get admin stats' });
  }
});

// ========================================
// System Logs
// ========================================

const { getSystemLogService, LOG_TYPES, LOG_LEVELS } = require('../services/systemLogService.cjs');

/**
 * GET /api/admin/logs
 * Query system logs with filters
 */
router.get('/logs', async (req, res) => {
  try {
    const {
      type = 'all',
      level = null,
      search = null,
      userId = null,
      provider = null,
      startDate = null,
      endDate = null,
      page = 1,
      limit = 50,
    } = req.query;

    const logService = getSystemLogService();
    const result = await logService.getLogs({
      type,
      level: level || null,
      search: search || null,
      userId: userId || null,
      provider: provider || null,
      startDate: startDate || null,
      endDate: endDate || null,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 200), // Cap at 200
    });

    res.json(result);

  } catch (error) {
    logger.error(`Failed to get logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

/**
 * GET /api/admin/logs/stats
 * Get log statistics
 */
router.get('/logs/stats', async (req, res) => {
  try {
    const { startDate = null, endDate = null, userId = null } = req.query;

    const logService = getSystemLogService();
    const stats = await logService.getStats({
      startDate: startDate || null,
      endDate: endDate || null,
      userId: userId || null,
    });

    res.json({ stats });

  } catch (error) {
    logger.error(`Failed to get log stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get log stats' });
  }
});

/**
 * GET /api/admin/logs/export
 * Export logs as JSON or CSV
 */
router.get('/logs/export', async (req, res) => {
  try {
    const {
      format = 'json',
      type = 'all',
      level = null,
      startDate = null,
      endDate = null,
    } = req.query;

    const logService = getSystemLogService();
    const result = await logService.exportLogs({
      format,
      type,
      level: level || null,
      startDate: startDate || null,
      endDate: endDate || null,
    });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);

  } catch (error) {
    logger.error(`Failed to export logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

/**
 * POST /api/admin/logs/cleanup
 * Clean up old logs based on retention policy
 */
router.post('/logs/cleanup', async (req, res) => {
  try {
    const { retentionDays = 7 } = req.body;

    const logService = getSystemLogService();
    const result = await logService.cleanupOldLogs(parseInt(retentionDays));

    if (result.success) {
      logger.info(`Admin ${req.user.id} triggered log cleanup (${retentionDays} days retention)`);
      res.json(result);
    } else {
      res.status(500).json({ error: result.error || 'Cleanup failed' });
    }

  } catch (error) {
    logger.error(`Failed to cleanup logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to cleanup logs' });
  }
});

/**
 * GET /api/admin/logs/types
 * Get available log types and levels
 */
router.get('/logs/types', (req, res) => {
  res.json({
    types: Object.values(LOG_TYPES),
    levels: Object.values(LOG_LEVELS),
  });
});

module.exports = router;
