/**
 * Flow Routes
 * FlowBuilder workflow management and execution
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { createPagination } = require('../utils/responseHelpers.cjs');
const { getSuperBrainRouter } = require('../services/ai/SuperBrainRouter.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * Transform flow from database to API format
 */
function transformFlow(f) {
  if (!f) return null;
  return {
    id: f.id,
    userId: f.user_id,
    agentId: f.agent_id,
    name: f.name,
    description: f.description,
    nodes: f.nodes ? JSON.parse(f.nodes) : [],
    edges: f.edges ? JSON.parse(f.edges) : [],
    variables: f.variables ? JSON.parse(f.variables) : {},
    triggerType: f.trigger_type,
    status: f.status,
    isActive: f.status === 'active',
    createdAt: f.created_at,
    updatedAt: f.updated_at
  };
}

/**
 * Transform flow execution from database to API format
 */
function transformExecution(e) {
  if (!e) return null;
  return {
    id: e.id,
    flowId: e.flow_id,
    userId: e.user_id,
    inputs: e.inputs ? JSON.parse(e.inputs) : {},
    outputs: e.outputs ? JSON.parse(e.outputs) : {},
    status: e.status,
    error: e.error,
    createdAt: e.created_at,
    completedAt: e.completed_at
  };
}

/**
 * GET /api/flows
 * List all flows
 * Query params:
 *   - status: filter by active/inactive
 *   - agentId: filter by assigned agent
 *   - unassigned: if 'true', return only flows without agent assignment
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { status, agentId, unassigned, limit = 50, offset = 0 } = req.query;

    // Count query for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM flows WHERE user_id = ?';
    const countParams = [req.user.id];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (agentId) {
      countQuery += ' AND agent_id = ?';
      countParams.push(agentId);
    }
    if (unassigned === 'true') {
      countQuery += ' AND agent_id IS NULL';
    }
    const totalCount = db.prepare(countQuery).get(...countParams).count;

    let query = 'SELECT * FROM flows WHERE user_id = ?';
    const params = [req.user.id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }
    if (unassigned === 'true') {
      query += ' AND agent_id IS NULL';
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const flows = db.prepare(query).all(...params);
    const transformed = flows.map(transformFlow);

    res.json({
      flows: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list flows: ${error.message}`);
    res.status(500).json({ error: 'Failed to list flows' });
  }
});

/**
 * GET /api/flows/:id
 * Get flow details
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();

    const flow = db.prepare('SELECT * FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    res.json({ flow: transformFlow(flow) });

  } catch (error) {
    logger.error(`Failed to get flow: ${error.message}`);
    res.status(500).json({ error: 'Failed to get flow' });
  }
});

/**
 * POST /api/flows
 * Create a new flow
 */
router.post('/', (req, res) => {
  try {
    const { name, description, nodes, edges, variables, trigger, agentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Flow name is required' });
    }

    const db = getDatabase();
    const flowId = uuidv4();

    // Verify agent belongs to user if provided
    if (agentId) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);
      if (!agent) {
        return res.status(400).json({ error: 'Agent not found or not owned by you' });
      }
    }

    db.prepare(`
      INSERT INTO flows (id, user_id, agent_id, name, description, nodes, edges, variables, trigger_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'inactive')
    `).run(
      flowId,
      req.user.id,
      agentId || null,
      name,
      description || null,
      JSON.stringify(nodes || []),
      JSON.stringify(edges || []),
      JSON.stringify(variables || {}),
      trigger || 'manual'
    );

    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId);

    res.status(201).json({ flow: transformFlow(flow) });

  } catch (error) {
    logger.error(`Failed to create flow: ${error.message}`);
    res.status(500).json({ error: 'Failed to create flow' });
  }
});

/**
 * PUT /api/flows/:id
 * Update a flow
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT id FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const { name, description, nodes, edges, variables, trigger, status, agentId } = req.body;

    // Verify agent belongs to user if provided
    if (agentId !== undefined && agentId !== null) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);
      if (!agent) {
        return res.status(400).json({ error: 'Agent not found or not owned by you' });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (nodes !== undefined) { updates.push('nodes = ?'); params.push(JSON.stringify(nodes)); }
    if (edges !== undefined) { updates.push('edges = ?'); params.push(JSON.stringify(edges)); }
    if (variables !== undefined) { updates.push('variables = ?'); params.push(JSON.stringify(variables)); }
    if (trigger !== undefined) { updates.push('trigger_type = ?'); params.push(trigger); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (agentId !== undefined) { updates.push('agent_id = ?'); params.push(agentId); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE flows SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id);

    res.json({ flow: transformFlow(flow) });

  } catch (error) {
    logger.error(`Failed to update flow: ${error.message}`);
    res.status(500).json({ error: 'Failed to update flow' });
  }
});

/**
 * DELETE /api/flows/:id
 * Delete a flow and all related records
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const flowId = req.params.id;
    const userId = req.user.id;

    // Check if flow exists and belongs to user
    const flow = db.prepare('SELECT id FROM flows WHERE id = ? AND user_id = ?').get(flowId, userId);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    // Delete related records first (flow_executions doesn't have ON DELETE CASCADE)
    db.prepare('DELETE FROM flow_executions WHERE flow_id = ?').run(flowId);

    // Now delete the flow
    const result = db.prepare('DELETE FROM flows WHERE id = ? AND user_id = ?')
      .run(flowId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    logger.info(`Flow ${flowId} deleted with all related records`);
    res.json({ message: 'Flow deleted' });

  } catch (error) {
    logger.error(`Failed to delete flow: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete flow' });
  }
});

/**
 * POST /api/flows/:id/toggle
 * Toggle flow active status
 */
