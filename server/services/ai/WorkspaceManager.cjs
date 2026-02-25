/**
 * Workspace Manager
 *
 * Manages agentic workspaces for CLI AI execution.
 * Creates isolated directories with context files and guides.
 */

const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');
const os = require('os');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Detect cliuser for workspace ownership (Linux/Docker only)
let _cliUserUid = null;
let _cliUserGid = null;
if (os.platform() !== 'win32') {
  try {
    _cliUserUid = parseInt(execSync('id -u cliuser 2>/dev/null').toString().trim());
    _cliUserGid = parseInt(execSync('id -g cliuser 2>/dev/null').toString().trim());
    if (isNaN(_cliUserUid) || isNaN(_cliUserGid)) {
      _cliUserUid = null;
      _cliUserGid = null;
    }
  } catch { /* cliuser not available */ }
}

/**
 * Workspace status types
 */
const WORKSPACE_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
};

/**
 * Default workspace structure
 */
const WORKSPACE_STRUCTURE = [
  'knowledge',
  'logs',
  'custom/tools',
  'output',
];

class WorkspaceManager {
  constructor(config = {}) {
    this.baseDir = config.baseDir || path.join(process.cwd(), 'data', 'workspaces');
    this.templatesDir = config.templatesDir || path.join(process.cwd(), 'server', 'templates');
  }

  /**
   * Create a new workspace
   * @param {string} userId - User ID
   * @param {string} agentId - Agent ID (optional)
   * @param {string} cliType - CLI type for context files
   * @returns {Promise<Object>}
   */
  async createWorkspace(userId, agentId, cliType = 'claude') {
    const workspaceId = agentId || uuidv4();
    const workspacePath = path.join(this.baseDir, userId, workspaceId);

    // Create directory structure
    await fs.mkdir(workspacePath, { recursive: true });

    for (const dir of WORKSPACE_STRUCTURE) {
      await fs.mkdir(path.join(workspacePath, dir), { recursive: true });
    }

    // Create CLI home directories (CLI tools expect $HOME/.local, $HOME/.config, etc.)
    for (const homeDir of ['.local/share', '.local/cache', '.config', '.cache']) {
      await fs.mkdir(path.join(workspacePath, homeDir), { recursive: true });
    }

    // Copy guide files based on CLI type
    await this.copyGuideFiles(workspacePath, cliType);

    // Create context file
    await this.createContextFile(workspacePath, cliType, { userId, workspaceId });

    // Chown workspace to cliuser if running in Docker (so CLI tools can write to it)
    if (_cliUserUid !== null && _cliUserGid !== null) {
      try {
        await this._chownRecursive(workspacePath, _cliUserUid, _cliUserGid);
      } catch (e) {
        logger.warn(`[WorkspaceManager] Failed to chown workspace to cliuser: ${e.message}`);
      }
    }

    // Save to database
    const workspace = {
      id: workspaceId,
      userId,
      path: workspacePath,
      cliType,
      status: WORKSPACE_STATUS.ACTIVE,
      createdAt: new Date().toISOString(),
    };

    this.saveWorkspaceToDb(workspace);

    logger.info(`Created workspace ${workspaceId} for user ${userId} with CLI type ${cliType}`);

    return workspace;
  }

  /**
   * Get an existing workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object|null>}
   */
  async getWorkspace(workspaceId) {
    try {
      const db = getDatabase();

      const workspace = db.prepare(`
        SELECT * FROM agentic_workspaces WHERE id = ?
      `).get(workspaceId);

      if (!workspace) return null;

      return {
        id: workspace.id,
        userId: workspace.user_id,
        path: workspace.workspace_path,
        cliType: workspace.cli_type,
        status: workspace.status,
        createdAt: workspace.created_at,
      };
    } catch (error) {
      logger.warn(`Could not get workspace from DB: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all workspaces for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object[]>}
   */
  async getUserWorkspaces(userId) {
    try {
      const db = getDatabase();

      const workspaces = db.prepare(`
        SELECT * FROM agentic_workspaces
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC
      `).all(userId);

      return workspaces.map(w => ({
        id: w.id,
        userId: w.user_id,
        path: w.workspace_path,
        cliType: w.cli_type,
        status: w.status,
        createdAt: w.created_at,
      }));
    } catch (error) {
      logger.warn(`Could not get user workspaces: ${error.message}`);
      return [];
    }
  }

  /**
   * Copy guide files to workspace
   * @param {string} workspacePath - Workspace path
   * @param {string} cliType - CLI type
   */
  async copyGuideFiles(workspacePath, cliType) {
    const guides = {
      claude: 'claude-guide.md',
      gemini: 'gemini-guide.md',
      opencode: 'opencode-guide.md',
    };

    const guideFile = guides[cliType] || guides.claude;
    const sourcePath = path.join(this.templatesDir, guideFile);
    const destPath = path.join(workspacePath, guideFile);

    try {
      await fs.access(sourcePath);
      await fs.copyFile(sourcePath, destPath);
      logger.debug(`Copied guide file ${guideFile} to workspace`);
    } catch {
      // Template doesn't exist, create a default guide
      await this.createDefaultGuide(destPath, cliType);
    }

    // Also copy common guides
    const commonGuides = ['guide-rag.md', 'guide-flows.md', 'guide-swarm.md', 'guide-tools.md'];

    for (const guide of commonGuides) {
      const src = path.join(this.templatesDir, guide);
      const dest = path.join(workspacePath, guide);

      try {
        await fs.access(src);
        await fs.copyFile(src, dest);
      } catch {
        // Template doesn't exist, skip
      }
    }
  }

  /**
   * Create default guide file
   * @param {string} filePath - Guide file path
   * @param {string} cliType - CLI type
   */
  async createDefaultGuide(filePath, cliType) {
    const guides = {
      claude: `# Claude CLI Workspace Guide

## Available APIs

### RAG Knowledge Base
- POST /api/knowledge/query - Semantic search
- POST /api/knowledge/ingest - Add documents
- GET /api/knowledge/libraries - List libraries

### Flow Automation
- POST /api/flows/:id/execute - Run workflows
- GET /api/flows - List available flows

### Swarm Collaboration
- POST /api/swarm/tasks - Create distributed tasks
- POST /api/swarm/broadcast - Message all agents

## Your Capabilities
1. Execute complex multi-step tasks
2. Access knowledge base for context
3. Trigger automated workflows
4. Collaborate with other agents

## Best Practices
- Break complex tasks into subtasks
- Use RAG for factual accuracy
- Leverage flows for repetitive operations
`,
      gemini: `# Gemini CLI Workspace Guide

## Available APIs

### RAG Knowledge Base
- POST /api/knowledge/query - Semantic search
- POST /api/knowledge/ingest - Add documents

### Flow Automation
- POST /api/flows/:id/execute - Run workflows

### Swarm Collaboration
- POST /api/swarm/tasks - Create distributed tasks

## Gemini Capabilities
1. Multi-modal processing (text, images)
2. Long context understanding
3. Code generation and analysis
4. Research and reasoning

## Free Tier Usage
- Leverage free model for cost efficiency
- Ideal for code tasks and analysis
`,
      opencode: `# OpenCode CLI Workspace Guide

## Available APIs

### RAG Knowledge Base
- POST /api/knowledge/query - Semantic search

### Flow Automation
- POST /api/flows/:id/execute - Run workflows

## OpenCode Capabilities
1. Code generation and editing
2. Agentic automation
3. Free AI usage

## Usage Notes
- Optimized for code tasks
- Uses free AI models
- Ideal for automation scripts
`,
    };

    const content = guides[cliType] || guides.claude;
    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Create context file (CLAUDE.md, GEMINI.md, etc.)
   * @param {string} workspacePath - Workspace path
   * @param {string} cliType - CLI type
   * @param {Object} context - Context data
   */
  async createContextFile(workspacePath, cliType, context) {
    const contextFiles = {
      claude: 'CLAUDE.md',
      gemini: 'GEMINI.md',
      opencode: 'OPENCODE.md',
    };

    const fileName = contextFiles[cliType] || 'CLAUDE.md';
    const filePath = path.join(workspacePath, fileName);

    const content = `# ${cliType.charAt(0).toUpperCase() + cliType.slice(1)} CLI Context

## Workspace Information
- **Workspace ID**: ${context.workspaceId}
- **User ID**: ${context.userId}
- **Created**: ${new Date().toISOString()}

## API Access
You have access to the SwarmAI API for:
- Knowledge base queries (RAG)
- Flow automation
- Swarm collaboration
- Custom tool execution

## API Base URL
\`\`\`
http://localhost:3031/api
\`\`\`

## Authentication
Use the workspace token for API requests:
\`\`\`
Authorization: Bearer <workspace-token>
\`\`\`

## Available Guides
- ${cliType}-guide.md - CLI-specific guide
- guide-rag.md - RAG knowledge base usage
- guide-flows.md - Flow automation
- guide-swarm.md - Swarm collaboration
- guide-tools.md - Custom tool creation

## Output Directory
Save your outputs to the \`output/\` directory.

## Document Generation
When asked to create documents, save them to the \`output/\` directory.
Name files descriptively (e.g., \`sales-report.pdf\`, \`data-export.xlsx\`).
The system will detect files in output/ and make them available for delivery.

Supported formats:
- **PDF**: Save as \`.pdf\` (HTML or plain text content)
- **Excel**: Save as \`.xlsx\` (tabular data)
- **CSV**: Save as \`.csv\` (comma-separated values)

## Logs
Execution logs are stored in the \`logs/\` directory.
`;

    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Update workspace context file
   * @param {string} workspaceId - Workspace ID
   * @param {Object} updates - Updates to apply
   */
  async updateContextFile(workspaceId, updates) {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const contextFiles = {
      claude: 'CLAUDE.md',
      gemini: 'GEMINI.md',
      opencode: 'OPENCODE.md',
    };

    const fileName = contextFiles[workspace.cliType] || 'CLAUDE.md';
    const filePath = path.join(workspace.path, fileName);

    try {
      let content = await fs.readFile(filePath, 'utf8');

      // Append updates
      if (updates.append) {
        content += `\n\n${updates.append}`;
      }

      // Add custom sections
      if (updates.customSections) {
        for (const [title, sectionContent] of Object.entries(updates.customSections)) {
          content += `\n\n## ${title}\n${sectionContent}`;
        }
      }

      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      logger.warn(`Could not update context file: ${error.message}`);
    }
  }

  /**
   * Archive a workspace
   * @param {string} workspaceId - Workspace ID
   */
  async archiveWorkspace(workspaceId) {
    try {
      const db = getDatabase();

      db.prepare(`
        UPDATE agentic_workspaces
        SET status = 'archived', updated_at = datetime('now')
        WHERE id = ?
      `).run(workspaceId);

      logger.info(`Archived workspace ${workspaceId}`);
    } catch (error) {
      logger.warn(`Could not archive workspace: ${error.message}`);
    }
  }

  /**
   * Delete a workspace (soft delete)
   * @param {string} workspaceId - Workspace ID
   */
  async deleteWorkspace(workspaceId) {
    try {
      const db = getDatabase();

      db.prepare(`
        UPDATE agentic_workspaces
        SET status = 'deleted', updated_at = datetime('now')
        WHERE id = ?
      `).run(workspaceId);

      logger.info(`Deleted workspace ${workspaceId}`);
    } catch (error) {
      logger.warn(`Could not delete workspace: ${error.message}`);
    }
  }

  /**
   * Write file to workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} relativePath - Relative file path
   * @param {string} content - File content
   */
  async writeFile(workspaceId, relativePath, content) {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const filePath = path.join(workspace.path, relativePath);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');

    return filePath;
  }

  /**
   * Read file from workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} relativePath - Relative file path
   * @returns {Promise<string>}
   */
  async readFile(workspaceId, relativePath) {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const filePath = path.join(workspace.path, relativePath);
    return await fs.readFile(filePath, 'utf8');
  }

  /**
   * List files in workspace directory
   * @param {string} workspaceId - Workspace ID
   * @param {string} relativePath - Relative directory path
   * @returns {Promise<string[]>}
   */
  async listFiles(workspaceId, relativePath = '') {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const dirPath = path.join(workspace.path, relativePath);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(relativePath, entry.name),
    }));
  }

