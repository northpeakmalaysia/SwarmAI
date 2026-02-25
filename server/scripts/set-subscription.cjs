/**
 * Set subscription plan for a user
 *
 * Usage: node server/scripts/set-subscription.cjs <email> <plan>
 * Plans: free, starter, pro, enterprise
 * Example: node server/scripts/set-subscription.cjs syaiful0813@gmail.com enterprise
 */

const path = require('path');
const { randomUUID } = require('crypto');
const Database = require('better-sqlite3');

// Get args from command line
const email = process.argv[2];
const plan = process.argv[3] || 'enterprise';

if (!email) {
  console.error('Usage: node server/scripts/set-subscription.cjs <email> <plan>');
  console.error('Plans: free, starter, pro, enterprise');
  console.error('Example: node server/scripts/set-subscription.cjs syaiful0813@gmail.com enterprise');
  process.exit(1);
}

const validPlans = ['free', 'starter', 'pro', 'enterprise'];
if (!validPlans.includes(plan)) {
  console.error(`Invalid plan "${plan}". Must be one of: ${validPlans.join(', ')}`);
  process.exit(1);
}

// Plan features
const planFeatures = {
  free: { maxAgents: 2, maxConversations: 100, maxMessagesPerMonth: 1000 },
  starter: { maxAgents: 5, maxConversations: 500, maxMessagesPerMonth: 5000 },
  pro: { maxAgents: 20, maxConversations: 2000, maxMessagesPerMonth: 20000 },
  enterprise: { maxAgents: 999, maxConversations: 999999, maxMessagesPerMonth: 999999 }
};

// Database path
const DB_PATH = path.resolve(__dirname, '../data/swarm.db');

console.log('Setting subscription plan...');
console.log(`Database: ${DB_PATH}`);
console.log(`Email: ${email}`);
console.log(`Plan: ${plan}`);

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Find user by email
  const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);

  if (!user) {
    console.error(`\nUser with email "${email}" not found!`);
    db.close();
    process.exit(1);
  }

  console.log(`\nFound user: ${user.name || user.email} (${user.id})`);

  // Check existing subscription
  const existingSub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);

  const features = planFeatures[plan];

  if (existingSub) {
    // Update existing subscription
    console.log(`Current plan: ${existingSub.plan}`);

    const result = db.prepare(`
      UPDATE subscriptions
      SET plan = ?,
          agent_slots = ?,
          features = ?,
          status = 'active',
          updated_at = datetime('now')
      WHERE user_id = ?
    `).run(plan, features.maxAgents, JSON.stringify(features), user.id);

    if (result.changes > 0) {
      console.log(`\n✅ Updated subscription to ${plan}!`);
    }
  } else {
    // Create new subscription
    const subId = randomUUID();
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan, status, agent_slots, features, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))
    `).run(subId, user.id, plan, features.maxAgents, JSON.stringify(features));

    console.log(`\n✅ Created new ${plan} subscription!`);
  }

  console.log(`  Agent slots: ${features.maxAgents}`);
  console.log(`  Max conversations: ${features.maxConversations}`);
  console.log(`  Messages per month: ${features.maxMessagesPerMonth}`);
  console.log('\n⚠️  User may need to refresh the page for changes to appear.');

  db.close();

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
