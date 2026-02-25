/**
 * Webhook Trigger Node
 *
 * Executes when an HTTP webhook is received.
 * Supports authentication (Bearer token, API key, HMAC) and custom responses.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const crypto = require('crypto');

class WebhookTriggerNode extends BaseNodeExecutor {
  constructor() {
    super('trigger:webhook', 'trigger');
  }

  async execute(context) {
    const { input, node } = context;
    const data = node.data || {};

    // Authentication validation result (passed from webhook endpoint)
    const authResult = input.authResult || { authenticated: true, method: 'none' };

    // Extract webhook data
    const webhookData = {
      triggeredAt: new Date().toISOString(),
      triggerType: 'webhook',
      webhookPath: data.webhookPath || '',
      method: input.method || 'POST',
      headers: input.headers || {},
      query: input.query || {},
      body: input.body || {},
      authenticated: authResult.authenticated,
      authMethod: authResult.method,
    };

    // If authentication is enabled and request failed auth, fail the node
    if (data.authentication?.enabled && !authResult.authenticated) {
      return this.failure(
        `Webhook authentication failed: ${authResult.reason || 'Invalid credentials'}`,
        'AUTH_FAILED',
        { ...webhookData, reason: authResult.reason }
      );
    }

    // Prepare response configuration (will be used by webhook endpoint)
    const responseConfig = this.prepareResponse(data.response, context);

    return this.success({
      ...webhookData,
      responseConfig, // Return to execution context so endpoint can use it
    });
  }

  /**
   * Prepare custom response configuration
   * @param {Object} responseData - Response configuration from node data
   * @param {Object} context - Execution context for template resolution
   * @returns {Object} Resolved response configuration
   */
  prepareResponse(responseData, context) {
    if (!responseData) {
      // Default response
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Webhook received' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    const statusCode = parseInt(responseData.statusCode || 200, 10);
    const headers = responseData.headers || { 'Content-Type': 'application/json' };

    // Resolve template in response body
    let body = responseData.body || JSON.stringify({ success: true });
    if (typeof body === 'string') {
      body = this.resolveTemplates(body, context);
    }

    return { statusCode, body, headers };
  }

  /**
   * Validate webhook authentication
   * This is called by the webhook endpoint BEFORE triggering the flow
   *
   * @param {Object} req - Express request object
   * @param {Object} authConfig - Authentication configuration from node data
   * @returns {Object} { authenticated: boolean, method: string, reason?: string }
   */
  static validateAuthentication(req, authConfig) {
    if (!authConfig || !authConfig.enabled) {
      return { authenticated: true, method: 'none' };
    }

    const authType = authConfig.type || 'bearer';
    const secret = authConfig.secret || '';

    switch (authType) {
      case 'bearer':
        return this.validateBearerToken(req, secret);

      case 'apikey':
        return this.validateApiKey(req, authConfig.tokenField || 'X-API-Key', secret);

      case 'hmac':
        return this.validateHmacSignature(req, secret, authConfig.algorithm || 'sha256');

      default:
        return { authenticated: false, method: authType, reason: `Unsupported auth type: ${authType}` };
    }
  }

  /**
   * Validate Bearer token authentication
   */
  static validateBearerToken(req, expectedToken) {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return { authenticated: false, method: 'bearer', reason: 'Missing or invalid Authorization header' };
    }

    const providedToken = match[1];
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedToken),
      Buffer.from(expectedToken)
    );

    return {
      authenticated: isValid,
      method: 'bearer',
      reason: isValid ? undefined : 'Invalid bearer token',
    };
  }

  /**
   * Validate API key authentication
   */
  static validateApiKey(req, headerName, expectedKey) {
    const providedKey = req.headers[headerName.toLowerCase()] || req.query[headerName] || '';

    if (!providedKey) {
      return { authenticated: false, method: 'apikey', reason: `Missing API key in header ${headerName} or query parameter` };
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedKey),
      Buffer.from(expectedKey)
    );

    return {
      authenticated: isValid,
      method: 'apikey',
      reason: isValid ? undefined : 'Invalid API key',
    };
  }

  /**
   * Validate HMAC signature authentication
   */
  static validateHmacSignature(req, secret, algorithm = 'sha256') {
    const signatureHeader = req.headers['x-webhook-signature'] || req.headers['X-Webhook-Signature'] || '';

    if (!signatureHeader) {
      return { authenticated: false, method: 'hmac', reason: 'Missing X-Webhook-Signature header' };
    }

    // Get raw body (req.rawBody should be set by webhook endpoint middleware)
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // Calculate expected signature
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    // Compare signatures (timing-safe)
    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      // Length mismatch
      isValid = false;
    }

    return {
      authenticated: isValid,
      method: 'hmac',
      reason: isValid ? undefined : 'Invalid HMAC signature',
    };
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Webhook path is required
    if (!data.webhookPath) {
      errors.push('Webhook path is required');
    } else {
      // Path validation
      if (!data.webhookPath.startsWith('/')) {
        errors.push('Webhook path must start with /');
      }
      if (data.webhookPath.includes('..')) {
        errors.push('Webhook path cannot contain ..');
      }
      if (data.webhookPath.includes(' ')) {
        errors.push('Webhook path cannot contain spaces');
      }
    }

    // Authentication validation
    if (data.authentication?.enabled) {
      const authType = data.authentication.type;
      const secret = data.authentication.secret;

      if (!authType) {
        errors.push('Authentication type is required when authentication is enabled');
      } else if (!['bearer', 'apikey', 'hmac'].includes(authType)) {
        errors.push('Authentication type must be one of: bearer, apikey, hmac');
      }

      if (!secret) {
        errors.push('Secret is required when authentication is enabled');
      } else if (secret.length < 16) {
        errors.push('Secret must be at least 16 characters long for security');
      }

      // Validate API key header name
      if (authType === 'apikey') {
        const tokenField = data.authentication.tokenField;
        if (!tokenField) {
          errors.push('Token field (header name) is required for API key authentication');
        } else if (!/^[a-zA-Z0-9-_]+$/.test(tokenField)) {
          errors.push('Token field must contain only letters, numbers, hyphens, and underscores');
        }
      }

      // Validate HMAC algorithm
      if (authType === 'hmac') {
        const algorithm = data.authentication.algorithm || 'sha256';
        if (!['sha256', 'sha512', 'sha1'].includes(algorithm)) {
          errors.push('HMAC algorithm must be one of: sha256, sha512, sha1');
        }
      }
    }

    // Response validation
    if (data.response) {
      const statusCode = parseInt(data.response.statusCode, 10);
      if (statusCode && (statusCode < 100 || statusCode > 599)) {
        errors.push('Response status code must be between 100 and 599');
      }

      if (data.response.headers && typeof data.response.headers !== 'object') {
        errors.push('Response headers must be an object');
      }
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'trigger:webhook',
      category: 'trigger',
      name: 'Webhook Trigger',
      description: 'Trigger flow via HTTP webhook request',
      icon: 'webhook',
      properties: [
        {
          name: 'webhookPath',
          type: 'string',
          label: 'Webhook Path',
          description: 'URL path for this webhook (e.g., /my-webhook)',
          required: true,
          placeholder: '/my-webhook',
        },
        {
          name: 'authentication',
          type: 'object',
          label: 'Authentication',
          description: 'Secure your webhook with authentication',
          properties: [
            {
              name: 'enabled',
              type: 'boolean',
              label: 'Enable Authentication',
              default: false,
            },
            {
              name: 'type',
              type: 'select',
              label: 'Authentication Type',
              options: [
                { value: 'bearer', label: 'Bearer Token' },
                { value: 'apikey', label: 'API Key' },
                { value: 'hmac', label: 'HMAC Signature' },
              ],
              default: 'bearer',
              visibleWhen: 'authentication.enabled === true',
            },
            {
              name: 'secret',
              type: 'string',
              label: 'Secret/Token',
              description: 'Secret key or token (minimum 16 characters)',
              required: true,
              sensitive: true,
              supportsTemplates: true,
              visibleWhen: 'authentication.enabled === true',
            },
            {
              name: 'tokenField',
              type: 'string',
              label: 'Header/Query Field Name',
              description: 'Header or query parameter name for API key',
              default: 'X-API-Key',
              visibleWhen: 'authentication.type === "apikey"',
            },
            {
              name: 'algorithm',
              type: 'select',
              label: 'HMAC Algorithm',
              options: [
                { value: 'sha256', label: 'SHA-256 (Recommended)' },
                { value: 'sha512', label: 'SHA-512' },
                { value: 'sha1', label: 'SHA-1 (Legacy)' },
              ],
              default: 'sha256',
              visibleWhen: 'authentication.type === "hmac"',
            },
          ],
        },
        {
          name: 'response',
          type: 'object',
          label: 'Custom Response',
          description: 'Customize the HTTP response sent back to the caller',
          properties: [
            {
              name: 'statusCode',
              type: 'number',
              label: 'Status Code',
              description: 'HTTP response status code',
              default: 200,
              min: 100,
              max: 599,
            },
            {
              name: 'body',
              type: 'text',
              label: 'Response Body',
              description: 'Response body (supports templates like {{var.name}})',
              default: '{"success": true, "message": "Webhook received"}',
              supportsTemplates: true,
            },
            {
              name: 'headers',
              type: 'keyvalue',
              label: 'Response Headers',
              description: 'Custom HTTP headers',
              default: { 'Content-Type': 'application/json' },
            },
          ],
        },
      ],
      outputs: [
        {
          name: 'triggeredAt',
          type: 'string',
          description: 'Timestamp when webhook was received',
        },
        {
          name: 'method',
          type: 'string',
          description: 'HTTP method (GET, POST, PUT, etc.)',
        },
        {
          name: 'headers',
          type: 'object',
          description: 'HTTP request headers',
        },
        {
          name: 'query',
          type: 'object',
          description: 'URL query parameters',
        },
        {
          name: 'body',
          type: 'any',
          description: 'Request body',
        },
        {
          name: 'authenticated',
          type: 'boolean',
          description: 'Whether authentication succeeded',
        },
        {
          name: 'authMethod',
          type: 'string',
          description: 'Authentication method used',
        },
      ],
    };
  }
}

module.exports = { WebhookTriggerNode };
