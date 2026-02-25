/**
 * Terminal Routes
 * REST API for terminal session management
 * WebSocket handlers are in index.cjs
 */

const express = require('express');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const terminalService = require('../services/terminalService.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/terminal/types
 * Get available terminal types
 */
router.get('/types', (req, res) => {
  try {
    const types = terminalService.getAvailableTypes();
    res.json({ types });
  } catch (error) {
    logger.error(`Failed to get terminal types: ${error.message}`);
    res.status(500).json({ error: 'Failed to get terminal types' });
  }
});

/**
 * GET /api/terminal/sessions
 * List user's active terminal sessions
 */
router.get('/sessions', (req, res) => {
  try {
    const sessions = terminalService.getUserSessions(req.user.id);
    res.json({ sessions });
  } catch (error) {
    logger.error(`Failed to list sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * POST /api/terminal/sessions
 * Create a new terminal session
 */
router.post('/sessions', (req, res) => {
  try {
    const { type, cols, rows, cwd } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Terminal type is required' });
    }

    const session = terminalService.createSession(req.user.id, type, {
      cols: cols || 120,
      rows: rows || 40,
      cwd
    });

    logger.info(`Terminal session created: ${session.id} (${type}) for user ${req.user.id}`);

    res.status(201).json({ session });

  } catch (error) {
    logger.error(`Failed to create session: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/terminal/sessions/:sessionId
 * Get session info
 */
router.get('/sessions/:sessionId', (req, res) => {
  try {
    const session = terminalService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ session });

  } catch (error) {
    logger.error(`Failed to get session: ${error.message}`);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * DELETE /api/terminal/sessions/:sessionId
 * Close a terminal session
 */
router.delete('/sessions/:sessionId', (req, res) => {
  try {
    // Verify ownership
    if (!terminalService.verifyOwnership(req.params.sessionId, req.user.id)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const closed = terminalService.closeSession(req.params.sessionId);

    if (!closed) {
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info(`Terminal session closed: ${req.params.sessionId}`);

    res.json({ message: 'Session closed' });

  } catch (error) {
    logger.error(`Failed to close session: ${error.message}`);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

/**
 * POST /api/terminal/sessions/:sessionId/resize
 * Resize terminal
 */
router.post('/sessions/:sessionId/resize', (req, res) => {
  try {
    const { cols, rows } = req.body;

    if (!cols || !rows) {
      return res.status(400).json({ error: 'cols and rows are required' });
    }

    // Verify ownership
    if (!terminalService.verifyOwnership(req.params.sessionId, req.user.id)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const resized = terminalService.resize(req.params.sessionId, cols, rows);

    if (!resized) {
      return res.status(400).json({ error: 'Failed to resize terminal' });
    }

    res.json({ cols, rows });

  } catch (error) {
    logger.error(`Failed to resize terminal: ${error.message}`);
    res.status(500).json({ error: 'Failed to resize terminal' });
  }
});

/**
 * POST /api/terminal/sessions/:sessionId/write
 * Write to terminal (fallback for non-WebSocket clients)
 */
router.post('/sessions/:sessionId/write', (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'input is required' });
    }

    // Verify ownership
    if (!terminalService.verifyOwnership(req.params.sessionId, req.user.id)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    terminalService.write(req.params.sessionId, input);

    res.json({ success: true });

  } catch (error) {
    logger.error(`Failed to write to terminal: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/terminal/sessions/:sessionId/buffer
 * Get buffered output (for reconnection)
 */
router.get('/sessions/:sessionId/buffer', (req, res) => {
  try {
    const { since } = req.query;

    // Verify ownership
    if (!terminalService.verifyOwnership(req.params.sessionId, req.user.id)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const buffer = terminalService.getBufferedOutput(
      req.params.sessionId,
      since ? parseInt(since) : 0
    );

    res.json({ data: buffer });

  } catch (error) {
    logger.error(`Failed to get buffer: ${error.message}`);
    res.status(500).json({ error: 'Failed to get buffer' });
  }
});

/**
 * GET /api/terminal/cli/:name/status
 * Check if a CLI tool is installed
 */
router.get('/cli/:name/status', (req, res) => {
  try {
    const cliName = req.params.name;

    // Validate CLI name
    const validClis = ['claude', 'gemini', 'opencode'];
    if (!validClis.includes(cliName)) {
      return res.status(400).json({
        error: `Invalid CLI name. Valid options: ${validClis.join(', ')}`
      });
    }

    const installed = terminalService.isCliInstalled(cliName);
    res.json({
      cli: cliName,
      installed
    });
  } catch (error) {
    logger.error(`Failed to check CLI status: ${error.message}`);
    res.status(500).json({ error: 'Failed to check CLI status' });
  }
});

/**
 * POST /api/terminal/cli/:name/install
 * Install a CLI tool (requires admin/superuser privileges)
 */
router.post('/cli/:name/install', async (req, res) => {
  try {
    const cliName = req.params.name;

    // Validate CLI name
    const validClis = ['claude', 'gemini', 'opencode'];
    if (!validClis.includes(cliName)) {
      return res.status(400).json({
        error: `Invalid CLI name. Valid options: ${validClis.join(', ')}`
      });
    }

    // Only admins can install CLIs
    if (!req.user.isSuperuser && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Only administrators can install CLI tools'
      });
    }

    logger.info(`User ${req.user.id} requested installation of CLI: ${cliName}`);

    const result = await terminalService.installCli(cliName);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Failed to install CLI: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/terminal/cli/:name/recheck
 * Re-check if a CLI is installed (after manual installation)
 */
router.post('/cli/:name/recheck', async (req, res) => {
  try {
    const cliName = req.params.name;

    // Validate CLI name
    const validClis = ['claude', 'gemini', 'opencode'];
    if (!validClis.includes(cliName)) {
      return res.status(400).json({
        error: `Invalid CLI name. Valid options: ${validClis.join(', ')}`
      });
    }

    const installed = await terminalService.recheckCliInstallation(cliName);
    res.json({
      cli: cliName,
      installed
    });
  } catch (error) {
    logger.error(`Failed to recheck CLI: ${error.message}`);
    res.status(500).json({ error: 'Failed to recheck CLI status' });
  }
});

module.exports = router;
