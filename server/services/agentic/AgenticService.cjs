/**
 * Agentic Service
 *
 * Core service for managing Agentic AI profiles, hierarchy, team members,
 * and configuration. This service handles all CRUD operations for the
 * agentic profiles system.
 *
 * Key features:
 * - Agentic profile management (master/sub agents)
 * - Hierarchy management with parent-child relationships
 * - Team member management
 * - AI routing configuration
 * - Contact scope settings
 * - Background information (inherited from master)
 */

const crypto = require('crypto');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

class AgenticService {
  constructor(db = null) {
    this.db = db;
  }

  /**
   * Get database instance (lazy initialization)
   * @returns {Object} Database instance
   */
  getDb() {
    if (!this.db) {
      this.db = getDatabase();
    }
    return this.db;
  }

  // =====================================================
  // PROFILE CRUD OPERATIONS
  // =====================================================

  /**
   * Create a new agentic profile
   * @param {string} userId - Owner user ID
   * @param {Object} data - Profile data
   * @returns {Object} Created profile
   */
  createProfile(userId, data) {
    const db = this.getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      const stmt = db.prepare(`
        INSERT INTO agentic_profiles (
          id, user_id, name, role, description, avatar,
          agent_type, parent_agentic_id, hierarchy_level, hierarchy_path,
          created_by_type, created_by_agentic_id, creation_reason, creation_prompt,
          inherit_team, inherit_knowledge, inherit_monitoring, inherit_routing,
          ai_provider, ai_model, temperature, max_tokens, system_prompt, routing_preset,
          autonomy_level, require_approval_for,
          master_contact_id, master_contact_channel, notify_master_on, escalation_timeout_minutes,
          can_create_children, max_children, max_hierarchy_depth, children_autonomy_cap,
          daily_budget, rate_limit_per_minute,
          status, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?
        )
      `);

      stmt.run(
        id,
        userId,
        data.name,
        data.role || 'General',
        data.description || null,
        data.avatar || null,
        data.agentType || 'master',
        data.parentAgenticId || null,
        data.hierarchyLevel || 0,
        data.hierarchyPath || `/${id}`,
        data.createdByType || 'user',
        data.createdByAgenticId || null,
        data.creationReason || null,
        data.creationPrompt || null,
        data.inheritTeam !== undefined ? (data.inheritTeam ? 1 : 0) : 1,
        data.inheritKnowledge !== undefined ? (data.inheritKnowledge ? 1 : 0) : 1,
        data.inheritMonitoring !== undefined ? (data.inheritMonitoring ? 1 : 0) : 0,
        data.inheritRouting !== undefined ? (data.inheritRouting ? 1 : 0) : 1,
        data.aiProvider || 'task-routing',
        data.aiModel || null,
        data.temperature !== undefined ? data.temperature : 0.7,
        data.maxTokens || 4096,
        data.systemPrompt || null,
        data.routingPreset || null,
        data.autonomyLevel || 'supervised',
        JSON.stringify(data.requireApprovalFor || []),
        data.masterContactId || null,
        data.masterContactChannel || 'email',
        JSON.stringify(data.notifyMasterOn || ['approval_needed', 'daily_report', 'critical_error']),
        data.escalationTimeoutMinutes || 60,
        data.canCreateChildren !== undefined ? (data.canCreateChildren ? 1 : 0) : 0,
        data.maxChildren || 5,
        data.maxHierarchyDepth || 3,
        data.childrenAutonomyCap || 'supervised',
        data.dailyBudget || 10.0,
        data.rateLimitPerMinute || 60,
        data.status || 'inactive',
        now,
        now
      );

      logger.info(`Created agentic profile: ${id} (${data.name}) for user ${userId}`);

      return this.getProfile(id, userId);
    } catch (error) {
      logger.error(`Failed to create agentic profile: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get a single agentic profile with ownership verification
   * @param {string} agenticId - Profile ID
   * @param {string} userId - Owner user ID for verification
   * @returns {Object|null} Profile or null
   */
  getProfile(agenticId, userId) {
    const db = this.getDb();

    try {
      const row = db.prepare(`
        SELECT * FROM agentic_profiles
        WHERE id = ? AND user_id = ?
      `).get(agenticId, userId);

      if (!row) {
        return null;
      }

      return this.transformProfile(row);
    } catch (error) {
      logger.error(`Failed to get agentic profile ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Update an agentic profile
   * @param {string} agenticId - Profile ID
   * @param {string} userId - Owner user ID for verification
   * @param {Object} data - Fields to update
   * @returns {Object|null} Updated profile or null
   */
  updateProfile(agenticId, userId, data) {
    const db = this.getDb();

    try {
      // Verify ownership
      const existing = db.prepare(`
        SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?
      `).get(agenticId, userId);

      if (!existing) {
        return null;
      }

      // Build update query dynamically
      const allowedFields = {
        name: 'name',
        role: 'role',
        description: 'description',
        avatar: 'avatar',
        aiProvider: 'ai_provider',
        aiModel: 'ai_model',
        temperature: 'temperature',
        maxTokens: 'max_tokens',
        systemPrompt: 'system_prompt',
        routingPreset: 'routing_preset',
        autonomyLevel: 'autonomy_level',
        requireApprovalFor: 'require_approval_for',
        masterContactId: 'master_contact_id',
        masterContactChannel: 'master_contact_channel',
        notifyMasterOn: 'notify_master_on',
        escalationTimeoutMinutes: 'escalation_timeout_minutes',
        canCreateChildren: 'can_create_children',
        maxChildren: 'max_children',
        maxHierarchyDepth: 'max_hierarchy_depth',
        childrenAutonomyCap: 'children_autonomy_cap',
        dailyBudget: 'daily_budget',
        rateLimitPerMinute: 'rate_limit_per_minute',
        status: 'status',
        inheritTeam: 'inherit_team',
        inheritKnowledge: 'inherit_knowledge',
        inheritMonitoring: 'inherit_monitoring',
        inheritRouting: 'inherit_routing'
      };

      const updates = [];
      const params = [];

      for (const [camelKey, snakeKey] of Object.entries(allowedFields)) {
        if (data[camelKey] !== undefined) {
          let value = data[camelKey];

          // Handle JSON fields
          if (['requireApprovalFor', 'notifyMasterOn'].includes(camelKey)) {
            value = JSON.stringify(value);
          }

          // Handle boolean fields
          if (['canCreateChildren', 'inheritTeam', 'inheritKnowledge', 'inheritMonitoring', 'inheritRouting'].includes(camelKey)) {
            value = value ? 1 : 0;
          }

          updates.push(`${snakeKey} = ?`);
          params.push(value);
        }
      }

      if (updates.length === 0) {
        return this.transformProfile(existing);
      }

      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(agenticId);
      params.push(userId);

      db.prepare(`
        UPDATE agentic_profiles
        SET ${updates.join(', ')}
        WHERE id = ? AND user_id = ?
      `).run(...params);

      logger.info(`Updated agentic profile: ${agenticId}`);

      return this.getProfile(agenticId, userId);
    } catch (error) {
      logger.error(`Failed to update agentic profile ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Soft delete an agentic profile (set status='deleted')
   * @param {string} agenticId - Profile ID
   * @param {string} userId - Owner user ID for verification
   * @returns {boolean} Success
   */
  deleteProfile(agenticId, userId) {
    const db = this.getDb();

    try {
      const result = db.prepare(`
        UPDATE agentic_profiles
        SET status = 'deleted',
            terminated_at = ?,
            termination_reason = 'User deleted',
            updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        new Date().toISOString(),
        new Date().toISOString(),
        agenticId,
        userId
      );

      if (result.changes > 0) {
        logger.info(`Soft deleted agentic profile: ${agenticId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to delete agentic profile ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * List agentic profiles with pagination and filtering
   * @param {string} userId - Owner user ID
   * @param {Object} filters - Filter options
   * @returns {Object} { profiles: [], total: number, page: number, pageSize: number }
   */
  listProfiles(userId, filters = {}) {
    const db = this.getDb();

    try {
      const {
        page = 1,
        pageSize = 20,
        status = null,
        search = null,
        agentType = null,
        parentId = null,
        includeDeleted = false
      } = filters;

      const offset = (page - 1) * pageSize;
      const conditions = ['user_id = ?'];
      const params = [userId];

      // Filter by status
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      } else if (!includeDeleted) {
        conditions.push("status != 'deleted'");
      }

      // Filter by agent type
      if (agentType) {
        conditions.push('agent_type = ?');
        params.push(agentType);
      }

      // Filter by parent
      if (parentId !== null) {
        if (parentId === '') {
          conditions.push('parent_agentic_id IS NULL');
        } else {
          conditions.push('parent_agentic_id = ?');
          params.push(parentId);
        }
      }

      // Search by name or description
      if (search) {
        conditions.push('(name LIKE ? OR description LIKE ? OR role LIKE ?)');
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countResult = db.prepare(`
        SELECT COUNT(*) as total FROM agentic_profiles
        WHERE ${whereClause}
      `).get(...params);

      // Get paginated results
      const rows = db.prepare(`
        SELECT * FROM agentic_profiles
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);

      return {
        profiles: rows.map(row => this.transformProfile(row)),
        total: countResult.total,
        page,
        pageSize
      };
    } catch (error) {
      logger.error(`Failed to list agentic profiles: ${error.message}`, error);
      throw error;
    }
  }

  // =====================================================
  // HIERARCHY OPERATIONS
  // =====================================================

  /**
   * Create a sub-agent under a parent
   * @param {string} parentId - Parent agent ID
   * @param {string} userId - Owner user ID
   * @param {Object} data - Sub-agent data
   * @returns {Object} Created sub-agent
   */
  createSubAgent(parentId, userId, data) {
    const db = this.getDb();

    try {
      // Get parent to verify ownership and inherit settings
      const parent = this.getProfile(parentId, userId);
      if (!parent) {
        throw new Error('Parent agent not found or access denied');
      }

      // Check if parent can create children
      if (!parent.canCreateChildren) {
        throw new Error('Parent agent is not allowed to create sub-agents');
      }

      // Check max children limit
      const childCount = db.prepare(`
        SELECT COUNT(*) as count FROM agentic_profiles
        WHERE parent_agentic_id = ? AND status != 'deleted'
      `).get(parentId);

      if (childCount.count >= parent.maxChildren) {
        throw new Error(`Parent agent has reached maximum children limit (${parent.maxChildren})`);
      }

      // Check max hierarchy depth
      const newLevel = parent.hierarchyLevel + 1;
      if (newLevel > parent.maxHierarchyDepth) {
        throw new Error(`Maximum hierarchy depth (${parent.maxHierarchyDepth}) exceeded`);
      }

      // Build hierarchy path
      const hierarchyPath = `${parent.hierarchyPath}/${crypto.randomUUID()}`;

      // Cap autonomy level at parent's cap
      const autonomyLevels = ['supervised', 'semi-autonomous', 'autonomous'];
      const capIndex = autonomyLevels.indexOf(parent.childrenAutonomyCap);
      const requestedIndex = autonomyLevels.indexOf(data.autonomyLevel || 'supervised');
      const finalAutonomyLevel = autonomyLevels[Math.min(requestedIndex, capIndex)];

      // Create sub-agent with inherited settings
      const subAgentData = {
        ...data,
        agentType: 'sub',
        parentAgenticId: parentId,
        hierarchyLevel: newLevel,
        hierarchyPath,
        createdByType: data.createdByType || 'user',
        createdByAgenticId: data.createdByAgenticId || null,
        autonomyLevel: finalAutonomyLevel,
        // Inherit from parent if not specified
        inheritTeam: data.inheritTeam !== undefined ? data.inheritTeam : parent.inheritTeam,
        inheritKnowledge: data.inheritKnowledge !== undefined ? data.inheritKnowledge : parent.inheritKnowledge,
        inheritRouting: data.inheritRouting !== undefined ? data.inheritRouting : parent.inheritRouting,
        // Sub-agents can't exceed parent's child creation capabilities
        canCreateChildren: data.canCreateChildren && parent.maxHierarchyDepth > newLevel,
        maxHierarchyDepth: Math.min(data.maxHierarchyDepth || parent.maxHierarchyDepth, parent.maxHierarchyDepth)
      };

      const subAgent = this.createProfile(userId, subAgentData);

      logger.info(`Created sub-agent ${subAgent.id} under parent ${parentId}`);

      return subAgent;
    } catch (error) {
      logger.error(`Failed to create sub-agent: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get full hierarchy tree for an agent
   * @param {string} agenticId - Agent ID (master or sub)
   * @returns {Object} Hierarchy tree
   */
  getHierarchy(agenticId) {
    const db = this.getDb();

    try {
      // First get the agent to find its user_id and hierarchy
      const agent = db.prepare(`
        SELECT * FROM agentic_profiles WHERE id = ?
      `).get(agenticId);

      if (!agent) {
        return null;
      }

      // Find root agent (hierarchy_level = 0)
      let rootId = agenticId;
      if (agent.hierarchy_level > 0 && agent.hierarchy_path) {
        const pathParts = agent.hierarchy_path.split('/').filter(p => p);
        rootId = pathParts[0];
      }

      // Get all agents in this hierarchy
      const allAgents = db.prepare(`
        SELECT * FROM agentic_profiles
        WHERE user_id = ? AND hierarchy_path LIKE ? AND status != 'deleted'
        ORDER BY hierarchy_level, created_at
      `).all(agent.user_id, `/${rootId}%`);

      // Build tree structure
      const buildTree = (parentId) => {
        const children = allAgents.filter(a =>
          a.parent_agentic_id === parentId
        );

        return children.map(child => ({
          ...this.transformProfile(child),
          children: buildTree(child.id)
        }));
      };

      // Find root node
      const root = allAgents.find(a => a.id === rootId);
      if (!root) {
        return null;
      }

      return {
        ...this.transformProfile(root),
        children: buildTree(root.id)
      };
    } catch (error) {
      logger.error(`Failed to get hierarchy for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Detach an agent from its parent (make it independent)
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @returns {Object|null} Updated profile
   */
  detachFromParent(agenticId, userId) {
    const db = this.getDb();

    try {
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return null;
      }

      if (agent.agentType === 'master' || !agent.parentAgenticId) {
        throw new Error('Agent is already a master agent or has no parent');
      }

      // Update to master agent
      const result = db.prepare(`
        UPDATE agentic_profiles
        SET agent_type = 'master',
            parent_agentic_id = NULL,
            hierarchy_level = 0,
            hierarchy_path = ?,
            updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        `/${agenticId}`,
        new Date().toISOString(),
        agenticId,
        userId
      );

      if (result.changes > 0) {
        // Update children's hierarchy paths
        this.updateChildrenHierarchyPaths(agenticId, `/${agenticId}`);
        logger.info(`Detached agent ${agenticId} from parent`);
        return this.getProfile(agenticId, userId);
      }

      return null;
    } catch (error) {
      logger.error(`Failed to detach agent ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Update hierarchy paths for all children recursively
   * @param {string} parentId - Parent agent ID
   * @param {string} parentPath - New parent path
   */
  updateChildrenHierarchyPaths(parentId, parentPath) {
    const db = this.getDb();

    const children = db.prepare(`
      SELECT id FROM agentic_profiles
      WHERE parent_agentic_id = ? AND status != 'deleted'
    `).all(parentId);

    for (const child of children) {
      const newPath = `${parentPath}/${child.id}`;
      db.prepare(`
        UPDATE agentic_profiles
        SET hierarchy_path = ?, updated_at = ?
        WHERE id = ?
      `).run(newPath, new Date().toISOString(), child.id);

      // Recursively update grandchildren
      this.updateChildrenHierarchyPaths(child.id, newPath);
    }
  }

  // =====================================================
  // CONFIGURATION OPERATIONS
  // =====================================================

  /**
   * Get AI routing configuration for an agent
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @returns {Object|null} Routing configuration
   */
  getRouting(agenticId, userId) {
    const db = this.getDb();

    try {
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return null;
      }

      // Get custom routing from agentic_ai_routing table if exists
      const customRouting = db.prepare(`
        SELECT * FROM agentic_ai_routing
        WHERE agentic_id = ?
        ORDER BY task_type
      `).all(agenticId);

      return {
        agenticId,
        aiProvider: agent.aiProvider,
        aiModel: agent.aiModel,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        routingPreset: agent.routingPreset,
        inheritRouting: agent.inheritRouting,
        customRouting: customRouting.map(r => ({
          taskType: r.task_type,
          providerChain: JSON.parse(r.provider_chain || '[]'),
          temperature: r.temperature,
          maxTokens: r.max_tokens,
          timeoutSeconds: r.timeout_seconds,
          maxRetries: r.max_retries,
          retryDelayMs: r.retry_delay_ms
        }))
      };
    } catch (error) {
      logger.error(`Failed to get routing for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Update AI routing configuration
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @param {Object} routing - Routing configuration
   * @returns {Object|null} Updated routing
   */
  updateRouting(agenticId, userId, routing) {
    const db = this.getDb();

    try {
      // Verify ownership
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return null;
      }

      // Update main profile settings
      if (routing.aiProvider !== undefined || routing.aiModel !== undefined ||
          routing.temperature !== undefined || routing.maxTokens !== undefined ||
          routing.routingPreset !== undefined) {
        this.updateProfile(agenticId, userId, {
          aiProvider: routing.aiProvider,
          aiModel: routing.aiModel,
          temperature: routing.temperature,
          maxTokens: routing.maxTokens,
          routingPreset: routing.routingPreset
        });
      }

      // Update custom routing entries
      if (routing.customRouting && Array.isArray(routing.customRouting)) {
        // Delete existing custom routing
        db.prepare(`DELETE FROM agentic_ai_routing WHERE agentic_id = ?`).run(agenticId);

        // Insert new routing
        const stmt = db.prepare(`
          INSERT INTO agentic_ai_routing (
            id, agentic_id, user_id, task_type, provider_chain, temperature,
            max_tokens, timeout_seconds, max_retries, retry_delay_ms,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();

        for (const route of routing.customRouting) {
          stmt.run(
            crypto.randomUUID(),
            agenticId,
            userId,
            route.taskType,
            JSON.stringify(route.providerChain || []),
            route.temperature || 0.7,
            route.maxTokens || 4096,
            route.timeoutSeconds || 60,
            route.maxRetries || 2,
            route.retryDelayMs || 1000,
            now,
            now
          );
        }
      }

      logger.info(`Updated routing for agent ${agenticId}`);

      return this.getRouting(agenticId, userId);
    } catch (error) {
      logger.error(`Failed to update routing for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get contact scope settings for an agent
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @returns {Object|null} Contact scope settings
   */
  getContactScope(agenticId, userId) {
    const db = this.getDb();

    try {
      const row = db.prepare(`
        SELECT * FROM agentic_contact_scope
        WHERE agentic_id = ?
      `).get(agenticId);

      // Verify ownership through parent profile
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return null;
      }

      // If sub-agent, inherit from master
      if (agent.agentType === 'sub' && !row) {
        const masterId = agent.hierarchyPath.split('/').filter(p => p)[0];
        const masterScope = db.prepare(`
          SELECT * FROM agentic_contact_scope WHERE agentic_id = ?
        `).get(masterId);

        if (masterScope) {
          return {
            ...this.transformContactScope(masterScope),
            inherited: true,
            inheritedFrom: masterId
          };
        }
      }

      if (!row) {
        // Return default scope
        return {
          agenticId,
          scopeType: 'team_only',
          whitelistContactIds: [],
          whitelistTags: [],
          allowTeamMembers: true,
          allowMasterContact: true,
          notifyOnOutOfScope: true,
          autoAddApproved: false,
          inherited: false
        };
      }

      return this.transformContactScope(row);
    } catch (error) {
      logger.error(`Failed to get contact scope for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Update contact scope settings (only master agents)
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @param {Object} scope - Contact scope settings
   * @returns {Object|null} Updated scope
   */
  updateContactScope(agenticId, userId, scope) {
    const db = this.getDb();

    try {
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return null;
      }

      // Only master agents can update contact scope
      if (agent.agentType !== 'master') {
        throw new Error('Only master agents can update contact scope. Sub-agents inherit from master.');
      }

      const now = new Date().toISOString();

      // Check if record exists
      const existing = db.prepare(`
        SELECT id FROM agentic_contact_scope WHERE agentic_id = ?
      `).get(agenticId);

      if (existing) {
        db.prepare(`
          UPDATE agentic_contact_scope SET
            scope_type = ?,
            whitelist_contact_ids = ?,
            whitelist_tags = ?,
            allow_team_members = ?,
            allow_master_contact = ?,
            notify_on_out_of_scope = ?,
            auto_add_approved = ?,
            updated_at = ?
          WHERE agentic_id = ?
        `).run(
          scope.scopeType || 'team_only',
          JSON.stringify(scope.whitelistContactIds || []),
          JSON.stringify(scope.whitelistTags || []),
          scope.allowTeamMembers !== undefined ? (scope.allowTeamMembers ? 1 : 0) : 1,
          scope.allowMasterContact !== undefined ? (scope.allowMasterContact ? 1 : 0) : 1,
          scope.notifyOnOutOfScope !== undefined ? (scope.notifyOnOutOfScope ? 1 : 0) : 1,
          scope.autoAddApproved !== undefined ? (scope.autoAddApproved ? 1 : 0) : 0,
          now,
          agenticId
        );
      } else {
        db.prepare(`
          INSERT INTO agentic_contact_scope (
            id, agentic_id, user_id, scope_type, whitelist_contact_ids, whitelist_tags,
            allow_team_members, allow_master_contact, notify_on_out_of_scope,
            auto_add_approved, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          agenticId,
          userId,
          scope.scopeType || 'team_only',
          JSON.stringify(scope.whitelistContactIds || []),
          JSON.stringify(scope.whitelistTags || []),
          scope.allowTeamMembers !== undefined ? (scope.allowTeamMembers ? 1 : 0) : 1,
          scope.allowMasterContact !== undefined ? (scope.allowMasterContact ? 1 : 0) : 1,
          scope.notifyOnOutOfScope !== undefined ? (scope.notifyOnOutOfScope ? 1 : 0) : 1,
          scope.autoAddApproved !== undefined ? (scope.autoAddApproved ? 1 : 0) : 0,
          now,
          now
        );
      }

      logger.info(`Updated contact scope for agent ${agenticId}`);

      return this.getContactScope(agenticId, userId);
    } catch (error) {
      logger.error(`Failed to update contact scope for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get company background information (inherited from master for sub-agents)
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @returns {Object|null} Background information
   */
  getBackground(agenticId, userId) {
    const db = this.getDb();

    try {
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return null;
      }

      // For sub-agents, always get from master
      let targetId = agenticId;
      let inherited = false;

      if (agent.agentType === 'sub') {
        const pathParts = agent.hierarchyPath.split('/').filter(p => p);
        targetId = pathParts[0]; // Root master
        inherited = true;
      }

      const row = db.prepare(`
        SELECT * FROM agentic_background
        WHERE agentic_id = ?
      `).get(targetId);

      if (!row) {
        return {
          agenticId: targetId,
          inherited,
          inheritedFrom: inherited ? targetId : null,
          companyName: null,
          companyShortName: null,
          companyType: null,
          registrationNumber: null,
          taxId: null,
          industry: null,
          description: null,
          established: null,
          employeeCount: null,
          services: [],
          products: [],
          primaryPhone: null,
          alternatePhone: null,
          primaryEmail: null,
          supportEmail: null,
          website: null,
          address: {
            street: null,
            city: null,
            state: null,
            postalCode: null,
            country: null
          },
          timezone: null,
          businessHours: null,
          holidays: [],
          socialLinks: {
            linkedin: null,
            facebook: null,
            twitter: null,
            instagram: null
          },
          customFields: {}
        };
      }

      return {
        ...this.transformBackground(row),
        inherited,
        inheritedFrom: inherited ? targetId : null
      };
    } catch (error) {
      logger.error(`Failed to get background for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Update company background information (only master agents)
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @param {Object} background - Background information
   * @returns {Object|null} Updated background
   */
  updateBackground(agenticId, userId, background) {
    const db = this.getDb();

    try {
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return null;
      }

      // Only master agents can update background
      if (agent.agentType !== 'master') {
        throw new Error('Only master agents can update background information. Sub-agents inherit from master.');
      }

      const now = new Date().toISOString();

      // Check if record exists
      const existing = db.prepare(`
        SELECT id FROM agentic_background WHERE agentic_id = ?
      `).get(agenticId);

      if (existing) {
        db.prepare(`
          UPDATE agentic_background SET
            company_name = ?,
            company_short_name = ?,
            company_type = ?,
            registration_number = ?,
            tax_id = ?,
            industry = ?,
            description = ?,
            established = ?,
            employee_count = ?,
            services = ?,
            products = ?,
            primary_phone = ?,
            alternate_phone = ?,
            primary_email = ?,
            support_email = ?,
            website = ?,
            address_street = ?,
            address_city = ?,
            address_state = ?,
            address_postal_code = ?,
            address_country = ?,
            timezone = ?,
            business_hours = ?,
            holidays = ?,
            linkedin = ?,
            facebook = ?,
            twitter = ?,
            instagram = ?,
            custom_fields = ?,
            updated_at = ?
          WHERE agentic_id = ?
        `).run(
          background.companyName || null,
          background.companyShortName || null,
          background.companyType || null,
          background.registrationNumber || null,
          background.taxId || null,
          background.industry || null,
          background.description || null,
          background.established || null,
          background.employeeCount || null,
          JSON.stringify(background.services || []),
          JSON.stringify(background.products || []),
          background.primaryPhone || null,
          background.alternatePhone || null,
          background.primaryEmail || null,
          background.supportEmail || null,
          background.website || null,
          background.address?.street || null,
          background.address?.city || null,
          background.address?.state || null,
          background.address?.postalCode || null,
          background.address?.country || null,
          background.timezone || null,
          background.businessHours ? JSON.stringify(background.businessHours) : null,
          JSON.stringify(background.holidays || []),
          background.socialLinks?.linkedin || null,
          background.socialLinks?.facebook || null,
          background.socialLinks?.twitter || null,
          background.socialLinks?.instagram || null,
          background.customFields ? JSON.stringify(background.customFields) : null,
          now,
          agenticId
        );
      } else {
        db.prepare(`
          INSERT INTO agentic_background (
            id, agentic_id, user_id, company_name, company_short_name, company_type,
            registration_number, tax_id, industry, description, established, employee_count,
            services, products,
            primary_phone, alternate_phone, primary_email, support_email, website,
            address_street, address_city, address_state, address_postal_code, address_country,
            timezone, business_hours, holidays,
            linkedin, facebook, twitter, instagram, custom_fields,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          agenticId,
          userId,
          background.companyName || null,
          background.companyShortName || null,
          background.companyType || null,
          background.registrationNumber || null,
          background.taxId || null,
          background.industry || null,
          background.description || null,
          background.established || null,
          background.employeeCount || null,
          JSON.stringify(background.services || []),
          JSON.stringify(background.products || []),
          background.primaryPhone || null,
          background.alternatePhone || null,
          background.primaryEmail || null,
          background.supportEmail || null,
          background.website || null,
          background.address?.street || null,
          background.address?.city || null,
          background.address?.state || null,
          background.address?.postalCode || null,
          background.address?.country || null,
          background.timezone || null,
          background.businessHours ? JSON.stringify(background.businessHours) : null,
          JSON.stringify(background.holidays || []),
          background.socialLinks?.linkedin || null,
          background.socialLinks?.facebook || null,
          background.socialLinks?.twitter || null,
          background.socialLinks?.instagram || null,
          background.customFields ? JSON.stringify(background.customFields) : null,
          now,
          now
        );
      }

      logger.info(`Updated background for agent ${agenticId}`);

      return this.getBackground(agenticId, userId);
    } catch (error) {
      logger.error(`Failed to update background for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  // =====================================================
  // TEAM MANAGEMENT
  // =====================================================

  /**
   * Get team members for an agent
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @returns {Array} Team members
   */
  getTeamMembers(agenticId, userId) {
    const db = this.getDb();

    try {
      // Verify ownership
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        return [];
      }

      // If sub-agent inherits team, get from master
      let targetId = agenticId;
      if (agent.agentType === 'sub' && agent.inheritTeam) {
        const pathParts = agent.hierarchyPath.split('/').filter(p => p);
        targetId = pathParts[0];
      }

      const rows = db.prepare(`
        SELECT tm.*, c.display_name as contact_name, c.avatar as contact_avatar
        FROM agentic_team_members tm
        LEFT JOIN contacts c ON tm.contact_id = c.id
        WHERE tm.agentic_id = ? AND tm.is_active = 1
        ORDER BY tm.role, tm.created_at
      `).all(targetId);

      return rows.map(row => this.transformTeamMember(row));
    } catch (error) {
      logger.error(`Failed to get team members for ${agenticId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Add a team member
   * @param {string} agenticId - Agent ID
   * @param {string} userId - Owner user ID
   * @param {Object} data - Team member data
   * @returns {Object} Created team member
   */
  addTeamMember(agenticId, userId, data) {
    const db = this.getDb();

    try {
      const agent = this.getProfile(agenticId, userId);
      if (!agent) {
        throw new Error('Agent not found or access denied');
      }

      // Only master agents can add team members
      if (agent.agentType !== 'master') {
        throw new Error('Only master agents can add team members. Sub-agents inherit team from master.');
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO agentic_team_members (
          id, agentic_id, user_id, contact_id, role, department, skills,
          is_available, availability_schedule, timezone, max_concurrent_tasks,
          task_types, priority_level, preferred_channel, notification_frequency,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        agenticId,
        userId,
        data.contactId,
        data.role,
        data.department || null,
        JSON.stringify(data.skills || []),
        data.isAvailable !== undefined ? (data.isAvailable ? 1 : 0) : 1,
        data.availabilitySchedule ? JSON.stringify(data.availabilitySchedule) : null,
        data.timezone || 'Asia/Jakarta',
        data.maxConcurrentTasks || 3,
        JSON.stringify(data.taskTypes || []),
        data.priorityLevel || 'normal',
        data.preferredChannel || 'email',
        data.notificationFrequency || 'immediate',
        1,
        now,
        now
      );

      logger.info(`Added team member ${id} to agent ${agenticId}`);

      return this.getTeamMemberById(id);
    } catch (error) {
      logger.error(`Failed to add team member: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get team member by ID
   * @param {string} memberId - Team member ID
   * @returns {Object|null} Team member
   */
  getTeamMemberById(memberId) {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT tm.*, c.display_name as contact_name, c.avatar as contact_avatar
      FROM agentic_team_members tm
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE tm.id = ?
    `).get(memberId);

    return row ? this.transformTeamMember(row) : null;
  }

  /**
   * Update a team member
   * @param {string} memberId - Team member ID
   * @param {string} userId - Owner user ID
   * @param {Object} data - Updated data
   * @returns {Object|null} Updated team member
   */
  updateTeamMember(memberId, userId, data) {
    const db = this.getDb();

    try {
      // Get team member and verify ownership through agent
      const member = db.prepare(`
        SELECT tm.*, ap.user_id
        FROM agentic_team_members tm
        JOIN agentic_profiles ap ON tm.agentic_id = ap.id
        WHERE tm.id = ?
      `).get(memberId);

      if (!member || member.user_id !== userId) {
        return null;
      }

      const updates = [];
      const params = [];

      const fieldMap = {
        role: 'role',
        department: 'department',
        skills: 'skills',
        isAvailable: 'is_available',
        availabilitySchedule: 'availability_schedule',
        timezone: 'timezone',
        maxConcurrentTasks: 'max_concurrent_tasks',
        taskTypes: 'task_types',
        priorityLevel: 'priority_level',
        preferredChannel: 'preferred_channel',
        notificationFrequency: 'notification_frequency'
      };

      for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
        if (data[camelKey] !== undefined) {
          let value = data[camelKey];

          // Handle JSON fields
          if (['skills', 'taskTypes'].includes(camelKey)) {
            value = JSON.stringify(value);
          }
          if (camelKey === 'availabilitySchedule') {
            value = value ? JSON.stringify(value) : null;
          }

          // Handle boolean
          if (camelKey === 'isAvailable') {
            value = value ? 1 : 0;
          }

          updates.push(`${snakeKey} = ?`);
          params.push(value);
        }
      }

      if (updates.length === 0) {
        return this.getTeamMemberById(memberId);
      }

      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(memberId);

      db.prepare(`
        UPDATE agentic_team_members
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params);

      logger.info(`Updated team member ${memberId}`);

      return this.getTeamMemberById(memberId);
    } catch (error) {
      logger.error(`Failed to update team member ${memberId}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Remove a team member (soft delete)
   * @param {string} memberId - Team member ID
   * @param {string} userId - Owner user ID
   * @returns {boolean} Success
   */
  removeTeamMember(memberId, userId) {
    const db = this.getDb();

    try {
      // Verify ownership through agent
      const member = db.prepare(`
        SELECT tm.*, ap.user_id
        FROM agentic_team_members tm
        JOIN agentic_profiles ap ON tm.agentic_id = ap.id
        WHERE tm.id = ?
      `).get(memberId);

      if (!member || member.user_id !== userId) {
        return false;
      }

      const result = db.prepare(`
        UPDATE agentic_team_members
        SET is_active = 0, updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), memberId);

      if (result.changes > 0) {
        logger.info(`Removed team member ${memberId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to remove team member ${memberId}: ${error.message}`, error);
      throw error;
    }
  }

  // =====================================================
  // TRANSFORM HELPERS
  // =====================================================

  /**
   * Transform database row to API response format (snake_case to camelCase)
   * @param {Object} row - Database row
   * @returns {Object} Transformed profile
   */
  transformProfile(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      role: row.role,
      description: row.description,
      avatar: row.avatar,
      agentType: row.agent_type,
      parentAgenticId: row.parent_agentic_id,
      hierarchyLevel: row.hierarchy_level,
      hierarchyPath: row.hierarchy_path,
      createdByType: row.created_by_type,
      createdByAgenticId: row.created_by_agentic_id,
      creationReason: row.creation_reason,
      creationPrompt: row.creation_prompt,
      inheritTeam: !!row.inherit_team,
      inheritKnowledge: !!row.inherit_knowledge,
      inheritMonitoring: !!row.inherit_monitoring,
      inheritRouting: !!row.inherit_routing,
      aiProvider: row.ai_provider,
      aiModel: row.ai_model,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      systemPrompt: row.system_prompt,
      routingPreset: row.routing_preset,
      autonomyLevel: row.autonomy_level,
      requireApprovalFor: this.safeJsonParse(row.require_approval_for, []),
      masterContactId: row.master_contact_id,
      masterContactChannel: row.master_contact_channel,
      notifyMasterOn: this.safeJsonParse(row.notify_master_on, []),
      escalationTimeoutMinutes: row.escalation_timeout_minutes,
      canCreateChildren: !!row.can_create_children,
      maxChildren: row.max_children,
      maxHierarchyDepth: row.max_hierarchy_depth,
      childrenAutonomyCap: row.children_autonomy_cap,
      dailyBudget: row.daily_budget,
      dailyBudgetUsed: row.daily_budget_used,
      rateLimitPerMinute: row.rate_limit_per_minute,
      status: row.status,
      pausedBy: row.paused_by,
      lastActiveAt: row.last_active_at,
      expiresAt: row.expires_at,
      terminatedAt: row.terminated_at,
      terminationReason: row.termination_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Transform team member row to API response format
   * @param {Object} row - Database row
   * @returns {Object} Transformed team member
   */
  transformTeamMember(row) {
    return {
      id: row.id,
      agenticId: row.agentic_id,
      contactId: row.contact_id,
      contactName: row.contact_name,
      contactAvatar: row.contact_avatar,
      role: row.role,
      department: row.department,
      skills: this.safeJsonParse(row.skills, []),
      isAvailable: !!row.is_available,
      availabilitySchedule: this.safeJsonParse(row.availability_schedule, null),
      timezone: row.timezone,
      maxConcurrentTasks: row.max_concurrent_tasks,
      taskTypes: this.safeJsonParse(row.task_types, []),
      priorityLevel: row.priority_level,
      preferredChannel: row.preferred_channel,
      notificationFrequency: row.notification_frequency,
      tasksCompleted: row.tasks_completed,
      avgCompletionTime: row.avg_completion_time,
      rating: row.rating,
      isActive: !!row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Transform contact scope row to API response format
   * @param {Object} row - Database row
   * @returns {Object} Transformed contact scope
   */
  transformContactScope(row) {
    return {
      id: row.id,
      agenticId: row.agentic_id,
      scopeType: row.scope_type,
      whitelistContactIds: this.safeJsonParse(row.whitelist_contact_ids, []),
      whitelistTags: this.safeJsonParse(row.whitelist_tags, []),
      allowTeamMembers: !!row.allow_team_members,
      allowMasterContact: !!row.allow_master_contact,
      notifyOnOutOfScope: !!row.notify_on_out_of_scope,
      autoAddApproved: !!row.auto_add_approved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      inherited: false
    };
  }

  /**
   * Transform background row to API response format
   * @param {Object} row - Database row
   * @returns {Object} Transformed background
   */
  transformBackground(row) {
    return {
      id: row.id,
      agenticId: row.agentic_id,
      userId: row.user_id,
      companyName: row.company_name,
      companyShortName: row.company_short_name,
      companyType: row.company_type,
      registrationNumber: row.registration_number,
      taxId: row.tax_id,
      industry: row.industry,
      description: row.description,
      established: row.established,
      employeeCount: row.employee_count,
      services: this.safeJsonParse(row.services, []),
      products: this.safeJsonParse(row.products, []),
      primaryPhone: row.primary_phone,
      alternatePhone: row.alternate_phone,
      primaryEmail: row.primary_email,
      supportEmail: row.support_email,
      website: row.website,
      address: {
        street: row.address_street,
        city: row.address_city,
        state: row.address_state,
        postalCode: row.address_postal_code,
        country: row.address_country
      },
      timezone: row.timezone,
      businessHours: this.safeJsonParse(row.business_hours, null),
      holidays: this.safeJsonParse(row.holidays, []),
      socialLinks: {
        linkedin: row.linkedin,
        facebook: row.facebook,
        twitter: row.twitter,
        instagram: row.instagram
      },
      customFields: this.safeJsonParse(row.custom_fields, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Safely parse JSON string
   * @param {string} str - JSON string
   * @param {*} defaultValue - Default value if parsing fails
   * @returns {*} Parsed value or default
   */
  safeJsonParse(str, defaultValue) {
    if (!str) return defaultValue;
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }
}

// Export singleton instance
let instance = null;

function getAgenticService() {
  if (!instance) {
    instance = new AgenticService();
  }
  return instance;
}

module.exports = {
  AgenticService,
  getAgenticService
};
