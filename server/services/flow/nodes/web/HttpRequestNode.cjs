/**
 * HTTP Request Node
 *
 * Makes HTTP requests to external APIs and services.
 * Supports all common HTTP methods, headers, query parameters, and body content.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class HttpRequestNode extends BaseNodeExecutor {
  constructor() {
    super('web:httpRequest', 'web');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    // Get URL
    const url = this.resolveTemplate(
      this.getRequired(data, 'url'),
      context
    );

    // Get method
    const method = this.getOptional(data, 'method', 'GET').toUpperCase();

    // Get headers
    let headers = this.getOptional(data, 'headers', {});
    if (typeof headers === 'string') {
      try {
        headers = JSON.parse(this.resolveTemplate(headers, context));
      } catch {
        headers = {};
      }
    } else {
      // Resolve templates in header values
      const resolvedHeaders = {};
      for (const [key, value] of Object.entries(headers)) {
        resolvedHeaders[key] = this.resolveTemplate(String(value), context);
      }
      headers = resolvedHeaders;
    }

    // Get query parameters
    let queryParams = this.getOptional(data, 'queryParams', {});
    if (typeof queryParams === 'string') {
      try {
        queryParams = JSON.parse(this.resolveTemplate(queryParams, context));
      } catch {
        queryParams = {};
      }
    } else {
      // Resolve templates in query values
      const resolvedParams = {};
      for (const [key, value] of Object.entries(queryParams)) {
        resolvedParams[key] = this.resolveTemplate(String(value), context);
      }
      queryParams = resolvedParams;
    }

    // Get body (for POST, PUT, PATCH)
    let body = this.getOptional(data, 'body', null);
    if (body && typeof body === 'string') {
      body = this.resolveTemplate(body, context);
    } else if (body && typeof body === 'object') {
      // Deep resolve templates in body object
      body = this.resolveObjectTemplates(body, context);
    }

    // Get additional options
    const timeout = this.getOptional(data, 'timeout', 30000);
    const followRedirects = this.getOptional(data, 'followRedirects', true);
    const validateStatus = this.getOptional(data, 'validateStatus', true);
    const responseType = this.getOptional(data, 'responseType', 'json'); // json, text, binary

    // Build URL with query params
    const urlObj = new URL(url);
    for (const [key, value] of Object.entries(queryParams)) {
      urlObj.searchParams.append(key, value);
    }
    const finalUrl = urlObj.toString();

    // Set default content-type if not set and body exists
    if (body && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Prepare fetch options
    const fetchOptions = {
      method,
      headers,
      redirect: followRedirects ? 'follow' : 'manual',
    };

    // Add body for methods that support it
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Add abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOptions.signal = controller.signal;

    // Also respect context abort signal
    if (context.abortSignal) {
      context.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const startTime = Date.now();
      const response = await fetch(finalUrl, fetchOptions);
      const endTime = Date.now();

      clearTimeout(timeoutId);

      // Check status if validation is enabled
      if (validateStatus && !response.ok) {
        const errorBody = await response.text().catch(() => '');
        return this.failure(
          `HTTP request failed with status ${response.status}: ${errorBody.substring(0, 200)}`,
          `HTTP_${response.status}`,
          response.status >= 500 || response.status === 429 // 5xx and rate limits are recoverable
        );
      }

      // Parse response based on type
      let responseData;
      switch (responseType) {
        case 'json':
          try {
            responseData = await response.json();
          } catch {
            responseData = await response.text();
          }
          break;

        case 'text':
          responseData = await response.text();
          break;

        case 'binary':
        case 'blob':
          const buffer = await response.arrayBuffer();
          responseData = Buffer.from(buffer).toString('base64');
          break;

        default:
          responseData = await response.text();
      }

      // Extract response headers
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return this.success({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: responseData,
        url: finalUrl,
        method,
        duration: endTime - startTime,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        return this.failure('Request timed out', 'TIMEOUT', true);
      }

      return this.failure(
        `HTTP request failed: ${error.message}`,
        'REQUEST_ERROR',
        true
      );
    }
  }

  resolveObjectTemplates(obj, context) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObjectTemplates(item, context));
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.resolveTemplate(value, context);
      } else if (typeof value === 'object') {
        result[key] = this.resolveObjectTemplates(value, context);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.url) {
      errors.push('URL is required');
    } else {
      // Validate URL format (allow templates)
      const urlPattern = /^(https?:\/\/|{{)/i;
      if (!urlPattern.test(data.url)) {
        errors.push('URL must start with http:// or https:// (or be a template)');
      }
    }

    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (data.method && !validMethods.includes(data.method.toUpperCase())) {
      errors.push(`Invalid HTTP method: ${data.method}`);
    }

    if (data.timeout !== undefined) {
      const t = parseInt(data.timeout, 10);
      if (isNaN(t) || t < 1000 || t > 300000) {
        errors.push('Timeout must be between 1000 and 300000 milliseconds');
      }
    }

    const validResponseTypes = ['json', 'text', 'binary', 'blob'];
    if (data.responseType && !validResponseTypes.includes(data.responseType)) {
      errors.push(`Invalid responseType: ${data.responseType}`);
    }

    return errors;
  }
}

module.exports = { HttpRequestNode };
