/**
 * Contact Routes
 * Matches frontend Contact interface at /api/contacts
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// ==========================================
// Helper: Ensure extra columns exist (safe migration)
// ==========================================

let columnsEnsured = false;

function ensureColumns(db) {
  if (columnsEnsured) return;
  try {
    // Check if company column exists
    const tableInfo = db.prepare("PRAGMA table_info(contacts)").all();
    const columnNames = tableInfo.map(c => c.name);

    if (!columnNames.includes('company')) {
      db.exec("ALTER TABLE contacts ADD COLUMN company TEXT");
      logger.info('Added company column to contacts table');
    }
    if (!columnNames.includes('metadata')) {
      db.exec("ALTER TABLE contacts ADD COLUMN metadata TEXT");
      logger.info('Added metadata column to contacts table');
    }
    if (!columnNames.includes('is_blocked')) {
      db.exec("ALTER TABLE contacts ADD COLUMN is_blocked INTEGER DEFAULT 0");
      logger.info('Added is_blocked column to contacts table');
    }
    if (!columnNames.includes('is_favorite')) {
      db.exec("ALTER TABLE contacts ADD COLUMN is_favorite INTEGER DEFAULT 0");
      logger.info('Added is_favorite column to contacts table');
    }
    if (!columnNames.includes('contact_type')) {
      db.exec("ALTER TABLE contacts ADD COLUMN contact_type TEXT DEFAULT 'individual'");
      logger.info('Added contact_type column to contacts table');
    }
    if (!columnNames.includes('gender')) {
      db.exec("ALTER TABLE contacts ADD COLUMN gender TEXT");
      logger.info('Added gender column to contacts table');
    }

    // Migrate existing blocked/favorite from tags JSON to dedicated columns
    const contactsWithTags = db.prepare("SELECT id, tags FROM contacts WHERE tags IS NOT NULL").all();
    for (const c of contactsWithTags) {
      try {
        const tags = JSON.parse(c.tags);
        const tagNames = tags.map(t => typeof t === 'string' ? t : t.name);
        const isBlocked = tagNames.some(t => t === 'blocked' || t === 'Blocked');
        const isFavorite = tagNames.some(t => t === 'favorite' || t === 'Favorite');
        if (isBlocked || isFavorite) {
          db.prepare("UPDATE contacts SET is_blocked = ?, is_favorite = ? WHERE id = ?")
            .run(isBlocked ? 1 : 0, isFavorite ? 1 : 0, c.id);
        }
      } catch (e) {
        // Skip contacts with invalid tags JSON
      }
    }

    columnsEnsured = true;
  } catch (error) {
    // Columns likely already exist
    columnsEnsured = true;
  }
}

// ==========================================
// Helper: Transform DB row to frontend Contact interface
// ==========================================

function transformContact(contact, db) {
  if (!contact) return null;

  // Parse tags
  let tags = [];
  try {
    tags = contact.tags ? JSON.parse(contact.tags) : [];
  } catch (e) {
    tags = [];
  }

  // Normalize tags to objects
  tags = tags.map(t => typeof t === 'string' ? { name: t, color: null } : t);

  // Compute isBlocked/isFavorite from dedicated column or tags fallback
  const isBlocked = contact.is_blocked === 1 || contact.isBlocked === 1 ||
    tags.some(t => t.name === 'blocked' || t.name === 'Blocked');
  const isFavorite = contact.is_favorite === 1 || contact.isFavorite === 1 ||
    tags.some(t => t.name === 'favorite' || t.name === 'Favorite');

  // Get lastContactAt from conversations
  let lastContactAt = null;
  if (db) {
    try {
      const lastConv = db.prepare(
        "SELECT MAX(updated_at) as lastAt FROM conversations WHERE contact_id = ?"
      ).get(contact.id);
      lastContactAt = lastConv?.lastAt || null;
    } catch (e) {
      // Conversations table may not exist or have contact_id
    }
  }

  // Parse metadata
  let metadata = {};
  try {
    metadata = contact.metadata ? JSON.parse(contact.metadata) : {};
  } catch (e) {
    metadata = {};
  }

  return {
    id: contact.id,
    userId: contact.userId || contact.user_id,
    displayName: contact.displayName || contact.display_name || 'Unknown',
    avatarUrl: contact.avatar || contact.avatarUrl || null,
    primaryPhone: contact.primaryPhone || null,
    primaryEmail: contact.primaryEmail || null,
    primaryTelegramUsername: contact.primaryTelegramUsername || null,
    company: contact.company || null,
    notes: contact.notes || null,
    gender: contact.gender || null,
    isBlocked,
    isFavorite,
    contactType: contact.contact_type || contact.contactType || 'individual',
    metadata,
    createdAt: contact.createdAt || contact.created_at,
    updatedAt: contact.updatedAt || contact.updated_at,
    lastContactAt,
    tags,
    conversationCount: contact.conversationCount || 0,
  };
}

// ==========================================
// GET /api/contacts
// List all contacts for the current user
// ==========================================

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    // Accept both 'search' and 'query' params
    const { search, query: queryParam, tags, limit = 5000, offset = 0, isBlocked, isFavorite, hasPhone, hasEmail, sortBy, sortOrder } = req.query;
    const searchTerm = search || queryParam;

    let sql = `
      SELECT
        c.id,
        c.user_id as userId,
        c.display_name as displayName,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type IN ('phone', 'whatsapp') AND is_primary = 1 LIMIT 1) as primaryPhone,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'email' AND is_primary = 1 LIMIT 1) as primaryEmail,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'telegram' AND is_primary = 1 LIMIT 1) as primaryTelegramUsername,
        c.avatar,
        c.company,
        c.notes,
        c.tags,
        c.metadata,
        c.gender,
        c.is_blocked,
        c.is_favorite,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        (SELECT COUNT(*) FROM conversations WHERE contact_id = c.id) as conversationCount
      FROM contacts c
      WHERE c.user_id = ?
    `;

    const params = [req.user.id];

    // Search filter
    if (searchTerm) {
      sql += ` AND (
        c.display_name LIKE ?
        OR c.company LIKE ?
        OR EXISTS (SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = c.id AND ci.identifier_value LIKE ?)
      )`;
      const term = `%${searchTerm}%`;
      params.push(term, term, term);
    }

    // Boolean filters
    if (isBlocked === 'true') {
      sql += ' AND c.is_blocked = 1';
    } else if (isBlocked === 'false') {
      sql += ' AND (c.is_blocked = 0 OR c.is_blocked IS NULL)';
    }

    if (isFavorite === 'true') {
      sql += ' AND c.is_favorite = 1';
    } else if (isFavorite === 'false') {
      sql += ' AND (c.is_favorite = 0 OR c.is_favorite IS NULL)';
    }

    // Has phone/email filters
    if (hasPhone === 'true') {
      sql += " AND EXISTS (SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = c.id AND ci.identifier_type IN ('phone', 'whatsapp'))";
    }
    if (hasEmail === 'true') {
      sql += " AND EXISTS (SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = c.id AND ci.identifier_type = 'email')";
    }

    // Tag filter
    if (tags) {
      const tagList = Array.isArray(tags) ? tags : [tags];
      for (const tag of tagList) {
        sql += ' AND c.tags LIKE ?';
        params.push(`%${tag}%`);
      }
    }

    // Sorting - named contacts first, phone-only contacts last
    const validSorts = { 'display_name': 'c.display_name', 'created_at': 'c.created_at', 'updated_at': 'c.updated_at' };
    const sortCol = validSorts[sortBy] || 'c.display_name';
    const sortDir = sortOrder === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY CASE WHEN c.display_name LIKE '+%' OR c.display_name GLOB '[0-9]*' THEN 1 ELSE 0 END, ${sortCol} COLLATE NOCASE ${sortDir}`;

    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const contacts = db.prepare(sql).all(...params);

    // Transform to frontend interface
    const transformed = contacts.map(c => {
      const contact = transformContact(c, db);

      // Also get identifiers
      const identifiers = db.prepare(`
        SELECT id, identifier_type as identifierType, identifier_value as identifierValue,
               identifier_normalized as identifierNormalized, platform, is_primary as isPrimary,
               created_at as createdAt, updated_at as updatedAt
        FROM contact_identifiers WHERE contact_id = ?
      `).all(c.id);

      contact.identifiers = identifiers.map(i => ({
        ...i,
        isPrimary: !!i.isPrimary,
        isVerified: false,
        metadata: {},
      }));

      return contact;
    });

    res.json({ contacts: transformed });

  } catch (error) {
    logger.error(`Failed to list contacts: ${error.message}`);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

// ==========================================
// GET /api/contacts/stats
// Get contact statistics (MUST be before /:id)
// ==========================================

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END) as favorites,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = contacts.id AND ci.identifier_type IN ('phone', 'whatsapp')
        ) THEN 1 ELSE 0 END) as withPhone,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = contacts.id AND ci.identifier_type = 'email'
        ) THEN 1 ELSE 0 END) as withEmail,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = contacts.id AND ci.identifier_type = 'telegram'
        ) THEN 1 ELSE 0 END) as withTelegram
      FROM contacts
      WHERE user_id = ?
    `).get(req.user.id);

    res.json({
      total: stats.total || 0,
      blocked: stats.blocked || 0,
      favorites: stats.favorites || 0,
      withPhone: stats.withPhone || 0,
      withEmail: stats.withEmail || 0,
      withTelegram: stats.withTelegram || 0,
    });

  } catch (error) {
    logger.error(`Failed to get stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ==========================================
// GET /api/contacts/tags
// Get all unique tag names
// ==========================================

router.get('/tags', (req, res) => {
  try {
    const db = getDatabase();

    const contacts = db.prepare(
      "SELECT tags FROM contacts WHERE user_id = ? AND tags IS NOT NULL"
    ).all(req.user.id);

    const tagSet = new Set();
    for (const c of contacts) {
      try {
        const tags = JSON.parse(c.tags);
        for (const t of tags) {
          const name = typeof t === 'string' ? t : t.name;
          if (name) tagSet.add(name);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }

    res.json([...tagSet].sort());

  } catch (error) {
    logger.error(`Failed to get all tags: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// ==========================================
// GET /api/contacts/lookup
// Lookup a contact by platform + identifier value
// ==========================================

router.get('/lookup', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);
    const { platform, value } = req.query;

    if (!platform || !value) {
      return res.status(400).json({ error: 'platform and value are required' });
    }

    const identifier = db.prepare(`
      SELECT ci.contact_id
      FROM contact_identifiers ci
      JOIN contacts c ON c.id = ci.contact_id
      WHERE c.user_id = ? AND ci.platform = ? AND ci.identifier_value = ?
      LIMIT 1
    `).get(req.user.id, platform, value);

    if (!identifier) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Get full contact
    const contact = db.prepare(`
      SELECT
        c.id, c.user_id as userId, c.display_name as displayName,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type IN ('phone', 'whatsapp') AND is_primary = 1 LIMIT 1) as primaryPhone,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'email' AND is_primary = 1 LIMIT 1) as primaryEmail,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'telegram' AND is_primary = 1 LIMIT 1) as primaryTelegramUsername,
        c.avatar, c.company, c.notes, c.tags, c.metadata, c.is_blocked, c.is_favorite,
        c.created_at as createdAt, c.updated_at as updatedAt
      FROM contacts c WHERE c.id = ?
    `).get(identifier.contact_id);

    res.json(transformContact(contact, db));

  } catch (error) {
    logger.error(`Failed to lookup contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to lookup contact' });
  }
});

// ==========================================
// GET /api/contacts/duplicates
// Find potential duplicate contacts
// ==========================================

router.get('/duplicates', (req, res) => {
  try {
    const db = getDatabase();

    // Find contacts sharing identifiers
    const duplicates = db.prepare(`
      SELECT
        ci1.contact_id as contactId1,
        ci2.contact_id as contactId2,
        ci1.identifier_value as sharedValue,
        ci1.identifier_type as matchType
      FROM contact_identifiers ci1
      JOIN contact_identifiers ci2 ON ci1.identifier_value = ci2.identifier_value AND ci1.contact_id != ci2.contact_id
      JOIN contacts c1 ON c1.id = ci1.contact_id AND c1.user_id = ?
      JOIN contacts c2 ON c2.id = ci2.contact_id AND c2.user_id = ?
      GROUP BY ci1.contact_id, ci2.contact_id
    `).all(req.user.id, req.user.id);

    res.json(duplicates);

  } catch (error) {
    logger.error(`Failed to find duplicates: ${error.message}`);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

// ==========================================
// GET /api/contacts/:id
// Get a single contact
// ==========================================

router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    const contact = db.prepare(`
      SELECT
        c.id, c.user_id as userId, c.display_name as displayName,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type IN ('phone', 'whatsapp') AND is_primary = 1 LIMIT 1) as primaryPhone,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'email' AND is_primary = 1 LIMIT 1) as primaryEmail,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'telegram' AND is_primary = 1 LIMIT 1) as primaryTelegramUsername,
        c.avatar, c.company, c.notes, c.tags, c.metadata, c.gender, c.is_blocked, c.is_favorite,
        c.created_at as createdAt, c.updated_at as updatedAt
      FROM contacts c
      WHERE c.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const transformed = transformContact(contact, db);

    // Get identifiers
    const identifiers = db.prepare(`
      SELECT id, contact_id as contactId, identifier_type as identifierType,
             identifier_value as identifierValue, identifier_normalized as identifierNormalized,
             platform, is_primary as isPrimary, created_at as createdAt, updated_at as updatedAt
      FROM contact_identifiers WHERE contact_id = ?
    `).all(contact.id);

    transformed.identifiers = identifiers.map(i => ({
      ...i,
      isPrimary: !!i.isPrimary,
      isVerified: false,
      metadata: {},
    }));

    // Get conversations
    const conversations = db.prepare(`
      SELECT c.id, c.platform, c.title, c.status, c.unread_count as unreadCount,
             c.updated_at as updatedAt, a.name as agentName
      FROM conversations c
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE c.contact_id = ?
      ORDER BY c.updated_at DESC LIMIT 10
    `).all(contact.id);

    transformed.conversations = conversations;

    // Get team membership info (if this contact is a team member)
    try {
      const teamMemberships = db.prepare(`
        SELECT tm.role, tm.department, tm.skills, tm.gender as teamGender, tm.is_available,
               ap.name as agenticName, ap.id as agenticId
        FROM agentic_team_members tm
        JOIN agentic_profiles ap ON tm.agentic_id = ap.id
        WHERE tm.contact_id = ? AND tm.is_active = 1
      `).all(contact.id);

      if (teamMemberships.length > 0) {
        transformed.teamMemberships = teamMemberships.map(tm => ({
          agenticId: tm.agenticId,
          agenticName: tm.agenticName,
          role: tm.role,
          department: tm.department,
          skills: JSON.parse(tm.skills || '[]'),
          gender: tm.teamGender,
          isAvailable: tm.is_available === 1,
        }));
      }
    } catch (e) { /* agentic tables may not exist */ }

    res.json(transformed);

  } catch (error) {
    logger.error(`Failed to get contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

// ==========================================
// POST /api/contacts
// Create a new contact
// ==========================================

router.post('/', (req, res) => {
  try {
    const { displayName, notes, tags, identifiers, primaryPhone, primaryEmail, primaryTelegramUsername, company, avatarUrl, metadata, gender } = req.body;

    if (!displayName) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    const db = getDatabase();
    ensureColumns(db);
    const contactId = uuidv4();

    // Auto-detect gender from name if not provided
    let resolvedGender = gender || null;
    if (!resolvedGender) {
      try {
        const { detectGender } = require('../services/genderDetector.cjs');
        resolvedGender = detectGender(displayName);
      } catch (e) { /* ignore detection errors */ }
    }

    db.prepare(`
      INSERT INTO contacts (id, user_id, display_name, company, avatar, notes, tags, metadata, gender)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contactId,
      req.user.id,
      displayName,
      company || null,
      avatarUrl || null,
      notes || null,
      tags ? JSON.stringify(tags) : null,
      metadata ? JSON.stringify(metadata) : null,
      resolvedGender
    );

    // Add explicit identifiers
    if (identifiers && identifiers.length > 0) {
      for (const identifier of identifiers) {
        db.prepare(`
          INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), contactId, identifier.type || identifier.identifierType, identifier.value || identifier.identifierValue, identifier.platform || null, identifier.isPrimary ? 1 : 0);
      }
    }

    // Auto-create identifiers from primaryPhone/primaryEmail/primaryTelegramUsername
    if (primaryPhone) {
      db.prepare(`
        INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary)
        VALUES (?, ?, 'phone', ?, 'whatsapp', 1)
      `).run(uuidv4(), contactId, primaryPhone);
    }
    if (primaryEmail) {
      db.prepare(`
        INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary)
        VALUES (?, ?, 'email', ?, 'email', 1)
      `).run(uuidv4(), contactId, primaryEmail);
    }
    if (primaryTelegramUsername) {
      db.prepare(`
        INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary)
        VALUES (?, ?, 'telegram', ?, 'telegram-bot', 1)
      `).run(uuidv4(), contactId, primaryTelegramUsername);
    }

    // Fetch and return the transformed contact
    const created = db.prepare(`
      SELECT c.id, c.user_id as userId, c.display_name as displayName,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type IN ('phone', 'whatsapp') AND is_primary = 1 LIMIT 1) as primaryPhone,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'email' AND is_primary = 1 LIMIT 1) as primaryEmail,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'telegram' AND is_primary = 1 LIMIT 1) as primaryTelegramUsername,
        c.avatar, c.company, c.notes, c.tags, c.metadata, c.gender, c.is_blocked, c.is_favorite,
        c.created_at as createdAt, c.updated_at as updatedAt
      FROM contacts c WHERE c.id = ?
    `).get(contactId);

    res.status(201).json(transformContact(created, db));

  } catch (error) {
    logger.error(`Failed to create contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// ==========================================