  /**
   * Save workspace to database
   * @param {Object} workspace - Workspace object
   */
  saveWorkspaceToDb(workspace) {
    try {
      const db = getDatabase();

      db.prepare(`
        INSERT INTO agentic_workspaces (
          id, user_id, workspace_path, cli_type, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          workspace_path = excluded.workspace_path,
          cli_type = excluded.cli_type,
          status = excluded.status,
          updated_at = datetime('now')
      `).run(
        workspace.id,
        workspace.userId,
        workspace.path,
        workspace.cliType,
        workspace.status,
        workspace.createdAt
      );
    } catch (error) {
      logger.debug(`Could not save workspace to DB: ${error.message}`);
    }
  }

  /**
   * Clean up old/deleted workspaces
   * @param {number} olderThanDays - Delete workspaces older than this many days
   */
  async cleanupWorkspaces(olderThanDays = 30) {
    try {
      const db = getDatabase();

      const oldWorkspaces = db.prepare(`
        SELECT * FROM agentic_workspaces
        WHERE status = 'deleted'
        AND datetime(updated_at) < datetime('now', '-${olderThanDays} days')
      `).all();

      for (const workspace of oldWorkspaces) {
        // Remove directory
        try {
          await fs.rm(workspace.workspace_path, { recursive: true, force: true });
        } catch {
          // Directory may already be deleted
        }

        // Remove from database
        db.prepare('DELETE FROM agentic_workspaces WHERE id = ?').run(workspace.id);
      }

      if (oldWorkspaces.length > 0) {
        logger.info(`Cleaned up ${oldWorkspaces.length} old workspaces`);
      }
    } catch (error) {
      logger.warn(`Could not cleanup workspaces: ${error.message}`);
    }
  }

  /**
   * Recursively chown a directory to the specified uid/gid.
   * Uses execSync for simplicity (runs once at workspace creation).
   * @private
   */
  async _chownRecursive(dirPath, uid, gid) {
    try {
      execSync(`chown -R ${uid}:${gid} "${dirPath}"`, { timeout: 10000 });
    } catch (e) {
      // Fall back to node fs.chown on the top-level directory
      await fs.chown(dirPath, uid, gid);
    }
  }
}

// Singleton instance
let workspaceManagerInstance = null;

function getWorkspaceManager(config = {}) {
  if (!workspaceManagerInstance) {
    workspaceManagerInstance = new WorkspaceManager(config);
  }
  return workspaceManagerInstance;
}

module.exports = {
  WorkspaceManager,
  getWorkspaceManager,
  WORKSPACE_STATUS,
};
