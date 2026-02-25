/**
 * Wait For Reply Node
 *
 * Pauses flow execution and waits for a user reply on a specific channel.
 * Supports timeout handling and message matching/filtering.
 *
 * Features:
 * - Wait for reply on WhatsApp, Telegram, Email
 * - Configurable timeout with fallback path
 * - Message content matching (exact, contains, regex)
 * - Sender validation
 * - Multi-channel listening
 * - Button/callback response handling
 * - Conversation context preservation
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { v4: uuidv4 } = require('uuid');

// Pending replies storage (in production, use Redis)
const pendingReplies = new Map();

class WaitForReplyNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:waitForReply', 'messaging');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'messaging:waitForReply',
      label: 'Wait For Reply',
      description: 'Pause and wait for a user reply before continuing',
      icon: 'Clock',
      category: 'messaging',
      color: 'yellow',
      properties: {
        channel: {
          type: 'select',
          label: 'Channel',
          description: 'Channel to listen for replies on',
          options: [
            { value: 'any', label: 'Any Channel' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'telegram', label: 'Telegram' },
            { value: 'email', label: 'Email' }
          ],
          default: 'any'
        },
        fromSender: {
          type: 'text',
          label: 'From Sender',
          description: 'Expected sender (phone, chat ID, or email). Leave empty to accept from any sender in conversation.',
          showVariablePicker: true
        },
        conversationId: {
          type: 'text',
          label: 'Conversation ID',
          description: 'Specific conversation to wait in (from previous message)',
          showVariablePicker: true
        },
        timeout: {
          type: 'number',
          label: 'Timeout (seconds)',
          description: 'Maximum time to wait for reply. 0 = no timeout',
          default: 300,
          min: 0,
          max: 86400
        },
        matchType: {
          type: 'select',
          label: 'Match Type',
          description: 'How to match the reply content',
          options: [
            { value: 'any', label: 'Any Reply' },
            { value: 'exact', label: 'Exact Match' },
            { value: 'contains', label: 'Contains Text' },
            { value: 'startsWith', label: 'Starts With' },
            { value: 'regex', label: 'Regular Expression' },
            { value: 'button', label: 'Button/Callback Response' }
          ],
          default: 'any'
        },
        matchValue: {
          type: 'text',
          label: 'Match Value',
          description: 'Text, pattern, or button callback_data to match',
          showVariablePicker: true,
          showWhen: { matchType: ['exact', 'contains', 'startsWith', 'regex', 'button'] }
        },
        caseSensitive: {
          type: 'boolean',
          label: 'Case Sensitive',
          default: false,
          showWhen: { matchType: ['exact', 'contains', 'startsWith'] }
        },
        expectOptions: {
          type: 'array',
          label: 'Expected Options',
          description: 'Predefined valid responses (for validation)',
          itemSchema: {
            type: 'object',
            properties: {
              value: { type: 'text', label: 'Value' },
              label: { type: 'text', label: 'Display Label' }
            }
          }
        },
        retryOnInvalid: {
          type: 'boolean',
          label: 'Retry on Invalid Response',
          description: 'Re-send prompt if response does not match expected options',
          default: false
        },
        retryMessage: {
          type: 'textarea',
          label: 'Retry Message',
          description: 'Message to send when response is invalid',
          showWhen: { retryOnInvalid: true },
          rows: 2,
          default: 'Invalid response. Please try again.'
        },
        maxRetries: {
          type: 'number',
          label: 'Max Retries',
          default: 3,
          min: 1,
          max: 10,
          showWhen: { retryOnInvalid: true }
        },
        promptMessage: {
          type: 'textarea',
          label: 'Prompt Message (Optional)',
          description: 'Send this message before waiting for reply',
          showVariablePicker: true,
          rows: 3
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Reply In',
          description: 'Variable name to store the reply',
          placeholder: 'userReply'
        },
        storeMetadataIn: {
          type: 'text',
          label: 'Store Metadata In',
          description: 'Variable name to store reply metadata (sender, timestamp, etc.)',
          placeholder: 'replyMetadata'
        }
      },
      outputs: {
        reply: { label: 'Reply Received', type: 'default' },
        timeout: { label: 'Timeout', type: 'conditional' },
        invalid: { label: 'Invalid Response (after max retries)', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        channel: 'any',
        fromSender: '',
        conversationId: '',
        timeout: 300,
        matchType: 'any',
        matchValue: '',
        caseSensitive: false,
        expectOptions: [],
        retryOnInvalid: false,
        retryMessage: 'Invalid response. Please try again.',
        maxRetries: 3,
        promptMessage: '',
        storeInVariable: '',
        storeMetadataIn: ''
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (data.matchType === 'regex' && data.matchValue) {
      try {
        new RegExp(data.matchValue);
      } catch (e) {
        errors.push(`Invalid regular expression: ${e.message}`);
      }
    }

    if (data.retryOnInvalid && !data.expectOptions?.length) {
      errors.push('Expected options are required when retry on invalid is enabled');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      channel,
      fromSender,
      conversationId,
      timeout,
      matchType,
      matchValue,
      caseSensitive,
      expectOptions,
      retryOnInvalid,
      retryMessage,
      maxRetries,
      promptMessage,
      storeInVariable,
      storeMetadataIn
    } = context.node.data;

    const resolvedSender = fromSender ? this.resolveTemplate(fromSender, context) : null;
    const resolvedConversationId = conversationId ? this.resolveTemplate(conversationId, context) : null;
    const resolvedPrompt = promptMessage ? this.resolveTemplate(promptMessage, context) : null;

    try {
      // Generate a unique wait ID
      const waitId = uuidv4();

      // Send prompt message if provided
      if (resolvedPrompt) {
        await this.sendPrompt(context, channel, resolvedSender, resolvedPrompt);
      }

      // Register wait with message handler
      const waitConfig = {
        waitId,
        executionId: context.executionId,
        nodeId: context.node.id,
        channel,
        sender: resolvedSender,
        conversationId: resolvedConversationId,
        matchType,
        matchValue: matchValue ? this.resolveTemplate(matchValue, context) : null,
        caseSensitive,
        expectOptions,
        retryOnInvalid,
        retryMessage,
        maxRetries,
        retryCount: 0,
        createdAt: Date.now(),
        timeoutAt: timeout > 0 ? Date.now() + (timeout * 1000) : null
      };

      // Store wait configuration
      pendingReplies.set(waitId, waitConfig);

      // Register with message bus
      await this.registerWait(context, waitConfig);

      context.logger.info(`Waiting for reply: ${waitId} (timeout: ${timeout}s)`);

      // Create a promise that resolves when reply is received or times out
      const reply = await this.waitForReply(context, waitConfig, timeout);

      // Clean up
      pendingReplies.delete(waitId);

      if (reply.timedOut) {
        context.logger.info(`Wait timed out: ${waitId}`);
        return this.success({
          timedOut: true,
          waitId,
          waitDuration: timeout
        }, ['timeout']);
      }

      if (reply.maxRetriesExceeded) {
        context.logger.info(`Max retries exceeded: ${waitId}`);
        return this.success({
          maxRetriesExceeded: true,
          lastResponse: reply.content,
          retryCount: reply.retryCount
        }, ['invalid']);
      }

      // Build output
      const output = {
        content: reply.content,
        messageId: reply.messageId,
        sender: reply.sender,
        channel: reply.channel,
        timestamp: reply.timestamp,
        waitId,
        waitDuration: Math.round((Date.now() - waitConfig.createdAt) / 1000)
      };

      // Store in variables
      if (storeInVariable) {
        context.variables[storeInVariable] = reply.content;
      }

      if (storeMetadataIn) {
        context.variables[storeMetadataIn] = {
          messageId: reply.messageId,
          sender: reply.sender,
          channel: reply.channel,
          timestamp: reply.timestamp,
          waitDuration: output.waitDuration
        };
      }

      return this.success(output, ['reply']);

    } catch (error) {
      context.logger.error(`Wait for reply failed: ${error.message}`);
      return this.failure(error.message, 'WAIT_ERROR', true);
    }
  }

  /**
   * Send prompt message before waiting
   * @private
   */
  async sendPrompt(context, channel, sender, message) {
    const services = context.services;

    switch (channel) {
      case 'whatsapp':
        if (services.whatsapp && sender) {
          await services.whatsapp.sendMessage(sender, message);
        }
        break;

      case 'telegram':
        if (services.telegram && sender) {
          await services.telegram.sendMessage(sender, message);
        }
        break;

      case 'email':
        if (services.email && sender) {
          await services.email.send({
            to: sender,
            subject: 'Response Required',
            body: message
          });
        }
        break;

      case 'any':
        // Try to use the same channel as previous message
        if (context.variables.lastChannel) {
          await this.sendPrompt(context, context.variables.lastChannel, sender, message);
        }
        break;
    }
  }

  /**
   * Register wait with message bus
   * @private
   */
  async registerWait(context, waitConfig) {
    const messageBus = context.services?.messageBus;

    if (messageBus) {
      await messageBus.registerWait({
        waitId: waitConfig.waitId,
        executionId: waitConfig.executionId,
        channel: waitConfig.channel,
        sender: waitConfig.sender,
        conversationId: waitConfig.conversationId,
        timeoutAt: waitConfig.timeoutAt
      });
    }
  }

  /**
   * Wait for reply with timeout
   * @private
   */
  async waitForReply(context, waitConfig, timeout) {
    const messageBus = context.services?.messageBus;

    return new Promise((resolve) => {
      let timeoutHandle;

      // Setup timeout
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          resolve({ timedOut: true });
        }, timeout * 1000);
      }

      // Subscribe to reply events
      const handleReply = (reply) => {
        // Check if this reply matches our wait
        if (!this.matchesReply(waitConfig, reply)) {
          return;
        }

        // Check expected options if configured
        if (waitConfig.expectOptions && waitConfig.expectOptions.length > 0) {
          const isValid = this.validateResponse(reply.content, waitConfig.expectOptions);

          if (!isValid) {
            waitConfig.retryCount++;

            if (waitConfig.retryOnInvalid && waitConfig.retryCount < waitConfig.maxRetries) {
              // Send retry message
              this.sendRetryMessage(context, waitConfig, reply.channel, reply.sender);
              return; // Keep waiting
            }

            if (waitConfig.retryCount >= waitConfig.maxRetries) {
              clearTimeout(timeoutHandle);
              resolve({
                maxRetriesExceeded: true,
                content: reply.content,
                retryCount: waitConfig.retryCount
              });
              return;
            }
          }
        }

        // Valid reply received
        clearTimeout(timeoutHandle);
        resolve({
          content: reply.content,
          messageId: reply.messageId,
          sender: reply.sender,
          channel: reply.channel,
          timestamp: reply.timestamp
        });
      };

      // Register handler
      if (messageBus) {
        messageBus.onReply(waitConfig.waitId, handleReply);
      } else {
        // Fallback: poll for replies (for testing)
        const pollInterval = setInterval(() => {
          const config = pendingReplies.get(waitConfig.waitId);
          if (config && config.receivedReply) {
            clearInterval(pollInterval);
            handleReply(config.receivedReply);
          }
        }, 500);

        // Clean up on timeout
        if (timeoutHandle) {
          const originalTimeout = timeoutHandle;
          timeoutHandle = setTimeout(() => {
            clearInterval(pollInterval);
            resolve({ timedOut: true });
          }, timeout * 1000);
        }
      }
    });
  }

  /**
   * Check if a reply matches the wait configuration
   * @private
   */
  matchesReply(waitConfig, reply) {
    // Check channel
    if (waitConfig.channel !== 'any' && reply.channel !== waitConfig.channel) {
      return false;
    }

    // Check sender
    if (waitConfig.sender && reply.sender !== waitConfig.sender) {
      return false;
    }

    // Check conversation ID
    if (waitConfig.conversationId && reply.conversationId !== waitConfig.conversationId) {
      return false;
    }

    // Check content match
    return this.matchesContent(reply.content, waitConfig);
  }

  /**
   * Check if content matches the match criteria
   * @private
   */
  matchesContent(content, config) {
    if (config.matchType === 'any') {
      return true;
    }

    const value = config.matchValue;
    let text = content || '';
    let matchText = value || '';

    if (!config.caseSensitive) {
      text = text.toLowerCase();
      matchText = matchText.toLowerCase();
    }

    switch (config.matchType) {
      case 'exact':
        return text === matchText;

      case 'contains':
        return text.includes(matchText);

      case 'startsWith':
        return text.startsWith(matchText);

      case 'regex':
        try {
          const regex = new RegExp(value, config.caseSensitive ? '' : 'i');
          return regex.test(content);
        } catch {
          return false;
        }

      case 'button':
        // Match button callback_data
        return content === value;

      default:
        return true;
    }
  }

  /**
   * Validate response against expected options
   * @private
   */
  validateResponse(content, options) {
    const normalized = (content || '').toLowerCase().trim();

    return options.some(opt => {
      const optValue = (opt.value || '').toLowerCase().trim();
      const optLabel = (opt.label || '').toLowerCase().trim();
      return normalized === optValue || normalized === optLabel;
    });
  }

  /**
   * Send retry message
   * @private
   */
  async sendRetryMessage(context, waitConfig, channel, sender) {
    const message = waitConfig.retryMessage;

    if (message && sender) {
      await this.sendPrompt(context, channel, sender, message);
    }
  }

  /**
   * Static method to resolve a pending reply (called by message handlers)
   */
  static resolveReply(waitId, reply) {
    const config = pendingReplies.get(waitId);
    if (config) {
      config.receivedReply = reply;
    }
  }

  /**
   * Static method to get pending waits for a sender
   */
  static getPendingWaits(channel, sender) {
    const results = [];
    for (const [waitId, config] of pendingReplies) {
      if ((config.channel === 'any' || config.channel === channel) &&
        (!config.sender || config.sender === sender)) {
        results.push({ waitId, config });
      }
    }
    return results;
  }
}

module.exports = { WaitForReplyNode };
