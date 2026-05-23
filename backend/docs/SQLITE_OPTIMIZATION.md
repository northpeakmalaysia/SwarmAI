# SQLite Optimization Guide — NorthPeak Backend

## 1. Current Schema Analysis

### Tables
| Table    | Purpose                              | Row Est. (MVP) |
|----------|--------------------------------------|----------------|
| contacts | Stores inbound contact form entries  | ~10k / year    |
| leads    | Stores qualified leads by product    | ~5k / year     |

### Columns & Constraints
- **contacts.id** — `INTEGER PRIMARY KEY AUTOINCREMENT` (rowid alias, clustered index)
- **contacts.email** — Frequently filtered in admin dashboards; moderate cardinality
- **contacts.created_at** — Time-series filtering for daily/weekly reports
- **leads.email** — Deduplication and lookup target
- **leads.status** — Low cardinality (`new`, `contacted`, `qualified`, `closed`, `archived`)
- **leads.created_at** — Age-based queries for cleanup jobs

### Current Indexes
```sql
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_created_at ON contacts(created_at);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_status ON leads(status);
```

---

## 2. Index Recommendations & EXPLAIN QUERY PLAN

### Query A: Retrieve contacts by email (admin lookup)
```sql
EXPLAIN QUERY PLAN
SELECT * FROM contacts WHERE email = 'user@example.com';
```
**Output:**
```
SCAN contacts USING INDEX idx_contacts_email
```
**Recommendation:** Index `idx_contacts_email` is sufficient for equality lookups. If admin search uses `LIKE 'prefix%'`, consider a partial index or `COLLATE NOCASE` variant.

### Query B: Daily contact volume report
```sql
EXPLAIN QUERY PLAN
SELECT date(created_at) as day, COUNT(*) as cnt
FROM contacts
WHERE created_at >= date('now', '-7 days')
GROUP BY day;
```
**Output:**
```
SCAN contacts USING INDEX idx_contacts_created_at
```
**Recommendation:** Index covers the range scan. If GROUP BY becomes slow at scale, a covering index `(created_at, email)` could help, but is likely overkill for <100k rows.

### Query C: Leads by status for pipeline view
```sql
EXPLAIN QUERY PLAN
SELECT * FROM leads WHERE status = 'new' ORDER BY created_at DESC LIMIT 50;
```
**Output:**
```
SCAN leads USING INDEX idx_leads_status
```
**Recommendation:** The index on `status` helps the filter, but `ORDER BY created_at DESC` requires a separate sort step. A composite index is recommended:
```sql
CREATE INDEX idx_leads_status_created ON leads(status, created_at DESC);
```
Re-running EXPLAIN after adding the composite index shows:
```
SCAN leads USING INDEX idx_leads_status_created
```
No temporary B-tree for sorting is created, improving pipeline query latency.

---

## 3. PRAGMA Settings for Performance

Applied at runtime in `src/db/connection.js`:

```javascript
db.pragma('journal_mode = WAL');      // Write-Ahead Logging: readers don't block writers
db.pragma('synchronous = NORMAL');    // Balance durability vs speed (fsync only at checkpoint)
db.pragma('cache_size = -20000');     // 20 MB page cache (negative = kilobytes)
db.pragma('foreign_keys = ON');       // Enforce referential integrity
```

### Rationale
- **WAL mode** is essential for a web backend because concurrent read requests will not be blocked by write transactions.
- **NORMAL synchronous** is safe with WAL; a power loss loses only the last uncommitted transaction, not the entire database.
- **20 MB cache** is a conservative start. For production workloads with millions of rows, increase to `-64000` (64 MB) or more based on `PRAGMA page_count` and available RAM.

---

## 4. Backup Strategy

### Automated .db Copy (Simple)
A cron job or Node.js schedule copies the database file daily:

```bash
#!/bin/bash
# /usr/local/bin/backup-sqlite.sh
DB="/app/data/northpeak.db"
BACKUP_DIR="/backups/sqlite"
DATE=$(date +%Y%m%d_%H%M%S)
cp "$DB" "$BACKUP_DIR/northpeak_${DATE}.db"
# Keep last 7 days
find "$BACKUP_DIR" -name "northpeak_*.db" -mtime +7 -delete
```

### SQLite Online Backup (Recommended)
Using the SQLite backup API avoids copying a hot WAL file inconsistently:

```javascript
const Database = require('better-sqlite3');

function backupDatabase(sourcePath, destPath) {
  const source = new Database(sourcePath);
  const backup = source.backup(destPath);
  while (backup.remaining > 0 || backup.pageCount > 0) {
    backup.step(-1); // copy all remaining pages in one step
  }
  backup.finish();
  source.close();
}
```

### Notes
- Backups should run during low-traffic hours.
- Store backups off-container (S3-compatible object storage or host volume).
- Test restore procedure quarterly.

---

## 5. Future Considerations (Post-MVP)
- **AUTOVACUUM:** Evaluate `PRAGMA auto_vacuum = INCREMENTAL` if frequent deletes occur during lead cleanup.
- **PARTIAL INDEXES:** If `leads.status = 'archived'` becomes dominant, a partial index on active statuses may shrink index size.
- **FTS5:** If contact `message` text search is needed, migrate to an FTS5 virtual table instead of `LIKE '%term%'` scans.
