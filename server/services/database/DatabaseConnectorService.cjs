/**
 * Database Connector Service
 *
 * Native database driver support for SQL Server (with future extensibility for PostgreSQL/MySQL).
 * Handles connection pooling, query execution, schema introspection, and test connections.
 */

const sql = require('mssql');
const { logger } = require('../logger.cjs');

// Connection pool cache by source ID
const connectionPools = new Map();

// Default configuration
const DEFAULT_CONFIG = {
  connectionTimeout: 30000,  // 30 seconds
  requestTimeout: 60000,     // 60 seconds
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

/**
 * Build SQL Server connection config
 */
function buildSqlServerConfig(source) {
  return {
    server: source.host,
    port: source.port || 1433,
    database: source.databaseName || source.database_name,
    user: source.username,
    password: source.password,
    options: {
      encrypt: source.encrypt !== false && source.encrypt !== 0,
      trustServerCertificate: source.trustServerCertificate === true || source.trust_server_certificate === 1,
      enableArithAbort: true,
    },
    connectionTimeout: DEFAULT_CONFIG.connectionTimeout,
    requestTimeout: DEFAULT_CONFIG.requestTimeout,
    pool: DEFAULT_CONFIG.pool,
  };
}

/**
 * Get or create connection pool for a source
 */
async function getPool(source) {
  const poolKey = source.id || `temp-${source.host}-${source.databaseName || source.database_name}`;

  if (connectionPools.has(poolKey)) {
    const pool = connectionPools.get(poolKey);
    if (pool.connected) {
      return pool;
    }
    // Pool is disconnected, remove it and create new one
    connectionPools.delete(poolKey);
  }

  const config = buildSqlServerConfig(source);

  try {
    const pool = await new sql.ConnectionPool(config).connect();

    pool.on('error', (err) => {
      logger.error(`SQL Server pool error for ${poolKey}: ${err.message}`);
      connectionPools.delete(poolKey);
    });

    if (source.id) {
      connectionPools.set(poolKey, pool);
    }

    return pool;
  } catch (error) {
    logger.error(`Failed to create SQL Server pool for ${poolKey}: ${error.message}`);
    throw error;
  }
}

/**
 * Close a connection pool
 */
async function closePool(sourceId) {
  if (connectionPools.has(sourceId)) {
    const pool = connectionPools.get(sourceId);
    try {
      await pool.close();
    } catch (error) {
      logger.warn(`Error closing pool ${sourceId}: ${error.message}`);
    }
    connectionPools.delete(sourceId);
  }
}

/**
 * Close all connection pools
 */
async function closeAllPools() {
  for (const [sourceId, pool] of connectionPools) {
    try {
      await pool.close();
    } catch (error) {
      logger.warn(`Error closing pool ${sourceId}: ${error.message}`);
    }
  }
  connectionPools.clear();
}

/**
 * Test database connection
 * @param {Object} config - Connection configuration
 * @returns {Promise<{success: boolean, message: string, serverVersion?: string}>}
 */
async function testConnection(config) {
  const startTime = Date.now();
  let pool = null;

  try {
    const dbType = config.dbType || config.db_type || 'sqlserver';

    if (dbType !== 'sqlserver') {
      return {
        success: false,
        message: `Database type '${dbType}' is not yet supported. Only 'sqlserver' is currently available.`,
      };
    }

    // Create temporary pool for testing
    pool = await getPool({ ...config, id: null });

    // Execute test query
    const result = await pool.request().query('SELECT @@VERSION AS version');
    const serverVersion = result.recordset[0]?.version?.split('\n')[0] || 'Unknown';

    const duration = Date.now() - startTime;

    return {
      success: true,
      message: `Connected successfully in ${duration}ms`,
      serverVersion,
      durationMs: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Connection test failed: ${error.message}`);

    let userMessage = error.message;

    // Friendly error messages
    if (error.code === 'ELOGIN') {
      userMessage = 'Login failed. Please check username and password.';
    } else if (error.code === 'ESOCKET' || error.code === 'ECONNREFUSED') {
      userMessage = `Cannot connect to server at ${config.host}:${config.port || 1433}. Please check host and port.`;
    } else if (error.code === 'ETIMEOUT') {
      userMessage = 'Connection timed out. Server may be unreachable or firewall is blocking.';
    } else if (error.code === 'EREQUEST') {
      userMessage = 'Request error. The server rejected the connection.';
    }

    return {
      success: false,
      message: userMessage,
      error: error.message,
      code: error.code,
      durationMs: duration,
    };
  } finally {
    // Close temporary pool
    if (pool && !config.id) {
      try {
        await pool.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

/**
 * Execute a SQL query
 * @param {Object} source - Database source configuration
 * @param {string} query - SQL query to execute
 * @param {Object} options - Query options (limit, timeout)
 * @returns {Promise<{rows: Array, columns: Array, rowCount: number}>}
 */
async function executeQuery(source, query, options = {}) {
  const { limit = 10000, timeout = 60000 } = options;

  try {
    const pool = await getPool(source);
    const request = pool.request();
    request.timeout = timeout;

    // Apply row limit by wrapping query if needed
    let limitedQuery = query.trim();
    if (limit && !limitedQuery.toLowerCase().includes('top ') && !limitedQuery.toLowerCase().includes('offset')) {
      // For SQL Server, add TOP clause if not present
      if (limitedQuery.toLowerCase().startsWith('select')) {
        limitedQuery = limitedQuery.replace(/^select/i, `SELECT TOP ${limit}`);
      }
    }

    const result = await request.query(limitedQuery);

    // Extract column info
    const columns = result.recordset?.columns
      ? Object.entries(result.recordset.columns).map(([name, info]) => ({
          name,
          type: info.type?.declaration || 'unknown',
          nullable: info.nullable,
        }))
      : [];

    return {
      rows: result.recordset || [],
      columns,
      rowCount: result.recordset?.length || 0,
      rowsAffected: result.rowsAffected?.[0] || 0,
    };
  } catch (error) {
    logger.error(`Query execution failed: ${error.message}`);
    throw new Error(`Query failed: ${error.message}`);
  }
}

/**
 * Get list of tables in database
 * @param {Object} source - Database source configuration
 * @returns {Promise<Array<{name: string, schema: string, type: string, rowCount: number}>>}
 */
async function getTables(source) {
  const query = `
    SELECT
      t.TABLE_SCHEMA as [schema],
      t.TABLE_NAME as name,
      t.TABLE_TYPE as type,
      p.rows as rowCount
    FROM INFORMATION_SCHEMA.TABLES t
    LEFT JOIN sys.tables st ON st.name = t.TABLE_NAME
    LEFT JOIN sys.partitions p ON st.object_id = p.object_id AND p.index_id IN (0, 1)
    WHERE t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
    ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
  `;

  try {
    const result = await executeQuery(source, query, { limit: 1000 });
    return result.rows.map(row => ({
      name: row.name,
      schema: row.schema || 'dbo',
      type: row.type === 'VIEW' ? 'view' : 'table',
      rowCount: row.rowCount || 0,
    }));
  } catch (error) {
    logger.error(`Failed to get tables: ${error.message}`);
    throw new Error(`Failed to get tables: ${error.message}`);
  }
}

/**
 * Get columns for a table
 * @param {Object} source - Database source configuration
 * @param {string} tableName - Table name
 * @param {string} schema - Schema name (default: dbo)
 * @returns {Promise<Array<{name: string, type: string, nullable: boolean, isPrimaryKey: boolean}>>}
 */
async function getColumns(source, tableName, schema = 'dbo') {
  const query = `
    SELECT
      c.COLUMN_NAME as name,
      c.DATA_TYPE as dataType,
      c.CHARACTER_MAXIMUM_LENGTH as maxLength,
      c.IS_NULLABLE as nullable,
      CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey
    FROM INFORMATION_SCHEMA.COLUMNS c
    LEFT JOIN (
      SELECT ku.TABLE_NAME, ku.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
        ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    ) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
    WHERE c.TABLE_NAME = @tableName AND c.TABLE_SCHEMA = @schema
    ORDER BY c.ORDINAL_POSITION
  `;

  try {
    const pool = await getPool(source);
    const result = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .input('schema', sql.NVarChar, schema)
      .query(query);

    return result.recordset.map(row => ({
      name: row.name,
      type: row.maxLength
        ? `${row.dataType}(${row.maxLength === -1 ? 'MAX' : row.maxLength})`
        : row.dataType,
      nullable: row.nullable === 'YES',
      isPrimaryKey: row.isPrimaryKey === 1,
    }));
  } catch (error) {
    logger.error(`Failed to get columns for ${schema}.${tableName}: ${error.message}`);
    throw new Error(`Failed to get columns: ${error.message}`);
  }
}

/**
 * Preview query results (limited rows)
 * @param {Object} source - Database source configuration
 * @param {string} query - SQL query to preview
 * @param {number} limit - Max rows to return (default: 10)
 * @returns {Promise<{rows: Array, columns: Array, totalEstimate: number}>}
 */
async function previewQuery(source, query, limit = 10) {
  try {
    const result = await executeQuery(source, query, { limit });

    return {
      rows: result.rows,
      columns: result.columns,
      rowCount: result.rowCount,
      preview: true,
    };
  } catch (error) {
    logger.error(`Preview query failed: ${error.message}`);
    throw new Error(`Preview failed: ${error.message}`);
  }
}

/**
 * Generate SELECT query for a table
 * @param {string} tableName - Table name
 * @param {string} schema - Schema name
 * @param {Array<string>} columns - Columns to select (empty = all)
 * @returns {string}
 */
function generateSelectQuery(tableName, schema = 'dbo', columns = []) {
  const columnList = columns.length > 0 ? columns.map(c => `[${c}]`).join(', ') : '*';
  return `SELECT ${columnList} FROM [${schema}].[${tableName}]`;
}

/**
 * Sync data from database to knowledge base
 * @param {Object} source - Database source with extraction query and field mappings
 * @param {Function} onProgress - Progress callback (current, total, status)
 * @param {Object} options - Sync options
 * @returns {Promise<{rowsProcessed: number, rowsIngested: number, rowsFailed: number, errors: Array}>}
 */
async function syncToKnowledge(source, onProgress, options = {}) {
  const { maxRows = 10000, batchSize = 100 } = options;

  const stats = {
    rowsProcessed: 0,
    rowsIngested: 0,
    rowsFailed: 0,
    errors: [],
  };

  try {
    // Execute extraction query
    const query = source.extractionQuery || source.extraction_query;
    if (!query) {
      throw new Error('No extraction query configured');
    }

    const result = await executeQuery(source, query, { limit: maxRows });
    const totalRows = result.rows.length;

    onProgress?.(0, totalRows, 'fetched');

    // Parse field mappings
    const contentFields = parseJsonField(source.contentFields || source.content_fields) || [];
    const titleField = source.titleField || source.title_field;
    const idField = source.idField || source.id_field;
    const metadataFields = parseJsonField(source.metadataFields || source.metadata_fields) || [];

    if (contentFields.length === 0) {
      throw new Error('No content fields configured');
    }

    // Process rows in batches
    const documents = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];

      try {
        // Build document content from content fields
        const contentParts = contentFields
          .map(field => row[field])
          .filter(val => val !== null && val !== undefined)
          .map(val => String(val));

        const content = contentParts.join('\n\n');

        if (!content.trim()) {
          stats.rowsFailed++;
          stats.errors.push({ row: i, error: 'Empty content after field mapping' });
          continue;
        }

        // Build document
        const doc = {
          externalId: idField ? String(row[idField]) : `row-${i}`,
          title: titleField ? String(row[titleField] || '') : `Row ${i + 1}`,
          content,
          metadata: {},
        };

        // Add metadata fields
        for (const field of metadataFields) {
          if (row[field] !== undefined) {
            doc.metadata[field] = row[field];
          }
        }

        documents.push(doc);
        stats.rowsProcessed++;

        // Report progress every batch
        if (stats.rowsProcessed % batchSize === 0) {
          onProgress?.(stats.rowsProcessed, totalRows, 'processing');
        }
      } catch (error) {
        stats.rowsFailed++;
        stats.errors.push({ row: i, error: error.message });
      }
    }

    onProgress?.(stats.rowsProcessed, totalRows, 'complete');
    stats.rowsIngested = documents.length;

    return { ...stats, documents };
  } catch (error) {
    logger.error(`Sync to knowledge failed: ${error.message}`);
    throw error;
  }
}

/**
 * Parse JSON field (handles both string and array)
 */
function parseJsonField(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      // Treat as comma-separated
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return null;
}

// Cleanup on process exit
process.on('beforeExit', async () => {
  await closeAllPools();
});

module.exports = {
  testConnection,
  executeQuery,
  getTables,
  getColumns,
  previewQuery,
  generateSelectQuery,
  syncToKnowledge,
  closePool,
  closeAllPools,
  getPool,
};