// PUT /api/contacts/:id
// Update a contact
// ==========================================

router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    // Verify ownership
    const existing = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { displayName, notes, tags, avatar, avatarUrl, company, isBlocked, isFavorite, metadata, gender } = req.body;

    const updates = [];
    const params = [];

    if (displayName !== undefined) { updates.push('display_name = ?'); params.push(displayName); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
    if (avatar !== undefined || avatarUrl !== undefined) { updates.push('avatar = ?'); params.push(avatarUrl || avatar); }
    if (company !== undefined) { updates.push('company = ?'); params.push(company); }
    if (isBlocked !== undefined) { updates.push('is_blocked = ?'); params.push(isBlocked ? 1 : 0); }
    if (isFavorite !== undefined) { updates.push('is_favorite = ?'); params.push(isFavorite ? 1 : 0); }
    if (metadata !== undefined) { updates.push('metadata = ?'); params.push(JSON.stringify(metadata)); }
    if (gender !== undefined) { updates.push('gender = ?'); params.push(gender || null); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Sync gender to linked team members
    if (gender !== undefined) {
      try {
        db.prepare(`
          UPDATE agentic_team_members SET gender = ?, updated_at = datetime('now')
          WHERE contact_id = ? AND user_id = ?
        `).run(gender || null, req.params.id, req.user.id);
      } catch (e) { /* team members table may not have gender column yet */ }
    }

    // Fetch and return the transformed contact
    const updated = db.prepare(`
      SELECT c.id, c.user_id as userId, c.display_name as displayName,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type IN ('phone', 'whatsapp') AND is_primary = 1 LIMIT 1) as primaryPhone,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'email' AND is_primary = 1 LIMIT 1) as primaryEmail,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'telegram' AND is_primary = 1 LIMIT 1) as primaryTelegramUsername,
        c.avatar, c.company, c.notes, c.tags, c.metadata, c.gender, c.is_blocked, c.is_favorite,
        c.created_at as createdAt, c.updated_at as updatedAt
      FROM contacts c WHERE c.id = ?
    `).get(req.params.id);

    res.json(transformContact(updated, db));

  } catch (error) {
    logger.error(`Failed to update contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// ==========================================
// DELETE /api/contacts/agent/:agentId
// Delete all contacts linked to conversations for a specific agent
// ==========================================

router.delete('/agent/:agentId', (req, res) => {
  try {
    const db = getDatabase();
    const { agentId } = req.params;

    // Find contacts that are ONLY linked to this agent's conversations
    // (contacts might be linked to multiple agents via conversations)
    const contactsToDelete = db.prepare(`
      SELECT DISTINCT c.id
      FROM contacts c
      JOIN contact_identifiers ci ON ci.contact_id = c.id
      WHERE c.user_id = ?
        AND ci.identifier_value IN (
          SELECT DISTINCT external_id FROM conversations WHERE agent_id = ? AND user_id = ?
          UNION
          SELECT DISTINCT
            CASE
              WHEN external_id LIKE 'whatsapp:%' THEN SUBSTR(external_id, 10)
              WHEN external_id LIKE 'whatsapp-group:%' THEN SUBSTR(external_id, 16)
              ELSE external_id
            END
          FROM conversations WHERE agent_id = ? AND user_id = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM conversations conv2
          WHERE conv2.user_id = ?
            AND conv2.agent_id != ?
            AND (
              conv2.external_id = ci.identifier_value
              OR conv2.external_id = 'whatsapp:' || ci.identifier_value
              OR conv2.external_id = 'whatsapp-group:' || ci.identifier_value
            )
        )
    `).all(req.user.id, agentId, req.user.id, agentId, req.user.id, req.user.id, agentId);

    if (contactsToDelete.length === 0) {
      return res.json({
        message: 'No contacts found exclusively linked to this agent',
        deletedContacts: 0
      });
    }

    const contactIds = contactsToDelete.map(c => c.id);
    const placeholders = contactIds.map(() => '?').join(',');

    // Delete contact identifiers first (FK constraint)
    db.prepare(`
      DELETE FROM contact_identifiers WHERE contact_id IN (${placeholders})
    `).run(...contactIds);

    // Delete contacts
    const result = db.prepare(`
      DELETE FROM contacts WHERE id IN (${placeholders}) AND user_id = ?
    `).run(...contactIds, req.user.id);

    logger.info(`Deleted contacts for agent ${agentId}: ${result.changes} contacts`);

    res.json({
      message: 'All contacts deleted for agent',
      deletedContacts: result.changes
    });

  } catch (error) {
    logger.error(`Failed to delete contacts for agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete contacts' });
  }
});

