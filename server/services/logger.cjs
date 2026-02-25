/**
 * Logger Service
 * Simple Winston-based logging with console and file output
 * Enhanced with automatic file/function name extraction for error logs
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'data', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Parse stack trace to extract caller information
 * @param {number} stackDepth - How many levels up the stack to look (default: 3)
 * @returns {Object} - { filename, functionName, lineNumber, columnNumber }
 */
function getCallerInfo(stackDepth = 3) {
  const originalPrepareStackTrace = Error.prepareStackTrace;

  try {
    Error.prepareStackTrace = (_, stack) => stack;
    const err = new Error();
    const stack = err.stack;

    // Restore original prepareStackTrace
    Error.prepareStackTrace = originalPrepareStackTrace;

    if (!stack || stack.length <= stackDepth) {
      return { filename: 'unknown', functionName: 'unknown', lineNumber: 0, columnNumber: 0 };
    }

    const callSite = stack[stackDepth];
    const fullPath = callSite.getFileName() || 'unknown';
    const lineNumber = callSite.getLineNumber() || 0;
    const columnNumber = callSite.getColumnNumber() || 0;

    // Build function name from available info
    // Try: ClassName.methodName, functionName, methodName, or 'anonymous'
    const typeName = callSite.getTypeName();
    const methodName = callSite.getMethodName();
    const funcName = callSite.getFunctionName();

    let functionName;
    if (funcName) {
      // Use function name if available (includes class.method for methods)
      functionName = funcName;
    } else if (typeName && methodName) {
      // Combine type and method for class methods
      functionName = `${typeName}.${methodName}`;
    } else if (methodName) {
      functionName = methodName;
    } else {
      functionName = 'anonymous';
    }

    // Extract just the filename from the full path, relative to server/
    let filename = fullPath;
    if (fullPath !== 'unknown') {
      // Try to make path relative to server directory
      const serverIndex = fullPath.indexOf('server');
      if (serverIndex !== -1) {
        filename = fullPath.substring(serverIndex);
      } else {
        filename = path.basename(fullPath);
      }
      // Normalize path separators
      filename = filename.replace(/\\/g, '/');
    }

    return { filename, functionName, lineNumber, columnNumber };
  } catch (e) {
    // Restore on error
    Error.prepareStackTrace = originalPrepareStackTrace;
    return { filename: 'unknown', functionName: 'unknown', lineNumber: 0, columnNumber: 0 };
  }
}

/**
 * Format location string for log output
 * @param {Object} callerInfo - Caller information object
 * @returns {string} - Formatted location string
 */
function formatLocation(callerInfo) {
  const { filename, functionName, lineNumber } = callerInfo;
  return `[${filename}:${lineNumber} ${functionName}()]`;
}

