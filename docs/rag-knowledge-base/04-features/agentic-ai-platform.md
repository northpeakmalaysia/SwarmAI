# Agentic AI Platform

The Agentic AI Platform enables autonomous AI agents to execute tasks using CLI tools (Claude, Gemini, OpenCode) with workspace isolation and custom Python tools.

## Overview

Agentic AI goes beyond simple chat:
- **Autonomous Execution**: Agents work independently on complex tasks
- **CLI Integration**: Use Claude CLI, Gemini CLI, OpenCode CLI
- **Workspace Isolation**: Each agent has its own secure workspace
- **Custom Tools**: Create Python tools for specialized tasks
- **Self-Improvement**: Agents learn from feedback

## Architecture

```
User Task Request
    ↓
Agentic Task Node (FlowBuilder)
    ↓
Workspace Manager
    ├── Create/Load Workspace
    ├── Prepare CLAUDE.md Context
    └── Set Working Directory
    ↓
CLI Execution (claude/gemini/opencode)
    ├── Read Task
    ├── Access Custom Tools
    ├── Generate Output
    └── Log Activity
    ↓
Output Processing
    ├── Collect Files
    ├── Parse Logs
    └── Return Results
    ↓
Task Complete
```

## Workspace Structure

Each agent gets an isolated workspace:

```
server/data/workspaces/{userId}/{agentId}/
├── CLAUDE.md                # Agent context file
├── custom/
│   └── tools/              # Python tools
│       ├── calculator.py
│       ├── web_scraper.py
│       └── data_analyzer.py
├── output/                 # Task outputs
│   ├── report.md
│   ├── analysis.json
│   └── chart.png
├── logs/                   # Execution history
│   ├── 2026-02-03.log
│   └── task-123.log
└── temp/                   # Temporary files
```

### CLAUDE.md Context File

Provides context to CLI agents:

```markdown
# Agent Context

## Agent Information
- Name: Data Analyst Agent
- Role: Analyze datasets and generate insights
- Created: 2026-02-03

## Available Tools
- calculator.py: Perform mathematical operations
- data_analyzer.py: Analyze CSV/JSON data
- web_scraper.py: Fetch web content

## Guidelines
- Save all outputs to /output/ directory
- Log important decisions
- Use existing tools when possible
- Follow security best practices

## Environment
- Working Directory: /workspaces/user-1/agent-5
- Output Directory: /output
- Python Version: 3.11
```

## CLI Providers

### Claude CLI (Paid)

**Best For**: Code generation, complex reasoning, writing
**Cost**: $3-$15 per 1M tokens
**Setup**:
```bash
# Authenticate
claude auth login

# Use in tasks
claude --prompt "Analyze this log file and find errors"
```

**Advantages**:
- Highest quality
- Best code generation
- Excellent reasoning

**Limitations**:
- Requires paid Anthropic account
- Rate limits apply

### Gemini CLI (Free Tier)

**Best For**: Quick tasks, multimodal, free usage
**Cost**: Free tier: 1500 requests/day
**Setup**:
```bash
# Authenticate
gemini auth login

# Use in tasks
gemini --prompt "Summarize this document"
```

**Advantages**:
- Free tier available
- Fast responses
- Good multimodal support

**Limitations**:
- Rate limits on free tier
- Less accurate for complex code

### OpenCode CLI (Free Multi-Provider)

**Best For**: Aggregated free tier access
**Cost**: Free
**Setup**:
```bash
# Authenticate
opencode auth login

# Use in tasks
opencode --prompt "Generate a Python script"
```

**Advantages**:
- Completely free
- Aggregates multiple providers
- No API keys needed

**Limitations**:
- Quality varies by provider
- Less consistent

## Python Sandbox

Execute custom Python tools securely:

### Security Features

**Blocked Modules**:
```python
# Dangerous imports are blocked
import subprocess  # ❌ Blocked
import os.system   # ❌ Blocked
import socket      # ❌ Blocked
import pickle      # ❌ Blocked
eval()            # ❌ Blocked
exec()            # ❌ Blocked
```

**Allowed Modules**:
```python
# Safe imports are allowed
import json        # ✅ Allowed
import math        # ✅ Allowed
import pandas      # ✅ Allowed
import numpy       # ✅ Allowed
import requests    # ✅ Allowed (HTTP only)
```

