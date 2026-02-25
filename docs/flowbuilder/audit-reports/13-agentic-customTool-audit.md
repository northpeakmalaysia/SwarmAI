# agentic:customTool - Custom Tool Node Audit

**Audit Date:** 2026-02-03
**Node Type:** Agentic
**File:** `server/services/flow/nodes/agentic/CustomToolNode.cjs`
**Lines:** 300+

---

## Executive Summary

**Status:** 🆕 **NEW CAPABILITY** (Dynamic Python tools - not in old system)

Revolutionary feature allowing AI agents to create custom Python tools that automatically appear as FlowBuilder nodes.

**Completeness:** 100%
**Feature Parity:** N/A (new capability)
**Code Quality:** Excellent

---

## Key Features

**Two Node Types:**
1. **Generic CustomToolNode** - `agentic:customTool` (executes any tool by ID)
2. **DynamicCustomToolNode** - `agentic:tool:{toolId}` (one node per tool)

**Capabilities:**
- Loads tools from database
- Executes in secure PythonSandbox
- Template resolution in inputs
- Ownership validation (userId check)
- Timeout control (default 30s)
- Auto-generated usage guides

**Security:**
- Blocked modules: subprocess, os.system, socket
- File access limited to workspace
- 30s timeout, 1MB output limit
- User isolation (can't access other users' tools)

**Output Variables:**
- `result` (tool output)
- `executionTime`, `toolName`, `toolId`

---

## Verdict

🆕 **NEW CAPABILITY** - Revolutionary feature enabling AI-created FlowBuilder nodes

**Priority:** None (complete and working)

---

**Last Updated:** 2026-02-03
