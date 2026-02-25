/**
 * Flow Version Service
 * ====================
 * Manages flow versions with commit history, rollback support,
 * and diff visualization.
 *
 * Features:
 * - Auto-versioning on save (configurable interval)
 * - Named versions (commits) with messages
 * - Rollback to any previous version
 * - Version comparison (diff)
 * - Version pruning (retention policy)
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

/**
 * Version metadata
 * @typedef {Object} FlowVersion
 * @property {string} id - Version ID
 * @property {string} flowId - Flow ID
 * @property {number} version - Version number
 * @property {string} [name] - Optional version name
 * @property {string} [message] - Commit message
 * @property {Object} snapshot - Complete flow state snapshot
 * @property {string} createdBy - User who created the version
 * @property {Date} createdAt - Creation timestamp
 */

class FlowVersionService {
  constructor() {
    this.db = getDatabase();
    this.maxVersionsPerFlow = 50; // Default retention
    this.ensureTable();
  }

  /**
   * Ensure the flow_versions table exists
   * @private
   */
  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flow_versions (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        name TEXT,
        message TEXT,
        snapshot TEXT NOT NULL,
        nodes_count INTEGER DEFAULT 0,
        edges_count INTEGER DEFAULT 0,
        checksum TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_id ON flow_versions(flow_id);
      CREATE INDEX IF NOT EXISTS idx_flow_versions_version ON flow_versions(flow_id, version);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_versions_unique ON flow_versions(flow_id, version);
    `);
  }

  /**
   * Create a new version of a flow
   * @param {string} flowId - Flow ID
   * @param {string} userId - User ID
   * @param {Object} [options] - Version options
   * @param {string} [options.name] - Version name
   * @param {string} [options.message] - Commit message
   * @returns {FlowVersion}
   */
  async createVersion(flowId, userId, options = {}) {
    // Get the current flow state
    const flow = this.db.prepare(`
      SELECT * FROM flows WHERE id = ? AND user_id = ?
    `).get(flowId, userId);

    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    // Get the latest version number
    const lastVersion = this.db.prepare(`
      SELECT MAX(version) as maxVersion FROM flow_versions WHERE flow_id = ?
    `).get(flowId);

    const versionNumber = (lastVersion?.maxVersion || 0) + 1;

    // Parse nodes and edges for count
    const nodes = typeof flow.nodes === 'string' ? JSON.parse(flow.nodes) : (flow.nodes || []);
    const edges = typeof flow.edges === 'string' ? JSON.parse(flow.edges) : (flow.edges || []);

    // Create snapshot
    const snapshot = {
      name: flow.name,
      description: flow.description,
      nodes,
      edges,
      settings: flow.settings ? (typeof flow.settings === 'string' ? JSON.parse(flow.settings) : flow.settings) : {},
      status: flow.status,
      triggerType: flow.trigger_type,
    };

    // Calculate checksum for deduplication
    const checksum = this.calculateChecksum(snapshot);

    // Check if this is a duplicate of the last version
    const lastVersionData = this.db.prepare(`
      SELECT checksum FROM flow_versions
      WHERE flow_id = ? ORDER BY version DESC LIMIT 1
    `).get(flowId);

    if (lastVersionData?.checksum === checksum && !options.force) {
      logger.debug(`Skipping version creation - no changes detected for flow ${flowId}`);
      return this.getVersion(flowId, lastVersion.maxVersion, userId);
    }

    // Create version record
    const versionId = uuidv4();

    this.db.prepare(`
      INSERT INTO flow_versions (
        id, flow_id, version, name, message, snapshot,
        nodes_count, edges_count, checksum, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      flowId,
      versionNumber,
      options.name || null,
      options.message || null,
      JSON.stringify(snapshot),
      nodes.length,
      edges.length,
      checksum,
      userId
    );

    // Prune old versions if needed
    await this.pruneVersions(flowId);

    logger.info(`Created version ${versionNumber} for flow ${flowId}`);

    return {
      id: versionId,
      flowId,
      version: versionNumber,
      name: options.name,
      message: options.message,
      nodesCount: nodes.length,
      edgesCount: edges.length,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get a specific version of a flow
   * @param {string} flowId - Flow ID
   * @param {number} version - Version number
   * @param {string} userId - User ID
   * @returns {FlowVersion|null}
   */
  getVersion(flowId, version, userId) {
    // Verify ownership
    const flow = this.db.prepare(`
      SELECT id FROM flows WHERE id = ? AND user_id = ?
    `).get(flowId, userId);

    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const row = this.db.prepare(`
      SELECT * FROM flow_versions
      WHERE flow_id = ? AND version = ?
    `).get(flowId, version);

    if (!row) {
      return null;
    }

    return this.transformVersion(row);
  }

  /**
   * Get version history for a flow
   * @param {string} flowId - Flow ID
   * @param {string} userId - User ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=20] - Max versions to return
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {FlowVersion[]}
   */
  getVersionHistory(flowId, userId, options = {}) {
    // Verify ownership
    const flow = this.db.prepare(`
      SELECT id FROM flows WHERE id = ? AND user_id = ?
    `).get(flowId, userId);

    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const { limit = 20, offset = 0 } = options;

    const rows = this.db.prepare(`
      SELECT id, flow_id, version, name, message, nodes_count, edges_count, created_by, created_at
      FROM flow_versions
      WHERE flow_id = ?
      ORDER BY version DESC
      LIMIT ? OFFSET ?
    `).all(flowId, limit, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) as count FROM flow_versions WHERE flow_id = ?
    `).get(flowId);

    return {
      versions: rows.map(row => ({
        id: row.id,
        flowId: row.flow_id,
        version: row.version,
        name: row.name,
        message: row.message,
        nodesCount: row.nodes_count,
        edgesCount: row.edges_count,
        createdBy: row.created_by,
        createdAt: row.created_at,
      })),
      total: total.count,
      hasMore: offset + rows.length < total.count,
    };
  }

  /**
   * Rollback flow to a specific version
   * @param {string} flowId - Flow ID
   * @param {number} targetVersion - Version to rollback to
   * @param {string} userId - User ID
   * @param {Object} [options] - Rollback options
   * @param {boolean} [options.createBackup=true] - Create backup version before rollback
   * @returns {Object} Rollback result
   */
  async rollback(flowId, targetVersion, userId, options = {}) {
    const { createBackup = true } = options;

    // Get target version
    const version = this.getVersion(flowId, targetVersion, userId);
    if (!version) {
      throw new Error(`Version ${targetVersion} not found for flow ${flowId}`);
    }

    // Create backup of current state before rollback
    if (createBackup) {
      await this.createVersion(flowId, userId, {
        name: `Pre-rollback backup`,
        message: `Automatic backup before rollback to v${targetVersion}`,
        force: true,
      });
    }

    // Apply the snapshot to the flow
    const snapshot = version.snapshot;

    this.db.prepare(`
      UPDATE flows SET
        name = ?,
        description = ?,
        nodes = ?,
        edges = ?,
        settings = ?,
        status = ?,
        trigger_type = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      snapshot.name,
      snapshot.description || null,
      JSON.stringify(snapshot.nodes),
      JSON.stringify(snapshot.edges),
      snapshot.settings ? JSON.stringify(snapshot.settings) : null,
      snapshot.status,
      snapshot.triggerType,
      flowId,
      userId
    );

    logger.info(`Rolled back flow ${flowId} to version ${targetVersion}`);

    return {
      success: true,
      flowId,
      restoredVersion: targetVersion,
      backupCreated: createBackup,
      snapshot,
    };
  }

  /**
   * Compare two versions of a flow
   * @param {string} flowId - Flow ID
   * @param {number} versionA - First version
   * @param {number} versionB - Second version
   * @param {string} userId - User ID
   * @returns {Object} Diff result
   */
  compareVersions(flowId, versionA, versionB, userId) {
    const a = this.getVersion(flowId, versionA, userId);
    const b = this.getVersion(flowId, versionB, userId);

    if (!a || !b) {
      throw new Error('One or both versions not found');
    }

    const snapshotA = a.snapshot;
    const snapshotB = b.snapshot;

    // Compare nodes
    const nodesA = new Map(snapshotA.nodes.map(n => [n.id, n]));
    const nodesB = new Map(snapshotB.nodes.map(n => [n.id, n]));

    const addedNodes = [];
    const removedNodes = [];
    const modifiedNodes = [];

    // Find added and modified nodes
    for (const [id, node] of nodesB) {
      if (!nodesA.has(id)) {
        addedNodes.push({ id, type: node.type, label: node.data?.label });
      } else {
        const oldNode = nodesA.get(id);
        if (JSON.stringify(oldNode) !== JSON.stringify(node)) {
          modifiedNodes.push({
            id,
            type: node.type,
            label: node.data?.label,
            changes: this.diffObjects(oldNode, node),
          });
        }
      }
    }

    // Find removed nodes
    for (const [id, node] of nodesA) {
      if (!nodesB.has(id)) {
        removedNodes.push({ id, type: node.type, label: node.data?.label });
      }
    }

    // Compare edges
    const edgesA = new Set(snapshotA.edges.map(e => `${e.source}-${e.target}`));
    const edgesB = new Set(snapshotB.edges.map(e => `${e.source}-${e.target}`));

    const addedEdges = [...edgesB].filter(e => !edgesA.has(e));
    const removedEdges = [...edgesA].filter(e => !edgesB.has(e));

    // Compare settings
    const settingsChanged = JSON.stringify(snapshotA.settings) !== JSON.stringify(snapshotB.settings);

    return {
      versionA,
      versionB,
      nodes: {
        added: addedNodes,
        removed: removedNodes,
        modified: modifiedNodes,
      },
      edges: {
        added: addedEdges.length,
        removed: removedEdges.length,
        details: { added: addedEdges, removed: removedEdges },
      },
      settings: {
        changed: settingsChanged,
        diff: settingsChanged ? this.diffObjects(snapshotA.settings, snapshotB.settings) : null,
      },
      summary: {
        nodesAdded: addedNodes.length,
        nodesRemoved: removedNodes.length,
        nodesModified: modifiedNodes.length,
        edgesAdded: addedEdges.length,
        edgesRemoved: removedEdges.length,
        settingsChanged,
      },
    };
  }

  /**
   * Tag a version with a name
   * @param {string} flowId - Flow ID
   * @param {number} version - Version number
   * @param {string} name - Tag name
   * @param {string} userId - User ID
   */
  tagVersion(flowId, version, name, userId) {
    // Verify ownership
    const flow = this.db.prepare(`
      SELECT id FROM flows WHERE id = ? AND user_id = ?
    `).get(flowId, userId);

    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const result = this.db.prepare(`
      UPDATE flow_versions SET name = ?
      WHERE flow_id = ? AND version = ?
    `).run(name, flowId, version);

    if (result.changes === 0) {
      throw new Error(`Version ${version} not found`);
    }

    return { success: true, flowId, version, name };
  }

  /**
   * Delete a specific version
   * @param {string} flowId - Flow ID
   * @param {number} version - Version to delete
   * @param {string} userId - User ID
   */
  deleteVersion(flowId, version, userId) {
    // Verify ownership
    const flow = this.db.prepare(`
      SELECT id FROM flows WHERE id = ? AND user_id = ?
    `).get(flowId, userId);

    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    // Don't allow deleting the only version
    const count = this.db.prepare(`
      SELECT COUNT(*) as count FROM flow_versions WHERE flow_id = ?
    `).get(flowId);

    if (count.count <= 1) {
      throw new Error('Cannot delete the only version');
    }

    const result = this.db.prepare(`
      DELETE FROM flow_versions WHERE flow_id = ? AND version = ?
    `).run(flowId, version);

    return { success: result.changes > 0, flowId, version };
  }

  /**
   * Prune old versions based on retention policy
   * @private
   */
  async pruneVersions(flowId) {
    const count = this.db.prepare(`
      SELECT COUNT(*) as count FROM flow_versions WHERE flow_id = ?
    `).get(flowId);

    if (count.count <= this.maxVersionsPerFlow) {
      return;
    }

    // Keep named versions and the most recent N versions
    const toDelete = count.count - this.maxVersionsPerFlow;

    this.db.prepare(`
      DELETE FROM flow_versions
      WHERE flow_id = ? AND id IN (
        SELECT id FROM flow_versions
        WHERE flow_id = ? AND name IS NULL
        ORDER BY version ASC
        LIMIT ?
      )
    `).run(flowId, flowId, toDelete);

    logger.debug(`Pruned ${toDelete} old versions from flow ${flowId}`);
  }

  /**
   * Calculate checksum for deduplication
   * @private
   */
  calculateChecksum(snapshot) {
    const content = JSON.stringify({
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      settings: snapshot.settings,
    });

    // Simple hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Create a simple object diff
   * @private
   */
  diffObjects(a, b) {
    const changes = [];

    const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

    for (const key of allKeys) {
      const valA = a?.[key];
      const valB = b?.[key];

      if (JSON.stringify(valA) !== JSON.stringify(valB)) {
        changes.push({
          key,
          from: valA,
          to: valB,
        });
      }
    }

    return changes;
  }

  /**
   * Transform database row to version object
   * @private
   */
  transformVersion(row) {
    return {
      id: row.id,
      flowId: row.flow_id,
      version: row.version,
      name: row.name,
      message: row.message,
      snapshot: JSON.parse(row.snapshot),
      nodesCount: row.nodes_count,
      edgesCount: row.edges_count,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  /**
   * Set retention policy
   * @param {number} maxVersions - Max versions to keep per flow
   */
  setRetentionPolicy(maxVersions) {
    this.maxVersionsPerFlow = maxVersions;
  }
}

// Singleton instance
let _instance = null;

function getFlowVersionService() {
  if (!_instance) {
    _instance = new FlowVersionService();
  }
  return _instance;
}

module.exports = {
  FlowVersionService,
  getFlowVersionService,
};
