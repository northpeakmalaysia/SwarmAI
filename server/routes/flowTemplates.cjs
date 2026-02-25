/**
 * Flow Templates API Routes
 * =========================
 * Endpoints for flow import/export and template library.
 */

const express = require('express');
const router = express.Router();
const { getFlowTemplateService, TEMPLATE_CATEGORIES } = require('../services/flow/FlowTemplateService.cjs');
const { logger } = require('../services/logger.cjs');

// ===========================================
// Import/Export Routes
// ===========================================

/**
 * POST /api/flows/:flowId/export
 * Export a flow as a template
 */
router.post('/:flowId/export', async (req, res) => {
  try {
    const { flowId } = req.params;
    const {
      name,
      description,
      category,
      tags,
      includeSettings = true,
      includeAuthor = false,
      sanitize = true,
    } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const templateService = getFlowTemplateService();
    const template = await templateService.exportFlow(flowId, userId, {
      name,
      description,
      category,
      tags,
      includeSettings,
      includeAuthor,
      sanitize,
    });

    res.json(template);
  } catch (error) {
    logger.error(`Export flow failed: ${error.message}`);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/flows/:flowId/export/download
 * Export and download as JSON file
 */
router.post('/:flowId/export/download', async (req, res) => {
  try {
    const { flowId } = req.params;
    const options = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const templateService = getFlowTemplateService();
    const json = await templateService.exportToJSON(flowId, userId, options);
    const template = JSON.parse(json);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${template.name || 'flow'}-template.json"`
    );
    res.send(json);
  } catch (error) {
    logger.error(`Export download failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/flows/import
 * Import a flow from a template
 */
router.post('/import', async (req, res) => {
  try {
    const { template, name, description, variables } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!template) {
      return res.status(400).json({ error: 'Template is required' });
    }

    const templateService = getFlowTemplateService();
    const result = await templateService.importFlow(template, userId, {
      name,
      description,
      variables,
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error(`Import flow failed: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// ===========================================
// Template Library Routes
// ===========================================

/**
 * GET /api/templates
 * Get templates from the library
 */
router.get('/templates', async (req, res) => {
  try {
    const { category, search, publicOnly, limit = 20, offset = 0 } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const templateService = getFlowTemplateService();
    const templates = templateService.getTemplates(userId, {
      category,
      search,
      publicOnly: publicOnly === 'true',
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({ templates, categories: TEMPLATE_CATEGORIES });
  } catch (error) {
    logger.error(`Get templates failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/templates/categories
 * Get available template categories
 */
router.get('/templates/categories', (req, res) => {
  res.json({ categories: TEMPLATE_CATEGORIES });
});

/**
 * GET /api/templates/:templateId
 * Get a specific template
 */
router.get('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const templateService = getFlowTemplateService();
    const template = templateService.getTemplate(templateId, userId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    logger.error(`Get template failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates
 * Save a template to the library
 */
router.post('/templates', async (req, res) => {
  try {
    const { template, isPublic = false, thumbnail } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!template) {
      return res.status(400).json({ error: 'Template is required' });
    }

    const templateService = getFlowTemplateService();
    const result = await templateService.saveTemplate(template, userId, {
      isPublic,
      thumbnail,
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error(`Save template failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/flows/:flowId/save-as-template
 * Export flow and save to template library in one step
 */
router.post('/:flowId/save-as-template', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { name, description, category, tags, isPublic = false } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const templateService = getFlowTemplateService();

    // Export the flow
    const template = await templateService.exportFlow(flowId, userId, {
      name,
      description,
      category,
      tags,
    });

    // Save to library
    const result = await templateService.saveTemplate(template, userId, { isPublic });

    res.status(201).json(result);
  } catch (error) {
    logger.error(`Save as template failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/:templateId/use
 * Use a template to create a new flow
 */
router.post('/templates/:templateId/use', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { name, description, variables } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const templateService = getFlowTemplateService();

    // Get the template
    const template = templateService.getTemplate(templateId, userId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Import as new flow
    const result = await templateService.importFlow(
      {
        ...template,
        flow: template.flow,
      },
      userId,
      { name, description, variables }
    );

    // Increment downloads
    templateService.incrementDownloads(templateId);

    res.status(201).json(result);
  } catch (error) {
    logger.error(`Use template failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/:templateId/rate
 * Rate a template
 */
router.post('/templates/:templateId/rate', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { rating } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const templateService = getFlowTemplateService();
    const result = templateService.rateTemplate(templateId, userId, rating);

    res.json(result);
  } catch (error) {
    logger.error(`Rate template failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/templates/:templateId
 * Delete a template
 */
router.delete('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const templateService = getFlowTemplateService();
    const result = templateService.deleteTemplate(templateId, userId);

    if (!result.success) {
      return res.status(404).json({ error: 'Template not found or not owned by user' });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Delete template failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
