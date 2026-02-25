/**
 * Model Sync Service
 * Synchronizes models from OpenRouter API to local database
 */

const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Fetch models from OpenRouter API
 * @returns {Promise<Array>} Array of model objects
 */
async function fetchModelsFromAPI() {
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API returned ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];

  } catch (error) {
    logger.error(`Failed to fetch models from OpenRouter: ${error.message}`);
    throw error;
  }
}

/**
 * Parse model data from OpenRouter format
 * @param {Object} model - Raw model from API
 * @returns {Object} Parsed model
 */
function parseModel(model) {
  // Extract provider from model ID (e.g., "anthropic/claude-3-opus" -> "anthropic")
  const provider = model.id.split('/')[0] || 'unknown';

  // Check if model is free
  const isFree = model.pricing?.prompt === '0' && model.pricing?.completion === '0';

  // Extract architecture details
  const arch = model.architecture || {};
  const modality = arch.modality || 'text->text';
  const inputMods = arch.input_modalities || [];
  const outputMods = arch.output_modalities || [];

  // Determine capabilities from architecture and model ID
  // Vision support: check if image is in input modalities
  const supportsVision =
    inputMods.includes('image') ||
    modality.includes('image') ||
    model.id.includes('vision') ||
    model.id.includes('gpt-4o') ||
    (model.id.includes('claude-3') && !model.id.includes('haiku')) ||
    model.id.includes('gemini-1.5') ||
    model.id.includes('gemini-2');

  // Tool/function calling support based on known models
  const supportsTools =
    model.id.includes('gpt-4') ||
    model.id.includes('gpt-3.5') ||
    model.id.includes('claude-3') ||
    model.id.includes('claude-opus') ||
    model.id.includes('claude-sonnet') ||
    model.id.includes('gemini') ||
    model.id.includes('mistral-large') ||
    model.id.includes('mistral-medium') ||
    model.id.includes('mixtral') ||
    model.id.includes('llama-3') ||
    model.id.includes('command-r') ||
    model.id.includes('qwen');

  // JSON mode support (generally same models that support tools)
  const supportsJson = supportsTools;

  return {
    id: model.id,
    name: model.name || model.id,
    description: model.description || null,
    context_length: model.context_length || null,
    pricing_prompt: parseFloat(model.pricing?.prompt) || 0,
    pricing_completion: parseFloat(model.pricing?.completion) || 0,
    modality: modality,
    provider: provider,
    is_free: isFree ? 1 : 0,
    architecture: model.architecture ? JSON.stringify(model.architecture) : null,
    top_provider: model.top_provider ? JSON.stringify(model.top_provider) : null,
    per_request_limits: model.per_request_limits ? JSON.stringify(model.per_request_limits) : null,
    // New capability fields
    supports_vision: supportsVision ? 1 : 0,
    supports_tools: supportsTools ? 1 : 0,
    supports_json: supportsJson ? 1 : 0,
    supports_streaming: 1, // Most models support streaming
    input_modalities: JSON.stringify(inputMods.length > 0 ? inputMods : ['text']),
    output_modalities: JSON.stringify(outputMods.length > 0 ? outputMods : ['text']),
    max_output_tokens: arch.max_output_tokens || null,
    tokenizer: arch.tokenizer || null
  };
}

/**
 * Sync models from OpenRouter to database
 * @returns {Object} { success, count, error }
 */