router.post('/:id/toggle', (req, res) => {
  try {
    const db = getDatabase();

    const flow = db.prepare('SELECT * FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const newStatus = flow.status === 'active' ? 'inactive' : 'active';

    db.prepare(`UPDATE flows SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(newStatus, flow.id);

    const updatedFlow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flow.id);

    logger.info(`Flow ${flow.id} status toggled to ${newStatus}`);

    res.json({
      flow: transformFlow(updatedFlow)
    });

  } catch (error) {
    logger.error(`Failed to toggle flow status: ${error.message}`);
    res.status(500).json({ error: 'Failed to toggle flow status' });
  }
});

/**
 * POST /api/flows/:id/execute
 * Execute a flow
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const db = getDatabase();

    const flow = db.prepare('SELECT * FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const { inputs } = req.body;
    const executionId = uuidv4();

    // Create execution record
    db.prepare(`
      INSERT INTO flow_executions (id, flow_id, user_id, inputs, status)
      VALUES (?, ?, ?, ?, 'running')
    `).run(executionId, flow.id, req.user.id, JSON.stringify(inputs || {}));

    // Parse flow data
    const parsedFlow = {
      ...flow,
      nodes: flow.nodes ? JSON.parse(flow.nodes) : [],
      edges: flow.edges ? JSON.parse(flow.edges) : [],
      variables: flow.variables ? JSON.parse(flow.variables) : {},
    };

    // Execute flow asynchronously
    (async () => {
      try {
        const { getFlowExecutionEngine } = require('../services/flow/FlowExecutionEngine.cjs');
        const { registerAllNodes } = require('../services/flow/nodes/index.cjs');
        const { getAIService } = require('../services/ai/AIService.cjs');
        const { getRetrievalService } = require('../services/rag/index.cjs');

        // Get or create flow engine
        const services = {
          ai: getAIService(),
          rag: getRetrievalService(),
        };
        const engine = getFlowExecutionEngine(services);

        // Register all node executors
        registerAllNodes(engine);

        // Execute the flow
        const result = await engine.execute(parsedFlow, {
          executionId,
          userId: req.user.id,
          input: inputs || {},
        });

        // Update execution record
        db.prepare(`
          UPDATE flow_executions
          SET status = ?, outputs = ?, error = ?, completed_at = datetime('now')
          WHERE id = ?
        `).run(
          result.status,
          JSON.stringify(result.outputs || {}),
          result.error || null,
          executionId
        );

        if (global.wsBroadcast) {
          global.wsBroadcast('flow:execution_complete', {
            executionId,
            flowId: flow.id,
            status: result.status,
          });
        }
      } catch (error) {
        logger.error(`Flow execution failed: ${error.message}`);

        db.prepare(`
          UPDATE flow_executions
          SET status = 'failed', error = ?, completed_at = datetime('now')
          WHERE id = ?
        `).run(error.message, executionId);

        if (global.wsBroadcast) {
          global.wsBroadcast('flow:execution_complete', {
            executionId,
            flowId: flow.id,
            status: 'failed',
            error: error.message,
          });
        }
      }
    })();

    res.json({
      executionId,
      status: 'running'
    });

  } catch (error) {
    logger.error(`Failed to execute flow: ${error.message}`);
    res.status(500).json({ error: 'Failed to execute flow' });
  }
});

/**
 * GET /api/flows/nodes/available
 * Get all available node types including custom tools
 */
router.get('/nodes/available', (req, res) => {
  try {
    const { getRegisteredNodeTypes, getCustomToolsMetadata } = require('../services/flow/nodes/index.cjs');

    // Get built-in node types
    const builtInNodes = getRegisteredNodeTypes();

    // Get custom tool nodes for this user
    const customTools = getCustomToolsMetadata(req.user.id);

    // Combine all available nodes
    const allNodes = [
      ...builtInNodes,
      ...customTools.map(tool => ({
        type: tool.type,
        category: 'agentic',
        subcategory: 'custom-tools',
        name: tool.name,
        description: tool.description,
        icon: tool.icon || 'tool',
        color: tool.color || '#8B5CF6',
        inputs: tool.inputs,
        outputs: tool.outputs,
        isCustomTool: true,
      }))
    ];

    res.json({
      nodes: allNodes,
      categories: {
        triggers: { name: 'Triggers', icon: 'zap', color: '#F59E0B' },
        ai: { name: 'AI', icon: 'brain', color: '#8B5CF6' },
        logic: { name: 'Logic', icon: 'git-branch', color: '#3B82F6' },
        messaging: { name: 'Messaging', icon: 'message-circle', color: '#10B981' },
        web: { name: 'Web', icon: 'globe', color: '#6366F1' },
        agentic: { name: 'Agentic AI', icon: 'bot', color: '#EC4899' },
      },
      customToolsCount: customTools.length,
    });

  } catch (error) {
    logger.error(`Failed to get available nodes: ${error.message}`);
    res.status(500).json({ error: 'Failed to get available nodes' });
  }
});

/**
 * GET /api/flows/nodes/custom-tools
 * Get custom tools specifically for FlowBuilder
 */
router.get('/nodes/custom-tools', (req, res) => {
  try {
    const { getCustomToolsMetadata } = require('../services/flow/nodes/index.cjs');

    const customTools = getCustomToolsMetadata(req.user.id);

    res.json({
      tools: customTools,
      count: customTools.length,
    });

  } catch (error) {
    logger.error(`Failed to get custom tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to get custom tools' });
  }
});

/**
 * GET /api/flows/:id/executions
 * Get flow execution history
 */
router.get('/:id/executions', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20, offset = 0 } = req.query;

    // Count query for pagination
    const totalCount = db.prepare(`
      SELECT COUNT(*) as count FROM flow_executions
      WHERE flow_id = ? AND user_id = ?
    `).get(req.params.id, req.user.id).count;

    const executions = db.prepare(`
      SELECT * FROM flow_executions
      WHERE flow_id = ? AND user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.id, req.user.id, parseInt(limit), parseInt(offset));

    const transformed = executions.map(transformExecution);

    res.json({
      executions: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to get executions: ${error.message}`);
    res.status(500).json({ error: 'Failed to get executions' });
  }
});