// ==========================================
// DELETE /api/contacts/:id
// Delete a contact
// ==========================================

router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare(
      'DELETE FROM contacts WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact deleted' });

  } catch (error) {
    logger.error(`Failed to delete contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ==========================================
// POST /api/contacts/:id/block
// ==========================================

router.post('/:id/block', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    const result = db.prepare(
      "UPDATE contacts SET is_blocked = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact blocked' });

  } catch (error) {
    logger.error(`Failed to block contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to block contact' });
  }
});

// ==========================================
// POST /api/contacts/:id/unblock
// ==========================================

router.post('/:id/unblock', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    const result = db.prepare(
      "UPDATE contacts SET is_blocked = 0, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact unblocked' });

  } catch (error) {
    logger.error(`Failed to unblock contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to unblock contact' });
  }
});

// ==========================================
// POST /api/contacts/:id/favorite
// ==========================================

router.post('/:id/favorite', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    const result = db.prepare(
      "UPDATE contacts SET is_favorite = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact favorited' });

  } catch (error) {
    logger.error(`Failed to favorite contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to favorite contact' });
  }
});

// ==========================================
// POST /api/contacts/:id/unfavorite
// ==========================================

router.post('/:id/unfavorite', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);

    const result = db.prepare(
      "UPDATE contacts SET is_favorite = 0, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact unfavorited' });

  } catch (error) {
    logger.error(`Failed to unfavorite contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to unfavorite contact' });
  }
});

// ==========================================
// GET /api/contacts/:id/identifiers
// ==========================================

router.get('/:id/identifiers', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const identifiers = db.prepare(`
      SELECT id, contact_id as contactId, identifier_type as identifierType,
             identifier_value as identifierValue, identifier_normalized as identifierNormalized,
             platform, is_primary as isPrimary, created_at as createdAt, updated_at as updatedAt
      FROM contact_identifiers WHERE contact_id = ?
    `).all(req.params.id);

    res.json({
      identifiers: identifiers.map(i => ({
        ...i,
        isPrimary: !!i.isPrimary,
        isVerified: false,
        metadata: {},
      }))
    });

  } catch (error) {
    logger.error(`Failed to get identifiers: ${error.message}`);
    res.status(500).json({ error: 'Failed to get identifiers' });
  }
});

// ==========================================
// POST /api/contacts/:id/identifiers
// ==========================================

router.post('/:id/identifiers', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { type, identifierType, value, identifierValue, platform, isPrimary } = req.body;
    const idType = type || identifierType;
    const idValue = value || identifierValue;

    if (!idType || !idValue) {
      return res.status(400).json({ error: 'Type and value are required' });
    }

    const identifierId = uuidv4();

    db.prepare(`
      INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(identifierId, req.params.id, idType, idValue, platform || null, isPrimary ? 1 : 0);

    res.status(201).json({
      id: identifierId,
      contactId: req.params.id,
      identifierType: idType,
      identifierValue: idValue,
      platform,
      isPrimary: !!isPrimary,
      isVerified: false,
      metadata: {},
    });

  } catch (error) {
    logger.error(`Failed to add identifier: ${error.message}`);
    res.status(500).json({ error: 'Failed to add identifier' });
  }
});

