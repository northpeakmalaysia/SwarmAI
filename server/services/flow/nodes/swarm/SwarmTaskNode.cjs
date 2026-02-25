/**
 * Swarm Task Node
 *
 * Creates and manages collaborative swarm tasks.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwarmTaskNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:task', 'swarm');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'swarm:task',
      label: 'Create Swarm Task',
      description: 'Create a collaborative task for the swarm to work on',
      icon: 'ClipboardList',
      category: 'swarm',
      color: 'pink',
      properties: {
        title: {
          type: 'text',
          label: 'Task Title',
          description: 'Title of the task',
          required: true,
          showVariablePicker: true
        },
        description: {
          type: 'textarea',
          label: 'Task Description',
          description: 'Detailed description of the task',
          required: true,
          showVariablePicker: true
        },
        priority: {
          type: 'select',
          label: 'Priority',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' }
          ],
          default: 'normal'
        },
        taskType: {
          type: 'select',
          label: 'Task Type',
          description: 'How the task should be executed',
          options: [
            { value: 'single', label: 'Single Agent' },
            { value: 'collaborative', label: 'Collaborative (Multiple Agents)' },
            { value: 'sequential', label: 'Sequential (Agent Chain)' }
          ],
          default: 'single'
        },
        autoAssign: {
          type: 'boolean',
          label: 'Auto-Assign',
          description: 'Automatically assign to best available agent',
          default: true
        },
        agentId: {
          type: 'agent',
          label: 'Assign To',
          description: 'Specific agent to assign the task to',
          conditionalDisplay: { field: 'autoAssign', value: false }
        },
        requiredSkills: {
          type: 'array',
          label: 'Required Skills',
          description: 'Skills required for auto-assignment',
          conditionalDisplay: { field: 'autoAssign', value: true }
        },
        deadline: {
          type: 'datetime',
          label: 'Deadline',
          description: 'Task completion deadline'
        },
        waitForCompletion: {
          type: 'boolean',
          label: 'Wait for Completion',
          description: 'Wait for the task to complete before continuing',
          default: false
        },
        completionTimeout: {
          type: 'number',
          label: 'Completion Timeout (seconds)',
          description: 'Maximum time to wait for task completion',
          default: 300,
          min: 10,
          max: 3600,
          conditionalDisplay: { field: 'waitForCompletion', value: true }
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Task ID In',
          description: 'Store the task ID in this flow variable',
          placeholder: 'taskId'
        }
      },
      outputs: {
        created: { label: 'Task Created', type: 'default' },
        completed: { label: 'Completed', type: 'conditional' },
        failed: { label: 'Failed', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        title: '',
        description: '',
        priority: 'normal',
        taskType: 'single',
        autoAssign: true,
        agentId: '',
        requiredSkills: [],
        deadline: '',
        waitForCompletion: false,
        completionTimeout: 300,
        storeInVariable: ''
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.title) {
      errors.push('Task title is required');
    }

    if (!data.description) {
      errors.push('Task description is required');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      title,
      description,
      priority,
      taskType,
      autoAssign,
      agentId,
      requiredSkills,
      deadline,
      waitForCompletion,
      completionTimeout,
      storeInVariable
    } = context.node.data;

    const resolvedTitle = this.resolveTemplate(title, context);
    const resolvedDescription = this.resolveTemplate(description, context);

    if (!resolvedTitle || !resolvedDescription) {
      return this.failure('Title and description are required', 'MISSING_FIELDS');
    }

    try {
      // Create the task
      const task = await this.createTask(context, {
        title: resolvedTitle,
        description: resolvedDescription,
        priority,
        taskType,
        autoAssign,
        agentId: autoAssign ? null : agentId,
        requiredSkills: autoAssign ? requiredSkills : null,
        deadline
      });

      // Store task ID if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = task.id;
      }

      // Wait for completion if requested
      if (waitForCompletion) {
        const result = await this.waitForTaskCompletion(context, task.id, completionTimeout);

        if (result.status === 'completed') {
          return this.success({
            taskId: task.id,
            title: resolvedTitle,
            status: 'completed',
            assignedAgentId: task.assignedAgentId,
            result: result.result,
            completedAt: result.completedAt
          }, ['completed']);
        } else if (result.status === 'failed') {
          return this.success({
            taskId: task.id,
            title: resolvedTitle,
            status: 'failed',
            error: result.error
          }, ['failed']);
        } else {
          // Timeout
          return this.success({
            taskId: task.id,
            title: resolvedTitle,
            status: 'timeout',
            message: 'Task did not complete within timeout'
          }, ['failed']);
        }
      }

      // Return immediately without waiting
      return this.success({
        taskId: task.id,
        title: resolvedTitle,
        description: resolvedDescription,
        priority,
        taskType,
        status: task.status,
        assignedAgentId: task.assignedAgentId,
        createdAt: task.createdAt
      }, ['created']);

    } catch (error) {
      context.logger.error(`Create task failed: ${error.message}`);
      return this.failure(error.message, error.code || 'TASK_ERROR', true);
    }
  }

  /**
   * Create a swarm task
   * @private
   */
  async createTask(context, options) {
    const { swarm } = context.services;

    if (swarm?.createTask) {
      return swarm.createTask({
        userId: context.userId,
        ...options
      });
    }

    // Fallback to direct database insert
    const db = context.services.database || require('../../../database.cjs').getDatabase();
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();

    let assignedAgentId = null;

    // Auto-assign if requested
    if (options.autoAssign) {
      const agent = await this.findBestAgent(context, options.requiredSkills);
      if (agent) {
        assignedAgentId = agent.id;
      }
    } else if (options.agentId) {
      assignedAgentId = options.agentId;
    }

    db.prepare(`
      INSERT INTO swarm_tasks (
        id, user_id, title, description, priority, task_type,
        assigned_agent_id, deadline, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      context.userId,
      options.title,
      options.description,
      options.priority,
      options.taskType,
      assignedAgentId,
      options.deadline || null,
      assignedAgentId ? 'in_progress' : 'pending'
    );

    return {
      id,
      title: options.title,
      description: options.description,
      priority: options.priority,
      taskType: options.taskType,
      assignedAgentId,
      status: assignedAgentId ? 'in_progress' : 'pending',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Find best agent for task
   * @private
   */
  async findBestAgent(context, requiredSkills) {
    const { swarm } = context.services;

    if (swarm?.findBestAgent) {
      return swarm.findBestAgent(context.userId, {
        requiredSkills: requiredSkills || []
      });
    }

    const db = context.services.database || require('../../../database.cjs').getDatabase();
    return db.prepare(`
      SELECT * FROM agents
      WHERE user_id = ? AND status = 'idle'
      ORDER BY reputation_score DESC
      LIMIT 1
    `).get(context.userId);
  }

  /**
   * Wait for task completion
   * @private
   */
  async waitForTaskCompletion(context, taskId, timeout) {
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    const pollInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      // Check if aborted
      if (context.abortSignal?.aborted) {
        return { status: 'cancelled' };
      }

      const task = await this.getTask(context, taskId);

      if (task.status === 'completed') {
        return {
          status: 'completed',
          result: task.result ? JSON.parse(task.result) : null,
          completedAt: task.updated_at
        };
      }

      if (task.status === 'failed') {
        const result = task.result ? JSON.parse(task.result) : {};
        return {
          status: 'failed',
          error: result.error || 'Task failed'
        };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return { status: 'timeout' };
  }

  /**
   * Get task by ID
   * @private
   */
  async getTask(context, taskId) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();
    return db.prepare(`
      SELECT * FROM swarm_tasks WHERE id = ? AND user_id = ?
    `).get(taskId, context.userId);
  }
}

module.exports = { SwarmTaskNode };
