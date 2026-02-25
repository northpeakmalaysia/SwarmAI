/**
 * CLI Sessions Routes
 * Manages CLI session lifecycle for agentic AI
 */

const express = require('express');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const cliSessionService = require('../services/cliSessionService.cjs');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// ============================================
// Session CRUD Operations
// ============================================

/**
 * GET /api/cli/sessions
 * Get all CLI sessions for current user
 */
router.get('/', (req, res) => {
  try {
    const { status, cliType } = req.query;

    let sessions = cliSessionService.getUserActiveSessions(req.user.id);

    // Apply filters
    if (status) {
      const statusValue = Array.isArray(status) ? status[0] : status;
      sessions = sessions.filter(s => s.status === statusValue);
    }

    if (cliType) {
      const cliTypeValue = Array.isArray(cliType) ? cliType[0] : cliType;
      sessions = sessions.filter(s => s.cliType === cliTypeValue);
    }

    res.json(sessions);

  } catch (error) {
    logger.error(`Failed to list sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * GET /api/cli/sessions/:sessionId
 * Get session by ID
 */
router.get('/:sessionId', (req, res) => {
  try {
    const session = cliSessionService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access to session' });
    }

    res.json(session);

  } catch (error) {
    logger.error(`Failed to get session: ${error.message}`);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * POST /api/cli/sessions
 * Create a new CLI session
 */
router.post('/', (req, res) => {
  try {
    const { workspaceId, cliType, agentId, expiresInHours, metadata } = req.body;

    // Validate required fields
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    if (!cliType) {
      return res.status(400).json({ error: 'cliType is required' });
    }

    if (!cliSessionService.CLI_TYPES.includes(cliType)) {
      return res.status(400).json({
        error: `Invalid cliType. Must be one of: ${cliSessionService.CLI_TYPES.join(', ')}`
      });
    }

    // Validate expiresInHours
    if (expiresInHours !== undefined) {
      const hours = parseInt(expiresInHours);
      if (isNaN(hours) || hours < 1 || hours > 168) {
        return res.status(400).json({
          error: 'expiresInHours must be between 1 and 168 (7 days)'
        });
      }
    }

    const session = cliSessionService.createSession(
      req.user.id,
      workspaceId,
      cliType,
      { agentId, expiresInHours, metadata }
    );

    res.status(201).json(session);

  } catch (error) {
    logger.error(`Failed to create session: ${error.message}`);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * PUT /api/cli/sessions/:sessionId
 * Update CLI session
 */
router.put('/:sessionId', (req, res) => {
  try {
    const session = cliSessionService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access to session' });
    }

    const { lastPrompt, lastOutput, contextSummary, status, metadata } = req.body;

    // Validate status if provided
    if (status && !cliSessionService.SESSION_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${cliSessionService.SESSION_STATUSES.join(', ')}`
      });
    }

    cliSessionService.updateSession(req.params.sessionId, {
      lastPrompt,
      lastOutput,
      contextSummary,
      status,
      metadata
    });

    res.json({ message: 'Session updated successfully' });

  } catch (error) {
    logger.error(`Failed to update session: ${error.message}`);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

/**
 * DELETE /api/cli/sessions/:sessionId
 * Delete CLI session
 */
router.delete('/:sessionId', (req, res) => {
  try {
    const session = cliSessionService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access to session' });
    }

    cliSessionService.deleteSession(req.params.sessionId);

    res.json({ message: 'Session deleted successfully' });

  } catch (error) {
    logger.error(`Failed to delete session: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ============================================
// Workspace Sessions
// ============================================

/**
 * GET /api/cli/sessions/workspace/:workspaceId
 * Get all sessions for a workspace
 */
router.get('/workspace/:workspaceId', (req, res) => {
  try {
    const sessions = cliSessionService.getWorkspaceSessions(req.params.workspaceId);

    // Filter to only user's sessions
    const userSessions = sessions.filter(s => s.userId === req.user.id);

    res.json(userSessions);

  } catch (error) {
    logger.error(`Failed to get workspace sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to get workspace sessions' });
  }
});

// ============================================
// Cleanup Operations
// ============================================

/**
 * POST /api/cli/sessions/cleanup/expired
 * Cleanup expired sessions
 */
router.post('/cleanup/expired', (req, res) => {
  try {
    const deletedCount = cliSessionService.cleanupExpiredSessions();

    res.json({
      deletedCount,
      message: `Cleaned up ${deletedCount} expired sessions`
    });

  } catch (error) {
    logger.error(`Failed to cleanup expired sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to cleanup expired sessions' });
  }
});

/**
 * POST /api/cli/sessions/cleanup/old
 * Delete old sessions
 */
router.post('/cleanup/old', (req, res) => {
  try {
    let olderThanDays = 30;

    if (req.body.olderThanDays !== undefined) {
      olderThanDays = parseInt(req.body.olderThanDays);
      if (isNaN(olderThanDays) || olderThanDays < 1 || olderThanDays > 365) {
        return res.status(400).json({
          error: 'olderThanDays must be between 1 and 365'
        });
      }
    }

    const deletedCount = cliSessionService.deleteOldSessions(olderThanDays);

    res.json({
      deletedCount,
      message: `Cleaned up ${deletedCount} sessions older than ${olderThanDays} days`
    });

  } catch (error) {
    logger.error(`Failed to delete old sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete old sessions' });
  }
});

module.exports = router;