**File Access**:
- **Read**: Workspace directory only
- **Write**: `/output/` directory only
- **Size Limits**: 1MB per output file

**Execution**:
- **Timeout**: 30 seconds default
- **Memory**: 512MB limit
- **CPU**: Single core

### Creating Custom Tools

#### Example: Calculator Tool

```python
# custom/tools/calculator.py
"""
Advanced calculator with scientific functions.

Usage:
    python calculator.py --operation add --a 5 --b 10
"""

import argparse
import math
import json

def calculate(operation, a, b=None):
    """Perform calculation based on operation."""
    operations = {
        'add': lambda x, y: x + y,
        'subtract': lambda x, y: x - y,
        'multiply': lambda x, y: x * y,
        'divide': lambda x, y: x / y if y != 0 else None,
        'sqrt': lambda x, _: math.sqrt(x),
        'power': lambda x, y: x ** y
    }

    if operation not in operations:
        return {"error": f"Unknown operation: {operation}"}

    result = operations[operation](a, b)
    return {
        "operation": operation,
        "inputs": {"a": a, "b": b},
        "result": result
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--operation', required=True)
    parser.add_argument('--a', type=float, required=True)
    parser.add_argument('--b', type=float)
    args = parser.parse_args()

    result = calculate(args.operation, args.a, args.b)
    print(json.dumps(result))
```

#### Example: Data Analyzer Tool

```python
# custom/tools/data_analyzer.py
"""
Analyze CSV/JSON data files.

Usage:
    python data_analyzer.py --file data.csv --operation summary
"""

import argparse
import pandas as pd
import json
from pathlib import Path

def analyze_data(file_path, operation):
    """Analyze data file."""
    # Load data
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
    elif file_path.endswith('.json'):
        df = pd.read_json(file_path)
    else:
        return {"error": "Unsupported format"}

    # Perform operation
    if operation == 'summary':
        return {
            "rows": len(df),
            "columns": list(df.columns),
            "types": df.dtypes.to_dict(),
            "missing": df.isnull().sum().to_dict(),
            "summary": df.describe().to_dict()
        }
    elif operation == 'correlations':
        return df.corr().to_dict()
    elif operation == 'top10':
        return df.head(10).to_dict()

    return {"error": f"Unknown operation: {operation}"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', required=True)
    parser.add_argument('--operation', required=True)
    args = parser.parse_args()

    result = analyze_data(args.file, args.operation)

    # Save to output directory
    output_path = Path('/output') / 'analysis_result.json'
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)

    print(json.dumps({"saved": str(output_path), "result": result}))
```

### Registering Tools

```bash
POST /api/agentic/tools
Authorization: Bearer <token>
Content-Type: multipart/form-data

agentId: 1
name: calculator
description: Advanced calculator with scientific functions
file: calculator.py
```

## API Endpoints

### Create Workspace
```bash
POST /api/agentic/workspaces
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentId": 1,
  "contextFile": "# Custom context for this agent..."
}
```

### Execute Agentic Task
```bash
POST /api/agentic/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentId": 1,
  "task": "Analyze the log file in /workspace/logs/app.log and identify all errors",
  "cliType": "claude",
  "timeout": 300000,
  "saveOutput": true
}
```

Response:
```json
{
  "taskId": "task-123",
  "status": "completed",
  "output": {
    "summary": "Found 15 errors in log file",
    "details": "...",
    "filesCreated": [
      "/output/error_report.md",
      "/output/error_summary.json"
    ]
  },
  "executionTime": 12450,
  "logsPath": "/logs/task-123.log"
}
```

### List Custom Tools
```bash
GET /api/agentic/tools?agentId=1
Authorization: Bearer <token>
```

### Execute Custom Tool
```bash
POST /api/agentic/tools/:toolId/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentId": 1,
  "input": {
    "operation": "add",
    "a": 5,
    "b": 10
  }
}
```

## Integration with FlowBuilder

### Agentic Task Node

