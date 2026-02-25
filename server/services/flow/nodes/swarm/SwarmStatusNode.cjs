/**
 * Swarm Status Node
 *
 * Gets the current status of the swarm including agent availability,
 * active tasks, and system health.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwarmStatusNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:status', 'swarm');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'swarm:status',
      label: 'Swarm Status',
      description: 'Get the current status of the swarm and its agents',
      icon: 'Activity',
      category: 'swarm',
      color: 'pink',
      properties: {
        includeAgents: {
          type: 'boolean',
          label: 'Include Agent Details',
          description: 'Include detailed information about each agent',
          default: true
        },
        includeTasks: {
          type: 'boolean',
          label: 'Include Active Tasks',
          description: 'Include information about active tasks',
          default: true
        },
        includeMetrics: {
          type: 'boolean',
          label: 'Include Metrics',
          description: 'Include performance metrics',
          default: false
        },
        agentStatusFilter: {
          type: 'select',
          label: 'Agent Status Filter',
          options: [
            { value: 'all', label: 'All Agents' },
            { value: 'online', label: 'Online Only' },
            { value: 'idle', label: 'Idle Only' },
            { value: 'busy', label: 'Busy Only' }
          ],
          default: 'all'
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Status In',
          description: 'Store the status object in this variable',
          placeholder: 'swarmStatus'
        }
      },
      outputs: {
        default: { label: 'Status', type: 'default' }
      },
      getDefaultConfig: () => ({
        includeAgents: true,
        includeTasks: true,
        includeMetrics: false,
        agentStatusFilter: 'all',
        storeInVariable: ''
      })
    };
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      includeAgents,
      includeTasks,
      includeMetrics,
      agentStatusFilter,
      storeInVariable
    } = context.node.data;

    try {
      const status = {
        timestamp: new Date().toISOString(),
        userId: context.userId
      };

      // Get agent status
      if (includeAgents) {
        status.agents = await this.getAgentStatus(context, agentStatusFilter);
      }

      // Get summary counts
      status.summary = await this.getSummary(context);

      // Get active tasks
      if (includeTasks) {
        status.tasks = await this.getActiveTasks(context);
      }

      // Get metrics
      if (includeMetrics) {
        status.metrics = await this.getMetrics(context);
      }

      // Determine overall health
      status.health = this.calculateHealth(status);

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = status;
      }

      return this.success(status);

    } catch (error) {
      context.logger.error(`Get swarm status failed: ${error.message}`);
      return this.failure(error.message, error.code || 'STATUS_ERROR', true);
    }
  }

  /**
   * Get agent status
   * @private
   */
  async getAgentStatus(context, filter) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();

    let query = `SELECT id, name, status, skills, reputation_score, updated_at FROM agents WHERE user_id = ?`;
    const params = [context.userId];

    switch (filter) {
      case 'online':
        query += ` AND status != 'offline'`;
        break;
      case 'idle':
        query += ` AND status = 'idle'`;
        break;
      case 'busy':
        query += ` AND status = 'busy'`;
        break;
    }

    query += ` ORDER BY reputation_score DESC`;

    const agents = db.prepare(query).all(...params);

    return agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      skills: this.parseSkills(agent.skills),
      reputationScore: agent.reputation_score,
      lastActive: agent.updated_at
    }));
  }

  /**
   * Get summary counts
   * @private
   */
  async getSummary(context) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();

    // Agent counts by status
    const agentCounts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline
      FROM agents WHERE user_id = ?
    `).get(context.userId);

    // Task counts by status
    const taskCounts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM swarm_tasks WHERE user_id = ?
    `).get(context.userId) || { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0 };

    // Recent handoffs
    const handoffCount = db.prepare(`
      SELECT COUNT(*) as count FROM swarm_handoffs
      WHERE user_id = ? AND created_at > datetime('now', '-24 hours')
    `).get(context.userId)?.count || 0;

    return {
      agents: {
        total: agentCounts?.total || 0,
        idle: agentCounts?.idle || 0,
        busy: agentCounts?.busy || 0,
        offline: agentCounts?.offline || 0,
        available: (agentCounts?.idle || 0) + (agentCounts?.busy || 0)
      },
      tasks: {
        total: taskCounts.total,
        pending: taskCounts.pending,
        inProgress: taskCounts.inProgress,
        completed: taskCounts.completed,
        failed: taskCounts.failed
      },
      handoffs24h: handoffCount
    };
  }

  /**
   * Get active tasks
   * @private
   */
  async getActiveTasks(context) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();

    const tasks = db.prepare(`
      SELECT t.*, a.name as agent_name
      FROM swarm_tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.user_id = ? AND t.status IN ('pending', 'in_progress')
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        t.created_at DESC
      LIMIT 20
    `).all(context.userId);

    return tasks.map(task => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      assignedAgentId: task.assigned_agent_id,
      assignedAgentName: task.agent_name,
      createdAt: task.created_at,
      deadline: task.deadline
    }));
  }

  /**
   * Get performance metrics
   * @private
   */
  async getMetrics(context) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();

    // Task completion rate (last 7 days)
    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM swarm_tasks
      WHERE user_id = ? AND created_at > datetime('now', '-7 days')
    `).get(context.userId) || { total: 0, completed: 0, failed: 0 };

    // Average agent reputation
    const avgReputation = db.prepare(`
      SELECT AVG(reputation_score) as avg FROM agents WHERE user_id = ?
    `).get(context.userId)?.avg || 0;

    // Handoff success rate (last 7 days)
    const handoffStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
      FROM swarm_handoffs
      WHERE user_id = ? AND created_at > datetime('now', '-7 days')
    `).get(context.userId) || { total: 0, successful: 0 };

    return {
      taskCompletionRate: taskStats.total > 0
        ? ((taskStats.completed / taskStats.total) * 100).toFixed(1) + '%'
        : 'N/A',
      taskFailureRate: taskStats.total > 0
        ? ((taskStats.failed / taskStats.total) * 100).toFixed(1) + '%'
        : 'N/A',
      averageAgentReputation: avgReputation.toFixed(1),
      handoffSuccessRate: handoffStats.total > 0
        ? ((handoffStats.successful / handoffStats.total) * 100).toFixed(1) + '%'
        : 'N/A',
      tasksLast7Days: taskStats.total,
      handoffsLast7Days: handoffStats.total
    };
  }

  /**
   * Calculate overall health status
   * @private
   */
  calculateHealth(status) {
    let score = 100;
    const issues = [];

    // Check agent availability
    if (status.summary?.agents) {
      const { total, available } = status.summary.agents;
      if (total === 0) {
        score -= 50;
        issues.push('No agents configured');
      } else if (available === 0) {
        score -= 30;
        issues.push('No agents available');
      } else if (available / total < 0.3) {
        score -= 15;
        issues.push('Low agent availability');
      }
    }

    // Check task backlog
    if (status.summary?.tasks) {
      const { pending, inProgress } = status.summary.tasks;
      const backlog = pending + inProgress;
      if (backlog > 20) {
        score -= 20;
        issues.push('High task backlog');
      } else if (backlog > 10) {
        score -= 10;
        issues.push('Growing task backlog');
      }
    }

    // Determine health status
    let healthStatus;
    if (score >= 80) {
      healthStatus = 'healthy';
    } else if (score >= 50) {
      healthStatus = 'degraded';
    } else {
      healthStatus = 'unhealthy';
    }

    return {
      status: healthStatus,
      score,
      issues
    };
  }

  /**
   * Parse skills from agent
   * @private
   */
  parseSkills(skills) {
    if (!skills) return [];
    if (Array.isArray(skills)) return skills;
    if (typeof skills === 'string') {
      try {
        return JSON.parse(skills);
      } catch {
        return skills.split(',').map(s => s.trim());
      }
    }
    return [];
  }
}

module.exports = { SwarmStatusNode };
