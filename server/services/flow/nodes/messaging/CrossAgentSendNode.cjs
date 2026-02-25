/**
 * Cross-Agent Send Node
 * ======================
 * Sends messages through a specific agent to specific contacts.
 * Enables cross-platform messaging (e.g., Telegram trigger → WhatsApp response).
 *
 * Features:
 * - Agent selection (dropdown or variable)
 * - Contact selection (multi-select from agent's contacts or variable)
 * - Platform auto-detection from selected agent
 * - Variable support for dynamic routing: {{trigger.source.agentId}}, {{trigger.source.contactId}}
 * - Broadcast mode: send same message to multiple contacts in one execution
 *
 * Modes:
 * - reply: Send back to the triggering contact via triggering agent
 * - specific: Send to user-selected contacts via user-selected agent
 * - variable: Use variables for dynamic agent/contact resolution
 * - broadcast: Send to multiple contacts simultaneously
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { unifiedMessageService } = require('../../../unifiedMessageService.cjs');

class CrossAgentSendNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:crossAgentSend', 'messaging');
  }

  async execute(context) {
    const { node, input, services, logger } = context;
    const data = node.data || {};

    // Get send mode
    const mode = this.getOptional(data, 'mode', 'reply');

    // Get message content (always required)
    const message = this.resolveTemplate(
      this.getRequired(data, 'message'),
      context
    );

    let agentId, platform, recipients;

    try {
      switch (mode) {
        case 'reply':
          // Reply to triggering source
          const triggerSource = input.trigger?.source || input.message || {};
          agentId = triggerSource.agentId || input.agentId;
          platform = triggerSource.platform || input.platform || input.message?.platform;
          recipients = [triggerSource.contactId || triggerSource.from || input.message?.from];

          if (!agentId || !recipients[0]) {
            return this.failure(
              'Reply mode requires trigger source with agentId and contactId/from',
              'MISSING_TRIGGER_CONTEXT',
              false
            );
          }
          break;

        case 'specific':
          // User-selected agent and contacts
          agentId = this.getRequired(data, 'agentId');
          platform = this.getRequired(data, 'platform');
          recipients = data.recipients || [];

          if (!Array.isArray(recipients) || recipients.length === 0) {
            return this.failure(
              'Specific mode requires at least one recipient',
              'NO_RECIPIENTS',
              false
            );
          }
          break;

        case 'variable':
          // Resolve from variables
          agentId = this.resolveTemplate(
            this.getRequired(data, 'agentIdVariable'),
            context
          );
          platform = this.resolveTemplate(
            this.getOptional(data, 'platformVariable', '{{trigger.source.platform}}'),
            context
          );
          const recipientVar = this.resolveTemplate(
            this.getRequired(data, 'recipientsVariable'),
            context
          );

          // Parse recipients (could be comma-separated string or JSON array)
          if (typeof recipientVar === 'string') {
            try {
              recipients = JSON.parse(recipientVar);
            } catch {
              recipients = recipientVar.split(',').map(r => r.trim()).filter(Boolean);
            }
          } else if (Array.isArray(recipientVar)) {
            recipients = recipientVar;
          } else {
            recipients = [recipientVar];
          }

          if (!agentId || recipients.length === 0) {
            return this.failure(
              'Variable mode: agentId and recipients must resolve to valid values',
              'VARIABLE_RESOLUTION_FAILED',
              false
            );
          }
          break;

        case 'broadcast':
          // Send to multiple contacts via specific agent
          agentId = this.getRequired(data, 'agentId');
          platform = this.getRequired(data, 'platform');
          recipients = data.recipients || [];

          // Also support recipient list from variable
          if (data.recipientListVariable) {
            const dynamicRecipients = this.resolveTemplate(data.recipientListVariable, context);
            if (dynamicRecipients) {
              if (typeof dynamicRecipients === 'string') {
                try {
                  const parsed = JSON.parse(dynamicRecipients);
                  recipients = [...recipients, ...(Array.isArray(parsed) ? parsed : [parsed])];
                } catch {
                  recipients = [...recipients, ...dynamicRecipients.split(',').map(r => r.trim())];
                }
              } else if (Array.isArray(dynamicRecipients)) {
                recipients = [...recipients, ...dynamicRecipients];
              }
            }
          }

          if (recipients.length === 0) {
            return this.failure(
              'Broadcast mode requires at least one recipient',
              'NO_BROADCAST_RECIPIENTS',
              false
            );
          }
          break;

        default:
          return this.failure(`Unknown mode: ${mode}`, 'INVALID_MODE', false);
      }

      // Get platform-specific options
      const messageOptions = this.buildMessageOptions(data, platform, context);

      // Get user ID from context for authorization
      const userId = context.userId || input.userId;

      // Build source context for tracking
      const sourceContext = {
        flowId: context.flowId,
        flowName: context.flowName,
        executionId: context.executionId,
        nodeId: node.id,
        nodeName: node.data?.label || 'CrossAgentSend',
        triggerType: input.trigger?.type,
        originalPlatform: input.message?.platform || input.trigger?.source?.platform,
        mode
      };

      // Send the message
      logger.info(`CrossAgentSend: ${mode} mode, agent=${agentId}, platform=${platform}, recipients=${recipients.length}`);

      const result = await unifiedMessageService.sendCrossAgentMessage({
        agentId,
        platform,
        recipients,
        content: message,
        messageOptions,
        userId,
        sourceContext
      });

      if (!result.success && result.totalFailed > 0 && result.totalSent === 0) {
        // All failed
        return this.failure(
          `All messages failed to send: ${result.results.map(r => r.error).join(', ')}`,
          'ALL_SEND_FAILED',
          true // Recoverable - network issues
        );
      }

      return this.success({
        mode,
        agentId,
        platform,
        messageLength: message.length,
        recipientCount: recipients.length,
        sent: result.totalSent,
        failed: result.totalFailed,
        results: result.results,
        sentAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`CrossAgentSend failed: ${error.message}`);
      return this.failure(
        `Failed to send cross-agent message: ${error.message}`,
        'SEND_ERROR',
        true
      );
    }
  }

  /**
   * Build platform-specific message options
   * @private
   */
  buildMessageOptions(data, platform, context) {
    const options = {
      format: this.getOptional(data, 'format', 'text'),
      parseMode: this.getOptional(data, 'parseMode', null)
    };

    // WhatsApp-specific
    if (platform === 'whatsapp' || platform === 'whatsapp-business') {
      if (data.mentions) {
        options.mentions = Array.isArray(data.mentions)
          ? data.mentions
          : this.resolveTemplate(data.mentions, context);
      }
      options.linkPreview = this.getOptional(data, 'linkPreview', true);
      if (data.replyToMessageId) {
        options.quotedMessageId = this.resolveTemplate(data.replyToMessageId, context);
      }
    }

    // Telegram-specific
    if (platform === 'telegram-bot') {
      if (data.buttons) {
        options.buttons = data.buttons;
      }
      if (data.replyMarkup) {
        options.reply_markup = data.replyMarkup;
      }
      options.disable_notification = this.getOptional(data, 'silentMessage', false);
      options.disable_web_page_preview = this.getOptional(data, 'disableWebPagePreview', false);
      options.parse_mode = options.format === 'markdown' ? 'MarkdownV2' : 'HTML';
    }

    // Email-specific
    if (platform === 'email') {
      options.subject = this.resolveTemplate(
        this.getOptional(data, 'subject', 'Message from Agent'),
        context
      );
      if (data.cc) options.cc = data.cc;
      if (data.bcc) options.bcc = data.bcc;
      if (data.replyTo) options.replyTo = data.replyTo;
    }

    return options;
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Message is always required
    if (!data.message) {
      errors.push('Message content is required');
    }

    const mode = data.mode || 'reply';

    switch (mode) {
      case 'reply':
        // No additional validation - relies on trigger context
        break;

      case 'specific':
      case 'broadcast':
        if (!data.agentId) {
          errors.push(`${mode} mode requires agent selection`);
        }
        if (!data.platform) {
          errors.push(`${mode} mode requires platform selection`);
        }
        if (mode === 'specific' && (!data.recipients || data.recipients.length === 0)) {
          if (!data.recipientListVariable) {
            errors.push('Specific mode requires at least one recipient');
          }
        }
        break;

      case 'variable':
        if (!data.agentIdVariable) {
          errors.push('Variable mode requires agentIdVariable');
        }
        if (!data.recipientsVariable) {
          errors.push('Variable mode requires recipientsVariable');
        }
        break;

      default:
        errors.push(`Invalid mode: ${mode}`);
    }

    // Platform-specific validation
    if (data.platform === 'email' && mode !== 'reply' && mode !== 'variable') {
      if (!data.subject) {
        errors.push('Email requires a subject');
      }
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'messaging:crossAgentSend',
      category: 'messaging',
      name: 'Cross-Agent Send',
      description: 'Send messages through any agent to any contact, enabling cross-platform messaging',
      icon: 'send',
      color: '#3b82f6', // blue
      inputs: [
        { id: 'default', label: 'Input' }
      ],
      outputs: [
        { id: 'success', label: 'Sent' },
        { id: 'failure', label: 'Failed' }
      ],
      properties: [
        // Mode selection
        {
          key: 'mode',
          label: 'Send Mode',
          type: 'select',
          default: 'reply',
          options: [
            { value: 'reply', label: 'Reply to Trigger Source', description: 'Respond to whoever triggered the flow' },
            { value: 'specific', label: 'Specific Agent & Contacts', description: 'Select agent and contacts from list' },
            { value: 'variable', label: 'Dynamic (Variables)', description: 'Use variables for agent and contacts' },
            { value: 'broadcast', label: 'Broadcast', description: 'Send to multiple contacts at once' }
          ],
          description: 'How to determine the target agent and recipients'
        },

        // === Specific/Broadcast Mode Fields ===
        {
          key: 'agentId',
          label: 'Agent',
          type: 'agentSelector',
          showIf: 'mode === "specific" || mode === "broadcast"',
          description: 'Select the agent to send from',
          required: true
        },
        {
          key: 'platform',
          label: 'Platform',
          type: 'select',
          showIf: 'mode === "specific" || mode === "broadcast"',
          options: [
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'telegram-bot', label: 'Telegram' },
            { value: 'email', label: 'Email' }
          ],
          description: 'Messaging platform to use',
          required: true
        },
        {
          key: 'recipients',
          label: 'Recipients',
          type: 'contactPicker',
          showIf: 'mode === "specific" || mode === "broadcast"',
          multiple: true,
          description: 'Select contacts to send to',
          dependsOn: ['agentId', 'platform'] // Reload when these change
        },
        {
          key: 'recipientListVariable',
          label: 'Additional Recipients (Variable)',
          type: 'text',
          showIf: 'mode === "broadcast"',
          placeholder: '{{node.contacts.output}}',
          description: 'Optional: Add recipients from a variable (comma-separated or JSON array)'
        },

        // === Variable Mode Fields ===
        {
          key: 'agentIdVariable',
          label: 'Agent ID Variable',
          type: 'text',
          showIf: 'mode === "variable"',
          placeholder: '{{trigger.source.agentId}}',
          description: 'Variable containing the agent ID',
          required: true
        },
        {
          key: 'platformVariable',
          label: 'Platform Variable',
          type: 'text',
          showIf: 'mode === "variable"',
          placeholder: '{{trigger.source.platform}}',
          default: '{{trigger.source.platform}}',
          description: 'Variable containing the platform'
        },
        {
          key: 'recipientsVariable',
          label: 'Recipients Variable',
          type: 'text',
          showIf: 'mode === "variable"',
          placeholder: '{{trigger.source.contactId}}',
          description: 'Variable containing recipient ID(s)',
          required: true
        },

        // === Message Content ===
        {
          key: 'message',
          label: 'Message',
          type: 'textarea',
          rows: 4,
          placeholder: 'Enter your message (supports {{variables}})',
          description: 'Message content to send',
          required: true
        },
        {
          key: 'format',
          label: 'Message Format',
          type: 'select',
          options: [
            { value: 'text', label: 'Plain Text' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'html', label: 'HTML' }
          ],
          default: 'text'
        },

        // === Email-specific ===
        {
          key: 'subject',
          label: 'Subject (Email)',
          type: 'text',
          showIf: 'platform === "email"',
          placeholder: 'Email subject line',
          description: 'Required for email messages'
        },

        // === WhatsApp-specific ===
        {
          key: 'linkPreview',
          label: 'Link Preview (WhatsApp)',
          type: 'checkbox',
          showIf: 'platform === "whatsapp"',
          default: true,
          description: 'Show link preview in message'
        },

        // === Telegram-specific ===
        {
          key: 'silentMessage',
          label: 'Silent (Telegram)',
          type: 'checkbox',
          showIf: 'platform === "telegram-bot"',
          default: false,
          description: 'Send without notification sound'
        },
        {
          key: 'disableWebPagePreview',
          label: 'Disable Preview (Telegram)',
          type: 'checkbox',
          showIf: 'platform === "telegram-bot"',
          default: false,
          description: 'Disable link preview'
        }
      ],
      outputs: [
        {
          name: 'mode',
          type: 'string',
          description: 'Send mode used'
        },
        {
          name: 'agentId',
          type: 'string',
          description: 'Agent that sent the message'
        },
        {
          name: 'platform',
          type: 'string',
          description: 'Platform used'
        },
        {
          name: 'recipientCount',
          type: 'number',
          description: 'Number of recipients'
        },
        {
          name: 'sent',
          type: 'number',
          description: 'Successfully sent count'
        },
        {
          name: 'failed',
          type: 'number',
          description: 'Failed send count'
        },
        {
          name: 'results',
          type: 'array',
          description: 'Detailed results per recipient'
        },
        {
          name: 'sentAt',
          type: 'string',
          description: 'ISO timestamp'
        }
      ]
    };
  }
}

module.exports = { CrossAgentSendNode };
