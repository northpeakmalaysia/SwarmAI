/**
 * Response Helpers
 * Standardized response formatting utilities for API consistency
 */

/**
 * Convert snake_case database row to camelCase
 * @param {Object} row - Database row with snake_case keys
 * @returns {Object} Object with camelCase keys
 */
function toCamelCase(row) {
  if (!row || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(toCamelCase);

  return Object.fromEntries(
    Object.entries(row).map(([key, val]) => [
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      val
    ])
  );
}

/**
 * Convert camelCase to snake_case
 * @param {Object} obj - Object with camelCase keys
 * @returns {Object} Object with snake_case keys
 */
function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);

  return Object.fromEntries(
    Object.entries(obj).map(([key, val]) => [
      key.replace(/([A-Z])/g, '_$1').toLowerCase(),
      val
    ])
  );
}

/**
 * Transform boolean fields from 0/1 to true/false
 * @param {Object} row - Database row
 * @param {string[]} fields - Array of field names to transform
 * @returns {Object} Row with boolean fields transformed
 */
function transformBooleans(row, fields = []) {
  if (!row || typeof row !== 'object') return row;

  const result = { ...row };
  for (const field of fields) {
    if (field in result) {
      result[field] = !!result[field];
    }
  }
  return result;
}

/**
 * Parse JSON fields in a row
 * @param {Object} row - Database row
 * @param {string[]} fields - Array of field names to parse
 * @returns {Object} Row with JSON fields parsed
 */
function parseJsonFields(row, fields = []) {
  if (!row || typeof row !== 'object') return row;

  const result = { ...row };
  for (const field of fields) {
    if (field in result && typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        result[field] = null;
      }
    }
  }
  return result;
}

/**
 * Transform a database row with all common transformations
 * @param {Object} row - Database row
 * @param {Object} options - Transformation options
 * @param {string[]} options.booleanFields - Fields to convert to boolean
 * @param {string[]} options.jsonFields - Fields to parse as JSON
 * @param {boolean} options.camelCase - Convert keys to camelCase (default: false, use SELECT AS instead)
 * @returns {Object} Transformed row
 */
function transformRow(row, options = {}) {
  if (!row) return null;

  let result = row;

  if (options.camelCase) {
    result = toCamelCase(result);
  }

  if (options.booleanFields?.length) {
    result = transformBooleans(result, options.booleanFields);
  }

  if (options.jsonFields?.length) {
    result = parseJsonFields(result, options.jsonFields);
  }

  return result;
}

/**
 * Transform an array of database rows
 * @param {Object[]} rows - Array of database rows
 * @param {Object} options - Transformation options (same as transformRow)
 * @returns {Object[]} Transformed rows
 */
function transformRows(rows, options = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => transformRow(row, options));
}

/**
 * Create a paginated response
 * @param {Object[]} items - Array of items
 * @param {Object} params - Pagination parameters
 * @param {number} params.limit - Items per page
 * @param {number} params.offset - Current offset
 * @param {number} params.total - Total count (optional, will calculate hasMore if not provided)
 * @returns {Object} Pagination metadata
 */
function createPagination(items, params = {}) {
  const { limit = 50, offset = 0, total } = params;
  const count = items.length;

  // Calculate page number (1-indexed)
  const page = Math.floor(offset / limit) + 1;

  // Calculate total pages if total is provided
  const totalPages = total ? Math.ceil(total / limit) : undefined;

  // Calculate hasMore
  const hasMore = total !== undefined
    ? offset + count < total
    : count === limit; // If we got exactly limit items, assume there are more

  return {
    page,
    limit,
    offset,
    count,
    total: total || undefined,
    totalPages,
    hasMore
  };
}

/**
 * Send a success response with resource wrapper
 * @param {Object} res - Express response object
 * @param {string} key - Resource key name
 * @param {*} data - Data to send
 * @param {Object} extra - Extra fields to include
 */
function sendSuccess(res, key, data, extra = {}) {
  res.json({
    [key]: data,
    ...extra
  });
}

/**
 * Send a list response with optional pagination
 * @param {Object} res - Express response object
 * @param {string} key - Resource key name (plural)
 * @param {Object[]} items - Array of items
 * @param {Object} options - Options
 * @param {Object} options.pagination - Pagination params { limit, offset, total }
 */
function sendList(res, key, items, options = {}) {
  const response = { [key]: items };

  if (options.pagination) {
    response.pagination = createPagination(items, options.pagination);
  }

  res.json(response);
}

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {Object} details - Optional error details
 */
function sendError(res, status, message, details = null) {
  const response = { error: message };
  if (details) {
    response.details = details;
  }
  res.status(status).json(response);
}

/**
 * Common boolean fields in the database
 */
const COMMON_BOOLEAN_FIELDS = [
  'isActive',
  'isDefault',
  'isGroup',
  'isFree',
  'isSuperuser',
  'aiGenerated',
  'autoResponse',
  'supportsVision',
  'supportsTools',
  'supportsJson',
  'supportsStreaming'
];

/**
 * Common JSON fields in the database
 */
const COMMON_JSON_FIELDS = [
  'metadata',
  'config',
  'settings',
  'variables',
  'nodes',
  'edges',
  'parameters',
  'inputs',
  'outputs'
];

module.exports = {
  toCamelCase,
  toSnakeCase,
  transformBooleans,
  parseJsonFields,
  transformRow,
  transformRows,
  createPagination,
  sendSuccess,
  sendList,
  sendError,
  COMMON_BOOLEAN_FIELDS,
  COMMON_JSON_FIELDS
};
