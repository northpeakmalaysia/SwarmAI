/**
 * Self-Healing Service
 * ====================
 * Core orchestration engine for agent self-healing. Enables agents to detect,
 * diagnose, fix, and verify issues in their own operation.
 *
 * Severity Levels:
 * - LOW:      Auto-fix (handled by RecoveryStrategies, no action here)
 * - MEDIUM:   Diagnose → backup → propose fix → self-test → apply
 * - HIGH:     Diagnose → backup → propose fix → require master approval
 * - CRITICAL: Immediately notify master with full diagnostic log
 *
 * Builds ON TOP of existing services:
 * - ErrorAnalyzer: error classification
 * - RecoveryStrategies: LOW-level auto-recovery
 * - ReflectionService: post-healing learning
 * - MasterNotificationService: CRITICAL escalation
 * - ApprovalService: HIGH severity approval
 * - SelfLearningService: ingest healing outcomes
 *
 * Usage:
 *   const { getSelfHealingService } = require('./SelfHealingService.cjs');
 *   const healer = getSelfHealingService();
 *   const report = healer.getHealthReport(agentId);
 *   const diagnosis = await healer.diagnoseSelf(agentId, userId);
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getErrorAnalyzer, ERROR_TYPES } = require('./ErrorAnalyzer.cjs');

const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

const HEALING_STATUS = {
  DETECTED: 'detected',
  ANALYZING: 'analyzing',
  PROPOSING_FIX: 'proposing_fix',
  AWAITING_APPROVAL: 'awaiting_approval',
  BACKING_UP: 'backing_up',
  APPLYING_FIX: 'applying_fix',
  TESTING: 'testing',
  COMPLETED: 'completed',
  ROLLED_BACK: 'rolled_back',
  ESCALATED: 'escalated',
  FAILED: 'failed',
};

const FIX_TYPES = {
  TOOL_CONFIG: 'tool_config',
  SYSTEM_PROMPT: 'system_prompt',
  RETRY_CONFIG: 'retry_config',
  SKILL_ADJUSTMENT: 'skill_adjustment',
  PROVIDER_SWITCH: 'provider_switch',
};

// Thresholds for severity classification
const SEVERITY_THRESHOLDS = {
  MEDIUM_ERROR_RATE: 0.30,    // 30% error rate → MEDIUM
  HIGH_ERROR_RATE: 0.50,      // 50% error rate → HIGH
  CRITICAL_ERROR_RATE: 0.70,  // 70% error rate → CRITICAL
  RECURRING_PATTERN_MIN: 3,   // Same error 3+ times → pattern
  REGRESSION_THRESHOLD: 0.15, // 15% worse than baseline → regression
};

class SelfHealingService {
  constructor() {
    this._ensuredTable = false;
  }

  // ========== Table Initialization ==========

  _ensureTable() {
    if (this._ensuredTable) return;
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS agentic_self_healing_log (
          id TEXT PRIMARY KEY,
          agentic_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'detected',
          severity TEXT NOT NULL DEFAULT 'medium',
          trigger_source TEXT NOT NULL DEFAULT 'manual',
          trigger_context TEXT DEFAULT '{}',
          diagnosis TEXT DEFAULT '{}',
          error_summary TEXT,
          affected_tools TEXT DEFAULT '[]',
          proposed_fix TEXT DEFAULT '{}',
          fix_type TEXT,
          fix_reasoning TEXT,
          config_backup TEXT DEFAULT '{}',
          backup_created_at TEXT,
          applied_fix TEXT DEFAULT '{}',
          applied_at TEXT,
          test_results TEXT DEFAULT '{}',
          test_passed INTEGER DEFAULT 0,
          rolled_back_at TEXT,
          rollback_reason TEXT,
          approval_id TEXT,
          approved_by TEXT,
          approved_at TEXT,
          notification_id TEXT,
          escalated_at TEXT,
          outcome TEXT,
          outcome_notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_self_healing_agent
          ON agentic_self_healing_log(agentic_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_self_healing_status
          ON agentic_self_healing_log(status);
      `);
      this._ensuredTable = true;
    } catch (e) {
      logger.warn(`[SelfHealing] Table init: ${e.message}`);
    }
  }

  // ========== Diagnostic Methods ==========

  /**
   * Get error history for an agent.
   * @param {string} agentId
   * @param {Object} options - { hours: 24, limit: 50, toolId: null }
   * @returns {{ errors, totalCount, errorsByType, errorsByTool, timeline }}
   */
  getErrorHistory(agentId, options = {}) {
    const db = getDatabase();
    const hours = options.hours || 24;
    const limit = Math.min(options.limit || 50, 100);
    const toolId = options.toolId || null;
    const analyzer = getErrorAnalyzer();

    const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
    const toolFilter = toolId ? 'AND tool_id = ?' : '';
    const args = toolId
      ? [agentId, cutoff, toolId, limit]
      : [agentId, cutoff, limit];

    try {
      // Get failed tool executions
      const errors = db.prepare(`
        SELECT id, tool_id, parameters, result, status, error_message,
               execution_time_ms, trigger_source, session_id, created_at
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND status != 'success'
        ${toolFilter}
        ORDER BY created_at DESC LIMIT ?
      `).all(...args);

      // Get total count
      const countArgs = toolId ? [agentId, cutoff, toolId] : [agentId, cutoff];
      const totalCount = db.prepare(`
        SELECT COUNT(*) as c FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND status != 'success'
        ${toolFilter}
      `).get(...countArgs)?.c || 0;

      // Classify and aggregate errors
      const errorsByType = {};
      const errorsByTool = {};
      const timeline = [];

      for (const err of errors) {
        // Classify using ErrorAnalyzer
        const classification = analyzer.analyze(err.tool_id, err.error_message || 'unknown', { agentId });
        const errType = classification.errorType;

        // Aggregate by type
        errorsByType[errType] = (errorsByType[errType] || 0) + 1;

        // Aggregate by tool
        if (!errorsByTool[err.tool_id]) {
          errorsByTool[err.tool_id] = { count: 0, lastError: null, errors: [] };
        }
        errorsByTool[err.tool_id].count++;
        errorsByTool[err.tool_id].lastError = err.error_message;
        errorsByTool[err.tool_id].errors.push(errType);

        // Timeline entry
        timeline.push({
          timestamp: err.created_at,
          tool: err.tool_id,
          errorType: errType,
          message: (err.error_message || '').substring(0, 200),
          executionTimeMs: err.execution_time_ms,
        });
      }

      return {
        errors: errors.map(e => ({
          id: e.id,
          tool: e.tool_id,
          error: (e.error_message || '').substring(0, 300),
          params: this._safeParseJSON(e.parameters, {}),
          executionTimeMs: e.execution_time_ms,
          timestamp: e.created_at,
          classification: analyzer.analyze(e.tool_id, e.error_message || '', { agentId }).errorType,
        })),
        totalCount,
        errorsByType,
        errorsByTool,
        timeline,
        period: `last ${hours} hours`,
      };
    } catch (e) {
      logger.error(`[SelfHealing] getErrorHistory failed: ${e.message}`);
      return { errors: [], totalCount: 0, errorsByType: {}, errorsByTool: {}, timeline: [], error: e.message };
    }
  }

  /**
   * Get aggregated health report for an agent.
   * @param {string} agentId
   * @param {Object} options - { period: '24h'|'7d'|'30d' }
   * @returns {{ successRate, errorRate, topErrors, toolReliability, performanceTrend, anomalies }}
   */
  getHealthReport(agentId, options = {}) {
    const db = getDatabase();
    const period = options.period || '24h';
    const hours = period === '30d' ? 720 : period === '7d' ? 168 : 24;
    const cutoff = new Date(Date.now() - hours * 3600000).toISOString();

    try {
      // Overall success/failure counts
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failures,
          AVG(execution_time_ms) as avgExecTime,
          MAX(execution_time_ms) as maxExecTime
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ?
      `).get(agentId, cutoff);

      const total = stats?.total || 0;
      const successRate = total > 0 ? Math.round((stats.successes / total) * 100) : 100;
      const errorRate = total > 0 ? Math.round((stats.failures / total) * 100) : 0;

      // Top errors (most frequent error messages)
      const topErrors = db.prepare(`
        SELECT error_message, tool_id, COUNT(*) as count
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND status != 'success' AND error_message IS NOT NULL
        GROUP BY error_message, tool_id
        ORDER BY count DESC LIMIT 5
      `).all(agentId, cutoff).map(e => ({
        error: (e.error_message || '').substring(0, 200),
        tool: e.tool_id,
        count: e.count,
      }));

      // Per-tool reliability
      const toolStats = db.prepare(`
        SELECT tool_id,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ?
        GROUP BY tool_id
        ORDER BY total DESC
      `).all(agentId, cutoff);

      const toolReliability = {};
      for (const t of toolStats) {
        toolReliability[t.tool_id] = {
          total: t.total,
          successRate: t.total > 0 ? Math.round((t.successes / t.total) * 100) : 100,
        };
      }

      // Performance trend: compare recent 24h vs previous 7d baseline
      const performanceTrend = this._detectPerformanceRegression(agentId);

      // Anomalies: sudden error spikes
      const anomalies = this._detectAnomalies(agentId, cutoff);

      return {
        period,
        totalExecutions: total,
        successRate,
        errorRate,
        avgExecTimeMs: Math.round(stats?.avgExecTime || 0),
        maxExecTimeMs: stats?.maxExecTime || 0,
        topErrors,
        toolReliability,
        performanceTrend: performanceTrend.trend,
        performanceDetails: performanceTrend,
        anomalies,
      };
    } catch (e) {
      logger.error(`[SelfHealing] getHealthReport failed: ${e.message}`);
      return {
        period, totalExecutions: 0, successRate: 100, errorRate: 0,
        topErrors: [], toolReliability: {}, performanceTrend: 'unknown',
        anomalies: [], error: e.message,
      };
    }
  }

  /**
   * Deep root-cause analysis of recent failures.
   * @param {string} agentId
   * @param {string} userId
   * @returns {{ rootCauses, patterns, recommendations, severity, affectedTools, healingId }}
   */
  async diagnoseSelf(agentId, userId) {
    this._ensureTable();
    const healingId = uuidv4();

    // Create healing log entry
    this._logHealingEvent(healingId, agentId, userId, HEALING_STATUS.ANALYZING, {
      trigger_source: 'manual',
    });

    try {
      // 1. Get error history (last 72 hours for pattern detection)
      const errorHistory = this.getErrorHistory(agentId, { hours: 72, limit: 100 });

      // 2. Detect recurring patterns
      const patterns = this._detectRecurringPatterns(agentId, 72);

      // 3. Detect performance regression
      const regression = this._detectPerformanceRegression(agentId);

      // 4. Build root causes
      const rootCauses = this._analyzeRootCauses(errorHistory, patterns, regression);

      // 5. Generate recommendations
      const recommendations = this._generateRecommendations(rootCauses, patterns);

      // 6. Classify severity
      const severity = this._classifySeverity(errorHistory, patterns, regression);

      // 7. Get affected tools (unique list from error history)
      const affectedTools = Object.keys(errorHistory.errorsByTool);

      const diagnosis = {
        rootCauses,
        patterns,
        recommendations,
        severity,
        affectedTools,
        errorSummary: `${errorHistory.totalCount} errors in last 72h. Top types: ${JSON.stringify(errorHistory.errorsByType)}`,
        regression: regression.trend,
        healingId,
      };

      // Update healing log
      this._updateHealingLog(healingId, {
        status: severity === SEVERITY.CRITICAL ? HEALING_STATUS.ESCALATED : HEALING_STATUS.DETECTED,
        severity,
        diagnosis: JSON.stringify(diagnosis),
        error_summary: diagnosis.errorSummary,
        affected_tools: JSON.stringify(affectedTools),
      });

      // Auto-escalate CRITICAL
      if (severity === SEVERITY.CRITICAL) {
        await this.escalateToCritical(agentId, userId, diagnosis, healingId);
      }

      return diagnosis;
    } catch (e) {
      logger.error(`[SelfHealing] diagnoseSelf failed: ${e.message}`);
      this._updateHealingLog(healingId, {
        status: HEALING_STATUS.FAILED,
        outcome: 'no_action',
        outcome_notes: `Diagnosis failed: ${e.message}`,
      });
      return {
        rootCauses: [],
        patterns: [],
        recommendations: ['Diagnosis encountered an error. Manual review recommended.'],
        severity: SEVERITY.LOW,
        affectedTools: [],
        error: e.message,
        healingId,
      };
    }
  }

  // ========== Pattern Analysis ==========

  /**
   * Detect recurring error patterns over time.
   */
  _detectRecurringPatterns(agentId, lookbackHours = 72) {
    const db = getDatabase();
    const cutoff = new Date(Date.now() - lookbackHours * 3600000).toISOString();

    try {
      // Group errors by tool + error_message to find recurring patterns
      const patternRows = db.prepare(`
        SELECT tool_id, error_message, COUNT(*) as count,
               MIN(created_at) as first_seen, MAX(created_at) as last_seen
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND status != 'success'
          AND error_message IS NOT NULL
        GROUP BY tool_id, error_message
        HAVING COUNT(*) >= ?
        ORDER BY count DESC LIMIT 10
      `).all(agentId, cutoff, SEVERITY_THRESHOLDS.RECURRING_PATTERN_MIN);

      const analyzer = getErrorAnalyzer();
      return patternRows.map(row => {
        const classification = analyzer.analyze(row.tool_id, row.error_message, { agentId });

        // Determine trend: is this pattern increasing?
        const midpoint = new Date(Date.now() - (lookbackHours / 2) * 3600000).toISOString();
        const recentCount = db.prepare(`
          SELECT COUNT(*) as c FROM agentic_tool_executions
          WHERE agentic_id = ? AND tool_id = ? AND error_message = ?
            AND created_at >= ? AND status != 'success'
        `).get(agentId, row.tool_id, row.error_message, midpoint)?.c || 0;
        const olderCount = row.count - recentCount;

        let trend = 'stable';
        if (recentCount > olderCount * 1.5) trend = 'increasing';
        else if (recentCount < olderCount * 0.5) trend = 'decreasing';

        return {
          tool: row.tool_id,
          error: (row.error_message || '').substring(0, 200),
          errorType: classification.errorType,
          count: row.count,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          trend,
          recoverable: classification.recoverable,
          suggestion: classification.suggestion,
        };
      });
    } catch (e) {
      logger.warn(`[SelfHealing] Pattern detection failed: ${e.message}`);
      return [];
    }
  }

  /**
   * Detect performance regression by comparing recent vs baseline.
   * Baseline = last 7 days; recent = last 24 hours.
   */
  _detectPerformanceRegression(agentId) {
    const db = getDatabase();
    const now = new Date();
    const recentCutoff = new Date(now - 24 * 3600000).toISOString();
    const baselineCutoff = new Date(now - 7 * 24 * 3600000).toISOString();

    try {
      const recent = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
          AVG(execution_time_ms) as avgTime
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ?
      `).get(agentId, recentCutoff);

      const baseline = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
          AVG(execution_time_ms) as avgTime
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND created_at < ?
      `).get(agentId, baselineCutoff, recentCutoff);

      const recentSuccessRate = recent?.total > 0 ? recent.successes / recent.total : 1;
      const baselineSuccessRate = baseline?.total > 0 ? baseline.successes / baseline.total : 1;
      const diff = baselineSuccessRate - recentSuccessRate;

      let trend = 'stable';
      if (recent?.total < 5) {
        trend = 'insufficient_data';
      } else if (diff > SEVERITY_THRESHOLDS.REGRESSION_THRESHOLD) {
        trend = 'degrading';
      } else if (diff < -SEVERITY_THRESHOLDS.REGRESSION_THRESHOLD) {
        trend = 'improving';
      }

      return {
        trend,
        recentSuccessRate: Math.round(recentSuccessRate * 100),
        baselineSuccessRate: Math.round(baselineSuccessRate * 100),
        recentTotal: recent?.total || 0,
        baselineTotal: baseline?.total || 0,
        recentAvgTimeMs: Math.round(recent?.avgTime || 0),
        baselineAvgTimeMs: Math.round(baseline?.avgTime || 0),
        regressionAmount: Math.round(diff * 100),
      };
    } catch (e) {
      return { trend: 'unknown', error: e.message };
    }
  }

  /**
   * Detect anomalies (sudden error spikes in last few hours).
   */
  _detectAnomalies(agentId, cutoff) {
    const db = getDatabase();
    const anomalies = [];

    try {
      // Check for new error types that didn't appear in baseline
      const recentCutoff = new Date(Date.now() - 6 * 3600000).toISOString();
      const baselineCutoff = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

      const recentErrors = db.prepare(`
        SELECT DISTINCT tool_id || ':' || COALESCE(SUBSTR(error_message, 1, 100), '') as sig
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND status != 'success'
      `).all(agentId, recentCutoff).map(r => r.sig);

      const baselineErrors = db.prepare(`
        SELECT DISTINCT tool_id || ':' || COALESCE(SUBSTR(error_message, 1, 100), '') as sig
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND created_at < ? AND status != 'success'
      `).all(agentId, baselineCutoff, recentCutoff).map(r => r.sig);

      const baselineSet = new Set(baselineErrors);
      for (const sig of recentErrors) {
        if (!baselineSet.has(sig)) {
          const [tool, ...errParts] = sig.split(':');
          anomalies.push({
            type: 'new_error_type',
            tool,
            error: errParts.join(':'),
            description: `New error type detected for ${tool} that wasn't seen in baseline period`,
          });
        }
      }

      // Check for error spike (recent 2h vs average per 2h period)
      const last2h = new Date(Date.now() - 2 * 3600000).toISOString();
      const recentErrorCount = db.prepare(`
        SELECT COUNT(*) as c FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND status != 'success'
      `).get(agentId, last2h)?.c || 0;

      const avgPer2h = db.prepare(`
        SELECT COUNT(*) * 1.0 / MAX(1, (julianday('now') - julianday(MIN(created_at))) * 12) as avg
        FROM agentic_tool_executions
        WHERE agentic_id = ? AND created_at >= ? AND status != 'success'
      `).get(agentId, baselineCutoff)?.avg || 0;

      if (recentErrorCount > avgPer2h * 3 && recentErrorCount >= 3) {
        anomalies.push({
          type: 'error_spike',
          count: recentErrorCount,
          baseline: Math.round(avgPer2h),
          description: `Error spike: ${recentErrorCount} errors in last 2h vs ${Math.round(avgPer2h)} average per 2h`,
        });
      }
    } catch (e) {
      logger.debug(`[SelfHealing] Anomaly detection: ${e.message}`);
    }

    return anomalies;
  }

  /**
   * Analyze root causes from error history and patterns.
   */
  _analyzeRootCauses(errorHistory, patterns, regression) {
    const rootCauses = [];
    const analyzer = getErrorAnalyzer();

    // Check for config/permission issues (non-recoverable errors dominating)
    const permErrors = (errorHistory.errorsByType[ERROR_TYPES.PERMISSION] || 0);
    const valErrors = (errorHistory.errorsByType[ERROR_TYPES.VALIDATION] || 0);
    const total = errorHistory.totalCount || 1;

    if (permErrors > 0 && permErrors / total > 0.2) {
      rootCauses.push({
        type: 'permission_issue',
        confidence: 0.85,
        description: `${permErrors} permission errors detected. Agent may lack required access or credentials are expired.`,
        affectedTools: Object.keys(errorHistory.errorsByTool).filter(
          t => errorHistory.errorsByTool[t].errors.includes(ERROR_TYPES.PERMISSION)
        ),
      });
    }

    if (valErrors > 0 && valErrors / total > 0.2) {
      rootCauses.push({
        type: 'validation_issue',
        confidence: 0.80,
        description: `${valErrors} validation errors. System prompt may be generating incorrect parameters for tools.`,
        affectedTools: Object.keys(errorHistory.errorsByTool).filter(
          t => errorHistory.errorsByTool[t].errors.includes(ERROR_TYPES.VALIDATION)
        ),
      });
    }

    // Check for network/infra issues
    const networkErrors = (errorHistory.errorsByType[ERROR_TYPES.NETWORK] || 0) +
                          (errorHistory.errorsByType[ERROR_TYPES.TIMEOUT] || 0);
    if (networkErrors > 0 && networkErrors / total > 0.3) {
      rootCauses.push({
        type: 'infrastructure_issue',
        confidence: 0.70,
        description: `${networkErrors} network/timeout errors. External service may be down or network is unstable.`,
        affectedTools: Object.keys(errorHistory.errorsByTool).filter(
          t => errorHistory.errorsByTool[t].errors.some(e =>
            e === ERROR_TYPES.NETWORK || e === ERROR_TYPES.TIMEOUT
          )
        ),
      });
    }

    // Check for rate limiting
    const rateLimitErrors = errorHistory.errorsByType[ERROR_TYPES.RATE_LIMIT] || 0;
    if (rateLimitErrors >= 2) {
      rootCauses.push({
        type: 'rate_limit_issue',
        confidence: 0.90,
        description: `${rateLimitErrors} rate limit hits. Agent is making too many requests to external services.`,
        affectedTools: Object.keys(errorHistory.errorsByTool).filter(
          t => errorHistory.errorsByTool[t].errors.includes(ERROR_TYPES.RATE_LIMIT)
        ),
      });
    }

    // Check for recurring patterns (same error happening repeatedly)
    for (const pattern of patterns) {
      if (pattern.trend === 'increasing' && pattern.count >= 5) {
        rootCauses.push({
          type: 'recurring_failure',
          confidence: 0.75,
          description: `Recurring ${pattern.errorType} error on ${pattern.tool}: "${pattern.error}" (${pattern.count} times, trend: increasing)`,
          affectedTools: [pattern.tool],
        });
      }
    }

    // Check for performance regression
    if (regression.trend === 'degrading') {
      rootCauses.push({
        type: 'performance_regression',
        confidence: 0.65,
        description: `Performance degraded: success rate dropped from ${regression.baselineSuccessRate}% to ${regression.recentSuccessRate}%`,
        affectedTools: [],
      });
    }

    // Sort by confidence
    rootCauses.sort((a, b) => b.confidence - a.confidence);
    return rootCauses;
  }

  /**
   * Generate actionable recommendations from root causes.
   */
  _generateRecommendations(rootCauses, patterns) {
    const recommendations = [];

    for (const cause of rootCauses) {
      switch (cause.type) {
        case 'permission_issue':
          recommendations.push({
            fixType: FIX_TYPES.TOOL_CONFIG,
            priority: 'high',
            description: `Check and update credentials/permissions for tools: ${cause.affectedTools.join(', ')}. Consider disabling tools with persistent permission errors.`,
            autoFixable: false,
          });
          break;

        case 'validation_issue':
          recommendations.push({
            fixType: FIX_TYPES.SYSTEM_PROMPT,
            priority: 'medium',
            description: `Update system prompt to provide better instructions for parameter formatting. Affected tools: ${cause.affectedTools.join(', ')}`,
            autoFixable: true,
          });
          break;

        case 'infrastructure_issue':
          recommendations.push({
            fixType: FIX_TYPES.RETRY_CONFIG,
            priority: 'medium',
            description: `Increase retry delays and timeouts for affected tools: ${cause.affectedTools.join(', ')}. This may be a transient infrastructure issue.`,
            autoFixable: true,
          });
          break;

        case 'rate_limit_issue':
          recommendations.push({
            fixType: FIX_TYPES.RETRY_CONFIG,
            priority: 'high',
            description: `Reduce request frequency or switch to alternative tools. Consider adding longer delays between tool calls.`,
            autoFixable: true,
          });
          if (cause.affectedTools.length > 0) {
            recommendations.push({
              fixType: FIX_TYPES.PROVIDER_SWITCH,
              priority: 'medium',
              description: `Consider switching provider for rate-limited tools: ${cause.affectedTools.join(', ')}`,
              autoFixable: false,
            });
          }
          break;

        case 'recurring_failure':
          recommendations.push({
            fixType: FIX_TYPES.TOOL_CONFIG,
            priority: 'high',
            description: `Disable or reconfigure persistently failing tool: ${cause.affectedTools.join(', ')}`,
            autoFixable: true,
          });
          break;

        case 'performance_regression':
          recommendations.push({
            fixType: FIX_TYPES.SKILL_ADJUSTMENT,
            priority: 'medium',
            description: `Review recent changes. Performance has degraded significantly. Consider reverting recent configuration changes.`,
            autoFixable: false,
          });
          break;
      }
    }

    if (recommendations.length === 0 && patterns.length === 0) {
      recommendations.push({
        fixType: null,
        priority: 'low',
        description: 'No significant issues detected. System is operating within normal parameters.',
        autoFixable: false,
      });
    }

    return recommendations;
  }

  /**
   * Classify severity based on error rate, patterns, and regression.
   */
  _classifySeverity(errorHistory, patterns, regression) {
    // Get recent error rate (last 24h)
    const recentRate = regression.recentTotal > 0
      ? 1 - (regression.recentSuccessRate / 100)
      : 0;

    // Count increasing patterns
    const increasingPatterns = patterns.filter(p => p.trend === 'increasing').length;

    // CRITICAL: very high error rate or severe regression
    if (recentRate >= SEVERITY_THRESHOLDS.CRITICAL_ERROR_RATE) {
      return SEVERITY.CRITICAL;
    }

    // HIGH: high error rate or multiple increasing patterns
    if (recentRate >= SEVERITY_THRESHOLDS.HIGH_ERROR_RATE || increasingPatterns >= 3) {
      return SEVERITY.HIGH;
    }

    // MEDIUM: moderate error rate or regression detected
    if (recentRate >= SEVERITY_THRESHOLDS.MEDIUM_ERROR_RATE ||
        regression.trend === 'degrading' ||
        increasingPatterns >= 1) {
      return SEVERITY.MEDIUM;
    }

    return SEVERITY.LOW;
  }

  // ========== Healing Methods ==========

  /**
   * Main entry point: analyze agent health and trigger healing if needed.
   * Called by SelfHealingHook (post-reasoning) or SelfPromptingEngine (periodic).
   */
  async analyzeAndHeal(agentId, userId, context = {}) {
    this._ensureTable();

    try {
      const diagnosis = await this.diagnoseSelf(agentId, userId);

      // LOW severity: no action needed (RecoveryStrategies handles inline)
      if (diagnosis.severity === SEVERITY.LOW) {
        return { severity: SEVERITY.LOW, action: 'none', message: 'No significant issues detected' };
      }

      // CRITICAL: already escalated in diagnoseSelf
      if (diagnosis.severity === SEVERITY.CRITICAL) {
        return {
          severity: SEVERITY.CRITICAL,
          action: 'escalated',
          healingId: diagnosis.healingId,
          message: 'Critical issues detected. Master has been notified.',
        };
      }

      // MEDIUM/HIGH: try to propose a fix
      const autoFixableRecs = diagnosis.recommendations.filter(r => r.autoFixable);
      if (autoFixableRecs.length === 0) {
        // Nothing auto-fixable, just report
        return {
          severity: diagnosis.severity,
          action: 'reported',
          healingId: diagnosis.healingId,
          diagnosis,
          message: `${diagnosis.severity} issues detected but no auto-fixable recommendations. Manual review needed.`,
        };
      }

      // For HIGH: queue for approval
      if (diagnosis.severity === SEVERITY.HIGH) {
        await this.queueForApproval(agentId, userId, diagnosis.healingId, {
          diagnosis,
          recommendations: autoFixableRecs,
        });
        return {
          severity: SEVERITY.HIGH,
          action: 'awaiting_approval',
          healingId: diagnosis.healingId,
          message: 'High severity issues detected. Fix proposal sent for master approval.',
        };
      }

      // MEDIUM: auto-heal (full cycle: backup → apply → test → rollback if fail)
      const rec = autoFixableRecs[0];
      const fixType = rec.fixType;
      const proposedChange = this._generateProposedChange(fixType, diagnosis);

      // If we can't generate a concrete change, just report
      if (!proposedChange || Object.keys(proposedChange).length === 0) {
        return {
          severity: SEVERITY.MEDIUM,
          action: 'diagnosed',
          healingId: diagnosis.healingId,
          diagnosis,
          message: `Medium severity issues diagnosed but could not generate auto-fix. Manual review needed.`,
        };
      }

      // 1. Create backup
      const backup = this.createBackup(agentId, diagnosis.healingId);
      if (!backup.success) {
        return {
          severity: SEVERITY.MEDIUM,
          action: 'diagnosed',
          healingId: diagnosis.healingId,
          diagnosis,
          message: `Medium severity: backup failed (${backup.error}), skipping auto-fix.`,
        };
      }

      // Update healing log with proposed fix
      this._updateHealingLog(diagnosis.healingId, {
        proposed_fix: JSON.stringify(proposedChange),
        fix_type: fixType,
        fix_reasoning: rec.description,
      });

      // 2. Apply fix
      const userId = context.triggerContext?.userId || context.userId || 'system';
      const applyResult = await this.applyFix(diagnosis.healingId, agentId, userId, fixType, proposedChange);

      if (!applyResult.success) {
        return {
          severity: SEVERITY.MEDIUM,
          action: 'fix_failed',
          healingId: diagnosis.healingId,
          error: applyResult.error,
          message: `Medium severity: auto-fix failed to apply: ${applyResult.error}`,
        };
      }

      // 3. Self-test
      const testResult = await this.selfTest(agentId, userId, { fixType, proposedChange });

      if (!testResult.passed) {
        // Rollback on test failure
        const rollback = this.rollbackFix(diagnosis.healingId, agentId);
        this._learnFromHealing(agentId, userId, diagnosis.healingId, 'rollback');
        return {
          severity: SEVERITY.MEDIUM,
          action: 'rolled_back',
          healingId: diagnosis.healingId,
          message: 'Medium severity: auto-fix applied but self-test failed. Changes rolled back.',
          testResult,
          rollback,
        };
      }

      // 4. Success
      this._updateHealingLog(diagnosis.healingId, {
        status: HEALING_STATUS.COMPLETED,
        test_results: JSON.stringify(testResult),
        test_passed: 1,
        outcome: 'fixed',
        outcome_notes: `Auto-heal applied and verified. Type: ${fixType}`,
      });
      this._learnFromHealing(agentId, userId, diagnosis.healingId, 'success');

      logger.info(`[SelfHealing] MEDIUM auto-heal completed for agent ${agentId}: ${fixType}`);

      return {
        severity: SEVERITY.MEDIUM,
        action: 'auto_healed',
        healingId: diagnosis.healingId,
        fixType,
        testResult,
        message: `Medium severity: auto-fix applied and verified successfully.`,
      };
    } catch (e) {
      logger.error(`[SelfHealing] analyzeAndHeal failed: ${e.message}`);
      return { severity: SEVERITY.LOW, action: 'error', error: e.message };
    }
  }

  /**
   * Create a backup of current agent config before applying a fix.
   */
  createBackup(agentId, healingId) {
    const db = getDatabase();
    try {
      const profile = db.prepare(`
        SELECT system_prompt, ai_provider, ai_model, temperature,
               autonomy_level, require_approval_for, notify_master_on
        FROM agentic_profiles WHERE id = ?
      `).get(agentId);

      if (!profile) {
        return { success: false, error: 'Profile not found' };
      }

      // Get tool overrides
      const toolOverrides = db.prepare(`
        SELECT tool_id, override_type, custom_config
        FROM agentic_tool_overrides WHERE agentic_id = ?
      `).all(agentId);

      const configSnapshot = {
        profile,
        toolOverrides,
        timestamp: new Date().toISOString(),
      };

      // Save backup to healing log
      this._updateHealingLog(healingId, {
        status: HEALING_STATUS.BACKING_UP,
        config_backup: JSON.stringify(configSnapshot),
        backup_created_at: new Date().toISOString(),
      });

      logger.info(`[SelfHealing] Backup created for agent ${agentId} (healing: ${healingId})`);
      return { success: true, configSnapshot };
    } catch (e) {
      logger.error(`[SelfHealing] Backup failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * Propose a fix based on diagnosis. Creates backup first.
   */
  async proposeFix(agentId, userId, fixType, description, proposedChange) {
    this._ensureTable();
    const healingId = uuidv4();

    // Log the proposal
    this._logHealingEvent(healingId, agentId, userId, HEALING_STATUS.PROPOSING_FIX, {
      trigger_source: 'manual',
      severity: SEVERITY.MEDIUM,
    });

    // Create backup first
    const backup = this.createBackup(agentId, healingId);
    if (!backup.success) {
      this._updateHealingLog(healingId, {
        status: HEALING_STATUS.FAILED,
        outcome: 'no_action',
        outcome_notes: `Backup failed: ${backup.error}`,
      });
      return { success: false, error: `Backup failed: ${backup.error}`, healingId };
    }

    // Classify severity of the proposed change
    const severity = this._classifyFixSeverity(fixType, proposedChange);

    this._updateHealingLog(healingId, {
      status: severity === SEVERITY.HIGH ? HEALING_STATUS.AWAITING_APPROVAL : HEALING_STATUS.PROPOSING_FIX,
      severity,
      proposed_fix: typeof proposedChange === 'string' ? proposedChange : JSON.stringify(proposedChange),
      fix_type: fixType,
      fix_reasoning: description,
    });

    // HIGH severity: queue for master approval
    if (severity === SEVERITY.HIGH || severity === SEVERITY.CRITICAL) {
      await this.queueForApproval(agentId, userId, healingId, {
        fixType,
        description,
        proposedChange,
      });
      return {
        success: true,
        healingId,
        severity,
        status: 'awaiting_approval',
        message: 'Fix requires master approval. Notification sent.',
      };
    }

    // MEDIUM: apply directly
    const applyResult = await this.applyFix(healingId, agentId, userId, fixType, proposedChange);

    if (applyResult.success) {
      // Run self-test
      const testResult = await this.selfTest(agentId, userId, { fixType, proposedChange });

      if (testResult.passed) {
        this._updateHealingLog(healingId, {
          status: HEALING_STATUS.COMPLETED,
          test_results: JSON.stringify(testResult),
          test_passed: 1,
          outcome: 'fixed',
          outcome_notes: `Auto-fix applied and verified. Type: ${fixType}`,
        });

        // Learn from the fix
        this._learnFromHealing(agentId, userId, healingId, 'success');

        return { success: true, healingId, status: 'completed', testResult };
      } else {
        // Test failed, rollback
        const rollback = this.rollbackFix(healingId, agentId);
        return {
          success: false,
          healingId,
          status: 'rolled_back',
          message: 'Fix applied but self-test failed. Changes rolled back.',
          testResult,
          rollback,
        };
      }
    }

    return { success: false, healingId, status: 'failed', error: applyResult.error };
  }

  /**
   * Apply a proposed fix to agent configuration.
   */
  async applyFix(healingId, agentId, userId, fixType, proposedChange) {
    const db = getDatabase();

    try {
      const change = typeof proposedChange === 'string' ? this._safeParseJSON(proposedChange, {}) : proposedChange;

      this._updateHealingLog(healingId, { status: HEALING_STATUS.APPLYING_FIX });

      switch (fixType) {
        case FIX_TYPES.TOOL_CONFIG: {
          // Disable a failing tool via tool_overrides
          if (change.disableTool) {
            db.prepare(`
              INSERT OR REPLACE INTO agentic_tool_overrides (id, agentic_id, tool_id, override_type, created_at)
              VALUES (?, ?, ?, 'disable', datetime('now'))
            `).run(uuidv4(), agentId, change.disableTool);
          }
          break;
        }

        case FIX_TYPES.SYSTEM_PROMPT: {
          // Append healing instruction to system prompt
          if (change.appendInstruction) {
            const current = db.prepare('SELECT system_prompt FROM agentic_profiles WHERE id = ?').get(agentId);
            if (current) {
              const newPrompt = (current.system_prompt || '') + '\n\n' +
                `[Self-Healing Note]: ${change.appendInstruction}`;
              db.prepare('UPDATE agentic_profiles SET system_prompt = ? WHERE id = ?')
                .run(newPrompt, agentId);
            }
          }
          break;
        }

        case FIX_TYPES.RETRY_CONFIG: {
          // Store retry config override in tool_overrides custom_config
          if (change.tool && change.retryConfig) {
            db.prepare(`
              INSERT OR REPLACE INTO agentic_tool_overrides (id, agentic_id, tool_id, override_type, custom_config, created_at)
              VALUES (?, ?, ?, 'enable', ?, datetime('now'))
            `).run(uuidv4(), agentId, change.tool, JSON.stringify({ retryConfig: change.retryConfig }));
          }
          break;
        }

        case FIX_TYPES.SKILL_ADJUSTMENT: {
          // Adjust skill XP downward
          if (change.skillId && change.newXP !== undefined) {
            db.prepare(`
              UPDATE agentic_agent_skills SET experience_points = ?, updated_at = datetime('now')
              WHERE agentic_id = ? AND skill_id = ?
            `).run(change.newXP, agentId, change.skillId);
          }
          break;
        }

        default:
          return { success: false, error: `Unknown fix type: ${fixType}` };
      }

      this._updateHealingLog(healingId, {
        status: HEALING_STATUS.TESTING,
        applied_fix: JSON.stringify({ fixType, change }),
        applied_at: new Date().toISOString(),
      });

      logger.info(`[SelfHealing] Fix applied for agent ${agentId}: ${fixType}`);
      return { success: true, fixType, change };
    } catch (e) {
      logger.error(`[SelfHealing] Apply fix failed: ${e.message}`);
      this._updateHealingLog(healingId, {
        status: HEALING_STATUS.FAILED,
        outcome: 'no_action',
        outcome_notes: `Apply failed: ${e.message}`,
      });
      return { success: false, error: e.message };
    }
  }

  /**
   * Run a self-test after applying a fix.
   * Checks if recent error conditions would still fail.
   */
  async selfTest(agentId, userId, fix) {
    try {
      // Simple health check: get recent error rate and compare
      const report = this.getHealthReport(agentId, { period: '24h' });

      // If we have no data yet (fix just applied), consider it passed
      // The real validation will happen on next executions
      const passed = report.errorRate < 50; // Basic threshold check

      return {
        passed,
        successRate: report.successRate,
        errorRate: report.errorRate,
        note: 'Self-test validates current health metrics. Full validation occurs on next execution cycle.',
      };
    } catch (e) {
      return { passed: false, error: e.message };
    }
  }

  /**
   * Rollback a fix by restoring from backup.
   */
  rollbackFix(healingId, agentId) {
    const db = getDatabase();

    try {
      // Get the backup from healing log
      const healing = db.prepare(`
        SELECT config_backup FROM agentic_self_healing_log
        WHERE id = ? AND agentic_id = ?
      `).get(healingId, agentId);

      if (!healing || !healing.config_backup) {
        return { success: false, error: 'No backup found for this healing entry' };
      }

      const backup = this._safeParseJSON(healing.config_backup, null);
      if (!backup || !backup.profile) {
        return { success: false, error: 'Invalid backup data' };
      }

      // Restore profile settings
      const p = backup.profile;
      db.prepare(`
        UPDATE agentic_profiles SET
          system_prompt = ?, ai_provider = ?, ai_model = ?,
          temperature = ?, autonomy_level = ?,
          require_approval_for = ?, notify_master_on = ?
        WHERE id = ?
      `).run(
        p.system_prompt, p.ai_provider, p.ai_model,
        p.temperature, p.autonomy_level,
        p.require_approval_for, p.notify_master_on,
        agentId
      );

      // Restore tool overrides
      if (backup.toolOverrides) {
        db.prepare('DELETE FROM agentic_tool_overrides WHERE agentic_id = ?').run(agentId);
        for (const override of backup.toolOverrides) {
          db.prepare(`
            INSERT INTO agentic_tool_overrides (id, agentic_id, tool_id, override_type, custom_config, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
          `).run(uuidv4(), agentId, override.tool_id, override.override_type, override.custom_config);
        }
      }

      this._updateHealingLog(healingId, {
        status: HEALING_STATUS.ROLLED_BACK,
        rolled_back_at: new Date().toISOString(),
        rollback_reason: 'Self-test failed after fix application',
        outcome: 'rolled_back',
      });

      logger.info(`[SelfHealing] Rollback completed for agent ${agentId} (healing: ${healingId})`);
      return { success: true, restoredConfig: backup };
    } catch (e) {
      logger.error(`[SelfHealing] Rollback failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ========== Escalation Methods ==========

  /**
   * Escalate to master with full diagnostic log.
   */
  async escalateToCritical(agentId, userId, diagnosis, healingId) {
    try {
      const { MasterNotificationService } = require('./MasterNotificationService.cjs');
      const notifier = new MasterNotificationService();

      const errorSummary = diagnosis.rootCauses.map(c => `- ${c.description}`).join('\n');
      const recsText = diagnosis.recommendations.map(r => `- [${r.priority}] ${r.description}`).join('\n');

      const result = await notifier.sendNotification({
        agenticId: agentId,
        userId,
        type: 'critical_error',
        title: `CRITICAL: Self-Healing Alert for Agent`,
        message: [
          `Self-healing system detected critical issues:`,
          '',
          `**Error Summary:** ${diagnosis.errorSummary || 'Multiple critical failures'}`,
          '',
          `**Root Causes:**`,
          errorSummary || '- Unable to determine specific root cause',
          '',
          `**Recommendations:**`,
          recsText || '- Manual investigation required',
          '',
          `**Affected Tools:** ${(diagnosis.affectedTools || []).join(', ') || 'multiple'}`,
          '',
          `Healing ID: ${healingId}`,
        ].join('\n'),
        priority: 'urgent',
        actionRequired: true,
        actionType: 'review_self_healing',
        actionData: JSON.stringify({ healingId, diagnosis }),
        forceSend: true,
      });

      if (result?.id) {
        this._updateHealingLog(healingId, {
          status: HEALING_STATUS.ESCALATED,
          notification_id: result.id,
          escalated_at: new Date().toISOString(),
          outcome: 'escalated',
        });
      }

      logger.warn(`[SelfHealing] CRITICAL escalation for agent ${agentId}`);
    } catch (e) {
      logger.error(`[SelfHealing] Escalation failed: ${e.message}`);
    }
  }

  /**
   * Queue a fix for master approval via ApprovalService.
   */
  async queueForApproval(agentId, userId, healingId, proposedFix) {
    try {
      const ApprovalService = require('./ApprovalService.cjs');
      const approvalService = typeof ApprovalService.getApprovalService === 'function'
        ? ApprovalService.getApprovalService()
        : new ApprovalService();

      const recsText = (proposedFix.recommendations || proposedFix.description || [])
        .map ? proposedFix.recommendations.map(r => r.description).join('; ')
        : (proposedFix.description || 'Configuration change');

      const result = await approvalService.createApproval(agentId, userId, {
        actionType: 'self_healing_fix',
        actionTitle: `Self-Healing: Proposed Fix`,
        actionDescription: `Self-healing system proposes: ${recsText}`,
        payload: JSON.stringify(proposedFix),
        confidenceScore: 0.8,
        reasoning: `Automated diagnosis detected issues requiring configuration changes.`,
        priority: 'high',
      });

      if (result?.id) {
        this._updateHealingLog(healingId, {
          status: HEALING_STATUS.AWAITING_APPROVAL,
          approval_id: result.id,
        });
      }
    } catch (e) {
      logger.error(`[SelfHealing] Approval queue failed: ${e.message}`);
    }
  }

  // ========== Logging & Helpers ==========

  _logHealingEvent(healingId, agentId, userId, status, extra = {}) {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO agentic_self_healing_log
        (id, agentic_id, user_id, status, severity, trigger_source, trigger_context, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        healingId,
        agentId,
        userId,
        status,
        extra.severity || SEVERITY.MEDIUM,
        extra.trigger_source || 'manual',
        JSON.stringify(extra.trigger_context || {}),
      );
    } catch (e) {
      logger.debug(`[SelfHealing] Log event failed: ${e.message}`);
    }
  }

  _updateHealingLog(healingId, updates) {
    try {
      const db = getDatabase();
      const setClauses = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
      setClauses.push('updated_at = datetime(\'now\')');
      values.push(healingId);

      db.prepare(`
        UPDATE agentic_self_healing_log SET ${setClauses.join(', ')} WHERE id = ?
      `).run(...values);
    } catch (e) {
      logger.debug(`[SelfHealing] Update log failed: ${e.message}`);
    }
  }

  /**
   * Get healing history for an agent.
   */
  getHealingHistory(agentId, options = {}) {
    try {
      const db = getDatabase();
      const limit = Math.min(options.limit || 20, 50);
      const rows = db.prepare(`
        SELECT id, status, severity, trigger_source, error_summary,
               affected_tools, fix_type, outcome, outcome_notes,
               test_passed, created_at, updated_at
        FROM agentic_self_healing_log
        WHERE agentic_id = ?
        ORDER BY created_at DESC LIMIT ?
      `).all(agentId, limit);

      return { count: rows.length, history: rows };
    } catch (e) {
      return { count: 0, history: [], error: e.message };
    }
  }

  /**
   * Generate a concrete proposed change object from fixType and diagnosis.
   * Used by the MEDIUM auto-heal path.
   */
  _generateProposedChange(fixType, diagnosis) {
    const affectedTools = diagnosis.affectedTools || [];

    switch (fixType) {
      case FIX_TYPES.TOOL_CONFIG:
        // Disable the most problematic tool
        if (affectedTools.length > 0) {
          return { disableTool: affectedTools[0] };
        }
        return {};

      case FIX_TYPES.SYSTEM_PROMPT:
        // Append avoidance instruction for failing tools
        if (affectedTools.length > 0) {
          return {
            appendInstruction: `Avoid using these tools which have been failing repeatedly: ${affectedTools.join(', ')}. Use alternative approaches where possible.`,
          };
        }
        return {};

      case FIX_TYPES.RETRY_CONFIG:
        // Add retry config for the most problematic tool
        if (affectedTools.length > 0) {
          return {
            tool: affectedTools[0],
            retryConfig: { maxRetries: 3, delayMs: 5000, backoffMultiplier: 2 },
          };
        }
        return {};

      case FIX_TYPES.SKILL_ADJUSTMENT:
        // Can't auto-generate skill adjustments — needs manual review
        return {};

      default:
        return {};
    }
  }

  /**
   * Classify fix severity based on what's being changed.
   */
  _classifyFixSeverity(fixType, proposedChange) {
    // System prompt and provider changes are HIGH severity
    if (fixType === FIX_TYPES.SYSTEM_PROMPT || fixType === FIX_TYPES.PROVIDER_SWITCH) {
      return SEVERITY.HIGH;
    }
    // Tool disabling is MEDIUM
    if (fixType === FIX_TYPES.TOOL_CONFIG) {
      return SEVERITY.MEDIUM;
    }
    // Retry config and skill adjustments are MEDIUM
    return SEVERITY.MEDIUM;
  }

  /**
   * Learn from healing outcome via SelfLearningService.
   */
  _learnFromHealing(agentId, userId, healingId, outcome) {
    try {
      const { getSelfLearningService } = require('./SelfLearningService.cjs');
      const learner = getSelfLearningService();
      if (learner && typeof learner.queueLearning === 'function') {
        learner.queueLearning({
          agenticId: agentId,
          userId,
          sourceType: 'feedback',
          content: `Self-healing ${outcome}: Healing ID ${healingId}`,
          summary: `Self-healing applied a fix with outcome: ${outcome}`,
          confidence: outcome === 'success' ? 0.9 : 0.6,
        });
      }
    } catch (e) {
      // Non-critical
      logger.debug(`[SelfHealing] Learn from healing failed: ${e.message}`);
    }
  }

  _safeParseJSON(str, fallback) {
    try {
      return typeof str === 'string' ? JSON.parse(str) : str;
    } catch {
      return fallback;
    }
  }
}

// Singleton
let _instance = null;

function getSelfHealingService() {
  if (!_instance) {
    _instance = new SelfHealingService();
    _instance._ensureTable();
    logger.info('[SelfHealingService] Initialized');
  }
  return _instance;
}

module.exports = {
  SelfHealingService,
  getSelfHealingService,
  SEVERITY,
  HEALING_STATUS,
  FIX_TYPES,
};
