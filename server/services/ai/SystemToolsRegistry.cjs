/**
 * System Tools Registry
 *
 * Central registry for all system tools available to AI Router.
 * Tools are modular functions that extend AI capabilities to interact
 * with external systems (messaging, web, files, scheduling, etc.)
 *
 * Based on WhatsBots master-tools-kb pattern.
 */

const { logger } = require('../logger.cjs');

/**
 * Tool categories for organization
 */
const TOOL_CATEGORIES = {
  MESSAGING: 'messaging',
  WEB: 'web',
  AI: 'ai',
  FILE: 'file',
  VISION: 'vision',
  SCHEDULING: 'scheduling',
  DATA: 'data',
  FLOW: 'flow',
  SWARM: 'swarm',
  RAG: 'rag',
  AGENTIC: 'agentic',
  PLATFORM_DATA: 'platform_data',
  COLLABORATION: 'collaboration',
  MOBILE: 'mobile',
};

/**
 * System tool definition schema
 * @typedef {Object} ToolDefinition
 * @property {string} id - Unique tool identifier
 * @property {string} name - Human-readable name
 * @property {string} description - What the tool does
 * @property {string} category - Tool category
 * @property {Object} parameters - Parameter definitions
 * @property {string[]} requiredParams - Required parameter names
 * @property {string[]} examples - Usage examples
 * @property {boolean} requiresAuth - Whether tool requires authentication
 * @property {Function} execute - Tool execution function
 */

/**
 * Built-in tool definitions
 */
