/**
 * Authentication Routes
 * JWT-based authentication with magic link support
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { sendMagicLink } = require('../services/emailService.cjs');

const router = express.Router();

// Magic link expiry (15 minutes)
const MAGIC_LINK_EXPIRY_MINUTES = 15;

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '90d';
const REFRESH_TOKEN_EXPIRES_IN = '365d';

/**
 * Middleware to verify JWT token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = authHeader.substring(7);

  // Test bypass token (localhost only)
  if (process.env.ENABLE_TEST_BYPASS === 'true' && token === process.env.TEST_BYPASS_TOKEN) {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      req.user = {
        id: 'test-bypass-user',
        email: 'test@localhost',
        name: 'Test Bypass User',
        role: 'admin',
        isSuperuser: true
      };
      return next();
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const db = getDatabase();
    const user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE id = ?')
      .get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isSuperuser: !!user.is_superuser
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDatabase();

    // Check if email exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const userId = uuidv4();
    const isFirstUser = db.prepare('SELECT COUNT(*) as count FROM users').get().count === 0;

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, is_superuser)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, email, passwordHash, name || email.split('@')[0], isFirstUser ? 'admin' : 'user', isFirstUser ? 1 : 0);

    // Generate tokens
    const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    logger.info(`User registered: ${email}`);

    res.status(201).json({
      user: {
        id: userId,
        email,
        name: name || email.split('@')[0],
        role: isFirstUser ? 'admin' : 'user',
        isSuperuser: isFirstUser
      },
      token: accessToken,
      refreshToken
    });

  } catch (error) {
    logger.error(`Registration failed: ${error.message}`);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDatabase();

    const user = db.prepare(`
      SELECT id, email, password_hash, name, role, is_superuser
      FROM users WHERE email = ?
    `).get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    logger.info(`User logged in: ${email}`);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSuperuser: !!user.is_superuser
      },
      token: accessToken,
      refreshToken
    });

  } catch (error) {
    logger.error(`Login failed: ${error.message}`);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE id = ?')
      .get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({ token: accessToken });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info with preferences
 */
