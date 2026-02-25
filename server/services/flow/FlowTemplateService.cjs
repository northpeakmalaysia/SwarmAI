/**
 * Flow Template Service
 * =====================
 * Manages flow templates, import/export, and marketplace integration.
 *
 * Features:
 * - Export flows as shareable templates
 * - Import flows from JSON/YAML
 * - Template marketplace (public templates)
 * - Template categories and search
 * - Variable sanitization for sharing
 * - Dependency resolution
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

/**
 * Template format
 * @typedef {Object} FlowTemplate
 * @property {string} id - Template ID
 * @property {string} name - Template name
 * @property {string} description - Template description
 * @property {string} category - Template category
 * @property {string[]} tags - Template tags
 * @property {string} version - Template version
 * @property {Object} flow - Flow definition
 * @property {Object} metadata - Template metadata
 * @property {Object} variables - Template variables
 */

const TEMPLATE_CATEGORIES = [
  'automation',
  'ai-agents',
  'messaging',
  'data-processing',
  'integration',
  'utility',
  'custom',
];

class FlowTemplateService {
  constructor() {
    this.db = getDatabase();
    this.ensureTable();
  }

  /**
   * Ensure the templates table exists
   * @private
   */
  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flow_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'custom',
        tags TEXT,
        version TEXT DEFAULT '1.0.0',
        flow_definition TEXT NOT NULL,
        metadata TEXT,
        variables TEXT,
        thumbnail TEXT,
        is_public INTEGER DEFAULT 0,
        is_official INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        ratings_count INTEGER DEFAULT 0,
        author_id TEXT NOT NULL,
        author_name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (author_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_templates_category ON flow_templates(category);
      CREATE INDEX IF NOT EXISTS idx_templates_is_public ON flow_templates(is_public);
      CREATE INDEX IF NOT EXISTS idx_templates_author ON flow_templates(author_id);
    `);
  }

  // ===========================================
  // Export Functions
  // ===========================================

  /**
   * Export a flow as a template
   * @param {string} flowId - Flow ID
   * @param {string} userId - User ID
   * @param {Object} options - Export options
   * @returns {Object} Exported template
   */
  async exportFlow(flowId, userId, options = {}) {
    // Get the flow
    const flow = this.db.prepare(`
      SELECT * FROM flows WHERE id = ? AND user_id = ?
    `).get(flowId, userId);

    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    // Parse JSON fields
    const nodes = JSON.parse(flow.nodes || '[]');
    const edges = JSON.parse(flow.edges || '[]');
    const settings = JSON.parse(flow.settings || '{}');

    // Sanitize nodes (remove sensitive data)
    const sanitizedNodes = this.sanitizeNodes(nodes, options);

    // Extract template variables
    const templateVariables = this.extractVariables(nodes);

    // Build template
    const template = {
      id: uuidv4(),
      format: 'swarm-flow-template',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      name: options.name || flow.name,
      description: options.description || flow.description || '',
      category: options.category || 'custom',
      tags: options.tags || [],
      flow: {
        nodes: sanitizedNodes,
        edges,
        settings: options.includeSettings ? settings : {},
        triggerType: flow.trigger_type,
      },
      variables: templateVariables,
      metadata: {
        originalFlowId: flowId,
        nodesCount: nodes.length,
        edgesCount: edges.length,
        nodeTypes: [...new Set(nodes.map(n => n.type))],
        author: options.includeAuthor ? userId : undefined,
        requirements: this.extractRequirements(nodes),
      },
    };

    logger.info(`Exported flow ${flowId} as template ${template.id}`);
    return template;
  }

  /**
   * Export flow as JSON string
   * @param {string} flowId - Flow ID
   * @param {string} userId - User ID
   * @param {Object} options - Export options
   * @returns {string} JSON string
   */
  async exportToJSON(flowId, userId, options = {}) {
    const template = await this.exportFlow(flowId, userId, options);
    return JSON.stringify(template, null, 2);
  }

  /**
   * Sanitize nodes by removing sensitive data
   * @private
   */
  sanitizeNodes(nodes, options = {}) {
    const sanitize = options.sanitize !== false;

    return nodes.map(node => {
      const sanitized = { ...node };

      if (sanitize && sanitized.data) {
        // Remove API keys and credentials
        const sensitiveKeys = [
          'apiKey', 'api_key', 'password', 'secret',
          'token', 'credentials', 'privateKey', 'private_key',
          'accessToken', 'access_token', 'refreshToken', 'refresh_token',
        ];

        sanitized.data = this.sanitizeObject(sanitized.data, sensitiveKeys);
      }

      return sanitized;
    });
  }

  /**
   * Recursively sanitize an object
   * @private
   */
  sanitizeObject(obj, sensitiveKeys) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, sensitiveKeys));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()))) {
        sanitized[key] = '{{SENSITIVE_REMOVED}}';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value, sensitiveKeys);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Extract configurable variables from nodes
   * @private
   */
  extractVariables(nodes) {
    const variables = {};

    for (const node of nodes) {
      if (!node.data) continue;

      // Find template variables ({{variable}})
      const content = JSON.stringify(node.data);
      const matches = content.matchAll(/\{\{([^}]+)\}\}/g);

      for (const match of matches) {
        const varName = match[1].trim();
        if (!variables[varName]) {
          variables[varName] = {
            name: varName,
            type: 'string',
            description: `Variable used in node ${node.data.label || node.id}`,
            required: false,
          };
        }
      }
    }

    return variables;
  }

  /**
   * Extract requirements/dependencies from nodes
   * @private
   */
  extractRequirements(nodes) {
    const requirements = {
      platforms: new Set(),
      aiProviders: new Set(),
      services: new Set(),
    };

    for (const node of nodes) {
      const type = node.type || '';

      // Platform requirements
      if (type.includes('whatsapp')) requirements.platforms.add('whatsapp');
      if (type.includes('telegram')) requirements.platforms.add('telegram');
      if (type.includes('email')) requirements.platforms.add('email');

      // AI requirements
      if (type.includes('ai:')) requirements.aiProviders.add('ai');
      if (type.includes('superBrain')) requirements.services.add('superbrain');

      // Swarm requirements
      if (type.includes('swarm:')) requirements.services.add('swarm');

      // RAG requirements
      if (type.includes('rag')) requirements.services.add('rag');
    }

    return {
      platforms: [...requirements.platforms],
      aiProviders: [...requirements.aiProviders],
      services: [...requirements.services],
    };
  }

  // ===========================================
  // Import Functions
  // ===========================================

  /**
   * Import a flow from a template
   * @param {Object|string} template - Template object or JSON string
   * @param {string} userId - User ID
   * @param {Object} options - Import options
   * @returns {Object} Created flow
   */
  async importFlow(template, userId, options = {}) {
    // Parse if string
    if (typeof template === 'string') {
      try {
        template = JSON.parse(template);
      } catch (e) {
        throw new Error('Invalid template format: not valid JSON');
      }
    }

    // Validate template format
    this.validateTemplate(template);

    // Generate new IDs for nodes and edges
    const { nodes, edges, idMap } = this.regenerateIds(template.flow.nodes, template.flow.edges);

    // Apply variable substitutions
    const substitutedNodes = options.variables
      ? this.applyVariableSubstitutions(nodes, options.variables)
      : nodes;

    // Create flow
    const flowId = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO flows (
        id, user_id, name, description, nodes, edges, settings,
        trigger_type, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      flowId,
      userId,
      options.name || template.name || 'Imported Flow',
      options.description || template.description || '',
      JSON.stringify(substitutedNodes),
      JSON.stringify(edges),
      JSON.stringify(template.flow.settings || {}),
      template.flow.triggerType || 'manual',
      'draft',
      now,
      now
    );

    // Get the created flow
    const flow = this.db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId);

    logger.info(`Imported flow ${flowId} from template ${template.id || 'unknown'}`);

    return {
      id: flowId,
      name: flow.name,
      description: flow.description,
      status: flow.status,
      nodesCount: substitutedNodes.length,
      edgesCount: edges.length,
      importedFrom: template.id,
      importedAt: now,
    };
  }

  /**
   * Validate template format
   * @private
   */
  validateTemplate(template) {
    if (!template) {
      throw new Error('Template is empty');
    }

    if (template.format && template.format !== 'swarm-flow-template') {
      throw new Error(`Unsupported template format: ${template.format}`);
    }

    if (!template.flow) {
      throw new Error('Template missing flow definition');
    }

    if (!Array.isArray(template.flow.nodes)) {
      throw new Error('Template missing nodes array');
    }

    if (!Array.isArray(template.flow.edges)) {
      throw new Error('Template missing edges array');
    }
  }

  /**
   * Regenerate IDs for nodes and edges
   * @private
   */
  regenerateIds(nodes, edges) {
    const idMap = new Map();

    // Generate new node IDs
    const newNodes = nodes.map(node => {
      const newId = `node_${uuidv4().slice(0, 8)}`;
      idMap.set(node.id, newId);

      return {
        ...node,
        id: newId,
      };
    });

    // Update edge references
    const newEdges = edges.map(edge => ({
      ...edge,
      id: `edge_${uuidv4().slice(0, 8)}`,
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
    }));

    return { nodes: newNodes, edges: newEdges, idMap };
  }

  /**
   * Apply variable substitutions to nodes
   * @private
   */
  applyVariableSubstitutions(nodes, variables) {
    const content = JSON.stringify(nodes);

    let substituted = content;
    for (const [name, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
      substituted = substituted.replace(regex, String(value));
    }

    return JSON.parse(substituted);
  }

  // ===========================================
  // Template Library Functions
  // ===========================================

  /**
   * Save a template to the library
   * @param {Object} template - Template to save
   * @param {string} userId - User ID
   * @param {Object} options - Save options
   * @returns {Object} Saved template
   */
  async saveTemplate(template, userId, options = {}) {
    const templateId = template.id || uuidv4();

    // Get user name for author
    const user = this.db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
    const authorName = user?.name || user?.email?.split('@')[0] || 'Anonymous';

    this.db.prepare(`
      INSERT OR REPLACE INTO flow_templates (
        id, name, description, category, tags, version,
        flow_definition, metadata, variables, thumbnail,
        is_public, author_id, author_name, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      templateId,
      template.name || 'Untitled Template',
      template.description || '',
      template.category || 'custom',
      JSON.stringify(template.tags || []),
      template.version || '1.0.0',
      JSON.stringify(template.flow),
      JSON.stringify(template.metadata || {}),
      JSON.stringify(template.variables || {}),
      options.thumbnail || null,
      options.isPublic ? 1 : 0,
      userId,
      authorName
    );

    return {
      id: templateId,
      name: template.name,
      isPublic: options.isPublic,
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * Get templates from the library
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object[]} Templates
   */
  getTemplates(userId, options = {}) {
    const { category, search, publicOnly, limit = 20, offset = 0 } = options;

    let query = `
      SELECT * FROM flow_templates
      WHERE (author_id = ? OR is_public = 1)
    `;
    const params = [userId];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (publicOnly) {
      query += ' AND is_public = 1';
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: JSON.parse(row.tags || '[]'),
      version: row.version,
      isPublic: Boolean(row.is_public),
      isOfficial: Boolean(row.is_official),
      downloads: row.downloads,
      rating: row.rating,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a single template by ID
   * @param {string} templateId - Template ID
   * @param {string} userId - User ID
   * @returns {Object|null} Template
   */
  getTemplate(templateId, userId) {
    const row = this.db.prepare(`
      SELECT * FROM flow_templates
      WHERE id = ? AND (author_id = ? OR is_public = 1)
    `).get(templateId, userId);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: JSON.parse(row.tags || '[]'),
      version: row.version,
      flow: JSON.parse(row.flow_definition),
      metadata: JSON.parse(row.metadata || '{}'),
      variables: JSON.parse(row.variables || '{}'),
      isPublic: Boolean(row.is_public),
      isOfficial: Boolean(row.is_official),
      downloads: row.downloads,
      rating: row.rating,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete a template
   * @param {string} templateId - Template ID
   * @param {string} userId - User ID
   */
  deleteTemplate(templateId, userId) {
    const result = this.db.prepare(`
      DELETE FROM flow_templates WHERE id = ? AND author_id = ?
    `).run(templateId, userId);

    return { success: result.changes > 0 };
  }

  /**
   * Increment download count
   * @param {string} templateId - Template ID
   */
  incrementDownloads(templateId) {
    this.db.prepare(`
      UPDATE flow_templates SET downloads = downloads + 1 WHERE id = ?
    `).run(templateId);
  }

  /**
   * Rate a template
   * @param {string} templateId - Template ID
   * @param {string} userId - User ID
   * @param {number} rating - Rating (1-5)
   */
  rateTemplate(templateId, userId, rating) {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // For simplicity, we just update the average
    // In production, you'd have a separate ratings table
    const template = this.db.prepare('SELECT rating, ratings_count FROM flow_templates WHERE id = ?').get(templateId);

    if (!template) {
      throw new Error('Template not found');
    }

    const newCount = (template.ratings_count || 0) + 1;
    const newRating = ((template.rating || 0) * (template.ratings_count || 0) + rating) / newCount;

    this.db.prepare(`
      UPDATE flow_templates SET rating = ?, ratings_count = ? WHERE id = ?
    `).run(newRating, newCount, templateId);

    return { rating: newRating, ratingsCount: newCount };
  }

  /**
   * Get available categories
   */
  getCategories() {
    return TEMPLATE_CATEGORIES;
  }
}

// Singleton instance
let _instance = null;

function getFlowTemplateService() {
  if (!_instance) {
    _instance = new FlowTemplateService();
  }
  return _instance;
}

module.exports = {
  FlowTemplateService,
  getFlowTemplateService,
  TEMPLATE_CATEGORIES,
};
