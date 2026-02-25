/**
 * Task Assignment Service
 * ========================
 * AI-powered task assignment algorithm for assigning tasks to team members.
 *
 * Assignment Algorithm:
 * 1. Filter by required skills
 * 2. Check availability (timezone, schedule)
 * 3. Check current workload (max concurrent tasks)
 * 4. Score candidates based on:
 *    - Skills match (40%)
 *    - Priority level (20%)
 *    - Current workload (25%)
 *    - Task type match (15%)
 * 5. Return best candidate or null if none suitable
 */

const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

class TaskAssignmentService {
  constructor() {
    this.weights = {
      skillsMatch: 0.40,      // How well skills match
      priorityLevel: 0.20,    // Member's priority level (1-5)
      workloadBalance: 0.25,  // Current workload vs max capacity
      taskTypeMatch: 0.15,    // Task type in member's task_types list
    };
  }

  /**
   * Find the best team member for a task
   *
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {Object} taskRequirements - Task requirements
   * @param {string[]} taskRequirements.requiredSkills - Skills needed for the task
   * @param {string} taskRequirements.taskType - Type of task (code_review, bug_fix, etc.)
   * @param {string} taskRequirements.priority - Task priority (urgent, high, normal, low)
   * @param {string[]} taskRequirements.excludeMemberIds - Members to exclude
   * @returns {Object|null} Best candidate or null
   */
  async findBestAssignee(agenticId, userId, taskRequirements) {
    const {
      requiredSkills = [],
      taskType = null,
      priority = 'normal',
      excludeMemberIds = [],
    } = taskRequirements;

    try {
      const db = getDatabase();

      // Get all active team members for this profile
      const members = db.prepare(`
        SELECT tm.*, c.display_name as contact_name
        FROM agentic_team_members tm
        LEFT JOIN contacts c ON tm.contact_id = c.id
        WHERE tm.agentic_id = ? AND tm.user_id = ? AND tm.is_active = 1
      `).all(agenticId, userId);

      if (members.length === 0) {
        logger.debug(`No team members found for agentic ${agenticId}`);
        return null;
      }

      // Filter out excluded members
      const availableMembers = members.filter(m => !excludeMemberIds.includes(m.id));

      if (availableMembers.length === 0) {
        logger.debug(`All team members excluded for agentic ${agenticId}`);
        return null;
      }

      // Get current task counts for workload calculation
      const taskCounts = this.getCurrentTaskCounts(agenticId, userId);

      // Score each member
      const scoredMembers = availableMembers.map(member => {
        const score = this.calculateMemberScore(member, taskRequirements, taskCounts);
        return { member, score };
      });

      // Sort by score descending
      scoredMembers.sort((a, b) => b.score.total - a.score.total);

      // Get top candidates (score >= 0.3)
      const viableCandidates = scoredMembers.filter(s => s.score.total >= 0.3);

      if (viableCandidates.length === 0) {
        logger.debug(`No viable candidates found for task in agentic ${agenticId}`);
        return null;
      }

      const bestCandidate = viableCandidates[0];

      logger.info(`Best assignee for task: ${bestCandidate.member.contact_name} (score: ${bestCandidate.score.total.toFixed(2)})`);

      return {
        memberId: bestCandidate.member.id,
        contactId: bestCandidate.member.contact_id,
        contactName: bestCandidate.member.contact_name,
        role: bestCandidate.member.role,
        score: bestCandidate.score,
        alternatives: viableCandidates.slice(1, 4).map(c => ({
          memberId: c.member.id,
          contactName: c.member.contact_name,
          score: c.score.total,
        })),
      };

    } catch (error) {
      logger.error(`Task assignment error: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate assignment score for a team member
   */
  calculateMemberScore(member, requirements, taskCounts) {
    const { requiredSkills = [], taskType, priority } = requirements;

    // Parse member's JSON fields
    const memberSkills = this.parseJson(member.skills) || [];
    const memberTaskTypes = this.parseJson(member.task_types) || [];
    const maxConcurrent = member.max_concurrent_tasks || 5;
    const priorityLevel = member.priority_level || 3;

    // Current task count for this member
    const currentTasks = taskCounts[member.id] || 0;

    // 1. Skills Match Score (0-1)
    let skillsScore = 0;
    if (requiredSkills.length > 0) {
      const matchedSkills = requiredSkills.filter(s =>
        memberSkills.some(ms => ms.toLowerCase() === s.toLowerCase())
      );
      skillsScore = matchedSkills.length / requiredSkills.length;
    } else {
      skillsScore = 1; // No skills required = everyone matches
    }

    // 2. Priority Level Score (0-1) - higher priority = higher score
    const priorityScore = priorityLevel / 5;

    // 3. Workload Balance Score (0-1) - more capacity = higher score
    let workloadScore = 0;
    if (currentTasks >= maxConcurrent) {
      workloadScore = 0; // At capacity
    } else {
      workloadScore = 1 - (currentTasks / maxConcurrent);
    }

    // 4. Task Type Match Score (0-1)
    let taskTypeScore = 0;
    if (taskType && memberTaskTypes.length > 0) {
      taskTypeScore = memberTaskTypes.some(t =>
        t.toLowerCase() === taskType.toLowerCase()
      ) ? 1 : 0;
    } else {
      taskTypeScore = 0.5; // Neutral if no task type specified
    }

    // Calculate weighted total
    const total =
      (skillsScore * this.weights.skillsMatch) +
      (priorityScore * this.weights.priorityLevel) +
      (workloadScore * this.weights.workloadBalance) +
      (taskTypeScore * this.weights.taskTypeMatch);

    return {
      total: Math.min(1, Math.max(0, total)),
      skills: skillsScore,
      priority: priorityScore,
      workload: workloadScore,
      taskType: taskTypeScore,
      currentTasks,
      maxConcurrent,
    };
  }

  /**
   * Get current task counts for all team members
   */
  getCurrentTaskCounts(agenticId, userId) {
    const db = getDatabase();

    const counts = db.prepare(`
      SELECT assigned_to, COUNT(*) as count
      FROM agentic_tasks
      WHERE agentic_id = ? AND status IN ('pending', 'in_progress', 'blocked')
      GROUP BY assigned_to
    `).all(agenticId);

    return counts.reduce((acc, row) => {
      if (row.assigned_to) {
        acc[row.assigned_to] = row.count;
      }
      return acc;
    }, {});
  }

  /**
   * Check if member is available based on timezone and schedule
   */
  isAvailable(member, checkTime = new Date()) {
    const schedule = this.parseJson(member.availability_schedule);
    if (!schedule) return true; // No schedule = always available

    const timezone = member.timezone || 'UTC';

    try {
      // Get current day and time in member's timezone
      const localTime = new Date(checkTime.toLocaleString('en-US', { timeZone: timezone }));
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][localTime.getDay()];
      const currentHour = localTime.getHours();
      const currentMinute = localTime.getMinutes();
      const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

      const daySchedule = schedule[dayName];
      if (!daySchedule) return false; // Not working this day

      // Check if current time is within working hours
      return currentTimeStr >= daySchedule.start && currentTimeStr <= daySchedule.end;
    } catch (error) {
      logger.warn(`Availability check failed: ${error.message}`);
      return true; // Assume available on error
    }
  }

  /**
   * Suggest task redistribution when a member is overloaded
   */
  async suggestRedistribution(agenticId, userId, overloadedMemberId) {
    const db = getDatabase();

    // Get overloaded member's tasks
    const tasks = db.prepare(`
      SELECT t.*, tm.contact_id, c.display_name as assignee_name
      FROM agentic_tasks t
      LEFT JOIN agentic_team_members tm ON t.assigned_to = tm.id
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE t.agentic_id = ? AND t.assigned_to = ? AND t.status IN ('pending', 'in_progress')
      ORDER BY
        CASE t.priority
          WHEN 'low' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'high' THEN 3
          WHEN 'urgent' THEN 4
        END ASC
    `).all(agenticId, overloadedMemberId);

    if (tasks.length === 0) {
      return { suggestions: [] };
    }

    const suggestions = [];

    // Try to find alternative assignees for each task
    for (const task of tasks) {
      const taskRequirements = {
        requiredSkills: this.parseJson(task.required_skills) || [],
        taskType: task.type,
        priority: task.priority,
        excludeMemberIds: [overloadedMemberId],
      };

      const alternative = await this.findBestAssignee(agenticId, userId, taskRequirements);

      if (alternative && alternative.score.total >= 0.5) {
        suggestions.push({
          taskId: task.id,
          taskTitle: task.title,
          currentAssignee: task.assignee_name,
          suggestedAssignee: alternative.contactName,
          suggestedMemberId: alternative.memberId,
          score: alternative.score.total,
          reason: this.getReassignmentReason(alternative.score),
        });
      }
    }

    return { suggestions };
  }

  /**
   * Generate human-readable reason for reassignment
   */
  getReassignmentReason(score) {
    const reasons = [];

    if (score.skills >= 0.8) reasons.push('strong skills match');
    if (score.workload >= 0.8) reasons.push('low current workload');
    if (score.priority >= 0.8) reasons.push('high priority member');
    if (score.taskType >= 0.8) reasons.push('task type specialist');

    return reasons.length > 0
      ? `Recommended due to ${reasons.join(', ')}`
      : 'Best available alternative';
  }

  /**
   * Auto-assign a task to the best available team member
   */
  async autoAssignTask(agenticId, userId, taskId) {
    const db = getDatabase();

    // Get task details
    const task = db.prepare(`
      SELECT * FROM agentic_tasks WHERE id = ? AND agentic_id = ?
    `).get(taskId, agenticId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.assigned_to) {
      return { success: false, error: 'Task already assigned' };
    }

    // Find best assignee
    const bestAssignee = await this.findBestAssignee(agenticId, userId, {
      requiredSkills: this.parseJson(task.required_skills) || [],
      taskType: task.type,
      priority: task.priority,
    });

    if (!bestAssignee) {
      return { success: false, error: 'No suitable team member available' };
    }

    // Assign the task
    db.prepare(`
      UPDATE agentic_tasks
      SET assigned_to = ?, assigned_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(bestAssignee.memberId, taskId);

    logger.info(`Auto-assigned task ${taskId} to ${bestAssignee.contactName}`);

    return {
      success: true,
      assignee: bestAssignee,
      message: `Task assigned to ${bestAssignee.contactName}`,
    };
  }

  /**
   * Parse JSON safely
   */
  parseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}

// Singleton instance
const taskAssignmentService = new TaskAssignmentService();

module.exports = {
  TaskAssignmentService,
  taskAssignmentService,
};
