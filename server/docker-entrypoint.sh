#!/bin/bash
# =============================================================================
# SwarmAI Docker Entrypoint Script
# =============================================================================
# Handles:
# - CLI credentials directory initialization (for volume persistence)
# - Permissions for cliuser on mounted volumes
# - CLI tools configuration for Docker environment
# =============================================================================

set -e

CLI_HOME="${CLI_HOME:-/home/cliuser}"

echo "[Entrypoint] SwarmAI Server Starting..."
echo "[Entrypoint] CLI_HOME: $CLI_HOME"

# =============================================================================
# Initialize CLI Credentials Directory (Volume Mount)
# =============================================================================
# On first run with empty volume, create directory structure
# This ensures CLI tools can store their auth tokens

echo "[Entrypoint] Initializing CLI credentials directory..."

# Create directory structure if not exists (first run with empty volume)
mkdir -p "$CLI_HOME/.claude" \
         "$CLI_HOME/.gemini" \
         "$CLI_HOME/.opencode" \
         "$CLI_HOME/.config" \
         "$CLI_HOME/.local/share" \
         "$CLI_HOME/.cache"

# Ensure cliuser owns everything in home directory
chown -R cliuser:cliuser "$CLI_HOME" 2>/dev/null || true
chmod 755 "$CLI_HOME" 2>/dev/null || true

# =============================================================================
# Fix App Directory Permissions
# =============================================================================
echo "[Entrypoint] Setting up app directory permissions..."

# Fix ownership of mounted volumes so cliuser can edit
chown -R cliuser:cliuser /app/data 2>/dev/null || true
chown -R cliuser:cliuser /app/logs 2>/dev/null || true

# Create and fix CLI context directory for file generation
mkdir -p /app/cli_context
chown -R cliuser:cliuser /app/cli_context 2>/dev/null || true
chmod 755 /app/cli_context 2>/dev/null || true

# =============================================================================
# Persist CLI Context Files (CLAUDE.md, GEMINI.md, AGENTS.md)
# =============================================================================
# These files are used by CLI tools (Claude, Gemini) as project context.
# They live at /app/ but get overwritten on rebuild (COPY . .).
# Store authoritative copies in the persistent volume (/app/data/cli-context/)
# and symlink them to /app/ on every startup.
echo "[Entrypoint] Setting up persistent CLI context files..."

CLI_CONTEXT_DIR="/app/data/cli-context"
mkdir -p "$CLI_CONTEXT_DIR"

for f in CLAUDE.md GEMINI.md AGENTS.md; do
    if [ -f "$CLI_CONTEXT_DIR/$f" ]; then
        # Persistent copy exists - symlink it into /app/ (overrides rebuilt image)
        ln -sf "$CLI_CONTEXT_DIR/$f" "/app/$f"
        echo "[Entrypoint] Restored persistent $f from volume"
    elif [ -f "/app/$f" ]; then
        # First run: copy from image to persistent storage, then symlink
        cp "/app/$f" "$CLI_CONTEXT_DIR/$f"
        ln -sf "$CLI_CONTEXT_DIR/$f" "/app/$f"
        echo "[Entrypoint] Saved $f to persistent storage"
    fi
done

chown -R cliuser:cliuser "$CLI_CONTEXT_DIR" 2>/dev/null || true

# =============================================================================
# Configure Claude CLI
# =============================================================================
if [ -d "$CLI_HOME/.claude" ]; then
    echo "[Entrypoint] Configuring Claude CLI..."

    # Create settings.json if not exists
    if [ ! -f "$CLI_HOME/.claude/settings.json" ]; then
        cat > "$CLI_HOME/.claude/settings.json" << 'EOF'
{
  "permissions": {
    "allow": [
      "Read(*)",
      "Write(/app/**)",
      "Write(/home/cliuser/**)",
      "Write(/tmp/**)",
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(node:*)"
    ],
    "deny": []
  }
}
EOF
        chown cliuser:cliuser "$CLI_HOME/.claude/settings.json"
        echo "[Entrypoint] Claude CLI settings created"
    else
        echo "[Entrypoint] Claude CLI settings already exist (preserved from volume)"
    fi

    # Check if authenticated (correct path: ~/.claude/.credentials.json)
    if [ -f "$CLI_HOME/.claude/.credentials.json" ]; then
        echo "[Entrypoint] Claude CLI credentials found (authenticated via OAuth)"
    elif [ -n "$ANTHROPIC_API_KEY" ]; then
        echo "[Entrypoint] Claude CLI using ANTHROPIC_API_KEY from environment"
    else
        echo "[Entrypoint] Claude CLI not authenticated yet"
        echo "[Entrypoint]   Option 1: docker compose exec -u cliuser backend claude auth login"
        echo "[Entrypoint]   Option 2: Set ANTHROPIC_API_KEY in docker-compose.yml"
    fi
fi