async function syncModels() {
  try {
    logger.info('Starting OpenRouter model sync...');

    const models = await fetchModelsFromAPI();

    if (!models.length) {
      return { success: false, count: 0, error: 'No models returned from API' };
    }

    const db = getDatabase();

    // Use transaction for performance
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO openrouter_models (
        id, name, description, context_length,
        pricing_prompt, pricing_completion, modality,
        provider, is_free, architecture, top_provider,
        per_request_limits,
        supports_vision, supports_tools, supports_json, supports_streaming,
        input_modalities, output_modalities, max_output_tokens, tokenizer,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        datetime('now')
      )
    `);

    const insertMany = db.transaction((models) => {
      for (const model of models) {
        const parsed = parseModel(model);
        insertStmt.run(
          parsed.id,
          parsed.name,
          parsed.description,
          parsed.context_length,
          parsed.pricing_prompt,
          parsed.pricing_completion,
          parsed.modality,
          parsed.provider,
          parsed.is_free,
          parsed.architecture,
          parsed.top_provider,
          parsed.per_request_limits,
          // New capability fields
          parsed.supports_vision,
          parsed.supports_tools,
          parsed.supports_json,
          parsed.supports_streaming,
          parsed.input_modalities,
          parsed.output_modalities,
          parsed.max_output_tokens,
          parsed.tokenizer
        );
      }
    });

    insertMany(models);

    logger.info(`Model sync complete: ${models.length} models synced`);

    return { success: true, count: models.length };

  } catch (error) {
    logger.error(`Model sync failed: ${error.message}`);
    return { success: false, count: 0, error: error.message };
  }
}

/**
 * Get model count
 * @returns {number}
 */
function getModelCount() {
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM openrouter_models').get();
  return result.count;
}

/**
 * Get sync status
 * @returns {Object}
 */
function getSyncStatus() {
  const db = getDatabase();

  const count = db.prepare('SELECT COUNT(*) as count FROM openrouter_models').get();
  const latest = db.prepare('SELECT MAX(updated_at) as lastSync FROM openrouter_models').get();
  const freeCount = db.prepare('SELECT COUNT(*) as count FROM openrouter_models WHERE is_free = 1').get();
  const providers = db.prepare('SELECT COUNT(DISTINCT provider) as count FROM openrouter_models').get();

  return {
    totalModels: count.count,
    freeModels: freeCount.count,
    providerCount: providers.count,
    lastSync: latest.lastSync,
    source: 'openrouter'
  };
}

/**
 * Check if a model exists
 * @param {string} modelId
 * @returns {boolean}
 */
function isValidModel(modelId) {
  const db = getDatabase();
  const model = db.prepare('SELECT id FROM openrouter_models WHERE id = ?').get(modelId);
  return !!model;
}

/**
 * Get a specific model
 * @param {string} modelId
 * @returns {Object|null}
 */
function getModel(modelId) {
  const db = getDatabase();
  const model = db.prepare('SELECT * FROM openrouter_models WHERE id = ?').get(modelId);

  if (!model) return null;

  return {
    ...model,
    isFree: !!model.is_free,
    pricingPrompt: model.pricing_prompt,
    pricingCompletion: model.pricing_completion,
    contextLength: model.context_length,
    architecture: model.architecture ? JSON.parse(model.architecture) : null,
    topProvider: model.top_provider ? JSON.parse(model.top_provider) : null,
    perRequestLimits: model.per_request_limits ? JSON.parse(model.per_request_limits) : null,
    // Capabilities
    supportsVision: !!model.supports_vision,
    supportsTools: !!model.supports_tools,
    supportsJson: !!model.supports_json,
    supportsStreaming: !!model.supports_streaming,
    inputModalities: model.input_modalities ? JSON.parse(model.input_modalities) : ['text'],
    outputModalities: model.output_modalities ? JSON.parse(model.output_modalities) : ['text'],
    maxOutputTokens: model.max_output_tokens,
    tokenizer: model.tokenizer
  };
}

/**
 * Get models with filtering
 * @param {Object} filter
 * @returns {Array}
 */
function getModels(filter = {}) {
  const db = getDatabase();

  let sql = 'SELECT * FROM openrouter_models WHERE 1=1';
  const params = [];

  if (filter.isFree === true) {
    sql += ' AND is_free = 1';
  } else if (filter.isFree === false) {
    sql += ' AND is_free = 0';
  }

  if (filter.provider) {
    sql += ' AND provider = ?';
    params.push(filter.provider);
  }

  if (filter.search) {
    sql += ' AND (name LIKE ? OR id LIKE ? OR description LIKE ?)';
    const searchPattern = `%${filter.search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  if (filter.minContextLength) {
    sql += ' AND context_length >= ?';
    params.push(filter.minContextLength);
  }

  if (filter.modality) {
    sql += ' AND modality LIKE ?';
    params.push(`%${filter.modality}%`);
  }

  // Add capability filters
  if (filter.supportsVision === true) {
    sql += ' AND supports_vision = 1';
  }
  if (filter.supportsTools === true) {
    sql += ' AND supports_tools = 1';
  }
  if (filter.supportsJson === true) {
    sql += ' AND supports_json = 1';
  }

  sql += ' ORDER BY name';

  const models = db.prepare(sql).all(...params);

  return models.map(m => ({
    ...m,
    isFree: !!m.is_free,
    pricingPrompt: m.pricing_prompt,
    pricingCompletion: m.pricing_completion,
    contextLength: m.context_length,
    // Capabilities
    supportsVision: !!m.supports_vision,
    supportsTools: !!m.supports_tools,
    supportsJson: !!m.supports_json,
    supportsStreaming: !!m.supports_streaming,
    inputModalities: m.input_modalities ? JSON.parse(m.input_modalities) : ['text'],
    outputModalities: m.output_modalities ? JSON.parse(m.output_modalities) : ['text'],
    maxOutputTokens: m.max_output_tokens,
    tokenizer: m.tokenizer
  }));
}

/**
 * Get free models
 * @returns {Array}
 */
function getFreeModels() {
  return getModels({ isFree: true });
}

/**
 * Get recommended models
 * @returns {Array}
 */
function getRecommendedModels() {
  const db = getDatabase();

  const models = db.prepare(`
    SELECT * FROM openrouter_models
    WHERE id LIKE '%claude%'
       OR id LIKE '%gpt-4%'
       OR id LIKE '%gemini%'
       OR id LIKE '%llama%'
    ORDER BY name
    LIMIT 20
  `).all();

  return models.map(m => ({
    ...m,
    isFree: !!m.is_free,
    pricingPrompt: m.pricing_prompt,
    pricingCompletion: m.pricing_completion,
    contextLength: m.context_length,
    // Capabilities
    supportsVision: !!m.supports_vision,
    supportsTools: !!m.supports_tools,
    supportsJson: !!m.supports_json,
    supportsStreaming: !!m.supports_streaming,
    inputModalities: m.input_modalities ? JSON.parse(m.input_modalities) : ['text'],
    outputModalities: m.output_modalities ? JSON.parse(m.output_modalities) : ['text'],
    maxOutputTokens: m.max_output_tokens,
    tokenizer: m.tokenizer
  }));
}

/**
 * Get unique providers
 * @returns {Array}
 */
function getProviders() {
  const db = getDatabase();

  return db.prepare(`
    SELECT DISTINCT provider, COUNT(*) as modelCount
    FROM openrouter_models
    WHERE provider IS NOT NULL
    GROUP BY provider
    ORDER BY provider
  `).all();
}

/**
 * Get models grouped by provider
 * @returns {Object}
 */
function getModelsByProvider() {
  const db = getDatabase();
  const models = db.prepare('SELECT * FROM openrouter_models ORDER BY provider, name').all();

  const grouped = {};
  for (const model of models) {
    const provider = model.provider || 'unknown';
    if (!grouped[provider]) {
      grouped[provider] = [];
    }
    grouped[provider].push({
      ...model,
      isFree: !!model.is_free,
      supportsVision: !!model.supports_vision,
      supportsTools: !!model.supports_tools,
      supportsJson: !!model.supports_json,
      supportsStreaming: !!model.supports_streaming
    });
  }

  return grouped;
}

/**
 * Get models by capability requirements
 * Used by SuperBrain and Agentic AI for intelligent model selection
 * @param {Object} requirements - Capability requirements
 * @param {boolean} requirements.vision - Requires vision support
 * @param {boolean} requirements.tools - Requires tool/function calling
 * @param {boolean} requirements.json - Requires JSON mode
 * @param {boolean} requirements.preferFree - Prefer free models
 * @param {number} requirements.minContext - Minimum context length
 * @returns {Array} Matching models sorted by relevance
 */
function getModelsWithCapabilities(requirements = {}) {
  const db = getDatabase();

  let sql = 'SELECT * FROM openrouter_models WHERE 1=1';
  const params = [];

  // Filter by required capabilities
  if (requirements.vision) {
    sql += ' AND supports_vision = 1';
  }
  if (requirements.tools) {
    sql += ' AND supports_tools = 1';
  }
  if (requirements.json) {
    sql += ' AND supports_json = 1';
  }
  if (requirements.minContext) {
    sql += ' AND context_length >= ?';
    params.push(requirements.minContext);
  }

  // Order by preference: free models first if preferred, then by context length
  if (requirements.preferFree) {
    sql += ' ORDER BY is_free DESC, context_length DESC';
  } else {
    sql += ' ORDER BY context_length DESC';
  }

  const models = db.prepare(sql).all(...params);

  return models.map(m => ({
    id: m.id,
    name: m.name,
    description: m.description,
    provider: m.provider,
    contextLength: m.context_length,
    isFree: !!m.is_free,
    pricingPrompt: m.pricing_prompt,
    pricingCompletion: m.pricing_completion,
    // Capabilities
    supportsVision: !!m.supports_vision,
    supportsTools: !!m.supports_tools,
    supportsJson: !!m.supports_json,
    supportsStreaming: !!m.supports_streaming,
    inputModalities: m.input_modalities ? JSON.parse(m.input_modalities) : ['text'],
    outputModalities: m.output_modalities ? JSON.parse(m.output_modalities) : ['text'],
    maxOutputTokens: m.max_output_tokens,
    tokenizer: m.tokenizer
  }));
}

/**
 * Get capability summary for all models
 * @returns {Object} Summary statistics
 */
function getCapabilitySummary() {
  const db = getDatabase();

  return db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(supports_vision) as visionCount,
      SUM(supports_tools) as toolsCount,
      SUM(supports_json) as jsonCount,
      SUM(supports_streaming) as streamingCount,
      SUM(is_free) as freeCount
    FROM openrouter_models
  `).get();
}

module.exports = {
  syncModels,
  getModelCount,
  getSyncStatus,
  isValidModel,
  getModel,
  getModels,
  getFreeModels,
  getRecommendedModels,
  getProviders,
  getModelsByProvider,
  getModelsWithCapabilities,
  getCapabilitySummary
};