/**
 * POST /api/flows/:id/assign
 * Assign a flow to an agent
 */
router.post('/:id/assign', (req, res) => {
  try {
    const db = getDatabase();
    const { agentId } = req.body;

    // Verify flow exists and belongs to user
    const flow = db.prepare('SELECT id FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    // Verify agent exists and belongs to user
    if (agentId) {
      const agent = db.prepare('SELECT id, name FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);
      if (!agent) {
        return res.status(400).json({ error: 'Agent not found or not owned by you' });
      }
    }

    // Update flow assignment
    db.prepare(`UPDATE flows SET agent_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(agentId || null, req.params.id);

    const updatedFlow = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id);

    res.json({
      message: agentId ? 'Flow assigned to agent' : 'Flow unassigned from agent',
      flow: transformFlow(updatedFlow)
    });

  } catch (error) {
    logger.error(`Failed to assign flow: ${error.message}`);
    res.status(500).json({ error: 'Failed to assign flow' });
  }
});

/**
 * GET /api/flows/by-agent/:agentId
 * Get all flows assigned to a specific agent
 */
router.get('/by-agent/:agentId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify agent exists and belongs to user
    const agent = db.prepare('SELECT id, name FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.agentId, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const flows = db.prepare(`
      SELECT * FROM flows
      WHERE agent_id = ? AND user_id = ?
      ORDER BY updated_at DESC
    `).all(req.params.agentId, req.user.id);

    res.json({
      agent: { id: agent.id, name: agent.name },
      flows: flows.map(transformFlow),
      count: flows.length
    });

  } catch (error) {
    logger.error(`Failed to get flows by agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to get flows by agent' });
  }
});

/**
 * GET /api/flows/assignments
 * Get a summary of all flow-agent assignments
 */
router.get('/assignments/summary', (req, res) => {
  try {
    const db = getDatabase();

    // Get all flows with their agent info
    const flows = db.prepare(`
      SELECT f.id, f.name, f.status, f.agent_id, a.name as agent_name
      FROM flows f
      LEFT JOIN agents a ON f.agent_id = a.id
      WHERE f.user_id = ?
      ORDER BY a.name, f.name
    `).all(req.user.id);

    // Group by agent
    const byAgent = {};
    const unassigned = [];

    for (const flow of flows) {
      if (flow.agent_id) {
        if (!byAgent[flow.agent_id]) {
          byAgent[flow.agent_id] = {
            agentId: flow.agent_id,
            agentName: flow.agent_name,
            flows: []
          };
        }
        byAgent[flow.agent_id].flows.push({
          id: flow.id,
          name: flow.name,
          status: flow.status
        });
      } else {
        unassigned.push({
          id: flow.id,
          name: flow.name,
          status: flow.status
        });
      }
    }

    res.json({
      byAgent: Object.values(byAgent),
      unassigned,
      totalFlows: flows.length,
      assignedCount: flows.length - unassigned.length,
      unassignedCount: unassigned.length
    });

  } catch (error) {
    logger.error(`Failed to get assignments summary: ${error.message}`);
    res.status(500).json({ error: 'Failed to get assignments summary' });
  }
});

// ===========================================
// Shared Flow Assignments (Many-to-Many)
// ===========================================

/**
 * POST /api/flows/:id/shared-agents
 * Add an agent to use this flow (many-to-many)
 */
router.post('/:id/shared-agents', (req, res) => {
  try {
    const db = getDatabase();
    const { agentId, priority = 0, triggerFilter } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    // Verify flow exists and belongs to user
    const flow = db.prepare('SELECT id FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    // Verify agent exists and belongs to user
    const agent = db.prepare('SELECT id, name FROM agents WHERE id = ? AND user_id = ?')
      .get(agentId, req.user.id);

    if (!agent) {
      return res.status(400).json({ error: 'Agent not found or not owned by you' });
    }

    // Add assignment (upsert)
    const assignmentId = uuidv4();
    db.prepare(`
      INSERT INTO flow_agent_assignments (id, flow_id, agent_id, priority, trigger_filter)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(flow_id, agent_id) DO UPDATE SET
        priority = excluded.priority,
        trigger_filter = excluded.trigger_filter,
        updated_at = datetime('now')
    `).run(assignmentId, req.params.id, agentId, priority, triggerFilter || null);

    res.json({
      message: 'Agent added to flow',
      flowId: req.params.id,
      agentId,
      agentName: agent.name
    });

  } catch (error) {
    logger.error(`Failed to add shared agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to add shared agent' });
  }
});

/**
 * DELETE /api/flows/:id/shared-agents/:agentId
 * Remove an agent from using this flow
 */
router.delete('/:id/shared-agents/:agentId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify flow exists and belongs to user
    const flow = db.prepare('SELECT id FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const result = db.prepare(`
      DELETE FROM flow_agent_assignments
      WHERE flow_id = ? AND agent_id = ?
    `).run(req.params.id, req.params.agentId);

    res.json({
      success: result.changes > 0,
      message: result.changes > 0 ? 'Agent removed from flow' : 'Assignment not found'
    });

  } catch (error) {
    logger.error(`Failed to remove shared agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to remove shared agent' });
  }
});

/**
 * GET /api/flows/:id/shared-agents
 * Get all agents that can use this flow
 */
router.get('/:id/shared-agents', (req, res) => {
  try {
    const db = getDatabase();

    // Verify flow exists and belongs to user
    const flow = db.prepare('SELECT id, agent_id FROM flows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    // Get shared assignments
    const assignments = db.prepare(`
      SELECT fa.id, fa.agent_id, fa.priority, fa.trigger_filter, fa.is_active,
             fa.created_at, a.name as agent_name, a.status as agent_status
      FROM flow_agent_assignments fa
      JOIN agents a ON fa.agent_id = a.id
      WHERE fa.flow_id = ?
      ORDER BY fa.priority DESC, fa.created_at ASC
    `).all(req.params.id);

    // Get primary agent if assigned
    let primaryAgent = null;
    if (flow.agent_id) {
      primaryAgent = db.prepare('SELECT id, name, status FROM agents WHERE id = ?')
        .get(flow.agent_id);
    }

    res.json({
      flowId: req.params.id,
      primaryAgent,
      sharedAgents: assignments.map(a => ({
        assignmentId: a.id,
        agentId: a.agent_id,
        agentName: a.agent_name,
        agentStatus: a.agent_status,
        priority: a.priority,
        triggerFilter: a.trigger_filter,
        isActive: a.is_active === 1,
        assignedAt: a.created_at
      })),
      totalAgents: assignments.length + (primaryAgent ? 1 : 0)
    });

  } catch (error) {
    logger.error(`Failed to get shared agents: ${error.message}`);
    res.status(500).json({ error: 'Failed to get shared agents' });
  }
});

/**
 * GET /api/agents/:agentId/available-flows
 * Get all flows available to an agent (primary + shared)
 */
router.get('/agents/:agentId/available-flows', (req, res) => {
  try {
    const db = getDatabase();

    // Verify agent exists and belongs to user
    const agent = db.prepare('SELECT id, name FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.agentId, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get primary flows (where this agent is the primary owner)
    const primaryFlows = db.prepare(`
      SELECT f.*, 'primary' as assignment_type
      FROM flows f
      WHERE f.agent_id = ? AND f.user_id = ?
    `).all(req.params.agentId, req.user.id);

    // Get shared flows (via flow_agent_assignments)
    const sharedFlows = db.prepare(`
      SELECT f.*, 'shared' as assignment_type, fa.priority, fa.trigger_filter
      FROM flows f
      JOIN flow_agent_assignments fa ON f.id = fa.flow_id
      WHERE fa.agent_id = ? AND fa.is_active = 1 AND f.user_id = ?
    `).all(req.params.agentId, req.user.id);

    const allFlows = [...primaryFlows, ...sharedFlows].map(f => ({
      ...transformFlow(f),
      assignmentType: f.assignment_type,
      priority: f.priority,
      triggerFilter: f.trigger_filter
    }));

    res.json({
      agent: { id: agent.id, name: agent.name },
      flows: allFlows,
      primaryCount: primaryFlows.length,
      sharedCount: sharedFlows.length,
      totalCount: allFlows.length
    });

  } catch (error) {
    logger.error(`Failed to get available flows: ${error.message}`);
    res.status(500).json({ error: 'Failed to get available flows' });
  }
});

/**
 * POST /api/flows/generate
 * Generate a flow using AI from natural language prompt
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt, refinement, previousFlow, model } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const superBrain = getSuperBrainRouter();

    // Build the system prompt for flow generation with detailed node schemas
    const systemPrompt = `You are a flow automation expert. Generate a JSON flow configuration based on the user's description.

=== VARIABLE REFERENCE SYSTEM ===
Variables use {{expression}} syntax:
- {{input.message}} - Incoming message content
- {{input.from}} - Sender phone/ID
- {{input.platform}} - Platform (whatsapp, telegram, email)
- {{input.conversationId}} - Conversation ID
- {{node.NODE_ID.fieldName}} - Output from specific node
- {{previousOutput}} - Auto-extracts 'content' or 'response' from previous node
- {{var.myVariable}} - Flow variable set by Set Variable node
- {{TODAY}}, {{TIME}}, {{DATETIME}} - Current date/time
- {{UUID}}, {{RANDOM}} - Generate unique ID or random number

=== TRIGGER NODES (type: "trigger") ===

1. trigger:manual - Manual Trigger
   Config: { "description": "string" }
   Outputs: triggeredAt, triggerType, userId

2. trigger:schedule - Schedule Trigger
   Config: { "schedule": "cron expression (required)", "timezone": "UTC|America/New_York|..." }
   Example: { "schedule": "0 9 * * *", "timezone": "Asia/Jakarta" }
   Outputs: triggeredAt, triggerType, schedule, nextRun

3. trigger:webhook - Webhook Trigger
   Config: { "path": "/my-endpoint (required)", "method": "POST|GET|PUT", "secret": "optional" }
   Outputs: triggeredAt, method, headers, query, body, webhookPath
   Access: {{node.NODE_ID.body.fieldName}}, {{node.NODE_ID.query.param}}

4. trigger:message_received - Message Received
   Config: { "keywords": "help, support", "conversationId": "optional" }
   Outputs: triggered, timestamp, platform, message.content, message.from, sender
   Shorthand: {{triggerMessage}}, {{triggerPhone}}, {{triggerSenderName}}

=== AI NODES (type: "ai") ===

1. ai:response - AI Response (main AI chat)
   Config: {
     "provider": "task_routing|auto|specific_provider",
     "model": "model_name (required)",
     "systemPrompt": "You are...",
     "userMessage": "{{input.message}}" (supports variables),
     "temperature": 0.7, "maxTokens": 4096,
     "useMemory": true, "saveToMemory": true
   }
   Outputs: content, model, provider, tier, usage
   Access: {{node.NODE_ID.content}}, {{previousOutput}}

2. ai:classify - Classify Intent
   Config: {
     "provider": "...", "model": "...",
     "text": "{{input.message}} (required)",
     "categories": "support\\nsales\\nbilling (one per line, required)",
     "multiLabel": false, "returnConfidence": true
   }
   Outputs: text, intents[], primaryIntent.category, primaryIntent.confidence
   Access: {{node.NODE_ID.primaryIntent.category}}

3. ai:translate - Translate
   Config: {
     "text": "{{input.message}} (required)",
     "sourceLang": "auto|en|es|...",
     "targetLang": "en|es|fr|de|zh|ja|id|ar|ko (required)"
   }
   Outputs: translatedText, originalText, sourceLanguage, targetLanguage
   Access: {{node.NODE_ID.translatedText}}

4. ai:summarize - Summarize
   Config: {
     "text": "{{input.content}} (required)",
     "style": "brief|detailed|bullets|executive",
     "maxLength": 100
   }
   Outputs: summary, length, format, compressionRatio
   Access: {{node.NODE_ID.summary}}

=== LOGIC NODES (type: "logic") ===

1. logic:condition - Conditional Branch
   Config: {
     "field": "{{node.NODE_ID.value}} (variable to check)",
     "operator": "equals|not_equals|contains|greater_than|less_than|is_empty|startsWith|matches",
     "value": "compare value or variable"
   }
   Outputs: result (boolean), branch ("true" or "false")
   Creates 2 outgoing edges: sourceHandle="true" and sourceHandle="false"

2. logic:loop - Loop Over Array
   Config: {
     "items": "{{node.NODE_ID.results}} (array to iterate, required)",
     "itemVariable": "item", "indexVariable": "index",
     "maxIterations": 100
   }
   Inside loop: {{item}}, {{index}}
   Outputs: totalIterations, completed, currentItem

3. logic:switch - Multi-way Branch
   Config: {
     "value": "{{node.NODE_ID.category}} (required)",
     "cases": {"approved": "branch_a", "rejected": "branch_b"},
     "defaultBranch": "default"
   }
   Outputs: matchedCase, branch, value

4. logic:delay - Wait
   Config: { "duration": 5, "unit": "seconds|minutes|hours" }
   Outputs: delayedMs, startedAt, completedAt

5. logic:set_variable - Set Variable
   Config: {
     "variableName": "myVar (required)",
     "value": "{{node.NODE_ID.content}}"
   }
   Access later: {{var.myVar}}

=== ACTION NODES (type: "action") ===

1. action:send_message - Send Message
   Config: {
     "conversationId": "{{input.conversationId}}",
     "content": "{{node.NODE_ID.content}} (required)",
     "senderType": "system|agent"
   }
   Outputs: channel, recipient, messageId, status, sentAt

2. action:http_request - HTTP Request
   Config: {
     "method": "GET|POST|PUT|DELETE|PATCH",
     "url": "https://api.example.com/endpoint (required)",
     "headers": {"Authorization": "Bearer {{var.token}}"},
     "body": {"key": "value"} (for POST/PUT/PATCH),
     "timeout": 30000
   }
   Outputs: statusCode, headers, body, success, duration
   Access: {{node.NODE_ID.body.data}}, {{node.NODE_ID.statusCode}}

3. action:subflow - Execute Subflow
   Config: {
     "flowId": "uuid (required)",
     "input": {"message": "{{input.message}}"},
     "waitForCompletion": true, "timeout": 60000
   }
   Outputs: flowId, executionId, result, status, duration

=== SWARM NODES (type: "swarm") ===

1. swarm:agent_query - Query Agent
   Config: {
     "agentId": "optional (auto-select if empty)",
     "prompt": "{{input.message}}",
     "preferBestMatch": true
   }
   Outputs: agentId, agentName, response, confidence

2. swarm:broadcast - Broadcast to Agents
   Config: {
     "message": "{{input.message}}",
     "agentIds": "comma-separated or empty for all",
     "priority": "low|normal|high|urgent"
   }
   Outputs: broadcastId, agentCount, responses[]

3. swarm:consensus - Agent Voting
   Config: {
     "question": "{{input.message}}",
     "options": "approve, reject",
     "agentIds": "comma-separated",
     "threshold": 66, "timeout": 60000
   }
   Outputs: consensus (boolean), winner, votes, percentage

=== MCP NODES (type: "mcp") ===

1. mcp:tool - Call MCP Tool
   Config: {
     "mcpToolConfig": { "server": "...", "tool": "..." },
     "inputMapping": {"query": "{{input.message}}"},
     "outputVariable": "mcpResult", "timeout": 30000
   }
   Outputs: result, server, tool, success, duration
   Access: {{var.mcpResult}}, {{node.NODE_ID.result}}

=== OUTPUT FORMAT ===

Output ONLY valid JSON with this structure:
{
  "name": "Flow Name",
  "description": "Brief description",
  "nodes": [
    {
      "id": "trigger_1",
      "type": "trigger",
      "position": { "x": 250, "y": 50 },
      "data": {
        "label": "Message Received",
        "subtype": "message_received",
        "config": { "keywords": "help, support" }
      }
    },
    {
      "id": "ai_1",
      "type": "ai",
      "position": { "x": 250, "y": 200 },
      "data": {
        "label": "AI Response",
        "subtype": "ai_response",
        "config": {
          "model": "gpt-4",
          "systemPrompt": "You are a helpful assistant",
          "userMessage": "{{input.message}}"
        }
      }
    }
  ],
  "edges": [
    { "id": "edge_1", "source": "trigger_1", "target": "ai_1" }
  ]
}

IMPORTANT RULES:
1. Position nodes top-to-bottom with ~150px vertical spacing
2. Each node needs: id, type (trigger/ai/logic/action/swarm/mcp), position, data
3. data must have: label, subtype, config (with required fields filled)
4. For condition nodes, create edges with sourceHandle="true" and sourceHandle="false"
5. Use meaningful variable references like {{node.ai_1.content}} instead of hardcoded values
6. Always start with a trigger node`;

    let userPrompt = prompt;
    if (previousFlow && refinement) {
      userPrompt = `Previous flow:\n${JSON.stringify(previousFlow, null, 2)}\n\nRefinement request: ${refinement}\n\nModify the flow according to the refinement.`;
    }

    const result = await superBrain.process({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: model || undefined,
      userId: req.user.id,
      temperature: 0.7,
      maxTokens: 4000
    });

    // Extract JSON from the response
    let flowJson;
    const content = result.content || '';

    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        flowJson = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON:', parseError);
        return res.status(400).json({
          error: 'AI response was not valid JSON. Please try again with a simpler prompt.',
          rawResponse: content
        });
      }
    } else {
      return res.status(400).json({
        error: 'AI did not generate a valid flow structure. Please try again.',
        rawResponse: content
      });
    }

    // Validate the flow structure
    const warnings = [];
    if (!flowJson.name) {
      flowJson.name = 'AI Generated Flow';
      warnings.push('Flow name was not provided');
    }
    if (!flowJson.nodes || !Array.isArray(flowJson.nodes)) {
      return res.status(400).json({ error: 'Generated flow has no nodes' });
    }
    if (flowJson.nodes.length === 0) {
      return res.status(400).json({ error: 'Generated flow has no nodes' });
    }

    // Ensure all nodes have required fields
    flowJson.nodes = flowJson.nodes.map((node, idx) => ({
      id: node.id || `node_${idx + 1}`,
      type: node.type || 'action',
      position: node.position || { x: 250, y: 50 + idx * 150 },
      data: {
        label: node.data?.label || `Node ${idx + 1}`,
        subtype: node.data?.subtype || 'transform',
        config: node.data?.config || {},
        ...node.data
      }
    }));

    // Ensure edges array exists
    if (!flowJson.edges) {
      flowJson.edges = [];
    }

    logger.info(`Generated flow with ${flowJson.nodes.length} nodes for user ${req.user.id}`);

    res.json({
      flow: flowJson,
      warnings,
      tokensUsed: result.usage?.totalTokens || 0
    });

  } catch (error) {
    logger.error(`Failed to generate flow: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate flow: ' + error.message });
  }
});

/**
 * POST /api/flows/generate/chat
 * AI-to-AI flow generation with SuperBrain knowledge integration
 *
 * ARCHITECTURE:
 * User → AI_01 (Flow Generator selected by user) ←→ SuperBrain (Knowledge Service) ← RAG
 *
 * AI_01 uses [SUPERBRAIN:QUERY] markers to ask SuperBrain for node information.
 * SuperBrain queries RAG and injects knowledge back into AI_01's context.
 * This loop continues until AI_01 outputs [FLOW_COMPLETE] with the final JSON.
 *
 * Works with: API providers (OpenRouter, Ollama) and CLI providers (Claude, Gemini)
 */
router.post('/generate/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [], provider, model } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const superBrain = getSuperBrainRouter();
    const db = getDatabase();

    // Get Flow Generator AI name from swarm config (default: Athena)
    let flowGeneratorAiName = 'Athena';
    try {
      const swarmConfig = db.prepare(
        'SELECT value FROM system_settings WHERE key = ?'
      ).get('swarm_config');
      if (swarmConfig) {
        const config = JSON.parse(swarmConfig.value);
        flowGeneratorAiName = config.flowGeneratorAiName || 'Athena';
      }
    } catch (e) {
      // Use default
    }

    // System Prompt for AI Flow Generator with configurable name
    const ai01SystemPrompt = `You are ${flowGeneratorAiName}, an AI Flow Generator. You create automation flows for SwarmAI's FlowBuilder.

=== CRITICAL: ALWAYS QUERY SUPERBRAIN FIRST ===
BEFORE generating any flow, you MUST query SuperBrain to get the correct node schemas:
[SUPERBRAIN:QUERY]
Give me the JSON format for: trigger:message_received, ai:response, action:send_message nodes
[/SUPERBRAIN:QUERY]

SuperBrain has the EXACT JSON format with correct subtypes and config fields. NEVER guess the format.

=== COMMUNICATION PROTOCOL ===
[INTENT:QUESTION] - ONLY when you absolutely need USER input that AI cannot decide:
  - User hasn't specified the trigger type and multiple options exist
  - User's request is genuinely ambiguous about core functionality

[SUPERBRAIN:QUERY]...[/SUPERBRAIN:QUERY] - When you need node config details (ALWAYS USE THIS)
[FLOW_COMPLETE] - When you have created the final flow

=== MAKE REASONABLE ASSUMPTIONS ===
For simple requests, DO NOT ask questions. Make smart defaults:
- If detecting a message → use trigger:message_received
- If responding with AI → use ai:response node
- If sending a reply → use action:send_message with {{input.conversationId}}
- Platform not specified → flow works on ALL platforms (WhatsApp, Telegram, Email)
- No delay specified → reply immediately

=== WORKFLOW ===
1. User describes what they want
2. IMMEDIATELY query SuperBrain for node schemas you'll need
3. Generate the flow using EXACT format from SuperBrain
4. Output with [FLOW_COMPLETE]

Only use [INTENT:QUESTION] if the user's request is genuinely unclear about WHAT they want, not HOW to implement it.

=== AVAILABLE NODE CATEGORIES (query SuperBrain for exact format) ===
- trigger: manual, schedule, webhook, message_received
- ai: ai_response, ai_with_rag (RAG/knowledge base), ai_classify, ai_translate, ai_summarize, ai_rephrase, superbrain
- logic: condition, loop, switch, delay, set_variable, error_handler, parallel, merge, retry
- action: send_message, http_request, subflow
- messaging: send_whatsapp, send_telegram, send_media, wait_for_reply
- data: data_query, data_insert, data_update
- swarm: agent_query, swarm_broadcast, swarm_consensus, agent_handoff, swarm_task, find_agent, swarm_status
- mcp: custom_tool

IMPORTANT: For knowledge base/RAG queries, use subtype "ai_with_rag" NOT "rag_query"

=== NODE JSON FORMAT (get exact details from SuperBrain) ===
Each node has: type (category), data.subtype, data.config, data.label
Example: { "type": "ai", "data": { "subtype": "ai_response", "label": "AI Reply", "config": {...} } }

=== FINAL OUTPUT FORMAT ===
When ready, output:
[FLOW_COMPLETE]
\`\`\`json
{
  "name": "Flow Name",
  "description": "Brief description",
  "nodes": [
    {
      "id": "trigger_1",
      "type": "trigger",
      "position": { "x": 250, "y": 50 },
      "data": { "label": "Message Trigger", "subtype": "message_received", "config": { "keywords": "" } }
    },
    {
      "id": "ai_1",
      "type": "ai",
      "position": { "x": 250, "y": 200 },
      "data": { "label": "AI Response", "subtype": "ai_response", "config": { "userMessage": "{{input.message}}", "systemPrompt": "You are a helpful assistant." } }
    },
    {
      "id": "action_1",
      "type": "action",
      "position": { "x": 250, "y": 350 },
      "data": { "label": "Send Reply", "subtype": "send_message", "config": { "conversationId": "{{input.conversationId}}", "content": "{{node.ai_1.content}}" } }
    }
  ],
  "edges": [
    { "id": "edge_1", "source": "trigger_1", "target": "ai_1" },
    { "id": "edge_2", "source": "ai_1", "target": "action_1" }
  ]
}
\`\`\`

=== VARIABLE REFERENCES ===
- {{input.message}} - Incoming message content
- {{input.from}} - Sender ID
- {{input.conversationId}} - REQUIRED for send_message to reply to sender
- {{input.platform}} - Platform (whatsapp, telegram, email)
- {{node.NODE_ID.content}} - Output from specific node (e.g., {{node.ai_1.content}})
- {{previousOutput}} - Auto-extract from previous node
- {{var.varName}} - Flow variable

=== RULES ===
1. Always start flows with a trigger node
2. Position nodes: x=250, y starts at 50 with ~150px spacing
3. Use meaningful IDs like trigger_1, ai_1, action_1
4. ALWAYS query SuperBrain for node config fields before generating
5. For replies, ALWAYS include conversationId: "{{input.conversationId}}"`;

    // Build conversation messages
    const messages = [
      { role: 'system', content: ai01SystemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // Track AI-to-AI communication
    const aiCommunicationLog = [];
    let currentMessages = [...messages];
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops

    // AI-to-AI loop
    while (iterations < maxIterations) {
      iterations++;

      // Call AI_01
      // If model is 'default', don't pass it - let the CLI/provider auto-select
      const effectiveModel = (model === 'default' || !model) ? undefined : model;

      const ai01Result = await superBrain.process({
        messages: currentMessages,
        provider: provider || undefined,
        model: effectiveModel,
        userId: req.user.id,
        temperature: 0.7,
        maxTokens: 4000
      });

      const ai01Response = ai01Result.content || '';

      aiCommunicationLog.push({
        from: flowGeneratorAiName,
        to: 'User/SuperBrain',
        content: ai01Response,
        provider: ai01Result.provider,
        model: ai01Result.model,
        timestamp: new Date().toISOString()
      });

      // Check for SuperBrain query
      const superbrainMatch = ai01Response.match(/\[SUPERBRAIN:QUERY\]([\s\S]*?)\[\/SUPERBRAIN:QUERY\]/i);

      if (superbrainMatch) {
        const query = superbrainMatch[1].trim();
        logger.info(`[${flowGeneratorAiName} → SuperBrain] Query: "${query.substring(0, 100)}..."`);

        // Query SuperBrain knowledge service
        const { getFlowSchemaRAG } = require('../services/flow/FlowSchemaRAG.cjs');
        const flowSchemaRAG = getFlowSchemaRAG();
        await flowSchemaRAG.initialize();

        const ragResults = await flowSchemaRAG.querySchemas(query, 5);

        let superbrainResponse = '';
        if (ragResults.length > 0) {
          superbrainResponse = '=== SUPERBRAIN KNOWLEDGE RESPONSE ===\n\n';
          for (const result of ragResults) {
            superbrainResponse += result.content + '\n\n---\n\n';
          }
          superbrainResponse += '=== END SUPERBRAIN RESPONSE ===';
        } else {
          superbrainResponse = '[SuperBrain] No specific schema found. Please check the node type name or ask about a different node.';
        }

        aiCommunicationLog.push({
          from: 'SuperBrain',
          to: flowGeneratorAiName,
          query,
          content: superbrainResponse.substring(0, 500) + '...',
          resultCount: ragResults.length,
          timestamp: new Date().toISOString()
        });

        // Inject SuperBrain response and continue conversation
        currentMessages.push({ role: 'assistant', content: ai01Response });
        currentMessages.push({
          role: 'user',
          content: `[SuperBrain Response]\n${superbrainResponse}\n\nPlease continue with the flow generation using this information.`
        });

        continue; // Next iteration
      }

      // Check for flow completion
      if (ai01Response.includes('[FLOW_COMPLETE]')) {
        logger.info(`[${flowGeneratorAiName}] Flow generation complete after ${iterations} iterations`);

        // Extract the final flow JSON
        const jsonMatch = ai01Response.match(/```json\s*([\s\S]*?)\s*```/);
        let flow = null;
        let isComplete = false;

        if (jsonMatch) {
          try {
            flow = JSON.parse(jsonMatch[1]);

            // Normalize the flow
            if (flow.nodes && Array.isArray(flow.nodes)) {
              flow.nodes = flow.nodes.map((node, idx) => ({
                id: node.id || `node_${idx + 1}`,
                type: node.type || 'action',
                position: node.position || { x: 250, y: 50 + idx * 150 },
                data: {
                  label: node.data?.label || `Node ${idx + 1}`,
                  subtype: node.data?.subtype || 'transform',
                  config: node.data?.config || {},
                  ...node.data
                }
              }));
            }

            if (!flow.edges) {
              flow.edges = [];
            }

            isComplete = true;
            logger.info(`[${flowGeneratorAiName}] Generated flow: ${flow.name} with ${flow.nodes.length} nodes`);
          } catch (parseError) {
            logger.error(`Failed to parse final flow JSON: ${parseError.message}`);
          }
        }

        // Clean response
        const cleanResponse = ai01Response
          .replace(/\[FLOW_COMPLETE\]/gi, '')
          .replace(/\[SUPERBRAIN:QUERY\][\s\S]*?\[\/SUPERBRAIN:QUERY\]/gi, '')
          .replace(/```json[\s\S]*?```/g, '')
          .trim();

        return res.json({
          response: cleanResponse || "I've generated the flow based on your requirements.",
          intent: 'COMPLETE',
          isComplete,
          conversationStatus: 'completed',
          flow,
          tokensUsed: ai01Result.usage?.totalTokens || 0,
          provider: ai01Result.provider,
          model: ai01Result.model,
          aiCommunicationLog,
          aiName: flowGeneratorAiName,
          iterations
        });
      }

      // Check for user questions (no SuperBrain query, not complete)
      const intentMatch = ai01Response.match(/\[INTENT:(QUESTION|CLARIFY)\]/i);
      const intent = intentMatch ? intentMatch[1].toUpperCase() : 'IN_PROGRESS';

      // Clean response
      const cleanResponse = ai01Response
        .replace(/\[INTENT:(QUESTION|CLARIFY|COMPLETE)\]/gi, '')
        .replace(/\[SUPERBRAIN:QUERY\][\s\S]*?\[\/SUPERBRAIN:QUERY\]/gi, '')
        .trim();

      return res.json({
        response: cleanResponse,
        intent,
        isComplete: false,
        conversationStatus: intent === 'QUESTION' ? 'awaiting_input' : 'in_progress',
        flow: null,
        tokensUsed: ai01Result.usage?.totalTokens || 0,
        provider: ai01Result.provider,
        model: ai01Result.model,
        aiCommunicationLog,
        aiName: flowGeneratorAiName,
        iterations
      });
    }

    // Max iterations reached
    logger.warn(`[${flowGeneratorAiName}] Max iterations (${maxIterations}) reached without completion`);
    return res.json({
      response: 'The flow generation process is taking longer than expected. Please try simplifying your request or provide more specific details.',
      intent: 'ERROR',
      isComplete: false,
      conversationStatus: 'error',
      flow: null,
      aiCommunicationLog,
      aiName: flowGeneratorAiName,
      iterations
    });

  } catch (error) {
    logger.error(`Failed to process flow chat: ${error.message}`);
    res.status(500).json({ error: 'Failed to process: ' + error.message });
  }
});

/**
 * GET /api/flows/schema-library
 * Get the FlowBuilder Schema library ID for reference
 */
router.get('/schema-library', async (req, res) => {
  try {
    const { getFlowSchemaRAG } = require('../services/flow/FlowSchemaRAG.cjs');
    const flowSchemaRAG = getFlowSchemaRAG();
    await flowSchemaRAG.initialize();

    res.json({
      libraryId: flowSchemaRAG.getLibraryId(),
      libraryName: 'FlowBuilder Schema',
      description: 'Auto-updated node schemas for AI flow generation'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