router.get('/me', authenticate, (req, res) => {
  try {
    const db = getDatabase();

    // Get user preferences from settings table
    const prefSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'user_preferences'
    `).get(req.user.id);

    let preferences = {
      theme: 'system',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h'
    };

    if (prefSetting?.value) {
      try {
        preferences = { ...preferences, ...JSON.parse(prefSetting.value) };
      } catch {
        // Use defaults on parse error
      }
    }

    res.json({
      user: {
        ...req.user,
        preferences
      }
    });
  } catch (error) {
    logger.error(`Failed to get user info: ${error.message}`);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token deletion)
 */
router.post('/logout', authenticate, (req, res) => {
  logger.info(`User logged out: ${req.user.email}`);
  res.json({ message: 'Logged out successfully' });
});

/**
 * POST /api/auth/magic-link/request
 * Request a magic link for passwordless login (matches backend pattern)
 */
router.post('/magic-link/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDatabase();

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Set expiry time
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    // Delete any existing unused magic links for this email
    db.prepare('DELETE FROM magic_links WHERE email = ? AND used_at IS NULL').run(email);

    // Create new magic link (store hash, not plain token)
    const linkId = uuidv4();
    db.prepare(`
      INSERT INTO magic_links (id, email, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(linkId, email, tokenHash, expiresAt);

    // Send email with magic link
    try {
      await sendMagicLink(email, token);
      logger.info(`Magic link sent to ${email}`);
    } catch (emailError) {
      logger.error(`Failed to send magic link email: ${emailError.message}`);
      // Delete the magic link since email failed
      db.prepare('DELETE FROM magic_links WHERE id = ?').run(linkId);
      return res.status(500).json({ error: 'Failed to send magic link email. Please check email configuration.' });
    }

    res.json({
      message: 'If an account exists for this email, a magic link has been sent.',
      success: true
    });

  } catch (error) {
    logger.error(`Magic link request failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to send magic link' });
  }
});

/**
 * POST /api/auth/magic-link
 * Alias for /magic-link/request (backward compatibility)
 */
router.post('/magic-link', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDatabase();

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiry time
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Delete any existing unused magic links for this email
    db.prepare('DELETE FROM magic_links WHERE email = ? AND used_at IS NULL').run(email);

    // Create new magic link
    const linkId = uuidv4();
    db.prepare(`
      INSERT INTO magic_links (id, email, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(linkId, email, token, expiresAt);

    // Send email with magic link
    try {
      await sendMagicLink(email, token);
      logger.info(`Magic link sent to ${email}`);
    } catch (emailError) {
      logger.error(`Failed to send magic link email: ${emailError.message}`);
      // Delete the magic link since email failed
      db.prepare('DELETE FROM magic_links WHERE id = ?').run(linkId);
      return res.status(500).json({ error: 'Failed to send magic link email. Please check email configuration.' });
    }

    res.json({
      message: 'Magic link sent successfully',
      expiresIn: MAGIC_LINK_EXPIRY_MINUTES * 60 // seconds
    });

  } catch (error) {
    logger.error(`Magic link request failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to send magic link' });
  }
});

/**
 * POST /api/auth/magic-link/verify
 * Verify magic link token and login
 */
router.post('/magic-link/verify', async (req, res) => {
  try {
    const { token, name } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const db = getDatabase();

    // Hash the token for lookup
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find the magic link by hash
    const magicLink = db.prepare(`
      SELECT id, email, expires_at, used_at
      FROM magic_links WHERE token = ?
    `).get(tokenHash);

    if (!magicLink) {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }

    // Check if already used
    if (magicLink.used_at) {
      return res.status(400).json({ error: 'This link has already been used' });
    }

    // Check if expired
    if (new Date(magicLink.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This link has expired' });
    }

    // Mark as used
    db.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE id = ?").run(magicLink.id);

    // Find or create user
    let user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE email = ?').get(magicLink.email);
    let isNewUser = false;

    if (!user) {
      // Create new user (first user is admin/superuser)
      const userId = uuidv4();
      const isFirstUser = db.prepare('SELECT COUNT(*) as count FROM users').get().count === 0;
      const userName = name || magicLink.email.split('@')[0];

      db.prepare(`
        INSERT INTO users (id, email, name, role, is_superuser)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, magicLink.email, userName, isFirstUser ? 'admin' : 'user', isFirstUser ? 1 : 0);

      user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE id = ?').get(userId);
      isNewUser = true;
      logger.info(`New user created via magic link: ${magicLink.email}`);
    }

    // Generate tokens
    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    logger.info(`User logged in via magic link: ${magicLink.email}`);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSuperuser: !!user.is_superuser
      },
      token: accessToken,
      refreshToken,
      isNewUser
    });

  } catch (error) {
    logger.error(`Magic link verification failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to verify magic link' });
  }
});

/**
 * GET /api/auth/magic-link/verify
 * Verify magic link token (GET method for redirect from email)
 */
router.get('/magic-link/verify', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const db = getDatabase();

    // Hash the token for lookup
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find the magic link by hash
    const magicLink = db.prepare(`
      SELECT id, email, expires_at, used_at
      FROM magic_links WHERE token = ?
    `).get(tokenHash);

    if (!magicLink) {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }

    // Check if already used
    if (magicLink.used_at) {
      return res.status(400).json({ error: 'This link has already been used' });
    }

    // Check if expired
    if (new Date(magicLink.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This link has expired' });
    }

    // Mark as used
    db.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE id = ?").run(magicLink.id);

    // Find or create user
    let user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE email = ?').get(magicLink.email);
    let isNewUser = false;

    if (!user) {
      // Create new user
      const userId = uuidv4();
      const isFirstUser = db.prepare('SELECT COUNT(*) as count FROM users').get().count === 0;

      db.prepare(`
        INSERT INTO users (id, email, name, role, is_superuser)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, magicLink.email, magicLink.email.split('@')[0], isFirstUser ? 'admin' : 'user', isFirstUser ? 1 : 0);

      user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE id = ?').get(userId);
      isNewUser = true;
      logger.info(`New user created via magic link: ${magicLink.email}`);
    }

    // Generate tokens
    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    logger.info(`User logged in via magic link: ${magicLink.email}`);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSuperuser: !!user.is_superuser
      },
      token: accessToken,
      refreshToken,
      isNewUser
    });

  } catch (error) {
    logger.error(`Magic link verification failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to verify magic link' });
  }
});

// ============================================
// Profile Management
// ============================================

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;
    const db = getDatabase();

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (email !== undefined) {
      // Check if email is already taken
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(email, req.user.id);
      if (existing) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updates.push('email = ?');
      params.push(email);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE id = ?')
      .get(req.user.id);

    logger.info(`User profile updated: ${user.email}`);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSuperuser: !!user.is_superuser
      }
    });

  } catch (error) {
    logger.error(`Profile update failed: ${error.message}`);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

/**
 * POST /api/auth/change-password
 * Change password (requires current password)
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

    if (!user.password_hash) {
      return res.status(400).json({ error: 'No password set. Use set-password instead.' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newHash, req.user.id);

    logger.info(`Password changed: ${req.user.email}`);

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    logger.error(`Password change failed: ${error.message}`);
    res.status(500).json({ error: 'Password change failed' });
  }
});

/**
 * POST /api/auth/set-password
 * Set password (for magic link users without password)
 */
router.post('/set-password', authenticate, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

    if (user.password_hash) {
      return res.status(400).json({ error: 'Password already set. Use change-password instead.' });
    }

    const hash = await bcrypt.hash(password, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hash, req.user.id);

    logger.info(`Password set: ${req.user.email}`);

    res.json({ message: 'Password set successfully' });

  } catch (error) {
    logger.error(`Set password failed: ${error.message}`);
    res.status(500).json({ error: 'Set password failed' });
  }
});

// ============================================
// Passkey (WebAuthn) Routes
// ============================================

/**
 * GET /api/auth/passkey/register-options
 * Get WebAuthn registration options
 */
router.get('/passkey/register-options', authenticate, (req, res) => {
  try {
    // Generate challenge
    const challenge = crypto.randomBytes(32).toString('base64url');

    // Store challenge temporarily (expires in 5 minutes)
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO settings (id, user_id, key, value)
      VALUES (?, ?, 'passkey_challenge', ?)
    `).run(uuidv4(), req.user.id, JSON.stringify({
      challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }));

    res.json({
      challenge,
      rp: {
        name: 'SwarmAI',
        id: process.env.PASSKEY_RP_ID || 'localhost'
      },
      user: {
        id: Buffer.from(req.user.id).toString('base64url'),
        name: req.user.email,
        displayName: req.user.name
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      timeout: 60000,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    });

  } catch (error) {
    logger.error(`Failed to get passkey register options: ${error.message}`);
    res.status(500).json({ error: 'Failed to get registration options' });
  }
});

