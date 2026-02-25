/**
 * CollaborationProtocol — Phase 6: Agent Collaboration
 * =====================================================
 * Enables structured multi-agent collaboration through:
 * - Consultation: Agent A asks Agent B a question and gets a response
 * - Consensus: Multiple agents vote on a topic, majority wins
 * - Knowledge Sharing: Propagate learnings to relevant agents
 *
 * Usage:
 *   const { getCollaborationProtocol } = require('./CollaborationProtocol.cjs');
 *   const collab = getCollaborationProtocol();
 *   const result = await collab.startConsultation(fromId, toId, userId, { question, context });
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const crypto = require('crypto');

class CollaborationProtocol {
  constructor() {
    this.consultationTimeout = 60000; // 60s timeout for consultation responses
  }

  /**
   * Start a consultation: Agent A asks Agent B a question.
   * Creates a conversation record, triggers Agent B's reasoning, returns the response.
   *
   * @param {string} fromAgentId - Requesting agent
   * @param {string} toAgentId - Target agent to consult
   * @param {string} userId - Owner user
   * @param {{ question: string, context?: string }} options
   * @returns {{ success: boolean, response?: string, conversationId?: string, error?: string }}
   */
  async startConsultation(fromAgentId, toAgentId, userId, options = {}) {
    const { question, context: additionalContext } = options;

    if (!question) {
      return { success: false, error: 'Question is required for consultation' };
    }

    if (fromAgentId === toAgentId) {
      return { success: false, error: 'Cannot consult self' };
    }

    const db = getDatabase();
    const conversationId = crypto.randomUUID();

    try {
      // Verify target agent exists and belongs to same user
      const targetAgent = db.prepare(
        'SELECT id, name, role FROM agentic_profiles WHERE id = ? AND user_id = ?'
      ).get(toAgentId, userId);

      if (!targetAgent) {
        return { success: false, error: `Target agent ${toAgentId} not found` };
      }

      const fromAgent = db.prepare(
        'SELECT name, role FROM agentic_profiles WHERE id = ?'
      ).get(fromAgentId);

      // Create conversation record
      db.prepare(`
        INSERT INTO agentic_conversations (id, type, initiator_id, participant_ids, user_id, topic, status, created_at, updated_at)
        VALUES (?, 'consultation', ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        conversationId, fromAgentId,
        JSON.stringify([fromAgentId, toAgentId]),
        userId, question.substring(0, 200),
        new Date().toISOString(), new Date().toISOString()
      );

      // Save the question as a message
      db.prepare(`
        INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, role, content, message_type, created_at)
        VALUES (?, ?, ?, 'agent', ?, 'question', ?)
      `).run(crypto.randomUUID(), conversationId, fromAgentId, question, new Date().toISOString());

      // Trigger target agent reasoning with consultation context
      const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
      const loop = getAgentReasoningLoop();

      const consultContext = {
        event: 'consultation',
        situation: `Agent "${fromAgent?.name || fromAgentId}" (${fromAgent?.role || 'agent'}) is consulting you with a question:\n\n"${question}"` +
                   (additionalContext ? `\n\nAdditional context: ${additionalContext}` : '') +
                   `\n\nRespond with your expert opinion. Be concise and actionable.`,
        preview: question,
        _maxIterations: 5,
        _maxToolCalls: 3,
        _consultationId: conversationId,
      };

      const result = await loop.run(toAgentId, 'consultation', consultContext);

      const response = result.finalThought || 'No response generated';

      // Save the response as a message
      db.prepare(`
        INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, role, content, message_type, created_at)
        VALUES (?, ?, ?, 'agent', ?, 'response', ?)
      `).run(crypto.randomUUID(), conversationId, toAgentId, response, new Date().toISOString());

      // Complete the conversation
      db.prepare(`
        UPDATE agentic_conversations SET status = 'completed', result = ?, completed_at = ?, updated_at = ? WHERE id = ?
      `).run(response.substring(0, 1000), new Date().toISOString(), new Date().toISOString(), conversationId);

      logger.info(`[Collaboration] Consultation ${conversationId}: ${fromAgent?.name} → ${targetAgent.name}, response: ${response.length} chars`);

      return {
        success: true,
        response,
        conversationId,
        respondingAgent: { id: toAgentId, name: targetAgent.name, role: targetAgent.role },
      };
    } catch (err) {
      logger.error(`[Collaboration] Consultation failed: ${err.message}`);

      // Mark conversation as failed
      try {
        db.prepare(`
          UPDATE agentic_conversations SET status = 'failed', result = ?, updated_at = ? WHERE id = ?
        `).run(err.message, new Date().toISOString(), conversationId);
      } catch (e) { /* ignore */ }

      return { success: false, error: err.message, conversationId };
    }
  }

  /**
   * Request consensus: Multiple agents vote on a topic.
   * Each agent evaluates the options and votes. Majority wins.
   *
   * @param {string} initiatorId - Agent requesting consensus
   * @param {string[]} agentIds - Agents to participate in voting
   * @param {string} userId - Owner user
   * @param {{ topic: string, options: string[], context?: string }} voteOptions
   * @returns {{ success: boolean, winner?: string, votes?: Object, conversationId?: string }}
   */
  async requestConsensus(initiatorId, agentIds, userId, voteOptions = {}) {
    const { topic, options, context: additionalContext } = voteOptions;

    if (!topic || !options || options.length < 2) {
      return { success: false, error: 'Topic and at least 2 options are required' };
    }

    // Filter out initiator and deduplicate
    const voters = [...new Set(agentIds.filter(id => id !== initiatorId))];
    if (voters.length === 0) {
      return { success: false, error: 'Need at least 1 other agent for consensus' };
    }

    const db = getDatabase();
    const conversationId = crypto.randomUUID();

    try {
      // Create conversation
      db.prepare(`
        INSERT INTO agentic_conversations (id, type, initiator_id, participant_ids, user_id, topic, status, metadata, created_at, updated_at)
        VALUES (?, 'consensus', ?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(
        conversationId, initiatorId,
        JSON.stringify([initiatorId, ...voters]),
        userId, topic.substring(0, 200),
        JSON.stringify({ options }),
        new Date().toISOString(), new Date().toISOString()
      );

      // Collect votes in parallel
      const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
      const loop = getAgentReasoningLoop();

      const optionsList = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');

      const votePromises = voters.map(async (agentId) => {
        const voteContext = {
          event: 'consensus_vote',
          situation: `You are participating in a team vote.\n\nTopic: ${topic}\n\nOptions:\n${optionsList}` +
                     (additionalContext ? `\n\nContext: ${additionalContext}` : '') +
                     `\n\nRespond with ONLY the number of your choice (1, 2, etc.) followed by a brief reason.`,
          preview: topic,
          _maxIterations: 3,
          _maxToolCalls: 2,
        };

        try {
          const result = await loop.run(agentId, 'consensus_vote', voteContext);
          const response = result.finalThought || '';

          // Parse the vote (look for a number)
          const voteMatch = response.match(/\b(\d+)\b/);
          const voteIdx = voteMatch ? parseInt(voteMatch[1]) - 1 : -1;
          const votedOption = (voteIdx >= 0 && voteIdx < options.length) ? options[voteIdx] : null;

          // Save vote message
          db.prepare(`
            INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, role, content, message_type, metadata, created_at)
            VALUES (?, ?, ?, 'agent', ?, 'vote', ?, ?)
          `).run(
            crypto.randomUUID(), conversationId, agentId,
            response, JSON.stringify({ vote: votedOption, voteIndex: voteIdx }),
            new Date().toISOString()
          );

          return { agentId, vote: votedOption, reason: response };
        } catch (err) {
          return { agentId, vote: null, reason: `Error: ${err.message}` };
        }
      });

      const voteResults = await Promise.allSettled(votePromises);

      // Tally votes
      const votes = {};
      const validVotes = [];
      for (const settled of voteResults) {
        if (settled.status === 'fulfilled' && settled.value.vote) {
          const v = settled.value;
          validVotes.push(v);
          votes[v.vote] = (votes[v.vote] || 0) + 1;
        }
      }

      // Determine winner (majority)
      let winner = null;
      let maxVotes = 0;
      for (const [option, count] of Object.entries(votes)) {
        if (count > maxVotes) {
          maxVotes = count;
          winner = option;
        }
      }

      // Complete conversation
      const result = { winner, votes, totalVoters: voters.length, validVotes: validVotes.length };
      db.prepare(`
        UPDATE agentic_conversations SET status = 'completed', result = ?, completed_at = ?, updated_at = ? WHERE id = ?
      `).run(JSON.stringify(result), new Date().toISOString(), new Date().toISOString(), conversationId);

      logger.info(`[Collaboration] Consensus ${conversationId}: "${topic}" → winner="${winner}" (${maxVotes}/${voters.length} votes)`);

      return {
        success: true,
        winner,
        votes,
        validVotes: validVotes.length,
        totalVoters: voters.length,
        conversationId,
        details: validVotes,
      };
    } catch (err) {
      logger.error(`[Collaboration] Consensus failed: ${err.message}`);
      return { success: false, error: err.message, conversationId };
    }
  }

  /**
   * Propagate knowledge: Share a learning with relevant agents.
   * Finds agents with matching roles/skills and creates shared_learning memories.
   *
   * @param {string} sourceAgentId - Agent sharing the knowledge
   * @param {string} userId - Owner user
   * @param {{ learning: string, tags?: string[], importance?: number }} options
   * @returns {{ success: boolean, sharedWith?: string[], count?: number }}
   */
  async propagateKnowledge(sourceAgentId, userId, options = {}) {
    const { learning, tags = [], importance = 0.6 } = options;

    if (!learning) {
      return { success: false, error: 'Learning content is required' };
    }

    const db = getDatabase();

    try {
      // Find relevant agents (same user, different from source)
      const agents = db.prepare(`
        SELECT id, name, role FROM agentic_profiles
        WHERE user_id = ? AND id != ? AND is_active = 1
      `).all(userId, sourceAgentId);

      if (agents.length === 0) {
        return { success: true, sharedWith: [], count: 0 };
      }

      // Filter agents by relevance (if tags include skill categories, match agent skills)
      let relevantAgents = agents;
      if (tags.length > 0) {
        const skillCategories = ['communication', 'analysis', 'automation', 'integration', 'management'];
        const relevantCategories = tags.filter(t => skillCategories.includes(t));

        if (relevantCategories.length > 0) {
          relevantAgents = agents.filter(agent => {
            try {
              const agentSkills = db.prepare(`
                SELECT c.category FROM agentic_agent_skills s
                JOIN agentic_skills_catalog c ON s.skill_id = c.id
                WHERE s.agentic_id = ?
              `).all(agent.id);
              return agentSkills.some(s => relevantCategories.includes(s.category));
            } catch (e) { return true; } // Include if can't check skills
          });
        }
      }

      // Share with relevant agents via memory
      const sharedWith = [];

      try {
        const { getAgenticMemoryService } = require('./AgenticMemoryService.cjs');
        const memService = getAgenticMemoryService();

        const sourceAgent = db.prepare('SELECT name FROM agentic_profiles WHERE id = ?').get(sourceAgentId);

        for (const agent of relevantAgents) {
          try {
            await memService.createMemory(agent.id, userId, {
              type: 'shared_learning',
              content: `[Shared by ${sourceAgent?.name || sourceAgentId}] ${learning}`,
              importance_score: importance,
              tags: JSON.stringify([...tags, 'shared_learning', `from:${sourceAgentId}`]),
            });
            sharedWith.push(agent.id);
          } catch (e) {
            logger.debug(`[Collaboration] Failed to share with ${agent.id}: ${e.message}`);
          }
        }
      } catch (e) {
        logger.debug(`[Collaboration] Memory service unavailable: ${e.message}`);
      }

      logger.info(`[Collaboration] Knowledge propagated: "${learning.substring(0, 80)}..." shared with ${sharedWith.length} agents`);

      return {
        success: true,
        sharedWith,
        count: sharedWith.length,
      };
    } catch (err) {
      logger.error(`[Collaboration] Knowledge propagation failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // PHASE 7: Async Consensus
  // ==========================================

  /**
   * Non-blocking consensus — sends vote requests to all agents and collects
   * responses asynchronously. Completes when all votes are in or deadline is reached.
   *
   * @param {string} initiatorId - Agent requesting consensus
   * @param {string[]} agentIds - Agents to vote
   * @param {string} userId - Owner user
   * @param {{ topic: string, options: string[], deadlineMinutes?: number }} options
   * @returns {{ success: boolean, conversationId: string }}
   */
  async requestAsyncConsensus(initiatorId, agentIds, userId, options = {}) {
    const { topic, options: voteOptions = [], deadlineMinutes = 5 } = options;

    if (!topic) return { success: false, error: 'Topic is required' };
    if (!agentIds || agentIds.length === 0) return { success: false, error: 'At least one agent required' };

    const db = getDatabase();
    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString();

    try {
      // Create conversation record
      db.prepare(`
        INSERT INTO agentic_conversations (id, type, initiator_id, participant_ids, user_id, topic, status, metadata, deadline, created_at, updated_at)
        VALUES (?, 'consensus', ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `).run(
        conversationId, initiatorId, JSON.stringify(agentIds), userId,
        topic, JSON.stringify({ voteOptions, async: true, deadlineMinutes }),
        deadline, now, now
      );

      // Record the topic as first message
      db.prepare(`
        INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, message_type, content, metadata, created_at)
        VALUES (?, ?, ?, 'question', ?, ?, ?)
      `).run(crypto.randomUUID(), conversationId, initiatorId, topic, JSON.stringify({ voteOptions }), now);

      // Kick off async vote collection (non-blocking)
      for (const agentId of agentIds) {
        setImmediate(() => this._collectAsyncVote(conversationId, agentId, userId, topic, voteOptions));
      }

      logger.info(`[Collaboration] Async consensus started: ${conversationId}, topic="${topic}", deadline=${deadline}`);
      return { success: true, conversationId, deadline };
    } catch (err) {
      logger.error(`[Collaboration] Async consensus failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Collect a single vote from an agent (runs asynchronously via setImmediate).
   * @private
   */
  async _collectAsyncVote(conversationId, agentId, userId, topic, voteOptions) {
    try {
      const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
      const loop = getAgentReasoningLoop();

      const optionsStr = voteOptions.length > 0
        ? `Choose from: ${voteOptions.join(', ')}`
        : 'Respond with your choice and brief reasoning.';

      const result = await loop.run(agentId, 'event', {
        event: 'consensus_vote_request',
        situation: `You have been asked to vote on: "${topic}"\n${optionsStr}\nRespond with your vote and a brief explanation.`,
      });

      const vote = result.finalThought || 'abstain';
      const db = getDatabase();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, message_type, content, metadata, created_at)
        VALUES (?, ?, ?, 'vote', ?, ?, ?)
      `).run(crypto.randomUUID(), conversationId, agentId, vote, JSON.stringify({ vote }), now);

      logger.debug(`[Collaboration] Async vote collected from ${agentId}: "${vote.substring(0, 100)}"`);

      // Check if all votes are in
      this._checkAsyncConsensusComplete(conversationId);
    } catch (err) {
      logger.warn(`[Collaboration] Async vote failed for ${agentId}: ${err.message}`);
    }
  }

  /**
   * Check if all votes are collected and finalize consensus.
   * @private
   */
  _checkAsyncConsensusComplete(conversationId) {
    try {
      const db = getDatabase();
      const conv = db.prepare('SELECT * FROM agentic_conversations WHERE id = ?').get(conversationId);
      if (!conv || conv.status !== 'active') return;

      const participantIds = JSON.parse(conv.participant_ids || '[]');
      const votes = db.prepare(`
        SELECT sender_id, content FROM agentic_conversation_messages
        WHERE conversation_id = ? AND message_type = 'vote'
      `).all(conversationId);

      // Check if all participants have voted
      if (votes.length < participantIds.length) {
        // Check deadline
        if (conv.deadline && new Date(conv.deadline) > new Date()) {
          return; // Still waiting, deadline not reached
        }
      }

      // Tally votes (simple majority)
      const voteCounts = {};
      for (const v of votes) {
        const text = (v.content || '').toLowerCase().trim();
        voteCounts[text] = (voteCounts[text] || 0) + 1;
      }

      const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
      const winner = sorted[0]?.[0] || 'no consensus';

      // Record result
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, message_type, content, metadata, created_at)
        VALUES (?, ?, ?, 'result', ?, ?, ?)
      `).run(
        crypto.randomUUID(), conversationId, conv.initiator_id,
        `Consensus result: ${winner}`,
        JSON.stringify({ decision: winner, votes: voteCounts, totalVotes: votes.length }),
        now
      );

      db.prepare(`
        UPDATE agentic_conversations SET status = 'completed', result = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify({ decision: winner, votes: voteCounts }), now, now, conversationId);

      logger.info(`[Collaboration] Async consensus complete: ${conversationId}, decision="${winner}"`);
    } catch (err) {
      logger.warn(`[Collaboration] Consensus completion check failed: ${err.message}`);
    }
  }

  /**
   * Check the result of an async consensus.
   *
   * @param {string} conversationId
   * @returns {{ status, decision?, votes?, totalVotes? }}
   */
  checkConsensusResult(conversationId) {
    try {
      const db = getDatabase();
      const conv = db.prepare('SELECT * FROM agentic_conversations WHERE id = ?').get(conversationId);
      if (!conv) return { status: 'not_found' };

      if (conv.status === 'completed' && conv.result) {
        return { status: 'completed', ...JSON.parse(conv.result) };
      }

      const participantIds = JSON.parse(conv.participant_ids || '[]');
      const voteCount = db.prepare(`
        SELECT COUNT(*) as count FROM agentic_conversation_messages
        WHERE conversation_id = ? AND message_type = 'vote'
      `).get(conversationId).count;

      return {
        status: 'pending',
        votesCollected: voteCount,
        totalParticipants: participantIds.length,
        deadline: conv.deadline,
      };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  // ==========================================
  // PHASE 7: Conflict Resolution
  // ==========================================

  /**
   * Resolve a conflict between agents through structured rebuttal.
   * Flow: present positions → one rebuttal round → check for concession → escalate if needed.
   *
   * @param {string} initiatorId - Agent initiating resolution
   * @param {string[]} agentIds - Conflicting agents
   * @param {string} userId - Owner user
   * @param {{ topic: string, positions: { agentId: string, position: string }[], escalateToAgentId?: string }} options
   * @returns {{ success: boolean, resolution?: string, winner?: string, escalated?: boolean }}
   */
  async resolveConflict(initiatorId, agentIds, userId, options = {}) {
    const { topic, positions = [], escalateToAgentId } = options;

    if (!topic) return { success: false, error: 'Topic is required' };
    if (positions.length < 2) return { success: false, error: 'At least 2 positions required' };

    const db = getDatabase();
    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO agentic_conversations (id, type, initiator_id, participant_ids, user_id, topic, status, metadata, created_at, updated_at)
        VALUES (?, 'conflict_resolution', ?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(
        conversationId, initiatorId, JSON.stringify(agentIds), userId,
        topic, JSON.stringify({ positions, escalateToAgentId }),
        now, now
      );

      // Record initial positions
      const positionSummary = positions.map(p => `- ${p.agentId}: ${p.position}`).join('\n');
      db.prepare(`
        INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, message_type, content, metadata, created_at)
        VALUES (?, ?, ?, 'question', ?, ?, ?)
      `).run(crypto.randomUUID(), conversationId, initiatorId,
        `Conflict: ${topic}\nPositions:\n${positionSummary}`,
        JSON.stringify({ positions }), now
      );

      // Rebuttal round: each agent gets to respond to the other positions
      const rebuttals = [];
      const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
      const loop = getAgentReasoningLoop();

      for (const pos of positions) {
        try {
          const othersPositions = positions.filter(p => p.agentId !== pos.agentId)
            .map(p => `- ${p.position}`).join('\n');

          const result = await loop.run(pos.agentId, 'event', {
            event: 'conflict_rebuttal',
            situation: `There is a conflict about: "${topic}"\n\nYour position: ${pos.position}\n\nOther positions:\n${othersPositions}\n\nRespond with either:\n1. Your rebuttal defending your position\n2. "CONCEDE" if you agree with another position (explain which one)`,
          });

          const response = result.finalThought || '';
          rebuttals.push({ agentId: pos.agentId, response });

          db.prepare(`
            INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, message_type, content, metadata, created_at)
            VALUES (?, ?, ?, 'response', ?, ?, ?)
          `).run(crypto.randomUUID(), conversationId, pos.agentId, response, '{}', new Date().toISOString());

        } catch (err) {
          logger.warn(`[Collaboration] Rebuttal from ${pos.agentId} failed: ${err.message}`);
          rebuttals.push({ agentId: pos.agentId, response: `Error: ${err.message}` });
        }
      }

      // Check for concession
      const conceder = rebuttals.find(r => r.response.toUpperCase().includes('CONCEDE'));
      let resolution;
      let winner;
      let escalated = false;

      if (conceder) {
        // Someone conceded — the other side wins
        winner = positions.find(p => p.agentId !== conceder.agentId)?.agentId;
        resolution = `${conceder.agentId} conceded. Winner: ${winner}`;
      } else if (escalateToAgentId) {
        // No concession — escalate to hierarchy agent
        try {
          const escResult = await loop.run(escalateToAgentId, 'event', {
            event: 'conflict_escalation',
            situation: `A conflict needs your decision: "${topic}"\n\nPositions and rebuttals:\n${
              rebuttals.map(r => `- ${r.agentId}: ${r.response.substring(0, 300)}`).join('\n')
            }\n\nMake a final decision.`,
          });
          resolution = escResult.finalThought || 'No resolution reached';
          winner = escalateToAgentId;
          escalated = true;
        } catch (err) {
          resolution = 'Escalation failed — needs human review';
          escalated = true;
        }
      } else {
        // No concession, no escalation target
        resolution = 'needs_human';
        escalated = true;
      }

      // Record result
      const completeNow = new Date().toISOString();
      db.prepare(`
        INSERT INTO agentic_conversation_messages (id, conversation_id, sender_id, message_type, content, metadata, created_at)
        VALUES (?, ?, ?, 'result', ?, ?, ?)
      `).run(
        crypto.randomUUID(), conversationId, initiatorId,
        `Resolution: ${resolution}`,
        JSON.stringify({ winner, escalated, resolution }),
        completeNow
      );

      db.prepare(`
        UPDATE agentic_conversations SET status = 'completed', result = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify({ winner, escalated, resolution }), completeNow, completeNow, conversationId);

      logger.info(`[Collaboration] Conflict resolved: ${conversationId}, resolution="${resolution}"`);

      return { success: true, conversationId, resolution, winner, escalated };
    } catch (err) {
      logger.error(`[Collaboration] Conflict resolution failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get conversation history for an agent.
   *
   * @param {string} agentId
   * @param {string} userId
   * @param {Object} options - { limit, type }
   * @returns {Array}
   */
  getConversations(agentId, userId, options = {}) {
    const db = getDatabase();
    const limit = options.limit || 20;
    const type = options.type;

    let query = `
      SELECT * FROM agentic_conversations
      WHERE user_id = ? AND (initiator_id = ? OR participant_ids LIKE ?)
    `;
    const params = [userId, agentId, `%${agentId}%`];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Get messages for a conversation.
   *
   * @param {string} conversationId
   * @returns {Array}
   */
  getConversationMessages(conversationId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT m.*, p.name as sender_name
      FROM agentic_conversation_messages m
      LEFT JOIN agentic_profiles p ON m.sender_id = p.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(conversationId);
  }
}

// Singleton
let _instance = null;

function getCollaborationProtocol() {
  if (!_instance) {
    _instance = new CollaborationProtocol();
    logger.info('[CollaborationProtocol] Initialized');
  }
  return _instance;
}

module.exports = {
  CollaborationProtocol,
  getCollaborationProtocol,
};