// ==========================================
// DELETE /api/contacts/:contactId/identifiers/:identifierId
// ==========================================

router.delete('/:contactId/identifiers/:identifierId', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.contactId, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    db.prepare('DELETE FROM contact_identifiers WHERE id = ? AND contact_id = ?')
      .run(req.params.identifierId, req.params.contactId);

    res.json({ message: 'Identifier removed' });

  } catch (error) {
    logger.error(`Failed to remove identifier: ${error.message}`);
    res.status(500).json({ error: 'Failed to remove identifier' });
  }
});

// ==========================================
// POST /api/contacts/:contactId/identifiers/:identifierId/primary
// Set an identifier as primary
// ==========================================

router.post('/:contactId/identifiers/:identifierId/primary', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.contactId, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Get the identifier's type so we can reset others of same type
    const identifier = db.prepare('SELECT identifier_type FROM contact_identifiers WHERE id = ? AND contact_id = ?')
      .get(req.params.identifierId, req.params.contactId);

    if (!identifier) {
      return res.status(404).json({ error: 'Identifier not found' });
    }

    // Reset all identifiers of the same type for this contact
    db.prepare('UPDATE contact_identifiers SET is_primary = 0 WHERE contact_id = ? AND identifier_type = ?')
      .run(req.params.contactId, identifier.identifier_type);

    // Set this one as primary
    db.prepare('UPDATE contact_identifiers SET is_primary = 1 WHERE id = ?')
      .run(req.params.identifierId);

    res.json({ message: 'Primary identifier set' });

  } catch (error) {
    logger.error(`Failed to set primary identifier: ${error.message}`);
    res.status(500).json({ error: 'Failed to set primary identifier' });
  }
});

