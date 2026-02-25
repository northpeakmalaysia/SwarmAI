/**
 * Retry Failed Documents Script
 *
 * Re-processes all failed documents in the knowledge base.
 * Run with: node server/scripts/retry-failed-documents.cjs
 */

const path = require('path');

// Set up module paths
const serverPath = path.join(__dirname, '..');
process.chdir(serverPath);

const { initDatabase, getDatabase } = require('../services/database.cjs');
const { getRetrievalService } = require('../services/rag/index.cjs');
const { logger } = require('../services/logger.cjs');

async function retryFailedDocuments() {
  console.log('='.repeat(60));
  console.log('Retry Failed Documents Script');
  console.log('='.repeat(60));

  // Initialize database
  initDatabase();
  const db = getDatabase();
  const retrieval = getRetrievalService();

  // Get all failed documents
  const failedDocs = db.prepare(`
    SELECT id, library_id, folder_id, title, content, source_type, source_url, metadata
    FROM knowledge_documents
    WHERE status = 'failed' AND content IS NOT NULL AND content != ''
  `).all();

  console.log(`\nFound ${failedDocs.length} failed documents to retry\n`);

  if (failedDocs.length === 0) {
    console.log('No failed documents found.');
    return;
  }

  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < failedDocs.length; i++) {
    const doc = failedDocs[i];
    const progress = `[${i + 1}/${failedDocs.length}]`;

    console.log(`${progress} Processing: ${doc.title?.substring(0, 50)}...`);

    try {
      // Reset document status to allow re-processing
      db.prepare(`
        UPDATE knowledge_documents
        SET status = 'pending', metadata = '{}', progress = 0
        WHERE id = ?
      `).run(doc.id);

      // Parse existing metadata
      let metadata = {};
      try {
        metadata = doc.metadata ? JSON.parse(doc.metadata) : {};
        // Remove error from metadata
        delete metadata.error;
      } catch (e) {
        metadata = {};
      }

      // Re-ingest the document
      const result = await retrieval.ingestDocument(
        {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          sourceType: doc.source_type || 'text',
          sourceUrl: doc.source_url,
          folderId: doc.folder_id,
          metadata,
        },
        doc.library_id,
        {
          userId: 'system-retry',
          chunkStrategy: 'paragraph',
        }
      );

      console.log(`  ✓ Success: ${result.chunksCreated} chunks created`);
      success++;

    } catch (error) {
      console.log(`  ✗ Failed: ${error.message}`);
      failed++;
      errors.push({
        id: doc.id,
        title: doc.title,
        error: error.message,
      });
    }

    // Small delay to avoid overwhelming services
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total processed: ${failedDocs.length}`);
  console.log(`Successful: ${success}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\nFailed documents:');
    errors.forEach(e => {
      console.log(`  - ${e.title?.substring(0, 40)}... : ${e.error.substring(0, 60)}`);
    });
  }

  console.log('\nDone!');
}

// Run the script
retryFailedDocuments()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });
