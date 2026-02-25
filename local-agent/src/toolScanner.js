/**
 * Tool Scanner for Local Agent
 *
 * Auto-detects installed developer tools on the local machine.
 * Reports tool inventory to the server on connect.
 */

const { execSync } = require('child_process');
const os = require('os');

const isWindows = os.platform() === 'win32';

/**
 * Tools to scan for (name, detection command, version command)
 */
const TOOL_DEFINITIONS = [
  { id: 'git', versionCmd: 'git --version', versionRegex: /git version ([\d.]+)/ },
  { id: 'node', versionCmd: 'node --version', versionRegex: /v?([\d.]+)/ },
  { id: 'npm', versionCmd: 'npm --version', versionRegex: /([\d.]+)/ },
  { id: 'python', versionCmd: 'python3 --version || python --version', versionRegex: /Python ([\d.]+)/ },
  { id: 'docker', versionCmd: 'docker --version', versionRegex: /Docker version ([\d.]+)/ },
  { id: 'claude', versionCmd: 'claude --version', versionRegex: /([\d.]+)/ },
  { id: 'gemini', versionCmd: 'gemini --version', versionRegex: /([\d.]+)/ },
  { id: 'aws', versionCmd: 'aws --version', versionRegex: /aws-cli\/([\d.]+)/ },
  { id: 'gh', versionCmd: 'gh --version', versionRegex: /gh version ([\d.]+)/ },
  { id: 'code', versionCmd: 'code --version', versionRegex: /([\d.]+)/ },
  { id: 'curl', versionCmd: 'curl --version', versionRegex: /curl ([\d.]+)/ },
  { id: 'ffmpeg', versionCmd: 'ffmpeg -version', versionRegex: /ffmpeg version ([\d.]+)/ },
  { id: 'opencode', versionCmd: 'opencode --version', versionRegex: /([\d.]+)/ },
  { id: 'ollama', versionCmd: 'ollama --version', versionRegex: /ollama version ([\d.]+)/i },
  { id: 'lmstudio', versionCmd: 'lms version', versionRegex: /([\d.]+)/ },
];

/**
 * Check if a tool exists and get its version
 */
function checkTool(toolDef) {
  try {
    const output = execSync(toolDef.versionCmd, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    }).trim();

    const match = output.match(toolDef.versionRegex);
    const version = match ? match[1] : 'unknown';

    // Try to get the path
    let toolPath = null;
    try {
      const whichCmd = isWindows ? `where ${toolDef.id}` : `which ${toolDef.id}`;
      toolPath = execSync(whichCmd, {
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim().split('\n')[0].trim();
    } catch { /* path detection optional */ }

    return {
      installed: true,
      version,
      path: toolPath,
    };
  } catch {
    return {
      installed: false,
      version: null,
      path: null,
    };
  }
}

/**
 * Scan all known tools and return a registry object
 */
function scanTools() {
  const registry = {};

  for (const toolDef of TOOL_DEFINITIONS) {
    registry[toolDef.id] = checkTool(toolDef);
  }

  return registry;
}

module.exports = { scanTools, TOOL_DEFINITIONS };
