/**
 * Tool API Keys Routes
 *
 * Manage API keys for system tools like searchWeb (Brave, Serper, etc.)
 *
 * Routes:
 * - GET    /api/tool-api-keys           - List user's tool API keys
 * - GET    /api/tool-api-keys/providers - List supported providers per tool
 * - POST   /api/tool-api-keys           - Add new key
 * - PATCH  /api/tool-api-keys/:id       - Update key
 * - DELETE /api/tool-api-keys/:id       - Delete key
 * - POST   /api/tool-api-keys/:id/test  - Test key validity
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../services/logger.cjs');
const toolApiKeyService = require('../services/ToolApiKeyService.cjs');
const { authenticate } = require('./auth.cjs');

// All routes require authentication
router.use(authenticate);

// ============================================
// GET /api/tool-api-keys
// List all tool API keys for the user
// ============================================
router.get('/', (req, res) => {
  try {
    const keys = toolApiKeyService.getAllKeysForUser(req.user.id);

    // Group by tool for easier UI consumption
    const grouped = {};
    for (const key of keys) {
      if (!grouped[key.tool_id]) {
        grouped[key.tool_id] = [];
      }
      grouped[key.tool_id].push({
        id: key.id,
        toolId: key.tool_id,
        provider: key.provider,
        apiKeyMasked: key.apiKeyMasked,
        priority: key.priority,
        isActive: key.is_active === 1,
        lastUsedAt: key.last_used_at,
        lastError: key.last_error,
        createdAt: key.created_at,
        updatedAt: key.updated_at,
      });
    }

    res.json({
      keys: grouped,
      total: keys.length,
    });
  } catch (error) {
    logger.error(`Failed to list tool API keys: ${error.message}`);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// ============================================
// GET /api/tool-api-keys/providers
// List supported providers per tool
// ============================================
router.get('/providers', (req, res) => {
  try {
    const providers = toolApiKeyService.getToolProviders();

    // Transform for API response
    const result = {};
    for (const [toolId, toolProviders] of Object.entries(providers)) {
      result[toolId] = toolProviders.map(p => ({
        id: p.id,
        name: p.name,
        keyRequired: p.keyRequired,
        description: p.description,
        docsUrl: p.docsUrl,
      }));
    }

    res.json({ providers: result });
  } catch (error) {
    logger.error(`Failed to list providers: ${error.message}`);
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

// ============================================
// GET /api/tool-api-keys/:toolId
// Get API keys for a specific tool
// ============================================
router.get('/:toolId', (req, res) => {
  try {
    const { toolId } = req.params;
    const keys = toolApiKeyService.getKeysForTool(req.user.id, toolId);

    const providers = toolApiKeyService.getProvidersForTool(toolId);
    if (!providers) {
      return res.status(404).json({ error: `Unknown tool: ${toolId}` });
    }

    res.json({
      toolId,
      keys: keys.map(key => ({
        id: key.id,
        provider: key.provider,
        apiKeyMasked: toolApiKeyService.maskApiKey(key.api_key),
        priority: key.priority,
        isActive: key.is_active === 1,
        lastUsedAt: key.last_used_at,
        lastError: key.last_error,
        createdAt: key.created_at,
        updatedAt: key.updated_at,
      })),
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        keyRequired: p.keyRequired,
        description: p.description,
        docsUrl: p.docsUrl,
      })),
    });
  } catch (error) {
    logger.error(`Failed to get tool keys: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tool keys' });
  }
});

// ============================================
// POST /api/tool-api-keys
// Add a new API key
// ============================================
router.post('/', (req, res) => {
  try {
    const { toolId, provider, apiKey, priority } = req.body;

    // Validate required fields
    if (!toolId || !provider) {
      return res.status(400).json({ error: 'toolId and provider are required' });
    }

    // Validate provider requires key
    const providers = toolApiKeyService.getProvidersForTool(toolId);
    if (!providers) {
      return res.status(400).json({ error: `Unknown tool: ${toolId}` });
    }

    const providerConfig = providers.find(p => p.id === provider);
    if (!providerConfig) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    if (providerConfig.keyRequired && !apiKey) {
      return res.status(400).json({ error: 'API key is required for this provider' });
    }

    const result = toolApiKeyService.createKey(
      req.user.id,
      toolId,
      provider,
      apiKey || '',
      priority || 1
    );

    res.status(201).json({
      message: 'API key created successfully',
      key: {
        id: result.id,
        toolId: result.toolId,
        provider: result.provider,
        priority: result.priority,
        isActive: result.isActive,
        createdAt: result.createdAt,
      },
    });
  } catch (error) {
    logger.error(`Failed to create API key: ${error.message}`);

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: error.message || 'Failed to create API key' });
  }
});

// ============================================
// PATCH /api/tool-api-keys/:id
// Update an API key
// ============================================
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { apiKey, priority, isActive } = req.body;

    const updates = {};
    if (apiKey !== undefined) updates.apiKey = apiKey;
    if (priority !== undefined) updates.priority = priority;
    if (isActive !== undefined) updates.isActive = isActive ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const result = toolApiKeyService.updateKey(id, req.user.id, updates);

    if (!result) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({
      message: 'API key updated successfully',
      key: {
        id: result.id,
        toolId: result.tool_id,
        provider: result.provider,
        apiKeyMasked: toolApiKeyService.maskApiKey(result.api_key),
        priority: result.priority,
        isActive: result.is_active === 1,
        updatedAt: result.updated_at,
      },
    });
  } catch (error) {
    logger.error(`Failed to update API key: ${error.message}`);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// ============================================
// DELETE /api/tool-api-keys/:id
// Delete an API key
// ============================================
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = toolApiKeyService.deleteKey(id, req.user.id);

    if (!success) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    logger.error(`Failed to delete API key: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// ============================================
// POST /api/tool-api-keys/:id/test
// Test an API key validity
// ============================================
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await toolApiKeyService.testKey(id, req.user.id);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error(`Failed to test API key: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to test API key' });
  }
});

// ============================================
// POST /api/tool-api-keys/reorder
// Reorder priorities for a tool
// ============================================
router.post('/reorder', (req, res) => {
  try {
    const { toolId, orderedIds } = req.body;

    if (!toolId || !Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'toolId and orderedIds array required' });
    }

    // Update priorities based on array order
    for (let i = 0; i < orderedIds.length; i++) {
      toolApiKeyService.updateKey(orderedIds[i], req.user.id, { priority: i + 1 });
    }

    res.json({ message: 'Priorities updated successfully' });
  } catch (error) {
    logger.error(`Failed to reorder API keys: ${error.message}`);
    res.status(500).json({ error: 'Failed to reorder API keys' });
  }
});

module.exports = router;