# =============================================================================
# Configure Gemini CLI
# =============================================================================
if [ -d "$CLI_HOME/.gemini" ]; then
    echo "[Entrypoint] Configuring Gemini CLI..."

    # Create trustedFolders.json for Docker paths
    cat > "$CLI_HOME/.gemini/trustedFolders.json" << 'EOF'
{
  "/app": "TRUST_FOLDER",
  "/home/cliuser": "TRUST_FOLDER",
  "/tmp": "TRUST_FOLDER",
  "/home/cliuser/.gemini/tmp": "TRUST_FOLDER"
}
EOF
    chown cliuser:cliuser "$CLI_HOME/.gemini/trustedFolders.json"
    echo "[Entrypoint] Gemini CLI trusted folders configured"

    # Check if authenticated (Gemini uses Google OAuth)
    # Credentials stored in: ~/.gemini/.credentials.json or ~/.config/gemini-cli/
    if [ -f "$CLI_HOME/.gemini/.credentials.json" ] || \
       [ -f "$CLI_HOME/.gemini/credentials.json" ] || \
       [ -f "$CLI_HOME/.config/gemini-cli/credentials.json" ] || \
       [ -d "$CLI_HOME/.gemini/auth" ]; then
        echo "[Entrypoint] Gemini CLI credentials found (authenticated)"
    elif [ -n "$GOOGLE_API_KEY" ] || [ -n "$GEMINI_API_KEY" ]; then
        echo "[Entrypoint] Gemini CLI using API key from environment"
    else
        echo "[Entrypoint] Gemini CLI not authenticated yet"
        echo "[Entrypoint]   Option 1: docker compose exec -u cliuser backend gemini auth login"
        echo "[Entrypoint]   Option 2: Set GOOGLE_API_KEY or GEMINI_API_KEY in docker-compose.yml"
    fi
fi

# =============================================================================
# Configure OpenCode CLI
# =============================================================================
if [ -d "$CLI_HOME/.opencode" ]; then
    echo "[Entrypoint] Configuring OpenCode CLI..."

    # Create default config if not exists
    if [ ! -f "$CLI_HOME/.opencode/config.json" ]; then
        cat > "$CLI_HOME/.opencode/config.json" << 'EOF'
{
  "trustedFolders": ["/app", "/home/cliuser", "/tmp"],
  "autoApprove": false,
  "sandbox": true
}
EOF
        chown cliuser:cliuser "$CLI_HOME/.opencode/config.json"
        echo "[Entrypoint] OpenCode CLI config created"
    else
        echo "[Entrypoint] OpenCode CLI config already exists (preserved from volume)"
    fi

    # Check if authenticated
    if [ -f "$CLI_HOME/.opencode/credentials.json" ] || \
       [ -f "$CLI_HOME/.opencode/auth.json" ]; then
        echo "[Entrypoint] OpenCode CLI credentials found (authenticated)"
    else
        echo "[Entrypoint] OpenCode CLI not authenticated yet"
    fi
fi

# =============================================================================
# Verify CLI Tools Installation
# =============================================================================
echo "[Entrypoint] Checking CLI tools availability..."

if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
    echo "  - Claude CLI: OK ($CLAUDE_VERSION)"
else
    echo "  - Claude CLI: NOT FOUND"
fi

if command -v gemini &> /dev/null; then
    GEMINI_VERSION=$(gemini --version 2>/dev/null || echo "unknown")
    echo "  - Gemini CLI: OK ($GEMINI_VERSION)"
else
    echo "  - Gemini CLI: NOT FOUND"
fi

if command -v opencode &> /dev/null; then
    OPENCODE_VERSION=$(opencode --version 2>/dev/null || echo "unknown")
    echo "  - OpenCode CLI: OK ($OPENCODE_VERSION)"
else
    echo "  - OpenCode CLI: NOT FOUND"
fi

# =============================================================================
# Clean up stale browser locks (WhatsApp Web.js / Puppeteer)
# =============================================================================
# When container stops abruptly, Chromium leaves Singleton* lock files
# pointing to old container hostnames. Remove them to prevent launch errors.
echo "[Entrypoint] Cleaning up stale browser locks..."

WHATSAPP_SESSIONS_DIR="/app/data/whatsapp-sessions"
if [ -d "$WHATSAPP_SESSIONS_DIR" ]; then
    # Find and remove all Singleton* files/symlinks in WhatsApp session directories
    find "$WHATSAPP_SESSIONS_DIR" -name "Singleton*" -delete 2>/dev/null || true
    CLEANED_COUNT=$(find "$WHATSAPP_SESSIONS_DIR" -name "Singleton*" 2>/dev/null | wc -l)
    if [ "$CLEANED_COUNT" -eq 0 ]; then
        echo "[Entrypoint] Browser lock files cleared"
    fi
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "[Entrypoint] ================================================"
echo "[Entrypoint] CLI Credentials Persistence: ENABLED"
echo "[Entrypoint] Volume: cli_credentials -> $CLI_HOME"
echo "[Entrypoint] ================================================"
echo "[Entrypoint] To authenticate CLI tools, run as cliuser:"
echo "[Entrypoint]   docker compose exec -u cliuser backend claude auth login"
echo "[Entrypoint]   docker compose exec -u cliuser backend gemini auth login"
echo "[Entrypoint]   docker compose exec -u cliuser backend opencode auth login"
echo "[Entrypoint] ================================================"
echo ""
echo "[Entrypoint] Starting application..."

# Execute the main command with dumb-init for proper signal handling
exec dumb-init -- "$@"
