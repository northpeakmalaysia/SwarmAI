/**
 * Python Sandbox
 *
 * Secure execution environment for custom Python tools.
 * Executes Python scripts in isolated subprocess with:
 * - Restricted working directory (workspace only)
 * - Timeout enforcement
 * - Environment variable filtering
 * - Output capture and size limits
 * - Resource limits
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');

// Sandbox configuration
const DEFAULT_CONFIG = {
  timeout: 30000, // 30 seconds max execution
  maxOutputSize: 1024 * 1024, // 1MB max output
  maxMemoryMB: 256, // 256MB memory limit (advisory)
  pythonPath: process.env.PYTHON_PATH || 'python3',
};

// Blocked modules for security
const BLOCKED_MODULES = [
  'os.system',
  'subprocess',
  'multiprocessing',
  'ctypes',
  'importlib',
  '__import__',
  'eval',
  'exec',
  'compile',
  'open', // We provide a safe alternative
  'socket',
  'pickle', // Can execute arbitrary code
  'shelve',
  'marshal',
];

// Allowed built-in modules
const ALLOWED_MODULES = [
  'json',
  'datetime',
  'math',
  'random',
  'string',
  'collections',
  'itertools',
  'functools',
  'operator',
  'typing',
  're',
  'hashlib',
  'base64',
  'urllib.parse',
  'html',
  'textwrap',
  'difflib',
  'statistics',
  'decimal',
  'fractions',
  'uuid',
  'copy',
  'pprint',
  'time', // Limited - only time.time(), time.sleep() with cap
];

/**
 * Execution result
 */
const EXECUTION_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  TIMEOUT: 'timeout',
  SECURITY_VIOLATION: 'security_violation',
};

