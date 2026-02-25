# SwarmAI Local Agent

CLI agent that runs on your computer (Windows/Mac/Linux) and connects to a SwarmAI server, giving the agentic AI direct access to your device — shell commands, file system, screenshots, clipboard, MCP tools, and CLI AI sessions.

## Architecture

```
Local Agent CLI  →  WebSocket (wss://{server}/local-agent)  →  SwarmAI Backend
                    ├── systemInfo         (OS, CPU, RAM, disk)
                    ├── screenshot         (desktop capture → upload)
                    ├── shell              (execute commands, streaming output)
                    ├── fileRead / fileList (browse & read files)
                    ├── fileTransfer       (upload/download files)
                    ├── clipboard          (read/write system clipboard)
                    ├── capture            (camera/microphone, opt-in only)
                    ├── cliSession         (claude/gemini/opencode CLI)
                    ├── mcp               (MCP server tool execution)
                    ├── aiChat            (proxy to local Ollama/LM Studio)
                    └── kill              (terminate running command)
```

## Setup

### Prerequisites
- Node.js 16+

### Install & Login

```bash
cd local-agent
npm install

# Authenticate with SwarmAI server (opens browser for OAuth)
node index.js login --api https://agents.northpeak.app --name "My Laptop"

# Start the agent
node index.js start
```

### Global Install (optional)

```bash
npm install -g .
swarmai-agent login --api https://agents.northpeak.app
swarmai-agent start
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate this device with SwarmAI server |
| `start` | Connect and begin listening for commands |
| `startup enable` | Auto-start on system boot |
| `startup disable` | Remove auto-start |
| `startup status` | Check auto-start status |
| `status` | Show connection status |

### Login Options

```bash
swarmai-agent login \
  --api <url>      # Server URL (default: https://agents.northpeak.app)
  --name <name>    # Device name (default: hostname)
```

## Device Commands (AI Tools)

When connected, the SwarmAI agentic AI can execute these commands on your device:

| Command | Description | Security |
|---------|-------------|----------|
| `systemInfo` | OS, CPU, RAM, disk, network info | Always allowed |
| `notification` | Show desktop notification | Always allowed |
| `screenshot` | Capture desktop screenshot | Always allowed |
| `shell` | Execute shell commands (streaming) | Blocklist filtered |
| `fileRead` | Read file contents | Path-restricted (configurable) |
| `fileList` | List directory contents | Path-restricted (configurable) |
| `fileTransfer` | Upload/download files to/from server | Always allowed |
| `clipboard` | Read/write system clipboard | Requires approval |
| `capture` | Camera/microphone access | Opt-in only (`allowCapture`) |
| `cliSession` | Run Claude/Gemini/OpenCode CLI | Requires approval |
| `mcp` | Execute MCP server tools | Always allowed |
| `aiChat` | Chat with local AI (Ollama, LM Studio) | Always allowed |
| `kill` | Terminate a running command | Always allowed |

## MCP Server Integration

The agent can spawn and manage local MCP servers. Built-in recipes:

| Recipe | Description |
|--------|-------------|
| `playwright` | Browser automation via Playwright |
| `filesystem` | Local filesystem access |
| `sqlite` | SQLite database operations |
| `git` | Git repository operations |
| `docker` | Docker container management |

Custom MCP servers can be configured via the SwarmAI dashboard.

## Security

### Configuration

Security settings in `~/.swarmai/config.json`:

```json
{
  "security": {
    "shellBlocklist": [],
    "fileRootPaths": [],
    "requireApprovalFor": ["cliSession", "clipboard"],
    "allowCapture": false
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `shellBlocklist` | `[]` | Additional blocked shell patterns (on top of built-in: `rm -rf /`, `format`, `mkfs`, etc.) |
| `fileRootPaths` | `[]` | Restrict file access to these paths. Empty = allow all. |
| `requireApprovalFor` | `["cliSession", "clipboard"]` | Commands that are blocked unless user opts in |
| `allowCapture` | `false` | Camera/mic access (must explicitly enable) |

### Workspace

The agent manages a local workspace for file operations:

```
~/SwarmAI/          (Linux/Mac)
C:/SwarmAI/         (Windows)
├── temp/           # Temporary files (auto-cleanup: 24h)
├── downloads/      # Downloaded files (auto-cleanup: 7d)
└── workspace/      # Persistent working directory
```

Configurable in `~/.swarmai/config.json` under `"workspace"` key.

## Project Structure

```
local-agent/
├── index.js                # Entry point (CLI)
├── package.json
└── src/
    ├── cli.js              # Commander.js CLI definitions
    ├── auth.js             # OAuth browser login flow
    ├── config.js           # ~/.swarmai/config.json management
    ├── connection.js       # Socket.io WebSocket client
    ├── commands.js         # Command handlers (shell, screenshot, etc.)
    ├── mcpManager.js       # MCP server lifecycle management
    ├── toolScanner.js      # Discover local CLI tools
    ├── aiProviderScanner.js # Detect local AI (Ollama, LM Studio)
    ├── workspace.js        # Local workspace/file management
    └── startup.js          # OS auto-start (systemd, launchd, Task Scheduler)
```

## Backend Integration

The server-side gateway lives at:
- **Gateway:** `server/services/LocalAgentGateway.cjs`
- **Routes:** `server/routes/local-agents.cjs`
- **AI Tools:** `executeOnLocalAgent`, `uploadToTempStorage` (available to agentic AI when a local agent is online)

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `command:execute` | Server → Agent | Execute a command |
| `command:result` | Agent → Server | Command result (sync) |
| `command:output` | Agent → Server | Streaming output chunk |
| `command:async-result` | Agent → Server | Async CLI completion |
| `agent:heartbeat` | Agent → Server | Health pulse (every 15s) |
| `agent:capabilities` | Agent → Server | Supported commands + MCP tools |
