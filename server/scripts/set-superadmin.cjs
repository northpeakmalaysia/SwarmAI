/**
 * Set user as superadmin by email
 *
 * Usage: node server/scripts/set-superadmin.cjs <email>
 * Example: node server/scripts/set-superadmin.cjs syaiful0813@gmail.com
 */

const path = require('path');
const Database = require('better-sqlite3');

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.error('Usage: node server/scripts/set-superadmin.cjs <email>');
  console.error('Example: node server/scripts/set-superadmin.cjs syaiful0813@gmail.com');
  process.exit(1);
}

// Database path
const DB_PATH = path.resolve(__dirname, '../data/swarm.db');

console.log('Setting superadmin status...');
console.log(`Database: ${DB_PATH}`);
console.log(`Email: ${email}`);

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Find user by email
  const user = db.prepare('SELECT id, email, name, role, is_superuser FROM users WHERE email = ?').get(email);

  if (!user) {
    console.error(`\nUser with email "${email}" not found!`);

    // List all users
    const users = db.prepare('SELECT id, email, name, role, is_superuser FROM users LIMIT 10').all();
    console.log('\nExisting users:');
    users.forEach(u => {
      console.log(`  - ${u.email} (role: ${u.role}, superuser: ${u.is_superuser ? 'yes' : 'no'})`);
    });

    db.close();
    process.exit(1);
  }

  console.log(`\nFound user: ${user.name || user.email}`);
  console.log(`  Current role: ${user.role}`);
  console.log(`  Current superuser: ${user.is_superuser ? 'yes' : 'no'}`);

  // Update to superadmin
  const result = db.prepare(`
    UPDATE users
    SET role = 'admin', is_superuser = 1, updated_at = datetime('now')
    WHERE email = ?
  `).run(email);

  if (result.changes > 0) {
    console.log(`\n✅ Successfully updated ${email} to superadmin!`);
    console.log('  New role: admin');
    console.log('  New superuser: yes');
    console.log('\n⚠️  User needs to log out and log back in for changes to take effect.');
  } else {
    console.log('\n❌ No changes made.');
  }

  db.close();

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
