/**
 * Configuration
 * Centralized configuration from environment variables
 */

require('dotenv').config();

const config = {
  // Server
  apiPort: parseInt(process.env.API_PORT || '3031'),
  wsPort: parseInt(process.env.WS_PORT || '3032'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Security
  jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '90d',
  encryptionKey: process.env.ENCRYPTION_KEY,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3202').split(','),

  // Test Bypass (development only)
  testBypassEnabled: process.env.ENABLE_TEST_BYPASS === 'true',
  testBypassToken: process.env.TEST_BYPASS_TOKEN || 'swarm-test-bypass-2026',

  // Database
  databasePath: process.env.DATABASE_PATH || 'data/swarm.db',

  // WhatsApp
  whatsappSessionPath: process.env.WHATSAPP_SESSION_PATH || 'data/whatsapp-sessions',
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  puppeteerHeadless: process.env.PUPPETEER_HEADLESS !== 'false',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Redis (optional)
  redisUrl: process.env.REDIS_URL,
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6380'),
  redisPassword: process.env.REDIS_PASSWORD
};

// Validate required config
if (config.nodeEnv === 'production') {
  if (!config.encryptionKey || config.encryptionKey.length < 32) {
    console.error('ERROR: ENCRYPTION_KEY must be at least 32 characters in production');
    process.exit(1);
  }

  if (config.jwtSecret === 'change-this-in-production') {
    console.error('ERROR: JWT_SECRET must be set in production');
    process.exit(1);
  }
}

module.exports = { config };
