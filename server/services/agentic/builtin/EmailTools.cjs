/**
 * Built-in Email Tools for Agentic AI
 *
 * Provides pre-built email tools that agents can use without custom code.
 * These tools integrate with the EmailClient platform for IMAP/SMTP operations.
 *
 * Available tools:
 * - email_send: Send an email
 * - email_fetch: Fetch emails from folder
 * - email_search: Search emails by criteria
 * - email_reply: Reply to an email
 * - email_forward: Forward an email
 * - email_mark_read: Mark emails as read/unread
 * - email_get_folders: List email folders
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../logger.cjs');
const { getDatabase } = require('../../database.cjs');
const { decrypt } = require('../../encryption.cjs');

/**
 * Email tool definitions
 */
const EMAIL_TOOLS = {
  email_send: {
    id: 'builtin:email_send',
    name: 'email_send',
    type: 'builtin',
    description: 'Send an email message via SMTP',
    category: 'email',
    parameters: [
      {
        name: 'to',
        type: 'string',
        required: true,
        description: 'Recipient email address(es), comma-separated for multiple',
      },
      {
        name: 'subject',
        type: 'string',
        required: true,
        description: 'Email subject line',
      },
      {
        name: 'body',
        type: 'string',
        required: true,
        description: 'Email body content',
      },
      {
        name: 'isHtml',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Send as HTML email (default: plain text)',
      },
      {
        name: 'cc',
        type: 'string',
        required: false,
        description: 'CC recipients, comma-separated',
      },
      {
        name: 'bcc',
        type: 'string',
        required: false,
        description: 'BCC recipients, comma-separated',
      },
      {
        name: 'replyTo',
        type: 'string',
        required: false,
        description: 'Reply-to email address',
      },
    ],
    execute: async (inputs, context) => {
      const { to, subject, body, isHtml, cc, bcc, replyTo } = inputs;
      const { accountId, userId } = context;

      const client = await getEmailClient(accountId, userId);
      if (!client) {
        return { success: false, error: 'Email account not found or not connected' };
      }

      try {
        const result = await client.sendEmail(to, subject, body, {
          isHtml,
          cc: cc ? cc.split(',').map((e) => e.trim()) : undefined,
          bcc: bcc ? bcc.split(',').map((e) => e.trim()) : undefined,
          replyTo,
        });

        return {
          success: true,
          messageId: result.id,
          to,
          subject,
          timestamp: result.timestamp,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  email_fetch: {
    id: 'builtin:email_fetch',
    name: 'email_fetch',
    type: 'builtin',
    description: 'Fetch emails from an IMAP folder',
    category: 'email',
    parameters: [
      {
        name: 'folder',
        type: 'string',
        required: false,
        default: 'INBOX',
        description: 'IMAP folder name (default: INBOX)',
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        default: 10,
        description: 'Maximum number of emails to fetch (default: 10)',
      },
      {
        name: 'unreadOnly',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Only fetch unread emails',
      },
    ],
    execute: async (inputs, context) => {
      const { folder = 'INBOX', limit = 10, unreadOnly = false } = inputs;
      const { accountId, userId } = context;

      const client = await getEmailClient(accountId, userId);
      if (!client) {
        return { success: false, error: 'Email account not found or not connected' };
      }

      try {
        const emails = await client.getEmails(folder, limit);

        let filteredEmails = emails;
        if (unreadOnly) {
          filteredEmails = emails.filter((e) => !e.isRead);
        }

        return {
          success: true,
          folder,
          count: filteredEmails.length,
          emails: filteredEmails.map((e) => ({
            id: e.id,
            externalId: e.externalId,
            from: e.from,
            to: e.to,
            subject: e.subject,
            snippet: e.text ? e.text.substring(0, 200) : '',
            date: e.date,
            isRead: e.isRead,
            hasAttachments: e.hasAttachments,
          })),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  email_search: {
    id: 'builtin:email_search',
    name: 'email_search',
    type: 'builtin',
    description: 'Search emails by subject, sender, or content',
    category: 'email',
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'Search query (email address, keyword, etc.)',
      },
      {
        name: 'searchType',
        type: 'string',
        required: false,
        default: 'all',
        description: 'Where to search: subject, from, body, all (default: all)',
      },
      {
        name: 'folder',
        type: 'string',
        required: false,
        default: 'INBOX',
        description: 'Folder to search in',
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        default: 20,
        description: 'Maximum results to return',
      },
    ],
    execute: async (inputs, context) => {
      const { query, searchType = 'all', folder = 'INBOX', limit = 20 } = inputs;
      const { accountId, userId } = context;

      const client = await getEmailClient(accountId, userId);
      if (!client) {
        return { success: false, error: 'Email account not found or not connected' };
      }

      try {
        // Fetch emails and filter locally (IMAP search can be limited)
        const emails = await client.getEmails(folder, 100);

        const queryLower = query.toLowerCase();
        const matches = emails.filter((email) => {
          switch (searchType) {
            case 'subject':
              return email.subject?.toLowerCase().includes(queryLower);
            case 'from':
              return email.from?.toLowerCase().includes(queryLower);
            case 'body':
              return email.text?.toLowerCase().includes(queryLower);
            case 'all':
            default:
              return (
                email.subject?.toLowerCase().includes(queryLower) ||
                email.from?.toLowerCase().includes(queryLower) ||
                email.text?.toLowerCase().includes(queryLower)
              );
          }
        });

        return {
          success: true,
          query,
          searchType,
          matchCount: matches.length,
          matches: matches.slice(0, limit).map((e) => ({
            id: e.id,
            externalId: e.externalId,
            from: e.from,
            subject: e.subject,
            snippet: e.text ? e.text.substring(0, 150) : '',
            date: e.date,
          })),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  email_reply: {
    id: 'builtin:email_reply',
    name: 'email_reply',
    type: 'builtin',
    description: 'Reply to an existing email',
    category: 'email',
    parameters: [
      {
        name: 'emailId',
        type: 'string',
        required: true,
        description: 'ID of the email to reply to',
      },
      {
        name: 'body',
        type: 'string',
        required: true,
        description: 'Reply body content',
      },
      {
        name: 'replyAll',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Reply to all recipients',
      },
      {
        name: 'isHtml',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Send as HTML',
      },
    ],
    execute: async (inputs, context) => {
      const { emailId, body, replyAll = false, isHtml = false } = inputs;
      const { accountId, userId } = context;

      const client = await getEmailClient(accountId, userId);
      if (!client) {
        return { success: false, error: 'Email account not found or not connected' };
      }

      try {
        // Find original email
        const emails = await client.getEmails('INBOX', 50);
        const original = emails.find((e) => e.id === emailId || e.externalId === emailId);

        if (!original) {
          return { success: false, error: 'Original email not found' };
        }

        const subject = original.subject?.startsWith('Re:')
          ? original.subject
          : `Re: ${original.subject}`;

        const recipients = replyAll
          ? [original.from, ...(original.cc || [])].join(', ')
          : original.from;

        const result = await client.sendEmail(recipients, subject, body, {
          isHtml,
          replyTo: original.from,
          inReplyTo: original.externalId,
        });

        return {
          success: true,
          messageId: result.id,
          to: recipients,
          subject,
          inReplyTo: original.externalId,
          timestamp: result.timestamp,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  email_forward: {
    id: 'builtin:email_forward',
    name: 'email_forward',
    type: 'builtin',
    description: 'Forward an email to another recipient',
    category: 'email',
    parameters: [
      {
        name: 'emailId',
        type: 'string',
        required: true,
        description: 'ID of the email to forward',
      },
      {
        name: 'to',
        type: 'string',
        required: true,
        description: 'Recipient to forward to',
      },
      {
        name: 'message',
        type: 'string',
        required: false,
        description: 'Optional message to include',
      },
    ],
    execute: async (inputs, context) => {
      const { emailId, to, message = '' } = inputs;
      const { accountId, userId } = context;

      const client = await getEmailClient(accountId, userId);
      if (!client) {
        return { success: false, error: 'Email account not found or not connected' };
      }

      try {
        // Find original email
        const emails = await client.getEmails('INBOX', 50);
        const original = emails.find((e) => e.id === emailId || e.externalId === emailId);

        if (!original) {
          return { success: false, error: 'Original email not found' };
        }

        const subject = original.subject?.startsWith('Fwd:')
          ? original.subject
          : `Fwd: ${original.subject}`;

        const forwardBody = `${message}

---------- Forwarded message ----------
From: ${original.from}
Date: ${original.date}
Subject: ${original.subject}

${original.text}`;

        const result = await client.sendEmail(to, subject, forwardBody, {
          isHtml: false,
        });

        return {
          success: true,
          messageId: result.id,
          to,
          subject,
          forwardedFrom: original.from,
          timestamp: result.timestamp,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  email_mark_read: {
    id: 'builtin:email_mark_read',
    name: 'email_mark_read',
    type: 'builtin',
    description: 'Mark email(s) as read or unread',
    category: 'email',
    parameters: [
      {
        name: 'emailIds',
        type: 'string',
        required: true,
        description: 'Email ID(s) to mark, comma-separated for multiple',
      },
      {
        name: 'read',
        type: 'boolean',
        required: false,
        default: true,
        description: 'Mark as read (true) or unread (false)',
      },
    ],
    execute: async (inputs, context) => {
      const { emailIds, read = true } = inputs;
      const { accountId, userId } = context;

      const client = await getEmailClient(accountId, userId);
      if (!client) {
        return { success: false, error: 'Email account not found or not connected' };
      }

      try {
        const ids = emailIds.split(',').map((id) => id.trim());

        // Mark each email (implementation depends on EmailClient capabilities)
        const results = [];
        for (const id of ids) {
          try {
            if (client.markAsRead) {
              await client.markAsRead(id, read);
              results.push({ id, success: true });
            } else {
              results.push({ id, success: false, error: 'markAsRead not implemented' });
            }
          } catch (err) {
            results.push({ id, success: false, error: err.message });
          }
        }

        return {
          success: true,
          markedAs: read ? 'read' : 'unread',
          results,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  email_get_folders: {
    id: 'builtin:email_get_folders',
    name: 'email_get_folders',
    type: 'builtin',
    description: 'List available email folders/mailboxes',
    category: 'email',
    parameters: [],
    execute: async (inputs, context) => {
      const { accountId, userId } = context;

      const client = await getEmailClient(accountId, userId);
      if (!client) {
        return { success: false, error: 'Email account not found or not connected' };
      }

      try {
        const folders = await client.getFolders();

        return {
          success: true,
          count: folders.length,
          folders: folders.map((f) => ({
            name: f.name || f,
            path: f.path || f.name || f,
            delimiter: f.delimiter,
            hasChildren: f.hasChildren,
          })),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },
};

/**
 * Get email client for account
 * @param {string} accountId - Platform account ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Email client or null
 */
async function getEmailClient(accountId, userId) {
  try {
    const { getAgentManager } = require('../../../agents/agentManager.cjs');
    const agentManager = getAgentManager();

    // Get client from agent manager
    const client = agentManager.getClient(accountId);

    if (client && client.status === 'connected') {
      return client;
    }

    // Try to find and connect account
    const db = getDatabase();
    const account = db
      .prepare(
        `SELECT * FROM platform_accounts
         WHERE id = ? AND user_id = ? AND platform = 'email'`
      )
      .get(accountId, userId);

    if (!account) {
      logger.warn(`EmailTools: Account ${accountId} not found for user ${userId}`);
      return null;
    }

    // Account exists but not connected - try to connect
    if (account.credentials_encrypted && agentManager.connectAccount) {
      await agentManager.connectAccount(accountId);
      return agentManager.getClient(accountId);
    }

    return null;
  } catch (error) {
    logger.error(`EmailTools: Failed to get email client: ${error.message}`);
    return null;
  }
}

/**
 * Get all email tools
 * @returns {Object} Email tools object
 */
function getEmailTools() {
  return EMAIL_TOOLS;
}

/**
 * Get tool by name
 * @param {string} name - Tool name
 * @returns {Object|null} Tool definition or null
 */
function getEmailTool(name) {
  return EMAIL_TOOLS[name] || null;
}

/**
 * Execute a built-in email tool
 * @param {string} toolName - Tool name
 * @param {Object} inputs - Tool inputs
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */
async function executeEmailTool(toolName, inputs, context) {
  const tool = EMAIL_TOOLS[toolName];

  if (!tool) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  // Validate required parameters
  for (const param of tool.parameters) {
    if (param.required && inputs[param.name] === undefined) {
      return { success: false, error: `Missing required parameter: ${param.name}` };
    }
  }

  try {
    const startTime = Date.now();
    const result = await tool.execute(inputs, context);
    const executionTime = Date.now() - startTime;

    logger.info(`EmailTools: Executed ${toolName} in ${executionTime}ms`);

    return {
      ...result,
      executionTime,
    };
  } catch (error) {
    logger.error(`EmailTools: Failed to execute ${toolName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get tool list for UI/API
 * @returns {Array} Tool list
 */
function getEmailToolList() {
  return Object.values(EMAIL_TOOLS).map((tool) => ({
    id: tool.id,
    name: tool.name,
    type: tool.type,
    description: tool.description,
    category: tool.category,
    parameters: tool.parameters,
  }));
}

module.exports = {
  EMAIL_TOOLS,
  getEmailTools,
  getEmailTool,
  executeEmailTool,
  getEmailToolList,
};
