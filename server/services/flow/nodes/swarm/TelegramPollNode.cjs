/**
 * Telegram Poll Node
 *
 * Create a Telegram native poll for group voting/consensus.
 * Integrates with the Telegram Bot API to send interactive polls
 * and collect results.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class TelegramPollNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:telegram_poll', 'swarm');
  }

  static getMetadata() {
    return {
      type: 'swarm:telegram_poll',
      label: 'Telegram Poll',
      description: 'Create a Telegram native poll for group voting/consensus',
      icon: 'BarChart2',
      category: 'swarm',
      color: 'blue',
      properties: {
        question: {
          type: 'textarea',
          label: 'Question',
          description: 'The poll question',
          required: true,
          showVariablePicker: true,
          placeholder: 'What should we build next?'
        },
        options: {
          type: 'array',
          label: 'Options',
          description: 'Poll options (2-10 items)',
          required: true,
          minItems: 2,
          maxItems: 10,
          default: ['Option 1', 'Option 2']
        },
        chatId: {
          type: 'text',
          label: 'Chat ID',
          description: 'Telegram chat/group ID to send poll to',
          required: true,
          showVariablePicker: true,
          placeholder: '-1001234567890'
        },
        accountId: {
          type: 'text',
          label: 'Telegram Bot Account ID',
          description: 'The platform account ID of the Telegram bot',
          required: true,
          showVariablePicker: true
        },
        isAnonymous: {
          type: 'boolean',
          label: 'Anonymous Voting',
          description: 'Whether votes are anonymous',
          default: false
        },
        allowsMultipleAnswers: {
          type: 'boolean',
          label: 'Allow Multiple Answers',
          description: 'Allow users to select multiple options',
          default: false
        },
        duration: {
          type: 'number',
          label: 'Duration (seconds)',
          description: 'Auto-close poll after this duration (5-600 seconds)',
          min: 5,
          max: 600,
          default: 60
        },
        waitForResults: {
          type: 'boolean',
          label: 'Wait for Results',
          description: 'Wait for poll to close before continuing flow',
          default: true
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In Variable',
          description: 'Variable name to store poll results',
          placeholder: 'pollResult'
        }
      },
      outputs: {
        completed: {
          label: 'Poll Completed',
          type: 'default',
          description: 'Poll closed and results collected'
        },
        timeout: {
          label: 'Timeout',
          type: 'conditional',
          description: 'Poll timed out'
        },
        error: {
          label: 'Error',
          type: 'conditional',
          description: 'Failed to send or process poll'
        }
      },
      getDefaultConfig: () => ({
        question: '',
        options: ['Option 1', 'Option 2'],
        chatId: '',
        accountId: '',
        isAnonymous: false,
        allowsMultipleAnswers: false,
        duration: 60,
        waitForResults: true,
        storeInVariable: ''
      })
    };
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.question || !data.question.trim()) {
      errors.push('Question is required');
    }

    if (!data.options || !Array.isArray(data.options)) {
      errors.push('Options must be an array');
    } else {
      if (data.options.length < 2) {
        errors.push('At least 2 options are required');
      }
      if (data.options.length > 10) {
        errors.push('Maximum 10 options allowed');
      }
      // Check for empty options
      const emptyOptions = data.options.filter(opt => !opt || !opt.trim());
      if (emptyOptions.length > 0) {
        errors.push('All options must have content');
      }
    }

    if (!data.chatId) {
      errors.push('Chat ID is required');
    }

    if (!data.accountId) {
      errors.push('Telegram Bot Account ID is required');
    }

    if (data.duration) {
      const duration = parseInt(data.duration);
      if (isNaN(duration) || duration < 5 || duration > 600) {
        errors.push('Duration must be between 5 and 600 seconds');
      }
    }

    return errors;
  }

  async execute(context) {
    const data = context.node.data || {};

    // Resolve templates
    const question = this.resolveTemplate(data.question, context);
    const chatId = this.resolveTemplate(data.chatId, context);
    const accountId = this.resolveTemplate(data.accountId, context);

    // Resolve options (could contain variables)
    const options = (data.options || []).map(opt =>
      this.resolveTemplate(opt, context)
    ).filter(opt => opt && opt.trim());

    const isAnonymous = data.isAnonymous !== undefined ? data.isAnonymous : false;
    const allowsMultipleAnswers = data.allowsMultipleAnswers || false;
    const duration = parseInt(data.duration) || 60;
    const waitForResults = data.waitForResults !== false;
    const storeInVariable = data.storeInVariable;

    // Validate after resolution
    if (!question) {
      return this.failure('Question is required', 'MISSING_QUESTION');
    }

    if (!chatId) {
      return this.failure('Chat ID is required', 'MISSING_CHAT_ID');
    }

    if (!accountId) {
      return this.failure('Account ID is required', 'MISSING_ACCOUNT_ID');
    }

    if (options.length < 2) {
      return this.failure('At least 2 options are required', 'INSUFFICIENT_OPTIONS');
    }

    try {
      // Get Telegram client
      const { AgentManager } = require('../../../../agents/agentManager.cjs');
      const agentManager = AgentManager.getInstance();
      const client = agentManager.getClient(accountId);

      if (!client) {
        return this.failure('Telegram bot not connected', 'CLIENT_NOT_FOUND');
      }

      if (typeof client.sendPoll !== 'function') {
        return this.failure('Client does not support polls (not a Telegram bot)', 'UNSUPPORTED_CLIENT');
      }

      context.logger?.info(`Sending Telegram poll to chat ${chatId}`);

      // Send poll
      const pollResult = await client.sendPoll(chatId, question, options, {
        isAnonymous,
        allowsMultipleAnswers,
        openPeriod: duration
      });

      // If not waiting for results, return immediately
      if (!waitForResults) {
        const output = {
          pollId: pollResult.pollId,
          messageId: pollResult.messageId,
          question,
          options,
          chatId,
          sent: true,
          waitedForResults: false
        };

        if (storeInVariable) {
          context.variables[storeInVariable] = output;
        }

        return this.success(output);
      }

      // Wait for poll to close
      context.logger?.info(`Waiting ${duration}s for poll results...`);

      const finalResults = await this.waitForPollClose(
        client,
        chatId,
        pollResult.messageId,
        duration * 1000 + 5000 // Extra 5s buffer
      );

      // Calculate winner
      const winner = this.getWinner(finalResults.options);

      const output = {
        pollId: pollResult.pollId,
        messageId: pollResult.messageId,
        question,
        options: finalResults.options,
        totalVotes: finalResults.totalVoterCount,
        winner,
        isClosed: true,
        waitedForResults: true
      };

      if (storeInVariable) {
        context.variables[storeInVariable] = output;
      }

      return this.success(output, ['completed']);

    } catch (error) {
      context.logger?.error(`Telegram poll failed: ${error.message}`);

      if (storeInVariable) {
        context.variables[storeInVariable] = {
          error: error.message,
          question,
          chatId
        };
      }

      return this.failure(error.message, 'POLL_ERROR', true);
    }
  }

  /**
   * Wait for poll to close and return final results
   */
  async waitForPollClose(client, chatId, messageId, timeoutMs) {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Set timeout to stop poll after duration
      const timeout = setTimeout(async () => {
        if (resolved) return;

        try {
          const results = await client.stopPoll(chatId, messageId);
          resolved = true;
          resolve(results);
        } catch (e) {
          if (!resolved) {
            resolved = true;
            reject(e);
          }
        }
      }, timeoutMs);

      // Also listen for poll updates in case it closes early
      const handler = (update) => {
        if (resolved) return;

        if (update.isClosed) {
          clearTimeout(timeout);
          resolved = true;
          client.removeListener('poll_update', handler);
          resolve(update);
        }
      };

      client.on('poll_update', handler);

      // Cleanup handler after timeout
      setTimeout(() => {
        client.removeListener('poll_update', handler);
      }, timeoutMs + 1000);
    });
  }

  /**
   * Get the winning option from poll results
   */
  getWinner(options) {
    if (!options || options.length === 0) return null;

    let maxVotes = 0;
    let winner = null;
    let tie = false;

    for (const opt of options) {
      if (opt.voterCount > maxVotes) {
        maxVotes = opt.voterCount;
        winner = opt.text;
        tie = false;
      } else if (opt.voterCount === maxVotes && maxVotes > 0) {
        tie = true;
      }
    }

    return {
      text: winner,
      votes: maxVotes,
      isTie: tie
    };
  }
}

module.exports = { TelegramPollNode };