// Custom format for console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, location, file, function: fn, line, service, platform, accountId, errorMessage, errorStack, errorName, severity, ...meta }) => {
    const locationStr = location ? ` ${location}` : '';
    // Only show remaining meta that isn't already displayed
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}:${locationStr} ${message}${metaStr}`;
  })
);

// Custom format for file (JSON with location info)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Create base logger instance
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Console output
    new winston.transports.Console({
      format: consoleFormat
    }),
    // File output - combined
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    // File output - errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

// Monitor transport health — catch silent failures
baseLogger.on('error', (err) => {
  console.error(`[LOGGER-HEALTH] Winston logger error: ${err.message}`);
});
baseLogger.transports.forEach((transport, idx) => {
  transport.on('error', (err) => {
    console.error(`[LOGGER-HEALTH] Transport ${idx} (${transport.name || 'unnamed'}) error: ${err.message}`);
  });
  if (transport.on) {
    transport.on('warn', (msg) => {
      console.error(`[LOGGER-HEALTH] Transport ${idx} warning: ${msg}`);
    });
  }
});

/**
 * Enhanced logger wrapper that adds location info to error and warn logs
 */
const logger = {
  /**
   * Log info message
   */
  info: (message, meta = {}) => {
    baseLogger.info(message, meta);
  },

  /**
   * Log debug message
   */
  debug: (message, meta = {}) => {
    baseLogger.debug(message, meta);
  },

  /**
   * Log warning with automatic location info
   */
  warn: (message, meta = {}) => {
    const callerInfo = getCallerInfo(2);
    const location = formatLocation(callerInfo);
    baseLogger.warn(message, {
      location,
      file: callerInfo.filename,
      function: callerInfo.functionName,
      line: callerInfo.lineNumber,
      ...meta
    });
  },

  /**
   * Log error with automatic location info
   */
  error: (message, meta = {}) => {
    const callerInfo = getCallerInfo(2);
    const location = formatLocation(callerInfo);

    // Handle Error objects passed as second argument
    let errorMeta = meta;
    if (meta instanceof Error) {
      errorMeta = {
        errorMessage: meta.message,
        errorStack: meta.stack,
        errorName: meta.name
      };
    }

    baseLogger.error(message, {
      location,
      file: callerInfo.filename,
      function: callerInfo.functionName,
      line: callerInfo.lineNumber,
      ...errorMeta
    });
  },

  /**
   * Log error with explicit location (for when caller info can't be auto-detected)
   * @param {string} message - Error message
   * @param {string} filename - Source filename
   * @param {string} functionName - Function name
   * @param {Object} meta - Additional metadata
   */
  errorAt: (message, filename, functionName, meta = {}) => {
    const location = `[${filename} ${functionName}()]`;
    baseLogger.error(message, {
      location,
      file: filename,
      function: functionName,
      ...meta
    });
  },

  /**
   * Log with full stack trace for critical errors
   */
  critical: (message, error = null, meta = {}) => {
    const callerInfo = getCallerInfo(2);
    const location = formatLocation(callerInfo);

    const criticalMeta = {
      location,
      file: callerInfo.filename,
      function: callerInfo.functionName,
      line: callerInfo.lineNumber,
      severity: 'CRITICAL',
      ...meta
    };

    if (error instanceof Error) {
      criticalMeta.errorMessage = error.message;
      criticalMeta.errorStack = error.stack;
      criticalMeta.errorName = error.name;
    }

    baseLogger.error(`[CRITICAL] ${message}`, criticalMeta);
  },

  /**
   * Access to underlying Winston logger for advanced use
   */
  _winston: baseLogger
};

/**
 * Create a platform-specific logger
 * @param {string} platform - Platform name (whatsapp, telegram, email)
 * @param {string} accountId - Account/agent ID
 */
function createPlatformLogger(platform, accountId) {
  const shortId = accountId ? accountId.substring(0, 8) : 'unknown';
  const prefix = `[${platform}:${shortId}]`;

  return {
    info: (msg, meta = {}) => logger.info(`${prefix} ${msg}`, meta),
    debug: (msg, meta = {}) => logger.debug(`${prefix} ${msg}`, meta),
    warn: (msg, meta = {}) => {
      const callerInfo = getCallerInfo(2);
      const location = formatLocation(callerInfo);
      baseLogger.warn(`${prefix} ${msg}`, {
        location,
        file: callerInfo.filename,
        function: callerInfo.functionName,
        line: callerInfo.lineNumber,
        platform,
        accountId: shortId,
        ...meta
      });
    },
    error: (msg, meta = {}) => {
      const callerInfo = getCallerInfo(2);
      const location = formatLocation(callerInfo);

      let errorMeta = meta;
      if (meta instanceof Error) {
        errorMeta = {
          errorMessage: meta.message,
          errorStack: meta.stack,
          errorName: meta.name
        };
      }

      baseLogger.error(`${prefix} ${msg}`, {
        location,
        file: callerInfo.filename,
        function: callerInfo.functionName,
        line: callerInfo.lineNumber,
        platform,
        accountId: shortId,
        ...errorMeta
      });
    }
  };
}

/**
 * Create a service-specific logger with automatic location tracking
 * @param {string} serviceName - Name of the service (e.g., 'SuperBrain', 'FlowEngine')
 */
function createServiceLogger(serviceName) {
  const prefix = `[${serviceName}]`;

  return {
    info: (msg, meta = {}) => logger.info(`${prefix} ${msg}`, meta),
    debug: (msg, meta = {}) => logger.debug(`${prefix} ${msg}`, meta),
    warn: (msg, meta = {}) => {
      const callerInfo = getCallerInfo(2);
      const location = formatLocation(callerInfo);
      baseLogger.warn(`${prefix} ${msg}`, {
        location,
        service: serviceName,
        file: callerInfo.filename,
        function: callerInfo.functionName,
        line: callerInfo.lineNumber,
        ...meta
      });
    },
    error: (msg, meta = {}) => {
      const callerInfo = getCallerInfo(2);
      const location = formatLocation(callerInfo);

      let errorMeta = meta;
      if (meta instanceof Error) {
        errorMeta = {
          errorMessage: meta.message,
          errorStack: meta.stack,
          errorName: meta.name
        };
      }

      baseLogger.error(`${prefix} ${msg}`, {
        location,
        service: serviceName,
        file: callerInfo.filename,
        function: callerInfo.functionName,
        line: callerInfo.lineNumber,
        ...errorMeta
      });
    },
    critical: (msg, error = null, meta = {}) => {
      const callerInfo = getCallerInfo(2);
      const location = formatLocation(callerInfo);

      const criticalMeta = {
        location,
        service: serviceName,
        file: callerInfo.filename,
        function: callerInfo.functionName,
        line: callerInfo.lineNumber,
        severity: 'CRITICAL',
        ...meta
      };

      if (error instanceof Error) {
        criticalMeta.errorMessage = error.message;
        criticalMeta.errorStack = error.stack;
        criticalMeta.errorName = error.name;
      }

      baseLogger.error(`${prefix} [CRITICAL] ${msg}`, criticalMeta);
    }
  };
}

/**
 * Safe logging wrapper for critical error paths.
 * If Winston fails (broken transport, full buffer), falls back to console.error.
 * Use this in catch blocks where logger failure would prevent user-facing error messages.
 */
function safeLog(level, message) {
  try {
    if (logger[level]) {
      logger[level](message);
    } else {
      logger.info(message);
    }
  } catch (_) {
    try { console.error(`[safeLog/${level}] ${message}`); } catch (__) { /* truly nothing */ }
  }
}

module.exports = {
  logger,
  safeLog,
  createPlatformLogger,
  createServiceLogger,
  getCallerInfo,
  formatLocation
};