/**
 * POST /api/auth/passkey/register
 * Register a new passkey
 */
router.post('/passkey/register', authenticate, (req, res) => {
  try {
    const { credentialId, publicKey, transports, name } = req.body;

    if (!credentialId || !publicKey) {
      return res.status(400).json({ error: 'credentialId and publicKey required' });
    }

    const db = getDatabase();
    const passkeyId = uuidv4();

    db.prepare(`
      INSERT INTO passkeys (id, user_id, credential_id, public_key, transports, name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      passkeyId,
      req.user.id,
      credentialId,
      publicKey,
      transports ? JSON.stringify(transports) : null,
      name || 'Passkey'
    );

    logger.info(`Passkey registered for user: ${req.user.email}`);

    res.json({
      id: passkeyId,
      credentialId,
      name: name || 'Passkey',
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'This passkey is already registered' });
    }
    logger.error(`Failed to register passkey: ${error.message}`);
    res.status(500).json({ error: 'Failed to register passkey' });
  }
});

/**
 * POST /api/auth/passkey/auth-options
 * Get WebAuthn authentication options
 */
router.post('/passkey/auth-options', (req, res) => {
  try {
    const { email } = req.body;
    const db = getDatabase();

    // Generate challenge
    const challenge = crypto.randomBytes(32).toString('base64url');

    let allowCredentials = [];
    if (email) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (user) {
        const passkeys = db.prepare('SELECT credential_id, transports FROM passkeys WHERE user_id = ?')
          .all(user.id);

        allowCredentials = passkeys.map(p => ({
          type: 'public-key',
          id: p.credential_id,
          transports: p.transports ? JSON.parse(p.transports) : undefined
        }));
      }
    }

    res.json({
      challenge,
      timeout: 60000,
      rpId: process.env.PASSKEY_RP_ID || 'localhost',
      allowCredentials,
      userVerification: 'preferred'
    });

  } catch (error) {
    logger.error(`Failed to get passkey auth options: ${error.message}`);
    res.status(500).json({ error: 'Failed to get authentication options' });
  }
});

/**
 * POST /api/auth/passkey/authenticate
 * Authenticate with passkey
 */
router.post('/passkey/authenticate', (req, res) => {
  try {
    const { credentialId, authenticatorData, signature, clientDataJSON } = req.body;

    if (!credentialId) {
      return res.status(400).json({ error: 'credentialId required' });
    }

    const db = getDatabase();

    // Find passkey
    const passkey = db.prepare(`
      SELECT p.*, u.id as user_id, u.email, u.name, u.role, u.is_superuser
      FROM passkeys p
      JOIN users u ON p.user_id = u.id
      WHERE p.credential_id = ?
    `).get(credentialId);

    if (!passkey) {
      return res.status(401).json({ error: 'Passkey not found' });
    }

    // TODO: Verify signature with public key
    // For now, trust the credential (implement full WebAuthn verification later)

    // Update counter and last used
    db.prepare(`
      UPDATE passkeys
      SET counter = counter + 1, last_used_at = datetime('now')
      WHERE credential_id = ?
    `).run(credentialId);

    // Generate tokens
    const accessToken = jwt.sign({ userId: passkey.user_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign(
      { userId: passkey.user_id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    logger.info(`User authenticated via passkey: ${passkey.email}`);

    res.json({
      user: {
        id: passkey.user_id,
        email: passkey.email,
        name: passkey.name,
        role: passkey.role,
        isSuperuser: !!passkey.is_superuser
      },
      token: accessToken,
      refreshToken
    });

  } catch (error) {
    logger.error(`Passkey authentication failed: ${error.message}`);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /api/auth/passkeys
 * List user's passkeys
 */
router.get('/passkeys', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const passkeys = db.prepare(`
      SELECT id, credential_id, name, device_type, created_at, last_used_at
      FROM passkeys WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({
      passkeys: passkeys.map(p => ({
        id: p.id,
        credentialId: p.credential_id,
        name: p.name,
        deviceType: p.device_type,
        createdAt: p.created_at,
        lastUsedAt: p.last_used_at
      }))
    });

  } catch (error) {
    logger.error(`Failed to list passkeys: ${error.message}`);
    res.status(500).json({ error: 'Failed to list passkeys' });
  }
});

/**
 * DELETE /api/auth/passkeys/:id
 * Delete a passkey
 */
router.delete('/passkeys/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Passkey not found' });
    }

    logger.info(`Passkey deleted: ${req.params.id}`);

    res.json({ message: 'Passkey deleted successfully' });

  } catch (error) {
    logger.error(`Failed to delete passkey: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete passkey' });
  }
});

/**
 * Middleware to require superadmin role
 */
function requireSuperadmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin' && !req.user.isSuperuser) {
    return res.status(403).json({ error: 'Superadmin access required' });
  }

  next();
}

module.exports = router;
module.exports.authenticate = authenticate;
module.exports.requireSuperadmin = requireSuperadmin;
