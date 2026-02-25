/**
 * Flow Versions API Routes
 * ========================
 * Endpoints for flow version management, rollback, and comparison.
 */

const express = require('express');
const router = express.Router();
const { getFlowVersionService } = require('../services/flow/FlowVersionService.cjs');
const { logger } = require('../services/logger.cjs');

/**
 * GET /api/flows/:flowId/versions
 * Get version history for a flow
 */
router.get('/:flowId/versions', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const versionService = getFlowVersionService();
    const result = versionService.getVersionHistory(flowId, userId, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json(result);
  } catch (error) {
    logger.error(`Get versions failed: ${error.message}`);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/flows/:flowId/versions/:version
 * Get a specific version
 */
router.get('/:flowId/versions/:version', async (req, res) => {
  try {
    const { flowId, version } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const versionService = getFlowVersionService();
    const result = versionService.getVersion(flowId, parseInt(version, 10), userId);

    if (!result) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Get version failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/flows/:flowId/versions
 * Create a new version (commit)
 */
router.post('/:flowId/versions', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { name, message } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const versionService = getFlowVersionService();
    const result = await versionService.createVersion(flowId, userId, {
      name,
      message,
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error(`Create version failed: ${error.message}`);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/flows/:flowId/versions/:version/rollback
 * Rollback to a specific version
 */
router.post('/:flowId/versions/:version/rollback', async (req, res) => {
  try {
    const { flowId, version } = req.params;
    const { createBackup = true } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const versionService = getFlowVersionService();
    const result = await versionService.rollback(
      flowId,
      parseInt(version, 10),
      userId,
      { createBackup }
    );

    res.json(result);
  } catch (error) {
    logger.error(`Rollback failed: ${error.message}`);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/flows/:flowId/versions/compare
 * Compare two versions
 */
router.get('/:flowId/versions/compare', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { versionA, versionB } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!versionA || !versionB) {
      return res.status(400).json({ error: 'Both versionA and versionB are required' });
    }

    const versionService = getFlowVersionService();
    const result = versionService.compareVersions(
      flowId,
      parseInt(versionA, 10),
      parseInt(versionB, 10),
      userId
    );

    res.json(result);
  } catch (error) {
    logger.error(`Compare versions failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/flows/:flowId/versions/:version
 * Tag a version with a name
 */
router.patch('/:flowId/versions/:version', async (req, res) => {
  try {
    const { flowId, version } = req.params;
    const { name } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const versionService = getFlowVersionService();
    const result = versionService.tagVersion(flowId, parseInt(version, 10), name, userId);

    res.json(result);
  } catch (error) {
    logger.error(`Tag version failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/flows/:flowId/versions/:version
 * Delete a specific version
 */
router.delete('/:flowId/versions/:version', async (req, res) => {
  try {
    const { flowId, version } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const versionService = getFlowVersionService();
    const result = versionService.deleteVersion(flowId, parseInt(version, 10), userId);

    res.json(result);
  } catch (error) {
    logger.error(`Delete version failed: ${error.message}`);
    res.status(error.message.includes('Cannot delete') ? 400 : 500).json({
      error: error.message,
    });
  }
});

module.exports = router;