```yaml
Type: AgenticTask
Use Case: Autonomous task execution
Config:
  - agentId: 1
  - task: "Analyze sales data and create report"
  - cliType: "claude" | "gemini" | "opencode"
  - workspace: "/workspaces/agent-1"
  - timeout: 300000  # 5 minutes
  - customTools: ["data_analyzer", "chart_generator"]
Output:
  - result: Task output
  - filesCreated: Array of created files
  - logsPath: Path to execution logs
```

### Custom Tool Node

```yaml
Type: CustomTool
Use Case: Execute specific Python tool
Config:
  - toolId: "calculator"
  - agentId: 1
  - input:
      operation: "add"
      a: 5
      b: 10
Output:
  - result: Tool output
  - executionTime: Milliseconds
```

## Use Cases

### 1. Code Analysis

```
Task: "Review this Python file and suggest improvements"

Agent:
  1. Read Python file
  2. Use AST parser tool
  3. Run linting tool
  4. Generate report
  5. Save to /output/code_review.md
```

### 2. Data Processing

```
Task: "Process CSV file and create visualizations"

Agent:
  1. Load CSV with pandas
  2. Clean and analyze data
  3. Generate charts with matplotlib
  4. Save charts to /output/
  5. Create summary report
```

### 3. Research & Synthesis

```
Task: "Research topic X and create comprehensive report"

Agent:
  1. Use web scraper tool
  2. Collect information
  3. Analyze and synthesize
  4. Generate structured report
  5. Include citations
```

### 4. Automated Testing

```
Task: "Run test suite and analyze results"

Agent:
  1. Execute test runner
  2. Parse test output
  3. Identify failures
  4. Generate detailed report
  5. Suggest fixes
```

## Best Practices

### 1. Clear Task Definitions

**Bad**:
```
"Do something with the data"
```

**Good**:
```
"Analyze the sales_2025.csv file in /workspace/data/:
1. Calculate total revenue by month
2. Identify top 5 products
3. Create a trend chart
4. Save results to /output/sales_analysis.json and /output/chart.png"
```

### 2. Tool Modularity

Create focused, reusable tools:
```python
# Good: Focused tool
def calculate_metrics(data):
    return {"mean": mean(data), "median": median(data)}

# Bad: Do-everything tool
def analyze_everything(data, options):
    # Too many responsibilities
```

### 3. Error Handling

```python
# Always handle errors gracefully
try:
    result = process_data(file_path)
    save_output(result)
    return {"status": "success", "result": result}
except Exception as e:
    return {"status": "error", "message": str(e)}
```

### 4. Output Organization

```
/output/
├── reports/
│   ├── summary.md
│   └── detailed.json
├── charts/
│   ├── trend.png
│   └── distribution.png
└── logs/
    └── execution.log
```

### 5. Resource Management

```python
# Use context managers
with open(file_path, 'r') as f:
    data = f.read()

# Cleanup temp files
import atexit
atexit.register(cleanup_temp_files)
```

## Troubleshooting

### Task Timeout

**Symptoms**: Task exceeds timeout limit

**Solutions**:
1. Increase timeout setting
2. Break task into smaller subtasks
3. Optimize tool performance
4. Use faster CLI provider

### Permission Denied

**Symptoms**: Cannot write files

**Solutions**:
1. Verify writing to `/output/` directory
2. Check file permissions
3. Ensure workspace exists
4. Review sandbox restrictions

### Tool Import Error

**Symptoms**: Python module not found

**Solutions**:
1. Check module is in allowed list
2. Install required packages:
   ```bash
   docker exec swarmAI-backend pip install pandas numpy
   ```
3. Use built-in modules when possible

### CLI Authentication Failed

**Symptoms**: CLI commands fail with auth error

**Solutions**:
1. Re-authenticate:
   ```bash
   docker exec -u cliuser backend claude auth login
   ```
2. Check credentials are persisted
3. Verify API keys in environment

## Related Topics

- [Creating Agentic Agents](../02-user-guides/agentic-agents.md)
- [Custom Tools Development](../03-developer-guides/custom-tools.md)
- [Workspace Security](../03-developer-guides/workspace-security.md)
- [CLI Integration](../03-developer-guides/cli-integration.md)

---

**Keywords**: Agentic AI, autonomous agents, CLI tools, Claude CLI, Gemini CLI, OpenCode CLI, Python sandbox, custom tools, workspace isolation
