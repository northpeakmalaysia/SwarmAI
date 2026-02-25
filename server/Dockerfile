# =============================================================================
# SwarmAI Server Dockerfile (CommonJS Backend)
# =============================================================================
# Production-ready Node.js server with WhatsApp and Email support
# Uses Debian-based image for Puppeteer/Chromium compatibility
# Includes: Claude CLI, Gemini CLI, OpenCode CLI, Python packages, Tesseract OCR
# =============================================================================

FROM node:20

WORKDIR /app

# =============================================================================
# System Dependencies
# =============================================================================
# Install system dependencies for:
# - Puppeteer/Chromium (WhatsApp Web.js)
# - Native module compilation
# - Python for document processing
# - Tesseract OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    python3 \
    python3-pip \
    make \
    g++ \
    git \
    curl \
    ca-certificates \
    fonts-freefont-ttf \
    # Chromium dependencies (required for Puppeteer/WhatsApp Web.js)
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-0 \
    libdrm2 \
    libxfixes3 \
    libxext6 \
    libxshmfence1 \
    libxrender1 \
    libxi6 \
    libxtst6 \
    libcups2 \
    libdbus-1-3 \
    libxss1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Python Packages for Document Processing
# =============================================================================
# - openpyxl: Excel (.xlsx) reading/writing
# - python-docx: Word document (.docx) creation/editing
# - reportlab: PDF generation
# - pypdf2: PDF reading/manipulation
# - pandas: Data manipulation (Excel/CSV processing)
# - Pillow: Image processing
# - xlrd: Legacy Excel (.xls) reading
# - xlwt: Legacy Excel (.xls) writing
# - faster-whisper: Local voice transcription (CTranslate2-based, lightweight)
RUN pip3 install --no-cache-dir --break-system-packages \
    openpyxl \
    python-docx \
    reportlab \
    pypdf2 \
    pandas \
    Pillow \
    xlrd \
    xlwt \
    faster-whisper

# =============================================================================
# Tesseract OCR with Multi-Language Support
# =============================================================================
# Languages: English, Malay, Chinese (Simplified & Traditional), Tamil, Hindi
# poppler-utils: Required for PDF to image conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-msa \
    tesseract-ocr-chi-sim \
    tesseract-ocr-chi-tra \
    tesseract-ocr-tam \
    tesseract-ocr-hin \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Verify Tesseract installation
RUN tesseract --version && \
    echo "Available Tesseract languages:" && \
    tesseract --list-langs

# =============================================================================
# FFmpeg for Audio Processing
# =============================================================================
# Required for voice transcription (OGG/Opus → WAV conversion for Whisper)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Puppeteer Setup
# =============================================================================
# Create shared Puppeteer cache directory
RUN mkdir -p /opt/puppeteer-cache && chmod 777 /opt/puppeteer-cache

# Set Puppeteer cache to shared location
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer-cache

# =============================================================================
# NPM Configuration
# =============================================================================
# Configure npm for better reliability
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000

# Copy package files
COPY package*.json ./

# Install project dependencies with native module rebuild
RUN npm install && npm cache clean --force

# Rebuild node-pty for the container's architecture (important for PTY support)
RUN npm rebuild node-pty || echo "node-pty rebuild skipped (not installed or rebuild failed)"

# =============================================================================
# CLI Tools Installation (Global)
# =============================================================================
# Install AI CLI tools globally:
# - @anthropic-ai/claude-code: Claude CLI for agentic AI tasks
# - @google/gemini-cli: Gemini CLI for multimodal AI
# - opencode-ai: OpenCode CLI for multi-provider AI coding
RUN npm cache clean --force && \
    npm install -g @anthropic-ai/claude-code @google/gemini-cli opencode-ai && \
    echo "Verifying CLI installations:" && \
    (which claude && claude --version || echo "Warning: Claude CLI may not be fully installed") && \
    (which gemini && gemini --version || echo "Warning: Gemini CLI may not be fully installed") && \
    (which opencode && opencode --version || echo "Warning: OpenCode CLI may not be fully installed") && \
    echo "CLI tools installation complete"

# =============================================================================
# Non-Root User for CLI Tools
# =============================================================================
# Create cliuser for CLI tools (required for claude --dangerously-skip-permissions)
# User needs access to /app for editing application code
# NOTE: /home/cliuser is mounted as a Docker volume (cli_credentials) for persistence
# The entrypoint script ensures proper directory structure on first run
RUN useradd -m -s /bin/bash cliuser && \
    mkdir -p /home/cliuser/.claude \
             /home/cliuser/.gemini \
             /home/cliuser/.opencode \
             /home/cliuser/.config \
             /home/cliuser/.local/share \
             /home/cliuser/.cache && \
    chown -R cliuser:cliuser /home/cliuser && \
    chmod 755 /home/cliuser

# Install Chrome for Puppeteer
RUN npx puppeteer browsers install chrome

# Verify Chrome is installed
RUN ls -la /opt/puppeteer-cache/ && \
    find /opt/puppeteer-cache -name "chrome" -type f | head -5

# Copy application source
COPY . .

# =============================================================================
# Faster-Whisper CLI Wrapper
# =============================================================================
# faster-whisper is a Python library (no CLI entry point). This wrapper makes it
# callable as 'faster-whisper' from LocalWhisperService.cjs.
# Models download on first use, cached in ~/.cache/huggingface/
RUN cp /app/scripts/faster-whisper-cli.py /usr/local/bin/faster-whisper && \
    sed -i 's/\r$//' /usr/local/bin/faster-whisper && \
    chmod +x /usr/local/bin/faster-whisper

# Give cliuser ownership of app directory so CLI tools can edit files
RUN chown -R cliuser:cliuser /app

# Create data directories
RUN mkdir -p /app/data /app/data/whatsapp-sessions /app/data/workspaces /app/logs /app/cli_context && \
    chown -R cliuser:cliuser /app/data /app/logs /app/cli_context

# =============================================================================
# Entrypoint Script
# =============================================================================
# Convert Windows line endings (CRLF) to Unix (LF) to prevent errors
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# =============================================================================
# Environment Variables
# =============================================================================
ENV NODE_ENV=production
ENV API_PORT=3210
ENV WS_PORT=3211
# CLI tools home directory (mounted as volume for persistence)
ENV CLI_HOME=/home/cliuser

# Expose ports
EXPOSE 3210 3211

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3210/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application with entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "index.cjs"]