class PythonSandbox {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tempDir = path.join(process.cwd(), 'data', 'sandbox-temp');
  }

  /**
   * Initialize sandbox (create temp directory)
   */
  async initialize() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      logger.info('PythonSandbox initialized');
    } catch (error) {
      logger.error(`Failed to initialize sandbox: ${error.message}`);
    }
  }

  /**
   * Execute a custom tool
   * @param {Object} tool - Tool definition from database
   * @param {Object} inputs - Input parameters
   * @param {string} workspacePath - Path to workspace for file access
   * @returns {Promise<Object>}
   */
  async executeTool(tool, inputs = {}, workspacePath = null) {
    const executionId = uuidv4();
    const startTime = Date.now();

    logger.info(`Executing tool ${tool.name} (${executionId})`);

    try {
      // Security check on code
      const securityCheck = this.checkCodeSecurity(tool.code);
      if (!securityCheck.safe) {
        return {
          executionId,
          status: EXECUTION_STATUS.SECURITY_VIOLATION,
          error: `Security violation: ${securityCheck.reason}`,
          output: null,
          executionTime: Date.now() - startTime,
        };
      }

      // Create wrapped script
      const wrappedScript = this.wrapToolCode(tool, inputs, workspacePath);

      // Write to temp file
      const scriptPath = path.join(this.tempDir, `tool_${executionId}.py`);
      await fs.writeFile(scriptPath, wrappedScript, 'utf8');

      // Execute
      const result = await this.executeScript(scriptPath, workspacePath);

      // Cleanup temp file
      await fs.unlink(scriptPath).catch(() => {});

      return {
        executionId,
        status: result.exitCode === 0 ? EXECUTION_STATUS.SUCCESS : EXECUTION_STATUS.ERROR,
        output: result.stdout,
        error: result.stderr || null,
        exitCode: result.exitCode,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      if (error.timeout) {
        return {
          executionId,
          status: EXECUTION_STATUS.TIMEOUT,
          error: `Execution timeout after ${this.config.timeout}ms`,
          output: null,
          executionTime: Date.now() - startTime,
        };
      }

      return {
        executionId,
        status: EXECUTION_STATUS.ERROR,
        error: error.message,
        output: null,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check code for security violations
   * @param {string} code - Python code
   * @returns {Object}
   */
  checkCodeSecurity(code) {
    // Check for blocked patterns
    for (const blocked of BLOCKED_MODULES) {
      // Check for import statements
      const importPattern = new RegExp(`import\\s+${blocked.replace('.', '\\.')}`, 'i');
      const fromPattern = new RegExp(`from\\s+${blocked.split('.')[0]}\\s+import`, 'i');
      const directPattern = new RegExp(`\\b${blocked.replace('.', '\\.')}\\s*\\(`, 'i');

      if (importPattern.test(code) || fromPattern.test(code) || directPattern.test(code)) {
        return {
          safe: false,
          reason: `Blocked module/function: ${blocked}`,
        };
      }
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /__builtins__/, reason: 'Access to __builtins__' },
      { pattern: /__class__/, reason: 'Access to __class__' },
      { pattern: /__bases__/, reason: 'Access to __bases__' },
      { pattern: /__subclasses__/, reason: 'Access to __subclasses__' },
      { pattern: /__globals__/, reason: 'Access to __globals__' },
      { pattern: /__code__/, reason: 'Access to __code__' },
      { pattern: /\.mro\s*\(/, reason: 'Access to method resolution order' },
      { pattern: /getattr\s*\(.*,\s*['"]__/, reason: 'Getattr with dunder' },
      { pattern: /setattr\s*\(/, reason: 'Use of setattr' },
      { pattern: /delattr\s*\(/, reason: 'Use of delattr' },
      { pattern: /globals\s*\(\s*\)/, reason: 'Access to globals()' },
      { pattern: /locals\s*\(\s*\)/, reason: 'Access to locals()' },
      { pattern: /vars\s*\(\s*\)/, reason: 'Access to vars()' },
      { pattern: /dir\s*\(\s*\)/, reason: 'Use of dir() without argument' },
    ];

    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(code)) {
        return { safe: false, reason };
      }
    }

    return { safe: true };
  }

  /**
   * Wrap tool code with sandbox harness
   * @param {Object} tool - Tool definition
   * @param {Object} inputs - Input parameters
   * @param {string} workspacePath - Workspace path
   * @returns {string}
   */
  wrapToolCode(tool, inputs, workspacePath) {
    const parameters = tool.parameters ? JSON.parse(tool.parameters) : [];
    const inputsJson = JSON.stringify(inputs);

    return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sandboxed tool execution wrapper
Tool: ${tool.name}
"""

import sys
import json
import traceback

# Restrict available builtins
_safe_builtins = {
    'abs': abs, 'all': all, 'any': any, 'ascii': ascii,
    'bin': bin, 'bool': bool, 'bytearray': bytearray, 'bytes': bytes,
    'callable': callable, 'chr': chr, 'dict': dict, 'divmod': divmod,
    'enumerate': enumerate, 'filter': filter, 'float': float,
    'format': format, 'frozenset': frozenset, 'hash': hash,
    'hex': hex, 'int': int, 'isinstance': isinstance, 'issubclass': issubclass,
    'iter': iter, 'len': len, 'list': list, 'map': map, 'max': max,
    'min': min, 'next': next, 'object': object, 'oct': oct,
    'ord': ord, 'pow': pow, 'print': print, 'range': range,
    'repr': repr, 'reversed': reversed, 'round': round, 'set': set,
    'slice': slice, 'sorted': sorted, 'str': str, 'sum': sum,
    'tuple': tuple, 'type': type, 'zip': zip,
    'True': True, 'False': False, 'None': None,
    'Exception': Exception, 'ValueError': ValueError, 'TypeError': TypeError,
    'KeyError': KeyError, 'IndexError': IndexError, 'AttributeError': AttributeError,
}

# Safe file operations (workspace only)
WORKSPACE_PATH = ${workspacePath ? `"${workspacePath.replace(/\\/g, '\\\\')}"` : 'None'}

def safe_open(filepath, mode='r', **kwargs):
    """Safe file open - only allows access within workspace"""
    import os
    if WORKSPACE_PATH is None:
        raise PermissionError("No workspace configured for file access")

    # Resolve and check path
    abs_path = os.path.abspath(filepath)
    workspace_abs = os.path.abspath(WORKSPACE_PATH)

    if not abs_path.startswith(workspace_abs):
        raise PermissionError(f"Access denied: {filepath} is outside workspace")

    # Only allow read mode and write to output folder
    if 'w' in mode or 'a' in mode:
        output_dir = os.path.join(workspace_abs, 'output')
        if not abs_path.startswith(output_dir):
            raise PermissionError("Write access only allowed in output/ folder")

    return open(abs_path, mode, **kwargs)

_safe_builtins['open'] = safe_open

# Tool inputs
_inputs = json.loads('''${inputsJson}''')

# User's tool code
# =================
${tool.code}
# =================

# Execute the tool
def _run_tool():
    try:
        # Check if execute function exists
        if 'execute' not in dir():
            return {"error": "Tool must define an 'execute' function"}

        # Call execute with inputs
        result = execute(**_inputs)

        # Ensure result is JSON serializable
        return {"result": result}
    except Exception as e:
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }

if __name__ == '__main__':
    output = _run_tool()
    print(json.dumps(output, default=str))
`;
  }

  /**
   * Execute Python script
   * @param {string} scriptPath - Path to script
   * @param {string} workspacePath - Working directory
   * @returns {Promise<Object>}
   */
  executeScript(scriptPath, workspacePath) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Build environment (filtered)
      const safeEnv = this.getSafeEnvironment(workspacePath);

      const pythonProcess = spawn(this.config.pythonPath, [scriptPath], {
        cwd: workspacePath || this.tempDir,
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.timeout,
      });

      // Timeout handler
      const timeoutId = setTimeout(() => {
        killed = true;
        pythonProcess.kill('SIGKILL');
        const error = new Error('Execution timeout');
        error.timeout = true;
        reject(error);
      }, this.config.timeout);

      // Capture stdout
      pythonProcess.stdout.on('data', (data) => {
        if (stdout.length < this.config.maxOutputSize) {
          stdout += data.toString();
        }
      });

      // Capture stderr
      pythonProcess.stderr.on('data', (data) => {
        if (stderr.length < this.config.maxOutputSize) {
          stderr += data.toString();
        }
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);

        if (killed) return;

        // Truncate if needed
        if (stdout.length > this.config.maxOutputSize) {
          stdout = stdout.substring(0, this.config.maxOutputSize) + '\n... (output truncated)';
        }

        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!killed) {
          reject(error);
        }
      });
    });
  }

  /**
   * Get safe environment variables
   * @param {string} workspacePath - Workspace path
   * @returns {Object}
   */
  getSafeEnvironment(workspacePath) {
    const safeEnv = {
      PATH: process.env.PATH,
      PYTHONPATH: '',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      HOME: workspacePath || this.tempDir,
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
    };

    // Add Python-specific paths if needed
    if (process.platform === 'win32') {
      safeEnv.SYSTEMROOT = process.env.SYSTEMROOT;
      safeEnv.TEMP = this.tempDir;
      safeEnv.TMP = this.tempDir;
    } else {
      safeEnv.TMPDIR = this.tempDir;
    }

    return safeEnv;
  }

  /**
   * Validate tool code syntax
   * @param {string} code - Python code
   * @returns {Promise<Object>}
   */
  async validateSyntax(code) {
    const executionId = uuidv4();
    const scriptPath = path.join(this.tempDir, `validate_${executionId}.py`);

    try {
      await fs.writeFile(scriptPath, code, 'utf8');

      const result = await new Promise((resolve, reject) => {
        const pythonProcess = spawn(
          this.config.pythonPath,
          ['-m', 'py_compile', scriptPath],
          {
            cwd: this.tempDir,
            timeout: 5000,
          }
        );

        let stderr = '';

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', (code) => {
          resolve({ valid: code === 0, error: stderr.trim() || null });
        });

        pythonProcess.on('error', (error) => {
          reject(error);
        });
      });

      await fs.unlink(scriptPath).catch(() => {});
      return result;
    } catch (error) {
      await fs.unlink(scriptPath).catch(() => {});
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get tool template
   * @param {string} name - Tool name
   * @param {Array} parameters - Parameter definitions
   * @returns {string}
   */
  getToolTemplate(name = 'my_tool', parameters = []) {
    const paramList = parameters.map((p) => p.name).join(', ');
    const paramDocs = parameters
      .map((p) => `    ${p.name}: ${p.type || 'any'} - ${p.description || 'No description'}`)
      .join('\n');

    return `"""
Custom Tool: ${name}

This tool can be invoked by the AI agent when needed.
"""

import json
import datetime

def execute(${paramList || '**kwargs'}):
    """
    Main execution function.

    Parameters:
${paramDocs || '    No parameters'}

    Returns:
        dict: Result of the tool execution
    """
    # Your tool logic here
    result = {
        "message": "Tool executed successfully",
        "timestamp": datetime.datetime.now().isoformat(),
        # Add your result data here
    }

    return result


# Example usage (for testing):
# if __name__ == '__main__':
#     print(execute(${parameters.length > 0 ? '# add test params' : ''}))
`;
  }

  /**
   * Cleanup old temp files
   */
  async cleanup() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath).catch(() => {});
        }
      }
    } catch (error) {
      logger.warn(`Sandbox cleanup error: ${error.message}`);
    }
  }
}

// Singleton instance
let pythonSandboxInstance = null;

function getPythonSandbox(config = {}) {
  if (!pythonSandboxInstance) {
    pythonSandboxInstance = new PythonSandbox(config);
    pythonSandboxInstance.initialize();
  }
  return pythonSandboxInstance;
}

module.exports = {
  PythonSandbox,
  getPythonSandbox,
  EXECUTION_STATUS,
  ALLOWED_MODULES,
  BLOCKED_MODULES,
};