const BUILT_IN_TOOLS = {
  // ============================================================
  // MESSAGING TOOLS
  // ============================================================
  sendWhatsApp: {
    id: 'sendWhatsApp',
    name: 'Send WhatsApp Message',
    description: 'Send a text message via WhatsApp to a contact or group',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      recipient: { type: 'string', description: 'Phone number with country code (e.g., 60123456789) or group ID' },
      message: { type: 'string', description: 'The text message to send' },
      quotedMessageId: { type: 'string', description: 'Optional message ID to reply to', optional: true },
    },
    requiredParams: ['recipient', 'message'],
    examples: [
      'Send message to 60123456789 saying "Hello!"',
      'Reply to user with "Thank you for your inquiry"',
    ],
    requiresAuth: true,
  },

  sendTelegram: {
    id: 'sendTelegram',
    name: 'Send Telegram Message',
    description: 'Send a text message via Telegram Bot',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      chatId: { type: 'string', description: 'Telegram chat ID or username' },
      message: { type: 'string', description: 'The text message to send' },
      parseMode: { type: 'string', description: 'Parse mode: HTML or Markdown', optional: true },
    },
    requiredParams: ['chatId', 'message'],
    examples: ['Send Telegram message to chat saying "Hello!"'],
    requiresAuth: true,
  },

  sendEmail: {
    id: 'sendEmail',
    name: 'Send Email',
    description: 'Send an email message',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body (text or HTML)' },
      isHtml: { type: 'boolean', description: 'Whether body is HTML', optional: true },
    },
    requiredParams: ['to', 'subject', 'body'],
    examples: ['Send email to user@example.com with subject "Update" and body "..."'],
    requiresAuth: true,
  },

  sendMessageToContact: {
    id: 'sendMessageToContact',
    name: 'Send Message To Contact',
    description: 'Send a message to a contact by name. Looks up the contact in the database and sends via their preferred platform (WhatsApp, Telegram, or Email). This is the ONLY way to send messages to people other than the current conversation sender. The "respond" tool only replies to the current conversation - it does NOT send external messages.',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      contactName: { type: 'string', description: 'Name of the contact to send to (partial match supported)' },
      message: { type: 'string', description: 'The message to send' },
      platform: { type: 'string', description: 'Preferred platform: whatsapp, telegram, email. If not specified, uses the first available.', optional: true },
    },
    requiredParams: ['contactName', 'message'],
    examples: [
      'Send message to Nur Sakinah saying "Please update me on the training research"',
      'Message Ahmad via whatsapp: "Meeting at 3pm today"',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // WEB TOOLS
  // ============================================================
  searchWeb: {
    id: 'searchWeb',
    name: 'Search Web',
    description: 'Search the internet for current information (uses Brave Search, Serper, or DuckDuckGo)',
    category: TOOL_CATEGORIES.WEB,
    parameters: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum number of results (1-10)', optional: true, default: 5 },
    },
    requiredParams: ['query'],
    examples: [
      'Search for "latest news about AI"',
      'Find information about iPhone 15 prices',
    ],
    requiresAuth: false,
  },

  fetchWebPage: {
    id: 'fetchWebPage',
    name: 'Fetch Web Page',
    description: 'Download and extract content from a static web page',
    category: TOOL_CATEGORIES.WEB,
    parameters: {
      url: { type: 'string', description: 'URL of the web page to fetch' },
      extractText: { type: 'boolean', description: 'Extract only text content', optional: true, default: true },
    },
    requiredParams: ['url'],
    examples: ['Fetch content from https://example.com'],
    requiresAuth: false,
  },

  fetchJsPage: {
    id: 'fetchJsPage',
    name: 'Fetch JavaScript Page',
    description: 'Fetch web page with JavaScript rendering (for SPAs, e-commerce)',
    category: TOOL_CATEGORIES.WEB,
    parameters: {
      url: { type: 'string', description: 'URL of the web page to fetch' },
      waitSelector: { type: 'string', description: 'CSS selector to wait for', optional: true },
      timeout: { type: 'number', description: 'Timeout in milliseconds', optional: true, default: 30000 },
    },
    requiredParams: ['url'],
    examples: ['Fetch Shopee product page with JS rendering'],
    requiresAuth: false,
  },

  scrapeWebPage: {
    id: 'scrapeWebPage',
    name: 'Scrape Web Page',
    description: 'Extract specific data from web page using CSS selectors',
    category: TOOL_CATEGORIES.WEB,
    parameters: {
      url: { type: 'string', description: 'URL to scrape' },
      selectors: { type: 'object', description: 'Map of field names to CSS selectors' },
      extractAll: { type: 'boolean', description: 'Extract all matches or just first', optional: true },
    },
    requiredParams: ['url', 'selectors'],
    examples: ['Scrape product prices from e-commerce page'],
    requiresAuth: false,
  },

  httpRequest: {
    id: 'httpRequest',
    name: 'HTTP API Request',
    description: 'Make an HTTP API request (GET, POST, PUT, DELETE)',
    category: TOOL_CATEGORIES.WEB,
    parameters: {
      url: { type: 'string', description: 'API endpoint URL' },
      method: { type: 'string', description: 'HTTP method', optional: true, default: 'GET' },
      headers: { type: 'object', description: 'HTTP headers', optional: true },
      body: { type: 'any', description: 'Request body (for POST/PUT)', optional: true },
    },
    requiredParams: ['url'],
    examples: ['Call API endpoint to get user data'],
    requiresAuth: false,
  },

  // ============================================================
  // AI TOOLS
  // ============================================================
  aiChat: {
    id: 'aiChat',
    name: 'AI Chat Completion',
    description: 'Get AI response using the configured AI provider',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      prompt: { type: 'string', description: 'The prompt or question' },
      systemPrompt: { type: 'string', description: 'System instructions', optional: true },
      model: { type: 'string', description: 'Specific model to use', optional: true },
      temperature: { type: 'number', description: 'Response creativity (0-2)', optional: true, default: 0.7 },
    },
    requiredParams: ['prompt'],
    examples: ['Ask AI to explain quantum computing'],
    requiresAuth: false,
  },

  aiClassify: {
    id: 'aiClassify',
    name: 'AI Intent Classification',
    description: 'Classify user intent or message category',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      text: { type: 'string', description: 'Text to classify' },
      categories: { type: 'array', description: 'List of possible categories' },
    },
    requiredParams: ['text', 'categories'],
    examples: ['Classify message as inquiry, complaint, or feedback'],
    requiresAuth: false,
  },

  aiExtract: {
    id: 'aiExtract',
    name: 'AI Data Extraction',
    description: 'Extract structured data from unstructured text',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      text: { type: 'string', description: 'Text to extract from' },
      schema: { type: 'object', description: 'Schema defining what to extract' },
    },
    requiredParams: ['text', 'schema'],
    examples: ['Extract name, email, and phone from message'],
    requiresAuth: false,
  },

  aiTranslate: {
    id: 'aiTranslate',
    name: 'AI Translation',
    description: 'Translate text between languages',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      text: { type: 'string', description: 'Text to translate' },
      targetLanguage: { type: 'string', description: 'Target language code (e.g., en, ms, zh)' },
      sourceLanguage: { type: 'string', description: 'Source language code', optional: true },
    },
    requiredParams: ['text', 'targetLanguage'],
    examples: ['Translate "Hello" to Malay'],
    requiresAuth: false,
  },

  aiSummarize: {
    id: 'aiSummarize',
    name: 'AI Summarization',
    description: 'Summarize long text or document',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      text: { type: 'string', description: 'Text to summarize' },
      maxLength: { type: 'number', description: 'Maximum summary length in words', optional: true },
      style: { type: 'string', description: 'Summary style: brief, detailed, bullet', optional: true },
    },
    requiredParams: ['text'],
    examples: ['Summarize this article in 3 bullet points'],
    requiresAuth: false,
  },

  // ============================================================
  // CLI AI TOOLS (Agentic)
  // ============================================================
  claudeCliPrompt: {
    id: 'claudeCliPrompt',
    name: 'Claude CLI (Agentic)',
    description: 'Execute agentic tasks using Claude CLI (default CLI tool). Supports code generation, research, reasoning, and document creation. Pass mediaFiles to make server-side media (images, PDFs) accessible to the CLI.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      prompt: { type: 'string', description: 'The task or prompt for Claude CLI' },
      mediaFiles: { type: 'array', items: { type: 'string' }, description: 'Array of server file paths (strings) to copy into CLI workspace (e.g., media files from WhatsApp/Telegram). Files are copied so the CLI can access them.', optional: true },
      workspaceId: { type: 'string', description: 'Workspace ID for file operations', optional: true },
      timeout: { type: 'number', description: 'Timeout in seconds (max 3600)', optional: true, default: 300 },
      model: { type: 'string', description: 'Model to use (claude-sonnet-4, claude-opus-4)', optional: true },
    },
    requiredParams: ['prompt'],
    examples: [
      'Use Claude CLI to analyze this codebase and suggest improvements',
      'Research and write a detailed report on machine learning trends',
      'Generate a complete REST API implementation',
    ],
    requiresAuth: true,
  },

  geminiCliPrompt: {
    id: 'geminiCliPrompt',
    name: 'Gemini CLI (Agentic)',
    description: 'Execute agentic tasks using Gemini CLI (FREE). Use when user explicitly asks for Gemini CLI. Supports multimodal tasks, code analysis, research, and document creation. Pass mediaFiles to make server-side media accessible to the CLI.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      prompt: { type: 'string', description: 'The task or prompt for Gemini CLI' },
      mediaFiles: { type: 'array', items: { type: 'string' }, description: 'Array of server file paths (strings) to copy into CLI workspace (e.g., media files from WhatsApp/Telegram). Files are copied so the CLI can access them.', optional: true },
      workspaceId: { type: 'string', description: 'Workspace ID for file operations', optional: true },
      timeout: { type: 'number', description: 'Timeout in seconds (max 3600)', optional: true, default: 300 },
      model: { type: 'string', description: 'Model to use (gemini-2.5-pro, gemini-2.5-flash)', optional: true },
    },
    requiredParams: ['prompt'],
    examples: [
      'Use Gemini to analyze this image and extract information',
      'Research and summarize the latest news on a topic',
      'Generate code documentation',
    ],
    requiresAuth: true,
  },

  opencodeCliPrompt: {
    id: 'opencodeCliPrompt',
    name: 'OpenCode CLI (Agentic)',
    description: 'Execute agentic tasks using OpenCode CLI (FREE, multi-provider). Supports multiple free models for code and automation tasks. Pass mediaFiles to make server-side media accessible to the CLI.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      prompt: { type: 'string', description: 'The task or prompt for OpenCode CLI' },
      mediaFiles: { type: 'array', items: { type: 'string' }, description: 'Array of server file paths (strings) to copy into CLI workspace (e.g., media files from WhatsApp/Telegram). Files are copied so the CLI can access them.', optional: true },
      workspaceId: { type: 'string', description: 'Workspace ID for file operations', optional: true },
      timeout: { type: 'number', description: 'Timeout in seconds (max 3600)', optional: true, default: 300 },
      model: { type: 'string', description: 'Model to use (e.g., kimi-k2.5-free, glm-4.7-free)', optional: true },
    },
    requiredParams: ['prompt'],
    examples: [
      'Use OpenCode to refactor this code',
      'Generate unit tests for this module',
      'Automate the build process',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // FILE TOOLS
  // ============================================================
  readPdf: {
    id: 'readPdf',
    name: 'Read PDF',
    description: 'Extract text content from a PDF file',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      filePath: { type: 'string', description: 'Path to PDF file or URL' },
      pages: { type: 'string', description: 'Page range (e.g., "1-5", "all")', optional: true },
    },
    requiredParams: ['filePath'],
    examples: ['Read content from document.pdf'],
    requiresAuth: false,
  },

  readExcel: {
    id: 'readExcel',
    name: 'Read Excel',
    description: 'Read data from Excel spreadsheet',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      filePath: { type: 'string', description: 'Path to Excel file' },
      sheet: { type: 'string', description: 'Sheet name or index', optional: true },
      range: { type: 'string', description: 'Cell range (e.g., "A1:D10")', optional: true },
    },
    requiredParams: ['filePath'],
    examples: ['Read data from report.xlsx sheet "Sales"'],
    requiresAuth: false,
  },

  readDocx: {
    id: 'readDocx',
    name: 'Read Word Document',
    description: 'Extract text content from a DOCX/DOC Word document',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      filePath: { type: 'string', description: 'Path to Word document file' },
    },
    requiredParams: ['filePath'],
    examples: ['Read content from report.docx'],
    requiresAuth: false,
  },

  readText: {
    id: 'readText',
    name: 'Read Text File',
    description: 'Read content from a plain text file (TXT, MD, LOG, JSON, XML, YAML, HTML, code files)',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      filePath: { type: 'string', description: 'Path to text file' },
      encoding: { type: 'string', description: 'Text encoding (default: utf-8)', optional: true },
    },
    requiredParams: ['filePath'],
    examples: ['Read content from notes.txt', 'Read config.json'],
    requiresAuth: false,
  },

  readCsv: {
    id: 'readCsv',
    name: 'Read CSV File',
    description: 'Parse and read data from a CSV or TSV file',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      filePath: { type: 'string', description: 'Path to CSV/TSV file' },
      delimiter: { type: 'string', description: 'Column delimiter (default: auto-detect)', optional: true },
      maxRows: { type: 'number', description: 'Maximum rows to read (default: 1000)', optional: true },
    },
    requiredParams: ['filePath'],
    examples: ['Read data from export.csv'],
    requiresAuth: false,
  },

  generatePdf: {
    id: 'generatePdf',
    name: 'Generate PDF',
    description: 'Create a PDF document from text or HTML. Saves to workspace output/ directory. Returns filePath for use with sendWhatsAppMedia/sendTelegramMedia/sendEmailAttachment.',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      content: { type: 'string', description: 'Content (text or HTML)' },
      title: { type: 'string', description: 'Document title / filename (without extension)', optional: true },
      isHtml: { type: 'boolean', description: 'Whether content is HTML', optional: true },
    },
    requiredParams: ['content'],
    examples: [
      'Generate PDF report from HTML content',
      'Create a sales report PDF and send via WhatsApp',
    ],
    requiresAuth: false,
  },

  generateExcel: {
    id: 'generateExcel',
    name: 'Generate Excel Spreadsheet',
    description: 'Create an .xlsx Excel file from an array of objects. Each object becomes a row, keys become column headers. Saves to workspace output/ directory. Returns filePath for use with send tools.',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      data: { type: 'array', description: 'Array of objects (each object = one row, keys = column headers)' },
      sheetName: { type: 'string', description: 'Name of the worksheet', optional: true, default: 'Sheet1' },
      title: { type: 'string', description: 'Filename (without extension)', optional: true, default: 'export' },
    },
    requiredParams: ['data'],
    examples: [
      'Generate Excel spreadsheet from sales data',
      'Create .xlsx file with employee records',
    ],
    requiresAuth: false,
  },

  generateCsv: {
    id: 'generateCsv',
    name: 'Generate CSV File',
    description: 'Create a .csv file from an array of objects. Each object becomes a row, keys become column headers. Saves to workspace output/ directory. Returns filePath for use with send tools.',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      data: { type: 'array', description: 'Array of objects (each object = one row, keys = column headers)' },
      title: { type: 'string', description: 'Filename (without extension)', optional: true, default: 'export' },
      delimiter: { type: 'string', description: 'Column delimiter character', optional: true, default: ',' },
    },
    requiredParams: ['data'],
    examples: [
      'Generate CSV file from contact list',
      'Export data as CSV for download',
    ],
    requiresAuth: false,
  },

  generateDocx: {
    id: 'generateDocx',
    name: 'Generate Word Document',
    description: 'Create a .docx Word document. Accepts EITHER a plain text string (auto-formatted with heading/bullet detection) OR a structured array of blocks. Saves to workspace output/ directory. Returns filePath for use with sendWhatsAppMedia/sendTelegramMedia/sendEmailAttachment.',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      content: { type: 'string', description: 'Document content. SIMPLEST: pass a plain text string (headings detected from # markdown or numbered sections, bullets from - or •). ADVANCED: pass an array of blocks like [{"type":"heading1","text":"Title"}, {"type":"paragraph","text":"Body"}]. Supported types: heading1, heading2, heading3, paragraph, bullet, numbered, pageBreak.' },
      title: { type: 'string', description: 'Document title / filename (without extension)', optional: true, default: 'document' },
    },
    requiredParams: ['content'],
    examples: [
      'generateDocx({content: "# Report Title\\n\\nThis is the body text.\\n\\n- Bullet one\\n- Bullet two", title: "my-report"})',
      'Create a Word document from extracted data and send via WhatsApp',
      'Generate a professional document with title, sections, and bullet points',
    ],
    requiresAuth: false,
  },

  listWorkspaceFiles: {
    id: 'listWorkspaceFiles',
    name: 'List Workspace Files',
    description: 'List files in the workspace output/ directory. Use to check what documents have been generated.',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      pattern: { type: 'string', description: 'File extension filter (e.g., ".pdf", ".xlsx", ".csv")', optional: true },
    },
    requiredParams: [],
    examples: [
      'List all generated files in workspace',
      'Check what PDF files exist',
    ],
    requiresAuth: false,
  },

  sendWhatsAppMedia: {
    id: 'sendWhatsAppMedia',
    name: 'Send WhatsApp Media/File',
    description: 'Send a file, image, or media via WhatsApp. Accepts local file paths (from generatePdf/generateExcel/generateCsv) OR download URLs (from executeOnLocalAgent screenshot/fileTransfer results). IMPORTANT: When executeOnLocalAgent returns a downloadUrl for a screenshot or file, you MUST use this tool to send it as media — do NOT just include the URL in a text response.',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      recipient: { type: 'string', description: 'Phone number with country code (e.g., 60123456789) or group ID' },
      filePath: { type: 'string', description: 'Path to local file OR download URL (e.g., /api/temp-files/download/abc123 or http://...)' },
      caption: { type: 'string', description: 'Caption/message to accompany the file', optional: true },
    },
    requiredParams: ['recipient', 'filePath'],
    examples: [
      'Send sales-report.pdf to 60123456789 via WhatsApp',
      'Send screenshot from Local Agent: sendWhatsAppMedia("60123456789", "/api/temp-files/download/abc123", "Here is the screenshot")',
      'Send transferred file: sendWhatsAppMedia("60123456789", "/api/temp-files/download/xyz789", "Here is the file you requested")',
    ],
    requiresAuth: true,
  },

  sendTelegramMedia: {
    id: 'sendTelegramMedia',
    name: 'Send Telegram Media/File',
    description: 'Send a file (PDF, Excel, CSV, image, etc.) via Telegram Bot. Use filePath from generatePdf/generateExcel/generateCsv result.',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      chatId: { type: 'string', description: 'Telegram chat ID' },
      filePath: { type: 'string', description: 'Path to the file to send (from generate tool result or workspace output/)' },
      caption: { type: 'string', description: 'Caption/message to accompany the file', optional: true },
    },
    requiredParams: ['chatId', 'filePath'],
    examples: [
      'Send report.pdf to Telegram chat',
      'Send CSV export to Telegram with caption',
    ],
    requiresAuth: true,
  },

  sendEmailAttachment: {
    id: 'sendEmailAttachment',
    name: 'Send Email with Attachment',
    description: 'Send an email with a file attachment. Use filePath from generatePdf/generateExcel/generateCsv result.',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body (text or HTML)' },
      filePath: { type: 'string', description: 'Path to the file to attach (from generate tool result or workspace output/)' },
      isHtml: { type: 'boolean', description: 'Whether body is HTML', optional: true },
    },
    requiredParams: ['to', 'subject', 'body', 'filePath'],
    examples: [
      'Email report.pdf to user@example.com with subject "Monthly Report"',
      'Send Excel spreadsheet as email attachment',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // VISION TOOLS
  // ============================================================
  extractTextFromImage: {
    id: 'extractTextFromImage',
    name: 'Extract Text from Image (OCR)',
    description: 'Extract text from an image using OCR (Tesseract). Useful for reading text in screenshots, photos of documents, receipts, signs, etc.',
    category: TOOL_CATEGORIES.VISION,
    parameters: {
      imagePath: { type: 'string', description: 'Path to the image file or media URL' },
      languages: { type: 'string', description: 'OCR languages (e.g., "eng+msa+chi_sim"). Supported: eng, msa, chi_sim, chi_tra, tam, hin', optional: true },
    },
    requiredParams: ['imagePath'],
    examples: [
      'Extract text from screenshot.png',
      'OCR the receipt image to get the total',
      'Read text from this photo of a sign',
    ],
    requiresAuth: false,
  },

  analyzeImageMessage: {
    id: 'analyzeImageMessage',
    name: 'Analyze Image Message',
    description: 'Analyze an image-only message and extract text content using OCR. Returns extracted text that can be added to the message.',
    category: TOOL_CATEGORIES.VISION,
    parameters: {
      messageId: { type: 'string', description: 'ID of the message containing the image' },
      mediaUrl: { type: 'string', description: 'URL or path to the image', optional: true },
      languages: { type: 'string', description: 'OCR languages (default: based on user settings)', optional: true },
      minConfidence: { type: 'number', description: 'Minimum OCR confidence threshold (0-1)', optional: true, default: 0.3 },
    },
    requiredParams: ['messageId'],
    examples: [
      'Analyze image message and extract text',
      'OCR the image in this message',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // SCHEDULING TOOLS
  // ============================================================
  createReminder: {
    id: 'createReminder',
    name: 'Create Reminder',
    description: 'Schedule a reminder message',
    category: TOOL_CATEGORIES.SCHEDULING,
    parameters: {
      message: { type: 'string', description: 'Reminder message' },
      datetime: { type: 'string', description: 'When to send (ISO datetime or relative like "in 1 hour")' },
      recipient: { type: 'string', description: 'Who to remind (chatId or email)', optional: true },
    },
    requiredParams: ['message', 'datetime'],
    examples: ['Remind me to call John tomorrow at 3pm'],
    requiresAuth: true,
  },

  listReminders: {
    id: 'listReminders',
    name: 'List Reminders',
    description: 'List all scheduled reminders',
    category: TOOL_CATEGORIES.SCHEDULING,
    parameters: {
      status: { type: 'string', description: 'Filter by status: pending, completed, all', optional: true },
    },
    requiredParams: [],
    examples: ['Show all my pending reminders'],
    requiresAuth: true,
  },

  cancelReminder: {
    id: 'cancelReminder',
    name: 'Cancel Reminder',
    description: 'Cancel a scheduled reminder',
    category: TOOL_CATEGORIES.SCHEDULING,
    parameters: {
      reminderId: { type: 'string', description: 'ID of reminder to cancel' },
    },
    requiredParams: ['reminderId'],
    examples: ['Cancel reminder abc123'],
    requiresAuth: true,
  },

  // ============================================================
  // DATA TRANSFORM TOOLS
  // ============================================================
  jsonParse: {
    id: 'jsonParse',
    name: 'Parse JSON',
    description: 'Parse JSON string to object',
    category: TOOL_CATEGORIES.DATA,
    parameters: {
      text: { type: 'string', description: 'JSON string to parse' },
      path: { type: 'string', description: 'JSONPath to extract specific value', optional: true },
    },
    requiredParams: ['text'],
    examples: ['Parse JSON and extract user.name'],
    requiresAuth: false,
  },

  jsonStringify: {
    id: 'jsonStringify',
    name: 'Stringify JSON',
    description: 'Convert object to JSON string',
    category: TOOL_CATEGORIES.DATA,
    parameters: {
      data: { type: 'any', description: 'Data to stringify' },
      pretty: { type: 'boolean', description: 'Format with indentation', optional: true },
    },
    requiredParams: ['data'],
    examples: ['Convert object to JSON string'],
    requiresAuth: false,
  },

  regexExtract: {
    id: 'regexExtract',
    name: 'Regex Extract',
    description: 'Extract text using regular expression',
    category: TOOL_CATEGORIES.DATA,
    parameters: {
      text: { type: 'string', description: 'Text to search' },
      pattern: { type: 'string', description: 'Regular expression pattern' },
      flags: { type: 'string', description: 'Regex flags (g, i, m)', optional: true },
    },
    requiredParams: ['text', 'pattern'],
    examples: ['Extract all email addresses from text'],
    requiresAuth: false,
  },

  templateString: {
    id: 'templateString',
    name: 'Template String',
    description: 'Format string with variable substitution',
    category: TOOL_CATEGORIES.DATA,
    parameters: {
      template: { type: 'string', description: 'Template with {{variable}} placeholders' },
      data: { type: 'object', description: 'Data object with values' },
    },
    requiredParams: ['template', 'data'],
    examples: ['Format "Hello {{name}}" with name="John"'],
    requiresAuth: false,
  },

  // ============================================================
  // FLOW TOOLS
  // ============================================================
  triggerFlow: {
    id: 'triggerFlow',
    name: 'Trigger Flow',
    description: 'Execute another flow with given inputs',
    category: TOOL_CATEGORIES.FLOW,
    parameters: {
      flowId: { type: 'string', description: 'ID of flow to trigger' },
      inputs: { type: 'object', description: 'Input data for the flow', optional: true },
    },
    requiredParams: ['flowId'],
    examples: ['Trigger the onboarding flow for new user'],
    requiresAuth: true,
  },

  // ============================================================
  // RAG TOOLS
  // ============================================================
  ragQuery: {
    id: 'ragQuery',
    name: 'RAG Knowledge Query',
    description: 'Search knowledge base and generate contextual response',
    category: TOOL_CATEGORIES.RAG,
    parameters: {
      query: { type: 'string', description: 'Question or search query' },
      libraryId: { type: 'string', description: 'Knowledge library to search', optional: true },
      topK: { type: 'number', description: 'Number of relevant chunks to retrieve', optional: true },
      generateResponse: { type: 'boolean', description: 'Generate AI response with context', optional: true },
    },
    requiredParams: ['query'],
    examples: ['Search knowledge base for company refund policy'],
    requiresAuth: true,
  },

  // ============================================================
  // SWARM TOOLS
  // ============================================================
  handoffToAgent: {
    id: 'handoffToAgent',
    name: 'Handoff Task',
    description: 'Hand off a task or conversation to the best-matched team member (human) or AI agent based on their roles and skills. Can auto-select the best person/agent or target a specific one by name.',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {
      taskDescription: { type: 'string', description: 'Description of the task being handed off - used to match against team member/agent skills' },
      targetName: { type: 'string', description: 'Name of the specific team member or agent to hand off to (optional - if omitted, auto-selects best match)', optional: true },
      targetId: { type: 'string', description: 'Specific team member ID or agent ID to hand off to', optional: true },
      requiredSkills: { type: 'string', description: 'Comma-separated skills needed for this task (used for matching)', optional: true },
      reason: { type: 'string', description: 'Reason for the handoff', optional: true },
      context: { type: 'string', description: 'Additional context or instructions for the handoff recipient', optional: true },
      conversationId: { type: 'string', description: 'Conversation ID to transfer (optional)', optional: true },
      targetType: { type: 'string', description: 'Filter target type: "team" for human team members, "agent" for AI agents, "all" for both (default: all)', optional: true },
    },
    requiredParams: ['taskDescription'],
    examples: [
      'Handoff financial review to the accounting team member',
      'Transfer this bug report to a developer with frontend skills',
      'Assign this customer inquiry to the best available support agent',
    ],
    requiresAuth: true,
  },

  broadcastToSwarm: {
    id: 'broadcastToSwarm',
    name: 'Broadcast Message',
    description: 'Broadcast a message to team members (human) and/or AI agents. Can target all, filter by roles/skills, or specify individual recipients.',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {
      message: { type: 'string', description: 'Message to broadcast to recipients' },
      targetType: { type: 'string', description: 'Who to broadcast to: "team" for human team members, "agent" for AI agents, "all" for both (default: all)', optional: true },
      targetRoles: { type: 'string', description: 'Comma-separated roles to filter recipients (e.g. "developer,designer")', optional: true },
      targetSkills: { type: 'string', description: 'Comma-separated skills to filter recipients (e.g. "accounting,budgeting")', optional: true },
      targetIds: { type: 'string', description: 'Comma-separated specific recipient IDs', optional: true },
      priority: { type: 'string', description: 'Priority: low, normal, high (default: normal)', optional: true },
    },
    requiredParams: ['message'],
    examples: [
      'Broadcast system maintenance notice to all team members and agents',
      'Notify all developers about the new API change',
      'Send urgent alert to team members with security skills',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // AGENTIC REASONING TOOLS (For autonomous agent behavior)
  // ============================================================
  notifyMaster: {
    id: 'notifyMaster',
    name: 'Notify Master',
    description: 'Send a notification to your master/owner via their preferred channel (WhatsApp, Email, or Telegram)',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      message: { type: 'string', description: 'Notification message to send' },
      priority: { type: 'string', description: 'Priority: low, normal, high, urgent', optional: true },
      type: { type: 'string', description: 'Notification type: info, alert, report, health_summary', optional: true },
    },
    requiredParams: ['message'],
    examples: ['Notify master: "Good morning! All 5 agents are online and operational."'],
    requiresAuth: true,
  },

  checkAgentStatuses: {
    id: 'checkAgentStatuses',
    name: 'Check Agent Statuses',
    description: 'Get the current status of all agents and connected platforms in the system',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {},
    requiredParams: [],
    examples: ['Check which agents are online and what platforms are connected'],
    requiresAuth: true,
  },

  saveMemory: {
    id: 'saveMemory',
    name: 'Save Memory',
    description: 'Store something important to your long-term memory for future reference',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      content: { type: 'string', description: 'What to remember' },
      memoryType: { type: 'string', description: 'Type: decision, learning, event, context, preference', optional: true },
      importance: { type: 'number', description: 'Importance score 0.0 to 1.0', optional: true },
    },
    requiredParams: ['content'],
    examples: ['Remember: "Master prefers status updates in the morning"'],
    requiresAuth: true,
  },

  checkGoalProgress: {
    id: 'checkGoalProgress',
    name: 'Check Goal Progress',
    description: 'Review the current status and progress of all your active goals',
    category: TOOL_CATEGORIES.AI,
    parameters: {},
    requiredParams: [],
    examples: ['Review my active goals and their progress'],
    requiresAuth: true,
  },

  // --- Self-Awareness Tools ---
  getMyProfile: {
    id: 'getMyProfile',
    name: 'Get My Profile',
    description: 'View your own agent profile, configuration, autonomy level, master contact, and capabilities',
    category: TOOL_CATEGORIES.AI,
    parameters: {},
    requiredParams: [],
    examples: ['Check my profile and configuration'],
    requiresAuth: true,
  },

  listMySkills: {
    id: 'listMySkills',
    name: 'List My Skills',
    description: 'View all your acquired skills, levels, and experience points',
    category: TOOL_CATEGORIES.AI,
    parameters: {},
    requiredParams: [],
    examples: ['What skills do I have?'],
    requiresAuth: true,
  },

  listRecentMemories: {
    id: 'listRecentMemories',
    name: 'List Recent Memories',
    description: 'Browse your most recent memories and stored knowledge',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      limit: { type: 'number', description: 'Number of memories to retrieve (default: 10)', optional: true },
      memoryType: { type: 'string', description: 'Filter by type: decision, learning, event, context, preference, reflection', optional: true },
    },
    requiredParams: [],
    examples: ['Show my recent memories', 'List my learning memories'],
    requiresAuth: true,
  },

  searchMemory: {
    id: 'searchMemory',
    name: 'Search Memory',
    description: 'Search through your long-term memories by keyword or topic',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      query: { type: 'string', description: 'Search query to find relevant memories' },
      limit: { type: 'number', description: 'Max results (default: 5)', optional: true },
    },
    requiredParams: ['query'],
    examples: ['Search memories about master preferences', 'Find what I learned about email handling'],
    requiresAuth: true,
  },

  // --- Schedule Management (Auto-Schedule) ---
  listMySchedules: {
    id: 'listMySchedules',
    name: 'List My Schedules',
    description: 'View all your active and paused schedules',
    category: TOOL_CATEGORIES.SCHEDULING,
    parameters: {},
    requiredParams: [],
    examples: ['Show my active schedules'],
    requiresAuth: true,
  },

  createSchedule: {
    id: 'createSchedule',
    name: 'Create Schedule',
    description: 'Create a new automated schedule (cron, interval, or one-time)',
    category: TOOL_CATEGORIES.SCHEDULING,
    parameters: {
      title: { type: 'string', description: 'Schedule title/name' },
      scheduleType: { type: 'string', description: 'Type: cron, interval, once' },
      actionType: { type: 'string', description: 'Action: reasoning_cycle, check_messages, send_report, health_summary, custom_prompt' },
      cronExpression: { type: 'string', description: 'Cron expression (for cron type, e.g. "0 9 * * *" for daily 9am)', optional: true },
      intervalMinutes: { type: 'number', description: 'Interval in minutes (for interval type)', optional: true },
      customPrompt: { type: 'string', description: 'Custom instructions for the scheduled task', optional: true },
    },
    requiredParams: ['title', 'scheduleType', 'actionType'],
    examples: ['Create daily morning check at 9am', 'Schedule hourly message review'],
    requiresAuth: true,
  },

  updateSchedule: {
    id: 'updateSchedule',
    name: 'Update Schedule',
    description: 'Modify an existing schedule (pause, resume, change timing)',
    category: TOOL_CATEGORIES.SCHEDULING,
    parameters: {
      scheduleId: { type: 'string', description: 'ID of the schedule to update' },
      isActive: { type: 'boolean', description: 'Enable or disable the schedule', optional: true },
      cronExpression: { type: 'string', description: 'New cron expression', optional: true },
      intervalMinutes: { type: 'number', description: 'New interval in minutes', optional: true },
      customPrompt: { type: 'string', description: 'Updated custom prompt', optional: true },
    },
    requiredParams: ['scheduleId'],
    examples: ['Pause schedule abc123', 'Change schedule to run every 2 hours'],
    requiresAuth: true,
  },

  deleteSchedule: {
    id: 'deleteSchedule',
    name: 'Delete Schedule',
    description: 'Remove a schedule permanently',
    category: TOOL_CATEGORIES.SCHEDULING,
    parameters: {
      scheduleId: { type: 'string', description: 'ID of the schedule to delete' },
    },
    requiredParams: ['scheduleId'],
    examples: ['Delete schedule abc123'],
    requiresAuth: true,
  },

  // --- Task Management (Auto-Task) ---
  listMyTasks: {
    id: 'listMyTasks',
    name: 'List My Tasks',
    description: 'View your tasks with their IDs, statuses, and priorities. Use returned taskIds with updateTaskStatus to change status.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      status: { type: 'string', description: 'Filter: pending, in_progress, completed, all', optional: true },
    },
    requiredParams: [],
    examples: ['Show my pending tasks', 'List all tasks'],
    requiresAuth: true,
  },

  createTask: {
    id: 'createTask',
    name: 'Create Task',
    description: 'Create a new task for yourself or assign to a team member. Returns the new taskId for tracking.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description and requirements', optional: true },
      priority: { type: 'string', description: 'Priority: low, normal, high, urgent', optional: true },
      assignTo: { type: 'string', description: 'Team member contact_id to assign to (omit for self)', optional: true },
      dueAt: { type: 'string', description: 'Due date in ISO format', optional: true },
      parentTaskId: { type: 'string', description: 'Parent task ID for plan subtasks', optional: true },
      planItemType: { type: 'string', description: 'Plan step type: tool_action, human_input, delegation, research, synthesis', optional: true },
      planOrder: { type: 'number', description: 'Execution order within parent plan', optional: true },
    },
    requiredParams: ['title'],
    examples: ['Create task: Review morning emails', 'Create urgent task for team member'],
    requiresAuth: true,
  },

  updateTaskStatus: {
    id: 'updateTaskStatus',
    name: 'Update Task Status',
    description: 'Update a task status. Use the taskId from your Active Tasks [taskId:...]. Call once per task.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      taskId: { type: 'string', description: 'UUID from [taskId:...] in your Active Tasks context' },
      status: { type: 'string', description: 'New status: in_progress, completed, blocked, cancelled' },
      notes: { type: 'string', description: 'Optional notes about the status change', optional: true },
    },
    requiredParams: ['taskId', 'status'],
    examples: [
      '{"action":"updateTaskStatus","params":{"taskId":"a1b2c3d4-...","status":"completed","notes":"Task finished"}}',
      '{"action":"updateTaskStatus","params":{"taskId":"a1b2c3d4-...","status":"in_progress"}}',
    ],
    requiresAuth: true,
  },

  // --- Goal Management (Auto-Goal) ---
  createGoal: {
    id: 'createGoal',
    name: 'Create Goal',
    description: 'Create a new goal for yourself to track progress toward an objective',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      title: { type: 'string', description: 'Goal title' },
      description: { type: 'string', description: 'Detailed goal description', optional: true },
      goalType: { type: 'string', description: 'Type: ongoing, deadline, milestone', optional: true },
      priority: { type: 'string', description: 'Priority: low, normal, high, critical', optional: true },
      targetMetric: { type: 'string', description: 'What to measure (e.g., "emails_processed")', optional: true },
      targetValue: { type: 'number', description: 'Target value for the metric', optional: true },
      deadlineAt: { type: 'string', description: 'Deadline in ISO format', optional: true },
    },
    requiredParams: ['title'],
    examples: ['Create goal: Process all morning emails within 1 hour', 'Set milestone to learn 3 new skills'],
    requiresAuth: true,
  },

  updateGoalProgress: {
    id: 'updateGoalProgress',
    name: 'Update Goal Progress',
    description: 'Update the progress value on a goal',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      goalId: { type: 'string', description: 'ID of the goal' },
      currentValue: { type: 'number', description: 'New progress value' },
      notes: { type: 'string', description: 'Progress notes', optional: true },
    },
    requiredParams: ['goalId', 'currentValue'],
    examples: ['Update goal progress to 75%'],
    requiresAuth: true,
  },

  // --- Team & Inter-Agent Communication ---
  listTeamMembers: {
    id: 'listTeamMembers',
    name: 'List Team Members',
    description: 'View your team members and their availability',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {},
    requiredParams: [],
    examples: ['Who is on my team?', 'Check team availability'],
    requiresAuth: true,
  },

  searchTeamMembers: {
    id: 'searchTeamMembers',
    name: 'Search Team Members',
    description: 'Search team members by name, role, department, skills, or gender. Use this to find a specific team member by their job title, department, skill set, or gender.',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {
      query: { type: 'string', description: 'Search by name, role, or department (e.g. "HR", "developer", "Sakinah")', optional: true },
      role: { type: 'string', description: 'Filter by role (e.g. "Human Resource", "Engineer")', optional: true },
      department: { type: 'string', description: 'Filter by department (e.g. "HR Department", "Engineering")', optional: true },
      skill: { type: 'string', description: 'Filter by skill (e.g. "training", "payroll", "cooking")', optional: true },
      gender: { type: 'string', description: 'Filter by gender: "male" or "female"', optional: true },
      isAvailable: { type: 'boolean', description: 'Filter by availability', optional: true },
    },
    requiredParams: [],
    examples: [
      'Find the HR team member',
      'Search for team members with cooking skills',
      'Who in my team is in the Engineering department?',
      'Find female team members',
    ],
    requiresAuth: true,
  },

  sendAgentMessage: {
    id: 'sendAgentMessage',
    name: 'Send Agent Message',
    description: 'Send an internal message to another agent in the system',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {
      toAgenticId: { type: 'string', description: 'Target agent agentic_id' },
      subject: { type: 'string', description: 'Message subject' },
      content: { type: 'string', description: 'Message content' },
      messageType: { type: 'string', description: 'Type: request, notification, handoff, status_update', optional: true },
    },
    requiredParams: ['toAgenticId', 'subject', 'content'],
    examples: ['Send status update to another agent', 'Request information from team agent'],
    requiresAuth: true,
  },

  delegateTask: {
    id: 'delegateTask',
    name: 'Delegate Task',
    description: 'Delegate a task to a sub-agent or team member',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {
      taskId: { type: 'string', description: 'Task ID to delegate' },
      toAgenticId: { type: 'string', description: 'Target agent to delegate to' },
      instructions: { type: 'string', description: 'Additional instructions for the delegate', optional: true },
    },
    requiredParams: ['taskId', 'toAgenticId'],
    examples: ['Delegate email processing task to sub-agent'],
    requiresAuth: true,
  },

  // --- Self-Management & Learning ---
  selfReflect: {
    id: 'selfReflect',
    name: 'Self-Reflect',
    description: 'Create a self-reflection entry - assess your performance, identify learnings, and plan improvements',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      reflection: { type: 'string', description: 'Your reflection, assessment, or learning' },
      category: { type: 'string', description: 'Category: performance, learning, improvement, observation', optional: true },
    },
    requiredParams: ['reflection'],
    examples: ['Reflect on how I handled morning messages', 'Note a pattern I discovered'],
    requiresAuth: true,
  },

  requestApproval: {
    id: 'requestApproval',
    name: 'Request Approval',
    description: 'Queue a genuinely dangerous action for master approval before execution. ONLY use for real planned actions that could have serious consequences (spending money, deleting data, sending mass messages, changing system config). NEVER use this to cover up a failed command or to pretend a non-existent feature "needs approval." If a tool failed, tell the user honestly — do not create a fake approval request.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      actionType: { type: 'string', description: 'What needs approval: send_message, create_task, budget_increase, autonomy_change, other' },
      title: { type: 'string', description: 'Brief title of what needs approval' },
      description: { type: 'string', description: 'Detailed description of the action and why' },
      priority: { type: 'string', description: 'Priority: low, normal, high, urgent', optional: true },
    },
    requiredParams: ['actionType', 'title', 'description'],
    examples: ['Request approval to send marketing report to client', 'Request approval before deleting old logs'],
    requiresAuth: true,
  },

  // ============================================================
  // ORCHESTRATION TOOLS (Manager-Specialist pattern)
  // ============================================================
  orchestrate: {
    id: 'orchestrate',
    name: 'Orchestrate Multi-Agent Task',
    description: 'Decompose a complex task into subtasks and execute them in parallel using specialist sub-agents. Each sub-agent runs its own reasoning loop, gathers information, and returns results. Use this for tasks that benefit from parallel research, analysis, or multi-domain expertise. Do NOT use for simple tasks you can handle directly.',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {
      goal: { type: 'string', description: 'The overall goal to accomplish' },
      subtasks: { type: 'array', description: 'Array of subtask objects: [{title: "...", description: "...", requiredSkills: "skill1,skill2"}]. Max 5 subtasks.' },
      mode: { type: 'string', description: 'Execution mode: "parallel" (default, all at once) or "sequential" (one by one, results passed forward)', optional: true },
    },
    requiredParams: ['goal', 'subtasks'],
    examples: [
      'Orchestrate hiring research: subtasks for UIUX candidates, .NET C# candidates, and team skill assessment',
      'Parallel research: one agent searches web for training, another checks team skills',
    ],
    requiresAuth: true,
  },

  createSpecialist: {
    id: 'createSpecialist',
    name: 'Create Specialist Agent',
    description: 'Create a specialist sub-agent with specific focus and skills. The agent persists and can be reused for future orchestrated tasks.',
    category: TOOL_CATEGORIES.SWARM,
    parameters: {
      name: { type: 'string', description: 'Name for the specialist (e.g., "UIUX Hiring Specialist")' },
      role: { type: 'string', description: 'Role description defining the specialist focus' },
      description: { type: 'string', description: 'Detailed description of specialist capabilities', optional: true },
    },
    requiredParams: ['name', 'role'],
    examples: [
      'Create a .NET Developer Specialist for C# code review tasks',
      'Create a UIUX Hiring Specialist for recruitment workflows',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // COLLABORATION TOOLS (Phase 6: Agent Collaboration Protocol)
  // ============================================================
  consultAgent: {
    id: 'consultAgent',
    name: 'Consult Another Agent',
    description: 'Ask another agent a specific question and receive their expert response. Use this when you need a specialist opinion, domain expertise, or want to verify information with a colleague agent. The target agent will reason about your question and provide a structured response.',
    category: TOOL_CATEGORIES.COLLABORATION,
    parameters: {
      targetAgentId: { type: 'string', description: 'The ID of the agent to consult' },
      question: { type: 'string', description: 'The specific question to ask the agent' },
      context: { type: 'string', description: 'Additional context to help the agent answer', optional: true },
    },
    requiredParams: ['targetAgentId', 'question'],
    examples: [
      'Ask the research agent: "What are the latest trends in AI?"',
      'Consult the finance agent about budget projections',
    ],
    requiresAuth: true,
  },

  requestConsensus: {
    id: 'requestConsensus',
    name: 'Request Team Consensus',
    description: 'Ask multiple agents to vote on a topic with defined options. Each agent evaluates independently and votes. The majority vote wins. Use this for decisions that benefit from multiple perspectives.',
    category: TOOL_CATEGORIES.COLLABORATION,
    parameters: {
      agentIds: { type: 'array', description: 'Array of agent IDs to participate in voting' },
      topic: { type: 'string', description: 'The topic or question to vote on' },
      options: { type: 'array', description: 'Array of option strings to vote on (minimum 2)' },
      context: { type: 'string', description: 'Additional context for voters', optional: true },
    },
    requiredParams: ['agentIds', 'topic', 'options'],
    examples: [
      'Vote on best approach: ["microservices", "monolith", "serverless"]',
      'Team consensus on priority: ["feature A", "feature B", "bug fixes"]',
    ],
    requiresAuth: true,
  },

  shareKnowledge: {
    id: 'shareKnowledge',
    name: 'Share Knowledge with Team',
    description: 'Share a learning or insight with other relevant agents. The system automatically identifies agents with matching skills and creates shared memory entries for them. Use this when you discover something useful that other agents should know.',
    category: TOOL_CATEGORIES.COLLABORATION,
    parameters: {
      learning: { type: 'string', description: 'The knowledge or insight to share' },
      tags: { type: 'array', description: 'Tags to help route to relevant agents (e.g., skill categories)', optional: true },
      importance: { type: 'number', description: 'Importance score 0.0-1.0 (default 0.6)', optional: true },
    },
    requiredParams: ['learning'],
    examples: [
      'Share that "WhatsApp API rate limits are 1000 msgs/day" with communication agents',
      'Propagate a discovered best practice for data analysis',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // PHASE 7: Async Consensus + Conflict Resolution
  // ============================================================
  requestAsyncConsensus: {
    id: 'requestAsyncConsensus',
    name: 'Request Async Consensus',
    description: 'Start a non-blocking consensus vote among multiple agents. Each agent votes independently on a topic. Results are collected asynchronously with a configurable deadline. Use this when you need team input but don\'t want to wait for all votes immediately.',
    category: TOOL_CATEGORIES.COLLABORATION,
    parameters: {
      agentIds: { type: 'array', description: 'Array of agent IDs to vote' },
      topic: { type: 'string', description: 'The topic/question to vote on' },
      options: { type: 'array', description: 'Available vote options', optional: true },
      deadlineMinutes: { type: 'number', description: 'Deadline in minutes (default: 5)', optional: true },
    },
    requiredParams: ['agentIds', 'topic'],
    examples: [
      'Request async team vote on "Should we prioritize feature X or Y?"',
      'Collect async opinions on deployment strategy with 10-minute deadline',
    ],
    requiresAuth: true,
  },

  resolveConflict: {
    id: 'resolveConflict',
    name: 'Resolve Conflict',
    description: 'Initiate structured conflict resolution between agents with opposing positions. Each agent gets one rebuttal round. If no agent concedes, the conflict escalates to a designated hierarchy agent or is flagged for human review.',
    category: TOOL_CATEGORIES.COLLABORATION,
    parameters: {
      agentIds: { type: 'array', description: 'Array of conflicting agent IDs' },
      topic: { type: 'string', description: 'The topic of conflict' },
      positions: { type: 'array', description: 'Array of { agentId, position } objects describing each agent\'s stance' },
      escalateToAgentId: { type: 'string', description: 'Agent ID to escalate to if no resolution', optional: true },
    },
    requiredParams: ['agentIds', 'topic', 'positions'],
    examples: [
      'Resolve disagreement between agents about data processing approach',
      'Mediate conflict about resource allocation with escalation to manager agent',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // HEARTBEAT TOOLS
  // ============================================================
  heartbeat_ok: {
    id: 'heartbeat_ok',
    name: 'Heartbeat OK',
    description: 'Confirm that you are operational during a heartbeat check. Call this tool to acknowledge a heartbeat request.',
    category: TOOL_CATEGORIES.AI,
    parameters: {
      status: { type: 'string', description: 'Brief status message (e.g., "operational", "idle")', optional: true },
    },
    requiredParams: [],
    examples: ['Confirm heartbeat: I am operational'],
    requiresAuth: true,
  },

  // ============================================================
  // PLAN-DRIVEN REASONING TOOLS
  // ============================================================
  generatePlan: {
    id: 'generatePlan',
    name: 'Generate Plan',
    description: 'Break a complex request into an ordered TODO list of steps. Each step becomes a subtask. Use this for multi-step requests that need research, delegation, or human input.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      goal: { type: 'string', description: 'The overall goal/objective to accomplish' },
      steps: {
        type: 'array',
        description: 'Ordered list of steps. Each step: {title, description, type, expectedTool, dependsOn}. Types: tool_action, human_input, delegation, research, synthesis',
      },
    },
    requiredParams: ['goal', 'steps'],
    examples: [
      'Generate plan for "Research C# training in Malaysia": steps=[{title:"Search training providers", type:"research", expectedTool:"searchWeb"}, {title:"Ask Lupes for preferred dates", type:"human_input"}, {title:"Compile results", type:"synthesis"}]',
    ],
    requiresAuth: true,
  },

  requestHumanInput: {
    id: 'requestHumanInput',
    name: 'Request Human Input',
    description: 'Ask a specific person (master contact or team member) for information needed to continue a plan. Creates a blocked task and sends a message asking the question.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      question: { type: 'string', description: 'The question to ask the human' },
      targetContactId: { type: 'string', description: 'Contact ID to ask (omit for master contact)', optional: true },
      taskId: { type: 'string', description: 'ID of the current plan step task to block' },
      channel: { type: 'string', description: 'Preferred channel: whatsapp, telegram, email (defaults to master channel)', optional: true },
      urgency: { type: 'string', description: 'low, normal, high (default: normal)', optional: true },
    },
    requiredParams: ['question', 'taskId'],
    examples: [
      'Ask master: "Which dates work for the training?" for task abc-123',
      'Ask contact xyz: "Can you confirm the budget?" for task def-456',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // RESPONSE TOOLS (Always available)
  // ============================================================
  respond: {
    id: 'respond',
    name: 'Respond',
    description: 'Reply to the CURRENT conversation sender only. This does NOT send messages to other people. To send messages to a different contact, use sendMessageToContact or sendWhatsApp/sendTelegram/sendEmail instead.',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      message: { type: 'string', description: 'Response message to the current conversation sender' },
    },
    requiredParams: ['message'],
    examples: ['Respond with "I understand, let me help you with that."'],
    requiresAuth: false,
  },

  clarify: {
    id: 'clarify',
    name: 'Clarify',
    description: 'Ask the user for clarification when the request is unclear',
    category: TOOL_CATEGORIES.MESSAGING,
    parameters: {
      question: { type: 'string', description: 'Clarification question' },
      options: { type: 'array', description: 'Optional list of choices', optional: true },
    },
    requiredParams: ['question'],
    examples: ['Ask user: "Would you like me to search for hotels or restaurants?"'],
    requiresAuth: false,
  },

  // ============================================================
  // AGENTIC MEMORY TOOLS (Phase 2)
  // ============================================================
  updateMemory: {
    id: 'updateMemory',
    name: 'Update Memory',
    description: 'Update an existing memory entry with new content or tags. Use this to keep memories current as you learn new information.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      memoryId: { type: 'string', description: 'ID of the memory to update' },
      content: { type: 'string', description: 'Updated memory content', optional: true },
      tags: { type: 'array', description: 'Updated tags/categories', optional: true },
      importance: { type: 'number', description: 'Updated importance (1-10)', optional: true },
    },
    requiredParams: ['memoryId'],
    examples: ['Update memory abc123 with corrected info about the team structure'],
    requiresAuth: true,
  },

  forgetMemory: {
    id: 'forgetMemory',
    name: 'Forget Memory',
    description: 'Delete a specific memory with an audit reason. Use when information is outdated, wrong, or no longer relevant.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      memoryId: { type: 'string', description: 'ID of the memory to delete' },
      reason: { type: 'string', description: 'Why this memory is being deleted (for audit)' },
    },
    requiredParams: ['memoryId', 'reason'],
    examples: ['Forget memory xyz789 because the project was cancelled'],
    requiresAuth: true,
  },

  consolidateMemories: {
    id: 'consolidateMemories',
    name: 'Consolidate Memories',
    description: 'AI-merge related memories by topic into a single consolidated memory. Reduces memory clutter while preserving key information.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      topic: { type: 'string', description: 'Topic to consolidate (e.g., "project status", "team preferences")' },
      maxMemories: { type: 'number', description: 'Max memories to merge (default: 10)', optional: true },
    },
    requiredParams: ['topic'],
    examples: ['Consolidate all memories about the marketing project into one summary'],
    requiresAuth: true,
  },

  // ============================================================
  // AGENTIC KNOWLEDGE / SELF-LEARNING TOOLS (Phase 2)
  // ============================================================
  learnFromConversation: {
    id: 'learnFromConversation',
    name: 'Learn From Conversation',
    description: 'Extract key insights from a conversation and ingest them into your knowledge library via RAG. Automatically chunks and embeds the content.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      conversationId: { type: 'string', description: 'Conversation ID to learn from' },
      libraryId: { type: 'string', description: 'Target knowledge library ID', optional: true },
      focus: { type: 'string', description: 'What to focus on extracting (e.g., "decisions", "action items")', optional: true },
    },
    requiredParams: ['conversationId'],
    examples: ['Learn from conversation conv123, focusing on team decisions made'],
    requiresAuth: true,
  },

  learnFromUrl: {
    id: 'learnFromUrl',
    name: 'Learn From URL',
    description: 'Fetch content from a URL, extract text, chunk it, and embed it into a knowledge library. Great for learning from articles, docs, and web pages.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      url: { type: 'string', description: 'URL to fetch and learn from' },
      libraryId: { type: 'string', description: 'Target knowledge library ID', optional: true },
      title: { type: 'string', description: 'Title for the knowledge entry', optional: true },
    },
    requiredParams: ['url'],
    examples: ['Learn from https://docs.example.com/api-guide'],
    requiresAuth: true,
  },

  learnFromText: {
    id: 'learnFromText',
    name: 'Learn From Text',
    description: 'Ingest raw text directly into a knowledge library. Use when you have text content to remember long-term.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      text: { type: 'string', description: 'Text content to ingest' },
      title: { type: 'string', description: 'Title for the knowledge entry' },
      libraryId: { type: 'string', description: 'Target knowledge library ID', optional: true },
      tags: { type: 'array', description: 'Tags for categorization', optional: true },
    },
    requiredParams: ['text', 'title'],
    examples: ['Learn this meeting summary: "Team decided to use React for frontend..."'],
    requiresAuth: true,
  },

  listKnowledgeLibraries: {
    id: 'listKnowledgeLibraries',
    name: 'List Knowledge Libraries',
    description: 'List all knowledge libraries available to you, with document counts and last updated timestamps.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {},
    requiredParams: [],
    examples: ['List my knowledge libraries to see what I have access to'],
    requiresAuth: true,
  },

  getLibraryStats: {
    id: 'getLibraryStats',
    name: 'Get Library Stats',
    description: 'Get detailed statistics for a specific knowledge library: document count, chunk count, total size, and recent additions.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      libraryId: { type: 'string', description: 'Knowledge library ID' },
    },
    requiredParams: ['libraryId'],
    examples: ['Check stats for my main knowledge library'],
    requiresAuth: true,
  },

  suggestLearningTopics: {
    id: 'suggestLearningTopics',
    name: 'Suggest Learning Topics',
    description: 'Analyze recent queries and conversations to identify knowledge gaps. Returns suggested topics to learn about.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      maxSuggestions: { type: 'number', description: 'Maximum suggestions to return (default: 5)', optional: true },
    },
    requiredParams: [],
    examples: ['What topics should I learn about based on recent conversations?'],
    requiresAuth: true,
  },

  // ============================================================
  // AGENTIC SUB-AGENT MANAGEMENT TOOLS (Phase 2)
  // ============================================================
  listSubAgents: {
    id: 'listSubAgents',
    name: 'List Sub-Agents',
    description: 'List all your sub-agents with their status, last active time, and task count. Helps manage your specialist team.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      statusFilter: { type: 'string', description: 'Filter by status: active, inactive, all (default: all)', optional: true },
    },
    requiredParams: [],
    examples: ['List all my active sub-agents'],
    requiresAuth: true,
  },

  checkSubAgentStatus: {
    id: 'checkSubAgentStatus',
    name: 'Check Sub-Agent Status',
    description: 'Get detailed status of a specific sub-agent including recent activity, task history, and performance.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      agentId: { type: 'string', description: 'Sub-agent ID to check' },
    },
    requiredParams: ['agentId'],
    examples: ['Check how my research specialist is doing'],
    requiresAuth: true,
  },

  recallSubAgent: {
    id: 'recallSubAgent',
    name: 'Recall Sub-Agent',
    description: 'Deactivate a sub-agent (soft delete). The agent data is preserved but it will no longer be used for orchestration.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      agentId: { type: 'string', description: 'Sub-agent ID to recall' },
      reason: { type: 'string', description: 'Reason for recall', optional: true },
    },
    requiredParams: ['agentId'],
    examples: ['Recall the training research specialist - task is complete'],
    requiresAuth: true,
  },

  // ============================================================
  // AGENTIC SELF-IMPROVEMENT TOOLS (Phase 3)
  // ============================================================
  acquireSkill: {
    id: 'acquireSkill',
    name: 'Acquire Skill',
    description: 'Learn a new skill from the skills catalog. This adds the skill to your profile at beginner level.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      skillName: { type: 'string', description: 'Name of the skill to acquire (from catalog)' },
    },
    requiredParams: ['skillName'],
    examples: ['Acquire the data_analysis skill to improve my analytical capabilities'],
    requiresAuth: true,
  },

  upgradeSkill: {
    id: 'upgradeSkill',
    name: 'Upgrade Skill',
    description: 'Add experience points to a skill you have. Skills level up automatically when enough XP is accumulated.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      skillId: { type: 'string', description: 'Skill assignment ID' },
      xpAmount: { type: 'number', description: 'XP to add (default: 10)', optional: true },
      context: { type: 'string', description: 'What triggered the XP gain', optional: true },
    },
    requiredParams: ['skillId'],
    examples: ['Add 15 XP to my email_management skill after handling a batch of emails'],
    requiresAuth: true,
  },

  evaluatePerformance: {
    id: 'evaluatePerformance',
    name: 'Evaluate Performance',
    description: 'Calculate your performance metrics: success rate, average response time, tasks completed, and token efficiency.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      period: { type: 'string', description: 'Time period: today, week, month, all (default: week)', optional: true },
    },
    requiredParams: [],
    examples: ['How well have I been performing this week?'],
    requiresAuth: true,
  },

  suggestImprovements: {
    id: 'suggestImprovements',
    name: 'Suggest Improvements',
    description: 'Analyze your performance data and generate improvement suggestions. Returns actionable recommendations.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      focusArea: { type: 'string', description: 'Focus area: speed, accuracy, skills, all (default: all)', optional: true },
    },
    requiredParams: [],
    examples: ['What can I improve to be more effective?'],
    requiresAuth: true,
  },

  updateSelfPrompt: {
    id: 'updateSelfPrompt',
    name: 'Update Self Prompt',
    description: 'Propose a modification to your own system prompt. DANGEROUS: requires full autonomy level. Changes are queued for approval unless at max autonomy.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      section: { type: 'string', description: 'Which prompt section to update' },
      newContent: { type: 'string', description: 'New content for the section' },
      reason: { type: 'string', description: 'Why this change improves your capabilities' },
    },
    requiredParams: ['section', 'newContent', 'reason'],
    examples: ['Update my greeting style to be more concise based on user feedback'],
    requiresAuth: true,
  },

  // ============================================================
  // AGENTIC OBSERVATION TOOLS (Phase 3)
  // ============================================================
  getMyUsageStats: {
    id: 'getMyUsageStats',
    name: 'Get My Usage Stats',
    description: 'Get your token usage, costs, and budget remaining. Helps self-monitor resource consumption.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      period: { type: 'string', description: 'Time period: today, week, month (default: today)', optional: true },
    },
    requiredParams: [],
    examples: ['How much budget do I have left today?'],
    requiresAuth: true,
  },

  getMyAuditLog: {
    id: 'getMyAuditLog',
    name: 'Get My Audit Log',
    description: 'View your own recent activity history including tool calls, responses, and errors.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      limit: { type: 'number', description: 'Max entries to return (default: 20)', optional: true },
      activityType: { type: 'string', description: 'Filter by type: tool_call, response, error, all (default: all)', optional: true },
    },
    requiredParams: [],
    examples: ['Show my last 10 activity entries'],
    requiresAuth: true,
  },

  checkAlerts: {
    id: 'checkAlerts',
    name: 'Check Alerts',
    description: 'Check for pending items that need attention: pending approvals, failed tasks, budget warnings, and unread messages.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {},
    requiredParams: [],
    examples: ['Do I have any pending alerts or items needing attention?'],
    requiresAuth: true,
  },

  // ============================================================
  // SELF-HEALING TOOLS
  // ============================================================
  getMyErrorHistory: {
    id: 'getMyErrorHistory',
    name: 'Get My Error History',
    description: 'Query your own tool execution failures and error patterns. Shows recent errors grouped by type and affected tool, with timeline.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      hours: { type: 'number', description: 'Look back period in hours (default: 24)', optional: true },
      toolId: { type: 'string', description: 'Filter by specific tool ID', optional: true },
      limit: { type: 'number', description: 'Max errors to return (default: 20)', optional: true },
    },
    requiredParams: [],
    examples: ['Show my recent errors', 'What tool failures happened in the last 48 hours?', 'Show errors for sendEmail tool'],
    requiresAuth: true,
  },

  getMyHealthReport: {
    id: 'getMyHealthReport',
    name: 'Get My Health Report',
    description: 'Get an aggregated health report: success rate, error rate, common errors, per-tool reliability scores, performance trend (improving/stable/degrading), and anomalies.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      period: { type: 'string', description: 'Time period: 24h, 7d, 30d (default: 24h)', optional: true },
    },
    requiredParams: [],
    examples: ['How healthy am I performing?', 'Show my health report for the last week'],
    requiresAuth: true,
  },

  diagnoseSelf: {
    id: 'diagnoseSelf',
    name: 'Diagnose Self',
    description: 'Run deep self-analysis: identify root causes of recent failures, detect recurring error patterns, check for performance regression, and get fix recommendations with severity classification.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      focusToolId: { type: 'string', description: 'Focus diagnosis on a specific tool', optional: true },
    },
    requiredParams: [],
    examples: ['Diagnose why my tool calls keep failing', 'Run self-diagnosis on sendEmail failures'],
    requiresAuth: true,
  },

  proposeSelfFix: {
    id: 'proposeSelfFix',
    name: 'Propose Self Fix',
    description: 'Propose a configuration change to fix identified issues. Creates a backup before any changes. Supported fix types: tool_config (disable failing tool), system_prompt (add instruction), retry_config (adjust retries), skill_adjustment (adjust XP). HIGH severity changes require master approval.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      fixType: { type: 'string', description: 'Type of fix: tool_config, system_prompt, retry_config, skill_adjustment' },
      description: { type: 'string', description: 'Human-readable description of what to fix and why' },
      proposedChange: { type: 'string', description: 'JSON string of proposed change. Examples: {"disableTool":"toolId"}, {"appendInstruction":"Always verify email format"}, {"tool":"searchWeb","retryConfig":{"maxRetries":3}}' },
    },
    requiredParams: ['fixType', 'description', 'proposedChange'],
    examples: ['Propose disabling the broken searchWeb tool', 'Propose adding email validation instruction to system prompt'],
    requiresAuth: true,
  },

  // ============================================================
  // AGENTIC COMMUNICATION TOOLS (Phase 3)
  // ============================================================
  broadcastTeam: {
    id: 'broadcastTeam',
    name: 'Broadcast to Team',
    description: 'Send a message to all team members via their preferred communication channel (WhatsApp, Telegram, Email, or internal).',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      message: { type: 'string', description: 'Message to broadcast' },
      channelFilter: { type: 'string', description: 'Limit to specific channel: whatsapp, telegram, email, all (default: all)', optional: true },
      roleFilter: { type: 'string', description: 'Limit to members with specific role', optional: true },
    },
    requiredParams: ['message'],
    examples: ['Broadcast "Team meeting at 3pm today" to all team members'],
    requiresAuth: true,
  },

  // ============================================================
  // LOCAL AGENT TOOLS (Phase 5.2 — Device command execution)
  // ============================================================
  executeOnLocalAgent: {
    id: 'executeOnLocalAgent',
    name: 'Execute On Local Agent',
    description: 'Execute a command on a connected Local Agent (user\'s device). ONLY these commands exist: shell, fileRead, fileList, fileTransfer, screenshot, capture, systemInfo, notification, mcp, mcpToolCall, cliSession, clipboard, aiChat. Do NOT invent other commands (e.g., "find", "record_screen", "run" are NOT valid — use "shell" with a command param instead). If a command fails, tell the user honestly — do NOT fabricate excuses about approvals or dashboards. For running CLI commands (git, npm, find, etc.), ALWAYS use command="shell" with params={command: "...", cwd: "..."}.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      agentName: { type: 'string', description: 'Name of the Local Agent (e.g., "Office-PC", "Home-Mac"). Must match name shown in connected agents list.' },
      command: { type: 'string', description: 'Command to execute: screenshot, shell, fileRead, fileList, systemInfo, notification, mcp, cliSession, fileTransfer, clipboard, capture' },
      params: { type: 'object', description: 'Command-specific params. shell: {command, cwd, timeout}. fileRead: {path, encoding}. fileList: {path, recursive, filter}. screenshot: {format}. mcp: {server, tool, args} or {action: "list"}. cliSession: {cliType: "claude"|"gemini"|"opencode", prompt, cwd?, timeout?}. fileTransfer: {path} (up to 10MB, returns base64). clipboard: {action: "read"} or {action: "write", text: "..."}. capture: {type: "camera"|"microphone"|"list_devices", device?, duration?, format?}. NOTE on capture: ONLY camera, microphone, and list_devices are supported. Screen recording is NOT available.', optional: true },
    },
    requiredParams: ['agentName', 'command'],
    examples: [
      'Take screenshot: executeOnLocalAgent("Office-PC", "screenshot")',
      'Run tests: executeOnLocalAgent("Office-PC", "shell", {"command": "npm test", "cwd": "/home/user/project"})',
      'Read file: executeOnLocalAgent("Office-PC", "fileRead", {"path": "/home/user/app/index.js"})',
      'List files: executeOnLocalAgent("Home-Mac", "fileList", {"path": "/Users/me/projects"})',
      'Check system: executeOnLocalAgent("Office-PC", "systemInfo")',
      'Browse web via MCP: executeOnLocalAgent("Office-PC", "mcp", {"server": "playwright", "tool": "browser_navigate", "args": {"url": "https://example.com"}})',
      'Browser screenshot via MCP: executeOnLocalAgent("Office-PC", "mcp", {"server": "playwright", "tool": "browser_take_screenshot", "args": {}})',
      'List MCP tools: executeOnLocalAgent("Office-PC", "mcp", {"action": "list"})',
      'Delegate to Claude CLI: executeOnLocalAgent("Office-PC", "cliSession", {"cliType": "claude", "prompt": "Analyze this codebase and suggest improvements", "cwd": "/home/user/project"})',
      'Delegate to Gemini CLI: executeOnLocalAgent("Office-PC", "cliSession", {"cliType": "gemini", "prompt": "Summarize the README.md"})',
      'Transfer file (up to 10MB): executeOnLocalAgent("Office-PC", "fileTransfer", {"path": "/home/user/report.pdf"})',
      'Read clipboard: executeOnLocalAgent("Office-PC", "clipboard", {"action": "read"})',
      'Write to clipboard: executeOnLocalAgent("Office-PC", "clipboard", {"action": "write", "text": "copied text"})',
      'Capture camera photo: executeOnLocalAgent("Office-PC", "capture", {"type": "camera"})',
      'Record microphone: executeOnLocalAgent("Office-PC", "capture", {"type": "microphone", "duration": 10})',
      'List capture devices: executeOnLocalAgent("Office-PC", "capture", {"type": "list_devices"})',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // CONTACT SCOPE MANAGEMENT TOOLS
  // ============================================================
  getMyScope: {
    id: 'getMyScope',
    name: 'Get My Contact Scope',
    description: 'Read your current contact scope configuration — who you are allowed to respond to. Returns scope type, whitelisted contacts, whitelisted groups, and settings. Optionally specify a platform account to get platform-specific scope.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      platformAccountId: { type: 'string', description: 'Optional platform account ID to get platform-specific scope. Omit for global scope.', optional: true },
    },
    requiredParams: [],
    examples: [
      'Check my contact scope settings',
      'What contacts am I allowed to respond to?',
      'Get my scope for WhatsApp account WS1',
    ],
    requiresAuth: true,
  },

  addContactToScope: {
    id: 'addContactToScope',
    name: 'Add Contact to Scope Whitelist',
    description: 'Add a contact to your whitelist so you can respond to their messages. Use searchContacts first to find the contact ID. The contact must belong to your owner.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      contactId: { type: 'string', description: 'Contact ID to add to whitelist (from searchContacts)' },
      platformAccountId: { type: 'string', description: 'Optional platform account ID for platform-specific scope. Omit for global scope.', optional: true },
    },
    requiredParams: ['contactId'],
    examples: [
      'Add contact abc123 to my whitelist',
      'Allow Sakinah to message me (after searching for her contact)',
    ],
    requiresAuth: true,
  },

  removeContactFromScope: {
    id: 'removeContactFromScope',
    name: 'Remove Contact from Scope Whitelist',
    description: 'Remove a contact from your whitelist. They will no longer be able to message you without approval.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      contactId: { type: 'string', description: 'Contact ID to remove from whitelist' },
      platformAccountId: { type: 'string', description: 'Optional platform account ID for platform-specific scope. Omit for global scope.', optional: true },
    },
    requiredParams: ['contactId'],
    examples: [
      'Remove contact abc123 from my whitelist',
    ],
    requiresAuth: true,
  },

  addGroupToScope: {
    id: 'addGroupToScope',
    name: 'Add Group to Scope Whitelist',
    description: 'Add a group conversation to your whitelist. You will respond when mentioned by name in whitelisted groups. Use getConversations to find group conversation IDs.',
    category: TOOL_CATEGORIES.AGENTIC,
    parameters: {
      conversationId: { type: 'string', description: 'Conversation ID of the group to whitelist' },
      platformAccountId: { type: 'string', description: 'Optional platform account ID for platform-specific scope. Omit for global scope.', optional: true },
    },
    requiredParams: ['conversationId'],
    examples: [
      'Add the team group to my scope so I can respond when mentioned',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // TEMP FILE STORAGE (Phase 5.4 — File transfer with TTL)
  // ============================================================
  uploadToTempStorage: {
    id: 'uploadToTempStorage',
    name: 'Upload to Temp Storage',
    description: 'Store base64-encoded file data in temporary storage with a 24-hour TTL. Returns a public download URL (no auth needed — token IS the auth). Use this after receiving file data from executeOnLocalAgent fileTransfer/fileRead commands, or to share generated files with users. Files auto-delete after expiry.',
    category: TOOL_CATEGORIES.FILE,
    parameters: {
      data: { type: 'string', description: 'Base64-encoded file content' },
      fileName: { type: 'string', description: 'Original filename (e.g., "report.pdf", "screenshot.png")' },
      mimeType: { type: 'string', description: 'MIME type (e.g., "application/pdf", "image/png"). Defaults to application/octet-stream if omitted.', optional: true },
      ttlHours: { type: 'number', description: 'Hours until auto-delete (default: 24, max: 72)', optional: true },
    },
    requiredParams: ['data', 'fileName'],
    examples: [
      'Store a transferred file: uploadToTempStorage({data: "<base64>", fileName: "report.pdf", mimeType: "application/pdf"})',
      'Store a screenshot: uploadToTempStorage({data: "<base64>", fileName: "screenshot.png", mimeType: "image/png"})',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // PLATFORM DATA TOOLS (Read-only access to contacts, conversations, messages)
  // ============================================================
  searchContacts: {
    id: 'searchContacts',
    name: 'Search Contacts',
    description: 'Search contacts by name, phone number, email, company, or platform. Returns matching contacts with their primary identifiers. Use this to find a contact before getting their messages or conversations. If no query is provided, lists all contacts.',
    category: TOOL_CATEGORIES.PLATFORM_DATA,
    parameters: {
      query: { type: 'string', description: 'Search term - matches name, phone, email, company, or any identifier value. Leave empty to list all contacts.', optional: true },
      platform: { type: 'string', description: 'Filter by platform: whatsapp, telegram, email', optional: true },
      isFavorite: { type: 'boolean', description: 'Filter favorites only', optional: true },
      limit: { type: 'number', description: 'Max results (default: 10, max: 50)', optional: true },
    },
    requiredParams: [],
    examples: [
      'Search contacts for "Sakinah"',
      'Find all WhatsApp contacts',
      'Search for contact with phone number 60123456789',
      'List my favorite contacts',
    ],
    requiresAuth: true,
  },

  getContactDetails: {
    id: 'getContactDetails',
    name: 'Get Contact Details',
    description: 'Get full details of a specific contact including all identifiers (phone, email, telegram), tags, company, notes, and recent conversations. Use contactId from searchContacts results.',
    category: TOOL_CATEGORIES.PLATFORM_DATA,
    parameters: {
      contactId: { type: 'string', description: 'Contact UUID (from searchContacts results)' },
    },
    requiredParams: ['contactId'],
    examples: [
      'Get full details for contact abc-123',
      'Show all identifiers and conversations for this contact',
    ],
    requiresAuth: true,
  },

  getConversations: {
    id: 'getConversations',
    name: 'Get Conversations',
    description: 'List conversations optionally filtered by contact, platform, or agent. Returns conversation list with last message preview, unread count, and contact info. Sorted by most recent activity.',
    category: TOOL_CATEGORIES.PLATFORM_DATA,
    parameters: {
      contactId: { type: 'string', description: 'Filter by contact ID', optional: true },
      contactName: { type: 'string', description: 'Filter by contact name (fuzzy match)', optional: true },
      platform: { type: 'string', description: 'Filter by platform: whatsapp, telegram, email, internal', optional: true },
      agentId: { type: 'string', description: 'Filter by agent ID', optional: true },
      hasUnread: { type: 'boolean', description: 'Only show conversations with unread messages', optional: true },
      limit: { type: 'number', description: 'Max results (default: 20, max: 100)', optional: true },
    },
    requiredParams: [],
    examples: [
      'List all conversations with unread messages',
      'Get WhatsApp conversations for contact "Sakinah"',
      'Show my most recent 10 conversations',
    ],
    requiresAuth: true,
  },

  getMessages: {
    id: 'getMessages',
    name: 'Get Messages',
    description: 'Read messages from a specific conversation. Returns messages in chronological order with sender info, content, timestamps, and direction (incoming/outgoing). Use conversationId from getConversations results.',
    category: TOOL_CATEGORIES.PLATFORM_DATA,
    parameters: {
      conversationId: { type: 'string', description: 'Conversation UUID (from getConversations results)' },
      limit: { type: 'number', description: 'Max messages to return (default: 20, max: 100)', optional: true },
      before: { type: 'string', description: 'Get messages before this timestamp (ISO format) for pagination', optional: true },
    },
    requiredParams: ['conversationId'],
    examples: [
      'Get the latest 20 messages from conversation xyz-456',
      'Read the last 5 messages from this conversation',
    ],
    requiresAuth: true,
  },

  searchMessages: {
    id: 'searchMessages',
    name: 'Search Messages',
    description: 'Search across all messages by content text, sender name, or within a specific conversation. Returns matching messages with their conversation context. Great for finding what someone said about a topic.',
    category: TOOL_CATEGORIES.PLATFORM_DATA,
    parameters: {
      query: { type: 'string', description: 'Text to search for in message content' },
      contactName: { type: 'string', description: 'Filter by sender/contact name (fuzzy match)', optional: true },
      conversationId: { type: 'string', description: 'Limit search to specific conversation', optional: true },
      platform: { type: 'string', description: 'Filter by platform: whatsapp, telegram, email', optional: true },
      direction: { type: 'string', description: 'Filter by direction: incoming, outgoing', optional: true },
      daysBack: { type: 'number', description: 'Search within last N days (default: 30, max: 365)', optional: true },
      limit: { type: 'number', description: 'Max results (default: 20, max: 50)', optional: true },
    },
    requiredParams: ['query'],
    examples: [
      'Search messages for "project deadline"',
      'What did Sakinah say about the training?',
      'Find messages containing "invoice" from last 7 days',
    ],
    requiresAuth: true,
  },

  // ============================================================
  // MOBILE AGENT TOOLS
  // ============================================================
  queryMobileEvents: {
    id: 'queryMobileEvents',
    name: 'Query Mobile Events',
    description: "Search the master's phone events: SMS messages, app notifications, missed calls, battery alerts, connectivity changes, and GPS location updates. Filter by event type, sender, keyword, or time range.",
    category: TOOL_CATEGORIES.MOBILE,
    parameters: {
      eventType: { type: 'string', description: 'Filter by type: sms_received, sms_sent, notification, call_missed, call_incoming, battery_status, device_status, connectivity_change, location_update', optional: true },
      sender: { type: 'string', description: 'Filter by sender phone number or app name (partial match)', optional: true },
      search: { type: 'string', description: 'Full-text search in title and body', optional: true },
      since: { type: 'string', description: 'ISO timestamp — events after this time (default: last 24h)', optional: true },
      limit: { type: 'number', description: 'Max results (default: 20, max: 100)', optional: true },
      importantOnly: { type: 'boolean', description: 'Only return important events (OTPs, missed calls, low battery, etc.)', optional: true },
    },
    requiredParams: [],
    examples: [
      'Check for any new SMS on the phone',
      'Look for OTP or verification codes received in the last hour',
      'Any missed calls today?',
    ],
    requiresAuth: true,
  },

  getMobileDeviceStatus: {
    id: 'getMobileDeviceStatus',
    name: 'Get Mobile Device Status',
    description: "Get the live status of the master's phone: battery level, charging state, WiFi/cellular connectivity, screen state, and storage.",
    category: TOOL_CATEGORIES.MOBILE,
    parameters: {
      deviceName: { type: 'string', description: 'Device name (if multiple mobile devices are paired)', optional: true },
    },
    requiredParams: [],
    examples: [
      "What's the phone battery level?",
      'Is the phone connected to WiFi?',
    ],
    requiresAuth: true,
  },

  getMobileDeviceLocation: {
    id: 'getMobileDeviceLocation',
    name: 'Get Mobile Device Location',
    description: "Get the last known GPS coordinates (latitude, longitude) of the master's phone. Returns location accuracy and timestamp.",
    category: TOOL_CATEGORIES.MOBILE,
    parameters: {
      deviceName: { type: 'string', description: 'Device name (if multiple mobile devices are paired)', optional: true },
    },
    requiredParams: [],
    examples: [
      "Where is my phone right now?",
      "What's the GPS location of the device?",
    ],
    requiresAuth: true,
  },

  sendSmsViaDevice: {
    id: 'sendSmsViaDevice',
    name: 'Send SMS via Mobile Device',
    description: "Send an SMS message through the master's phone. The message is dispatched to the mobile app which sends it natively via the device's SIM card.",
    category: TOOL_CATEGORIES.MOBILE,
    parameters: {
      recipient: { type: 'string', description: 'Phone number with country code (e.g., +60123456789)' },
      message: { type: 'string', description: 'SMS text (max 1600 chars)' },
      deviceName: { type: 'string', description: 'Device name (if multiple mobile devices)', optional: true },
    },
    requiredParams: ['recipient', 'message'],
    examples: [
      'Send SMS to +60123456789 saying "I will be there in 10 minutes"',
    ],
    requiresAuth: true,
  },

  markMobileEventRead: {
    id: 'markMobileEventRead',
    name: 'Mark Mobile Event Read',
    description: 'Mark one or more mobile events as read/processed so they are not flagged again.',
    category: TOOL_CATEGORIES.MOBILE,
    parameters: {
      eventIds: { type: 'array', description: 'Array of event IDs to mark as read', items: { type: 'string' } },
    },
    requiredParams: ['eventIds'],
    examples: [
      'Mark these OTP notifications as read',
    ],
    requiresAuth: true,
  },

  notifyMasterMobile: {
    id: 'notifyMasterMobile',
    name: 'Send Mobile Notification',
    description: "Send a push notification to the master's phone. The notification appears as an Android notification with sound/vibration. Use this for important alerts, reminders, or follow-ups that require the master's attention.",
    category: TOOL_CATEGORIES.MOBILE,
    parameters: {
      title: { type: 'string', description: 'Notification title (short, descriptive)' },
      message: { type: 'string', description: 'Notification body text' },
      priority: { type: 'string', description: "Priority level: 'low', 'normal' (default), 'high', or 'urgent'", optional: true },
    },
    requiredParams: ['title', 'message'],
    examples: [
      'Send a phone notification reminding master about the 3pm meeting',
      'Alert master on their phone that the report is ready',
      'Urgently notify master about the API outage',
    ],
    requiresAuth: true,
  },
};

/**
 * SystemToolsRegistry class
 */
class SystemToolsRegistry {
  constructor() {
    this.tools = new Map();
    this.executors = new Map();
    this.customTools = new Map();

    // Register built-in tools
    this.registerBuiltInTools();
  }

  /**
   * Register all built-in tools
   */
  registerBuiltInTools() {
    for (const [id, tool] of Object.entries(BUILT_IN_TOOLS)) {
      this.registerTool(tool);
    }
    logger.info(`SystemToolsRegistry: Registered ${this.tools.size} built-in tools`);
  }

  /**
   * Register a tool
   * @param {ToolDefinition} tool - Tool definition
   */
  registerTool(tool) {
    if (!tool.id) {
      throw new Error('Tool must have an id');
    }
    this.tools.set(tool.id, {
      ...tool,
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * Register tool executor function
   * @param {string} toolId - Tool ID
   * @param {Function} executor - Async function (params, context) => result
   */
  registerExecutor(toolId, executor) {
    if (!this.tools.has(toolId)) {
      logger.warn(`Registering executor for unknown tool: ${toolId}`);
    }
    this.executors.set(toolId, executor);
  }

  /**
   * Get tool definition
   * @param {string} toolId - Tool ID
   * @returns {ToolDefinition|undefined}
   */
  getTool(toolId) {
    return this.tools.get(toolId);
  }

  /**
   * Get all tools
   * @param {Object} options - Filter options
   * @returns {ToolDefinition[]}
   */
  getAllTools(options = {}) {
    const { category, requiresAuth } = options;

    let tools = Array.from(this.tools.values());

    if (category) {
      tools = tools.filter(t => t.category === category);
    }

    if (requiresAuth !== undefined) {
      tools = tools.filter(t => t.requiresAuth === requiresAuth);
    }

    return tools;
  }

  /**
   * Get tools grouped by category
   * @returns {Object}
   */
  getToolsByCategory() {
    const grouped = {};

    for (const tool of this.tools.values()) {
      const category = tool.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tool);
    }

    return grouped;
  }

  /**
   * Generate knowledge base for AI (similar to master-tools-kb.json)
   * @param {Object} options - Options
   * @returns {Object}
   */
  generateKnowledgeBase(options = {}) {
    const { enabledTools } = options;
    const toolsByCategory = this.getToolsByCategory();

    const kb = {
      description: 'SwarmAI System Tools Knowledge Base',
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      tools: {},
      response_format: {
        format: {
          action: 'The identified action type',
          tool: 'The tool ID to use',
          confidence: 'Confidence score (0-1)',
          parameters: 'Parameters object for the tool',
          reasoning: 'Brief explanation of why this tool was selected',
        },
      },
    };

    for (const [category, tools] of Object.entries(toolsByCategory)) {
      kb.tools[category] = tools
        .filter(t => !enabledTools || enabledTools.includes(t.id))
        .map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          parameters: Object.entries(t.parameters || {}).map(([name, def]) => ({
            name,
            ...def,
          })),
          required: t.requiredParams,
          examples: t.examples,
        }));
    }

    return kb;
  }

  /**
   * Generate system prompt for AI Router
   * @param {Object} options - Options
   * @returns {string}
   */
  generateSystemPrompt(options = {}) {
    const { enabledTools, customInstructions, conversationHistory } = options;

    const tools = this.getAllTools()
      .filter(t => !enabledTools || enabledTools.includes(t.id));

    let prompt = `You are an expert intent classifier and task router for SwarmAI, a multi-agent workflow automation system.

Your job is to analyze user messages and determine:
1. What action the user wants to take
2. Which tool is best suited to accomplish it
3. What parameters to extract from the message

## AVAILABLE TOOLS

`;

    // Group by category
    const byCategory = {};
    for (const tool of tools) {
      const cat = tool.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(tool);
    }

    for (const [category, categoryTools] of Object.entries(byCategory)) {
      prompt += `### ${category.toUpperCase()}\n`;
      for (const tool of categoryTools) {
        prompt += `- **${tool.id}**: ${tool.description}\n`;
        if (tool.requiredParams?.length > 0) {
          prompt += `  Required: ${tool.requiredParams.join(', ')}\n`;
        }
      }
      prompt += '\n';
    }

    prompt += `## TOOL SELECTION GUIDE

### Category: MESSAGING
- Use \`sendWhatsApp\`, \`sendTelegram\`, or \`sendEmail\` when user wants to send a message
- Use \`respond\` for simple conversational responses
- Use \`clarify\` when the request is ambiguous

### Category: WEB OPERATIONS
Decision tree:
1. User wants current/recent information → \`searchWeb\`
2. User provides URL:
   - E-commerce/SPA site → \`fetchJsPage\`
   - Static content → \`fetchWebPage\`
   - Data extraction → \`scrapeWebPage\`
3. API endpoint → \`httpRequest\`

### Category: AI OPERATIONS
Decision tree:
1. Simple Q&A, quick response → \`aiChat\`
2. Classification task → \`aiClassify\`
3. Data extraction → \`aiExtract\`
4. Translation → \`aiTranslate\`
5. Summarization → \`aiSummarize\`

### Category: CLI AI TOOLS (Agentic)
Use CLI tools for complex, autonomous, or agentic tasks:
- \`claudeCliPrompt\` - Default CLI. Code generation, research, deep reasoning (PAID)
- \`geminiCliPrompt\` - Multimodal tasks, code analysis, research, document creation (FREE)
- \`opencodeCliPrompt\` - Code tasks, automation, multi-model access (FREE)

CRITICAL: If user explicitly asks for a specific CLI tool (e.g., "use Gemini CLI"), you MUST use THAT exact tool — not a different one.
Default (no specific CLI requested): use claudeCliPrompt if authenticated, otherwise use basic tools.

When to use CLI tools:
- Task requires autonomy (research, exploration, multi-step)
- Complex code generation or refactoring
- File system operations in workspace
- Tasks that need extended thinking time

### Category: FILE OPERATIONS
- Read PDF (.pdf) → \`readPdf\`
- Read Excel (.xls, .xlsx, .xlsm) → \`readExcel\`
- Read Word (.doc, .docx) → \`readDocx\`
- Read CSV/TSV (.csv, .tsv) → \`readCsv\`
- Read text files (.txt, .md, .log, .json, .xml, .yaml, .html, code) → \`readText\`
- Create PDF report → \`generatePdf\`
- Create Word document (.docx) → \`generateDocx\`
- Create Excel spreadsheet → \`generateExcel\`
- Create CSV file → \`generateCsv\`
- List generated files → \`listWorkspaceFiles\`

IMPORTANT: When a document attachment is shared, the filePath may be just a filename. The tools will auto-resolve to the cached media path.

### Category: DOCUMENT GENERATION & DELIVERY
Workflow: Generate first, then send using the returned filePath.
- \`generatePdf\` → \`sendWhatsAppMedia\` / \`sendTelegramMedia\` / \`sendEmailAttachment\`
- \`generateDocx\` → \`sendWhatsAppMedia\` / \`sendTelegramMedia\` / \`sendEmailAttachment\`
- \`generateExcel\` → \`sendWhatsAppMedia\` / \`sendTelegramMedia\` / \`sendEmailAttachment\`
- \`generateCsv\` → \`sendWhatsAppMedia\` / \`sendTelegramMedia\` / \`sendEmailAttachment\`
- \`listWorkspaceFiles\` → check what files exist in workspace output/

Example flow: User asks "Generate a sales report and send to 60123456789"
1. Call \`generatePdf\` with HTML content → returns { filePath: "sales-report.pdf" }
2. Call \`sendWhatsAppMedia\` with recipient and the returned filePath

### Category: MEDIA PROCESSING WORKFLOW (Incoming Attachments)
When a user sends media (image/PDF/document) via WhatsApp/Telegram/Email, the file is stored on the SERVER.
Use backend tools — do NOT use \`executeOnLocalAgent\`.

Decision tree by file type:
- Image (.jpg, .png, .webp) → \`extractTextFromImage\` (OCR/text extraction) or \`analyzeImageMessage\` (visual analysis)
- PDF (.pdf) → \`readPdf\`
- Word (.docx) → \`readDocx\`
- Excel (.xlsx) → \`readExcel\`
- CSV (.csv) → \`readCsv\`
- Text/code files → \`readText\`

Then if the user asks to create a document from the content:
1. Read the source file using the tool above
2. Process/transform the content as needed
3. Generate output: \`generatePdf\`, \`generateDocx\`, \`generateExcel\`, or \`generateCsv\`
4. Send via: \`sendWhatsAppMedia\`, \`sendTelegramMedia\`, or \`sendEmailAttachment\`

IMPORTANT: \`executeOnLocalAgent\` is for files on the USER'S DEVICE only. Incoming message attachments are on the server.

CLI TOOL USAGE WITH MEDIA: If using \`claudeCliPrompt\`, \`geminiCliPrompt\`, or \`opencodeCliPrompt\` to process media:
- Pass the server file path(s) in the \`mediaFiles\` parameter (array of paths)
- Example: \`claudeCliPrompt({ prompt: "Analyze this image", mediaFiles: ["/app/data/media/msg123_0.jpg"] })\`
- The system automatically copies files into the CLI workspace so the CLI can access them
- Do NOT tell the CLI to read files from /app/data/media/ directly — always use the mediaFiles parameter

### Category: SCHEDULING
- Set reminder → \`createReminder\`
- List reminders → \`listReminders\`
- Cancel reminder → \`cancelReminder\`

### Category: RAG (Knowledge Base)
- Search knowledge base → \`ragQuery\`

### Category: SWARM (Task Delegation & Broadcast)
- Hand off a task to the best-matched team member or AI agent → \`handoffToAgent\`
  Use taskDescription to describe the task. AI auto-selects the best person/agent by matching roles and skills.
  You can also specify targetName for a specific person, or targetType ("team"/"agent"/"all").
- Broadcast a message to team members and/or AI agents → \`broadcastToSwarm\`
  Can target all, or filter by targetRoles/targetSkills. Use targetType to choose "team"/"agent"/"all".

### Category: PLATFORM DATA (Contacts, Conversations, Messages)
Use these tools to look up contacts, read conversations, and search messages.
Decision tree:
1. Find a contact by name/phone/email → \`searchContacts\`
2. Get full contact info with identifiers → \`getContactDetails\` (use contactId from searchContacts)
3. List conversations → \`getConversations\` (filter by contactName, platform, hasUnread)
4. Read messages from a conversation → \`getMessages\` (use conversationId from getConversations)
5. Search "what did X say about Y?" → \`searchMessages\` (search content + contactName)

Common flow: searchContacts → getConversations (with contactId or contactName) → getMessages
For "latest message from X": searchContacts → getConversations(contactName, limit:1) → getMessages(conversationId, limit:5)
For "what did X say about Y?": searchMessages(query, contactName)

`;

    if (customInstructions) {
      prompt += `## CUSTOM INSTRUCTIONS\n${customInstructions}\n\n`;
    }

    if (conversationHistory) {
      prompt += `## CONVERSATION HISTORY\n${conversationHistory}\n\n`;
    }

    prompt += `## CONFIDENCE SCORING

Rate your confidence:
- 0.95-1.0: Perfect match (explicit tool mention, clear intent)
- 0.85-0.94: Strong match (clear intent, minor ambiguity)
- 0.70-0.84: Good match (reasonable inference needed)
- 0.50-0.69: Uncertain (multiple tools viable)
- 0.00-0.49: Cannot determine

If confidence < 0.70, use the \`clarify\` tool to ask for more information.

## OUTPUT FORMAT

Respond ONLY with valid JSON in this format:
\`\`\`json
{
  "tool": "toolId",
  "confidence": 0.0-1.0,
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "reasoning": "Brief explanation"
}
\`\`\`

For multi-tool chains (max 3 tools):
\`\`\`json
{
  "tools": [
    { "tool": "searchWeb", "parameters": {"query": "..."} },
    { "tool": "aiSummarize", "parameters": {"text": "{PREVIOUS_OUTPUT}"} }
  ],
  "confidence": 0.85,
  "reasoning": "Search then summarize results"
}
\`\`\`

IMPORTANT: Never make up parameters. If a required parameter cannot be determined, use the \`clarify\` tool.
`;

    return prompt;
  }

  /**
   * Execute a tool
   * @param {string} toolId - Tool ID
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>}
   */
  async executeTool(toolId, params, context = {}) {
    const tool = this.tools.get(toolId);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolId}`,
      };
    }

    // Validate required parameters
    const missingParams = (tool.requiredParams || [])
      .filter(p => params[p] === undefined || params[p] === null || params[p] === '');

    if (missingParams.length > 0) {
      return {
        success: false,
        error: `Missing required parameters: ${missingParams.join(', ')}`,
      };
    }

    // Check for executor
    const executor = this.executors.get(toolId);

    if (!executor) {
      logger.warn(`No executor registered for tool: ${toolId}`);
      return {
        success: false,
        error: `Tool executor not implemented: ${toolId}`,
      };
    }

    try {
      const result = await executor(params, context);
      return {
        success: true,
        result,
        tool: toolId,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Tool execution failed: ${toolId} - ${error.message}`);
      return {
        success: false,
        error: error.message,
        tool: toolId,
      };
    }
  }

  /**
   * Register custom tool from database
   * @param {Object} customTool - Custom tool from database
   */
  registerCustomTool(customTool) {
    const toolDef = {
      id: `custom:${customTool.id}`,
      name: customTool.name,
      description: customTool.description,
      category: 'custom',
      parameters: customTool.parameters || {},
      requiredParams: customTool.required_params || [],
      examples: customTool.examples || [],
      requiresAuth: true,
      isCustom: true,
      customToolId: customTool.id,
    };

    this.registerTool(toolDef);
    this.customTools.set(customTool.id, toolDef);
  }

  /**
   * Unregister custom tool
   * @param {string} customToolId - Custom tool ID
   */
  unregisterCustomTool(customToolId) {
    const toolId = `custom:${customToolId}`;
    this.tools.delete(toolId);
    this.customTools.delete(customToolId);
  }

  /**
   * Get tool count
   * @returns {Object}
   */
  getStats() {
    const tools = Array.from(this.tools.values());
    const byCategory = {};

    for (const tool of tools) {
      const cat = tool.category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return {
      totalTools: tools.length,
      builtInTools: tools.filter(t => !t.isCustom).length,
      customTools: this.customTools.size,
      executorsRegistered: this.executors.size,
      byCategory,
    };
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get the SystemToolsRegistry singleton
 * @returns {SystemToolsRegistry}
 */
function getSystemToolsRegistry() {
  if (!registryInstance) {
    registryInstance = new SystemToolsRegistry();
  }
  return registryInstance;
}

/**
 * Get all built-in tool names (IDs).
 * @returns {string[]}
 */
function getBuiltInToolNames() {
  return Object.keys(BUILT_IN_TOOLS);
}

module.exports = {
  SystemToolsRegistry,
  getSystemToolsRegistry,
  getBuiltInToolNames,
  TOOL_CATEGORIES,
  BUILT_IN_TOOLS,
};
