/**
 * Fix Subscription Link
 *
 * This script ensures the subscription is properly linked to the user by email.
 * It finds the user by email and updates/creates their subscription.
 *
 * Usage: node server/scripts/fix-subscription-link.cjs <email> <plan>
 * Example: node server/scripts/fix-subscription-link.cjs syaif@northpeak.app enterprise
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(__dirname, '../data/swarm.db');

const email = process.argv[2];
const plan = process.argv[3] || 'enterprise';

if (!email) {
  console.error('Usage: node server/scripts/fix-subscription-link.cjs <email> [plan]');
  console.error('Example: node server/scripts/fix-subscription-link.cjs syaif@northpeak.app enterprise');
  process.exit(1);
}

const plans = {
  free: { maxAgents: 2, maxConversations: 100, maxMessagesPerMonth: 1000, platforms: ['whatsapp'], aiModels: ['gpt-3.5-turbo'] },
  starter: { maxAgents: 5, maxConversations: 500, maxMessagesPerMonth: 5000, platforms: ['whatsapp', 'telegram'], aiModels: ['gpt-3.5-turbo', 'gpt-4'] },
  pro: { maxAgents: 20, maxConversations: 2000, maxMessagesPerMonth: 20000, platforms: ['whatsapp', 'telegram', 'email'], aiModels: ['gpt-3.5-turbo', 'gpt-4', 'claude-3'] },
  enterprise: { maxAgents: 100, maxConversations: 10000, maxMessagesPerMonth: 100000, platforms: ['whatsapp', 'telegram', 'email'], aiModels: ['gpt-3.5-turbo', 'gpt-4', 'claude-3', 'claude-3-opus'] }
};

if (!plans[plan]) {
  console.error(`Invalid plan: ${plan}`);
  console.error('Valid plans: free, starter, pro, enterprise');
  process.exit(1);
}

console.log(`\n🔧 Fixing subscription link for: ${email}`);
console.log(`📋 Plan: ${plan}\n`);

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Find user by email
  const user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE email = ?').get(email);

  if (!user) {
    console.error(`❌ User not found with email: ${email}`);
    process.exit(1);
  }

  console.log(`✅ Found user:`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   Role: ${user.role}`);
  console.log(`   Superuser: ${user.is_superuser ? 'Yes' : 'No'}\n`);

  // Check existing subscription
  const existingSub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);

  if (existingSub) {
    console.log(`📦 Existing subscription found:`);
    console.log(`   Plan: ${existingSub.plan}`);
    console.log(`   Status: ${existingSub.status}\n`);
  } else {
    console.log(`⚠️  No subscription found for this user\n`);
  }

  // Delete any orphaned subscriptions with wrong user_id
  const orphanedCount = db.prepare('DELETE FROM subscriptions WHERE user_id != ? AND user_id IN (SELECT id FROM users WHERE email = ?)').run(user.id, email).changes;
  if (orphanedCount > 0) {
    console.log(`🗑️  Removed ${orphanedCount} orphaned subscription(s)\n`);
  }

  // Upsert subscription
  const features = JSON.stringify(plans[plan]);
  const now = new Date().toISOString();

  if (existingSub) {
    // Update existing
    db.prepare(`
      UPDATE subscriptions
      SET plan = ?, status = 'active', features = ?, agent_slots = ?, updated_at = ?
      WHERE user_id = ?
    `).run(plan, features, plans[plan].maxAgents, now, user.id);
    console.log(`✅ Updated subscription to ${plan}`);
  } else {
    // Create new with UUID
    const { v4: uuidv4 } = require('uuid');
    const subId = uuidv4();

    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan, status, features, agent_slots, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(subId, user.id, plan, features, plans[plan].maxAgents, now, now);
    console.log(`✅ Created new subscription: ${plan}`);
  }

  // Verify
  const verifiedSub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status = ?').get(user.id, 'active');

  if (verifiedSub) {
    console.log(`\n🎉 Subscription verified:`);
    console.log(`   ID: ${verifiedSub.id}`);
    console.log(`   User ID: ${verifiedSub.user_id}`);
    console.log(`   Plan: ${verifiedSub.plan}`);
    console.log(`   Status: ${verifiedSub.status}`);
    console.log(`   Agent Slots: ${verifiedSub.agent_slots}`);
    console.log(`   Features: ${verifiedSub.features}`);
  } else {
    console.error(`\n❌ Failed to verify subscription`);
    process.exit(1);
  }

  db.close();
  console.log(`\n✅ Done! User ${email} now has ${plan} subscription.`);
  console.log(`\n💡 Please hard refresh your browser (Ctrl+Shift+R) to see the changes.`);

} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
}
