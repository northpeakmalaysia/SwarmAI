/**
 * Swarm Consensus Node
 *
 * Initiates a multi-agent voting/consensus process.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwarmConsensusNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:consensus', 'swarm');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'swarm:consensus',
      label: 'Agent Consensus',
      description: 'Initiate a voting/consensus process among multiple agents',
      icon: 'Vote',
      category: 'swarm',
      color: 'pink',
      properties: {
        question: {
          type: 'textarea',
          label: 'Question',
          description: 'The question or decision to vote on',
          required: true,
          showVariablePicker: true
        },
        options: {
          type: 'array',
          label: 'Options',
          description: 'Available options to vote on',
          required: true
        },
        agentIds: {
          type: 'multiselect',
          label: 'Voting Agents',
          description: 'Select agents to participate (leave empty for all)',
          options: []
        },
        minParticipants: {
          type: 'number',
          label: 'Minimum Participants',
          description: 'Minimum number of agents required to vote',
          default: 2,
          min: 1,
          max: 20
        },
        consensusThreshold: {
          type: 'number',
          label: 'Consensus Threshold (%)',
          description: 'Percentage of agreement required for consensus',
          default: 50,
          min: 1,
          max: 100
        },
        votingMethod: {
          type: 'select',
          label: 'Voting Method',
          options: [
            { value: 'simple_majority', label: 'Simple Majority (>50%)' },
            { value: 'supermajority', label: 'Supermajority (>66%)' },
            { value: 'unanimous', label: 'Unanimous (100%)' },
            { value: 'plurality', label: 'Plurality (Most Votes)' },
            { value: 'custom', label: 'Custom Threshold' }
          ],
          default: 'simple_majority'
        },
        allowAbstain: {
          type: 'boolean',
          label: 'Allow Abstain',
          description: 'Allow agents to abstain from voting',
          default: true
        },
        includeReasoning: {
          type: 'boolean',
          label: 'Include Reasoning',
          description: 'Ask agents to provide reasoning for their vote',
          default: true
        },
        timeout: {
          type: 'number',
          label: 'Voting Timeout (seconds)',
          description: 'Maximum time to wait for all votes',
          default: 60,
          min: 10,
          max: 300
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In',
          description: 'Store the consensus result in this variable',
          placeholder: 'consensusResult'
        }
      },
      outputs: {
        consensus: { label: 'Consensus Reached', type: 'default' },
        noConsensus: { label: 'No Consensus', type: 'conditional' },
        timeout: { label: 'Timeout', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        question: '',
        options: [],
        agentIds: [],
        minParticipants: 2,
        consensusThreshold: 50,
        votingMethod: 'simple_majority',
        allowAbstain: true,
        includeReasoning: true,
        timeout: 60,
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

    if (!data.question) {
      errors.push('Question is required');
    }

    if (!data.options || data.options.length < 2) {
      errors.push('At least 2 options are required');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      question,
      options,
      agentIds,
      minParticipants,
      consensusThreshold,
      votingMethod,
      allowAbstain,
      includeReasoning,
      timeout,
      storeInVariable
    } = context.node.data;

    const resolvedQuestion = this.resolveTemplate(question, context);

    if (!resolvedQuestion) {
      return this.failure('Question is required', 'MISSING_QUESTION');
    }

    if (!options || options.length < 2) {
      return this.failure('At least 2 options are required', 'MISSING_OPTIONS');
    }

    try {
      // Get voting agents
      const agents = await this.getVotingAgents(context, agentIds);

      if (agents.length < minParticipants) {
        return this.failure(
          `Insufficient participants: ${agents.length} < ${minParticipants}`,
          'INSUFFICIENT_PARTICIPANTS'
        );
      }

      context.logger.info(`Starting consensus with ${agents.length} agents`);

      // Collect votes from all agents
      const votes = await this.collectVotes(context, agents, {
        question: resolvedQuestion,
        options,
        allowAbstain,
        includeReasoning,
        timeout
      });

      // Calculate results
      const results = this.calculateResults(votes, options, allowAbstain);

      // Determine if consensus reached
      const threshold = this.getThreshold(votingMethod, consensusThreshold);
      const consensusReached = this.checkConsensus(results, threshold, votingMethod);

      // Store result if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = {
          winner: results.winner,
          consensusReached,
          votes: results.voteCounts
        };
      }

      const output = {
        question: resolvedQuestion,
        options,
        totalVotes: results.totalVotes,
        voteCounts: results.voteCounts,
        percentages: results.percentages,
        winner: results.winner,
        winnerPercentage: results.winnerPercentage,
        consensusReached,
        threshold,
        votes: includeReasoning ? votes : undefined,
        agentCount: agents.length,
        participationRate: (results.totalVotes / agents.length * 100).toFixed(1) + '%'
      };

      if (results.timedOut) {
        output.timedOutAgents = results.timedOutAgents;
        return this.success(output, ['timeout']);
      }

      if (consensusReached) {
        return this.success(output, ['consensus']);
      } else {
        return this.success(output, ['noConsensus']);
      }

    } catch (error) {
      context.logger.error(`Consensus failed: ${error.message}`);
      return this.failure(error.message, error.code || 'CONSENSUS_ERROR', true);
    }
  }

  /**
   * Get voting agents
   * @private
   */
  async getVotingAgents(context, selectedIds) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();

    let query = `SELECT * FROM agents WHERE user_id = ? AND status != 'offline'`;
    const params = [context.userId];

    if (selectedIds && selectedIds.length > 0) {
      query += ` AND id IN (${selectedIds.map(() => '?').join(',')})`;
      params.push(...selectedIds);
    }

    return db.prepare(query).all(...params);
  }

  /**
   * Collect votes from all agents
   * @private
   */
  async collectVotes(context, agents, options) {
    const { question, options: voteOptions, allowAbstain, includeReasoning, timeout } = options;
    const { ai } = context.services;

    const prompt = this.buildVotingPrompt(question, voteOptions, allowAbstain, includeReasoning);

    // Create voting promises for all agents
    const votePromises = agents.map(async (agent) => {
      try {
        const response = await Promise.race([
          this.getAgentVote(context, agent, prompt, voteOptions),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout * 1000)
          )
        ]);

        return {
          agentId: agent.id,
          agentName: agent.name,
          ...response
        };
      } catch (error) {
        return {
          agentId: agent.id,
          agentName: agent.name,
          vote: null,
          timedOut: true,
          error: error.message
        };
      }
    });

    return Promise.all(votePromises);
  }

  /**
   * Build voting prompt for agents
   * @private
   */
  buildVotingPrompt(question, options, allowAbstain, includeReasoning) {
    let prompt = `You are participating in a group decision. Please vote on the following:\n\n`;
    prompt += `QUESTION: ${question}\n\n`;
    prompt += `OPTIONS:\n`;
    options.forEach((opt, i) => {
      prompt += `${i + 1}. ${opt}\n`;
    });

    if (allowAbstain) {
      prompt += `${options.length + 1}. ABSTAIN (choose not to vote)\n`;
    }

    prompt += `\nRespond with ONLY the number of your choice`;
    if (includeReasoning) {
      prompt += ` followed by a brief explanation (max 2 sentences)`;
    }
    prompt += `.`;

    return prompt;
  }

  /**
   * Get vote from a single agent
   * @private
   */
  async getAgentVote(context, agent, prompt, voteOptions) {
    const { ai } = context.services;

    if (!ai?.process) {
      throw new Error('AI service not available');
    }

    const response = await ai.process({
      task: prompt,
      messages: agent.system_prompt ? [{ role: 'system', content: agent.system_prompt }] : [],
      userId: context.userId,
      agentId: agent.id
    }, {
      temperature: 0.3, // Lower temperature for more consistent voting
      maxTokens: 150
    });

    // Parse vote from response
    const parsed = this.parseVote(response.content, voteOptions);

    return {
      vote: parsed.vote,
      voteIndex: parsed.index,
      reasoning: parsed.reasoning,
      rawResponse: response.content
    };
  }

  /**
   * Parse vote from agent response
   * @private
   */
  parseVote(response, options) {
    const text = response.trim();

    // Try to extract number from start
    const numberMatch = text.match(/^(\d+)/);
    if (numberMatch) {
      const index = parseInt(numberMatch[1], 10) - 1;
      if (index >= 0 && index < options.length) {
        const reasoning = text.replace(/^\d+\.?\s*/, '').trim();
        return {
          vote: options[index],
          index,
          reasoning
        };
      }
      // Check for abstain
      if (index === options.length) {
        return {
          vote: 'ABSTAIN',
          index: -1,
          reasoning: text.replace(/^\d+\.?\s*/, '').trim()
        };
      }
    }

    // Try to match option text
    for (let i = 0; i < options.length; i++) {
      if (text.toLowerCase().includes(options[i].toLowerCase())) {
        return {
          vote: options[i],
          index: i,
          reasoning: ''
        };
      }
    }

    // Check for abstain keyword
    if (text.toLowerCase().includes('abstain')) {
      return {
        vote: 'ABSTAIN',
        index: -1,
        reasoning: ''
      };
    }

    return {
      vote: null,
      index: -1,
      reasoning: 'Could not parse vote'
    };
  }

  /**
   * Calculate voting results
   * @private
   */
  calculateResults(votes, options, allowAbstain) {
    const voteCounts = {};
    const timedOutAgents = [];

    // Initialize counts
    options.forEach(opt => {
      voteCounts[opt] = 0;
    });
    if (allowAbstain) {
      voteCounts['ABSTAIN'] = 0;
    }

    // Count votes
    let totalVotes = 0;
    for (const vote of votes) {
      if (vote.timedOut) {
        timedOutAgents.push(vote.agentId);
        continue;
      }
      if (vote.vote && voteCounts.hasOwnProperty(vote.vote)) {
        voteCounts[vote.vote]++;
        totalVotes++;
      }
    }

    // Calculate percentages (excluding abstains for consensus calculation)
    const nonAbstainTotal = totalVotes - (voteCounts['ABSTAIN'] || 0);
    const percentages = {};
    for (const [opt, count] of Object.entries(voteCounts)) {
      if (opt !== 'ABSTAIN') {
        percentages[opt] = nonAbstainTotal > 0
          ? (count / nonAbstainTotal * 100).toFixed(1)
          : '0.0';
      }
    }

    // Find winner
    let winner = null;
    let maxVotes = 0;
    for (const [opt, count] of Object.entries(voteCounts)) {
      if (opt !== 'ABSTAIN' && count > maxVotes) {
        maxVotes = count;
        winner = opt;
      }
    }

    return {
      voteCounts,
      percentages,
      totalVotes,
      nonAbstainTotal,
      winner,
      winnerPercentage: nonAbstainTotal > 0
        ? (maxVotes / nonAbstainTotal * 100).toFixed(1)
        : '0.0',
      timedOut: timedOutAgents.length > 0,
      timedOutAgents
    };
  }

  /**
   * Get consensus threshold based on method
   * @private
   */
  getThreshold(votingMethod, customThreshold) {
    switch (votingMethod) {
      case 'simple_majority': return 50;
      case 'supermajority': return 66.67;
      case 'unanimous': return 100;
      case 'plurality': return 0; // Any winner counts
      case 'custom': return customThreshold;
      default: return 50;
    }
  }

  /**
   * Check if consensus is reached
   * @private
   */
  checkConsensus(results, threshold, votingMethod) {
    if (votingMethod === 'plurality') {
      // Just needs a winner (not a tie)
      const counts = Object.entries(results.voteCounts)
        .filter(([k]) => k !== 'ABSTAIN')
        .map(([, v]) => v);
      const max = Math.max(...counts);
      const maxCount = counts.filter(c => c === max).length;
      return maxCount === 1; // No tie
    }

    const winnerPct = parseFloat(results.winnerPercentage);
    return winnerPct >= threshold;
  }
}

module.exports = { SwarmConsensusNode };
