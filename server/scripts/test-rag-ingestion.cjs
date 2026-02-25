/**
 * Test RAG Ingestion Script
 *
 * This script tests document ingestion and semantic search.
 * Run with: node server/scripts/test-rag-ingestion.cjs
 */

const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Override QDRANT_URL for local testing (Docker uses 'qdrant', local uses 'localhost')
if (process.env.QDRANT_URL?.includes('qdrant:')) {
  process.env.QDRANT_URL = process.env.QDRANT_URL.replace('qdrant:', 'localhost:');
  console.log('Note: Using localhost instead of Docker hostname for Qdrant');
}

const { initDatabase, getDatabase } = require('../services/database.cjs');
const { getRetrievalService } = require('../services/rag/index.cjs');

async function main() {
  console.log('=== RAG Ingestion Test ===\n');

  // Initialize database
  initDatabase();
  const db = getDatabase();

  // Get first library
  const library = db.prepare('SELECT * FROM knowledge_libraries LIMIT 1').get();

  if (!library) {
    console.error('No libraries found. Please create a library first.');
    process.exit(1);
  }

  console.log(`Using library: "${library.name}" (${library.id})`);
  console.log(`User ID: ${library.user_id}\n`);

  // Sample document content
  const sampleDocument = {
    title: 'Test Document - School Information',
    content: `
      Sekolah Menengah Kebangsaan Taman Universiti adalah sebuah sekolah menengah yang terletak di Johor Bahru.
      Sekolah ini ditubuhkan pada tahun 1990 dan mempunyai lebih dari 1500 pelajar.

      Kemudahan sekolah termasuk:
      - Perpustakaan dengan koleksi lebih 10,000 buku
      - Makmal komputer dengan 50 unit komputer
      - Dewan serbaguna yang boleh memuatkan 500 orang
      - Padang bola sepak berukuran penuh
      - Kantin yang menyediakan pelbagai makanan

      Prestasi akademik sekolah sangat cemerlang dengan kadar lulus SPM melebihi 90% setiap tahun.
      Sekolah ini juga aktif dalam aktiviti kokurikulum seperti sukan, kelab dan persatuan.

      Waktu persekolahan:
      - Sesi pagi: 7:30 pagi - 1:30 petang
      - Sesi petang: 1:00 petang - 6:30 petang

      Untuk maklumat lanjut, sila hubungi pejabat sekolah di talian 07-1234567.
    `,
    sourceType: 'text',
    metadata: {
      language: 'ms',
      category: 'school_info',
      testDocument: true,
    },
  };

  console.log('Ingesting test document...');

  try {
    // Test Ollama embedding first
    console.log('\nTesting Ollama embedding...');
    const ollamaRes = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: 'test embedding' }),
    });
    if (!ollamaRes.ok) {
      console.error('Ollama embedding failed:', ollamaRes.status);
    } else {
      const ollamaData = await ollamaRes.json();
      console.log(`✓ Ollama embedding works (${ollamaData.embedding?.length || 0} dimensions)`);
    }

    // Test Qdrant connection
    console.log('\nTesting Qdrant connection...');
    const qdrantRes = await fetch('http://localhost:6333/collections');
    if (!qdrantRes.ok) {
      console.error('Qdrant connection failed:', qdrantRes.status);
    } else {
      const qdrantData = await qdrantRes.json();
      console.log(`✓ Qdrant connected (${qdrantData.result?.collections?.length || 0} collections)`);
    }

    const retrieval = getRetrievalService();

    console.log('\nStarting document ingestion...');
    const result = await retrieval.ingestDocument(
      sampleDocument,
      library.id,
      {
        userId: library.user_id,
        chunkStrategy: 'paragraph',
        chunkSize: 300,
      }
    );

    console.log('\n✓ Ingestion successful!');
    console.log(`  Document ID: ${result.documentId}`);
    console.log(`  Chunks created: ${result.chunksCreated}`);
    console.log(`  Status: ${result.status}`);

    // Wait a moment for indexing
    console.log('\nWaiting for indexing...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test semantic search
    console.log('\n=== Testing Semantic Search ===\n');

    const testQueries = [
      'Berapa ramai pelajar di sekolah ini?',
      'Apa kemudahan yang ada di sekolah?',
      'Bila waktu persekolahan?',
    ];

    for (const query of testQueries) {
      console.log(`Query: "${query}"`);

      const searchResult = await retrieval.retrieve(query, {
        libraryIds: [library.id],
        topK: 3,
        minScore: 0.5, // Lower threshold for testing
        userId: library.user_id,
      });

      if (searchResult.chunks.length === 0) {
        console.log('  ⚠ No results found\n');
      } else {
        console.log(`  ✓ Found ${searchResult.chunks.length} result(s)`);
        searchResult.chunks.forEach((chunk, i) => {
          console.log(`    ${i + 1}. Score: ${chunk.score.toFixed(3)} - "${chunk.content.substring(0, 80)}..."`);
        });
        console.log('');
      }
    }

    console.log('=== Test Complete ===');

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause.message || error.cause);
    }
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