// ==========================================
// GET /api/contacts/:id/tags
// ==========================================

router.get('/:id/tags', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id, tags FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const tags = contact.tags ? JSON.parse(contact.tags) : [];
    const normalizedTags = tags.map(tag =>
      typeof tag === 'string' ? { name: tag, color: null } : tag
    );

    res.json(normalizedTags);

  } catch (error) {
    logger.error(`Failed to get tags: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// ==========================================
// POST /api/contacts/:id/tags
// ==========================================

router.post('/:id/tags', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id, tags FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { tagName, color } = req.body;

    if (!tagName) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const existingTags = contact.tags ? JSON.parse(contact.tags) : [];
    const normalizedTags = existingTags.map(tag =>
      typeof tag === 'string' ? { name: tag, color: null } : tag
    );

    if (normalizedTags.some(t => t.name === tagName)) {
      return res.status(400).json({ error: 'Tag already exists' });
    }

    normalizedTags.push({ name: tagName, color: color || null });

    db.prepare("UPDATE contacts SET tags = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(normalizedTags), req.params.id);

    res.status(201).json({ name: tagName, color: color || null });

  } catch (error) {
    logger.error(`Failed to add tag: ${error.message}`);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// ==========================================
// DELETE /api/contacts/:id/tags/:tagName
// ==========================================

router.delete('/:id/tags/:tagName', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id, tags FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const tagName = decodeURIComponent(req.params.tagName);
    const existingTags = contact.tags ? JSON.parse(contact.tags) : [];

    const updatedTags = existingTags
      .map(tag => typeof tag === 'string' ? { name: tag, color: null } : tag)
      .filter(t => t.name !== tagName);

    db.prepare("UPDATE contacts SET tags = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(updatedTags), req.params.id);

    res.json({ message: 'Tag removed' });

  } catch (error) {
    logger.error(`Failed to remove tag: ${error.message}`);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// ==========================================
// GET /api/contacts/:id/conversations
// ==========================================

router.get('/:id/conversations', (req, res) => {
  try {
    const db = getDatabase();

    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const conversations = db.prepare(`
      SELECT c.id, c.platform, c.title, c.status, c.unread_count as unreadCount,
             c.updated_at as updatedAt, a.name as agentName
      FROM conversations c
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE c.contact_id = ?
      ORDER BY c.updated_at DESC
    `).all(req.params.id);

    res.json(conversations);

  } catch (error) {
    logger.error(`Failed to get conversations: ${error.message}`);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// ==========================================
// POST /api/contacts/merge/preview
// ==========================================

router.post('/merge/preview', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);
    const { primaryContactId, secondaryContactId } = req.body;

    if (!primaryContactId || !secondaryContactId) {
      return res.status(400).json({ error: 'Both contact IDs are required' });
    }

    const primary = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?')
      .get(primaryContactId, req.user.id);
    const secondary = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?')
      .get(secondaryContactId, req.user.id);

    if (!primary || !secondary) {
      return res.status(404).json({ error: 'One or both contacts not found' });
    }

    const secondaryIdentifiers = db.prepare(
      'SELECT COUNT(*) as count FROM contact_identifiers WHERE contact_id = ?'
    ).get(secondaryContactId);
    const secondaryConversations = db.prepare(
      'SELECT COUNT(*) as count FROM conversations WHERE contact_id = ?'
    ).get(secondaryContactId);

    res.json({
      primaryContact: transformContact(primary, db),
      secondaryContact: transformContact(secondary, db),
      mergedFields: {
        displayName: primary.display_name || secondary.display_name,
        notes: [primary.notes, secondary.notes].filter(Boolean).join('\n---\n'),
      },
      identifiersToTransfer: secondaryIdentifiers.count,
      conversationsToTransfer: secondaryConversations.count,
      tagsToMerge: [],
    });

  } catch (error) {
    logger.error(`Failed to preview merge: ${error.message}`);
    res.status(500).json({ error: 'Failed to preview merge' });
  }
});

// ==========================================
// POST /api/contacts/merge
// ==========================================

router.post('/merge', (req, res) => {
  try {
    const db = getDatabase();
    ensureColumns(db);
    const { primaryContactId, secondaryContactId } = req.body;

    if (!primaryContactId || !secondaryContactId) {
      return res.status(400).json({ error: 'Both contact IDs are required' });
    }

    const primary = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?')
      .get(primaryContactId, req.user.id);
    const secondary = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?')
      .get(secondaryContactId, req.user.id);

    if (!primary || !secondary) {
      return res.status(404).json({ error: 'One or both contacts not found' });
    }

    // Transfer identifiers
    const idResult = db.prepare(
      'UPDATE contact_identifiers SET contact_id = ? WHERE contact_id = ?'
    ).run(primaryContactId, secondaryContactId);

    // Transfer conversations
    const convResult = db.prepare(
      'UPDATE conversations SET contact_id = ? WHERE contact_id = ?'
    ).run(primaryContactId, secondaryContactId);

    // Merge notes
    if (secondary.notes && !primary.notes) {
      db.prepare('UPDATE contacts SET notes = ? WHERE id = ?').run(secondary.notes, primaryContactId);
    } else if (secondary.notes && primary.notes) {
      db.prepare('UPDATE contacts SET notes = ? WHERE id = ?')
        .run(primary.notes + '\n---\n' + secondary.notes, primaryContactId);
    }

    // Delete secondary contact
    db.prepare('DELETE FROM contacts WHERE id = ?').run(secondaryContactId);

    // Fetch merged contact
    const merged = db.prepare(`
      SELECT c.id, c.user_id as userId, c.display_name as displayName,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type IN ('phone', 'whatsapp') AND is_primary = 1 LIMIT 1) as primaryPhone,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'email' AND is_primary = 1 LIMIT 1) as primaryEmail,
        (SELECT identifier_value FROM contact_identifiers WHERE contact_id = c.id AND identifier_type = 'telegram' AND is_primary = 1 LIMIT 1) as primaryTelegramUsername,
        c.avatar, c.company, c.notes, c.tags, c.metadata, c.is_blocked, c.is_favorite,
        c.created_at as createdAt, c.updated_at as updatedAt
      FROM contacts c WHERE c.id = ?
    `).get(primaryContactId);

    res.json({
      mergedContact: transformContact(merged, db),
      deletedContactId: secondaryContactId,
      identifiersTransferred: idResult.changes,
      conversationsTransferred: convResult.changes,
      tagsMerged: 0,
    });

  } catch (error) {
    logger.error(`Failed to merge contacts: ${error.message}`);
    res.status(500).json({ error: 'Failed to merge contacts' });
  }
});

module.exports = router;
