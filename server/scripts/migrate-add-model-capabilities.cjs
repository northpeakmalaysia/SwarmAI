/**
 * Migration: Add Model Capabilities
 *
 * Adds columns to openrouter_models for AI capability detection:
 * - supports_vision: Model can process images
 * - supports_tools: Model supports function/tool calling
 * - supports_json: Model can output structured JSON
 * - supports_streaming: Model supports streaming responses
 * - input_modalities: JSON array of supported input types
 * - output_modalities: JSON array of supported output types
 *
 * These capabilities are used by SuperBrain and Agentic AI
 * for intelligent model selection based on task requirements.
 */

const Database = require('better-sqlite3');
const path = require('path');

// Database path
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Migration: Add Model Capabilities Columns');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Database: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Check if columns already exist
function columnExists(tableName, columnName) {
  const result = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return result.some(col => col.name === columnName);
}

// Add new columns for capabilities
const columnsToAdd = [
  { name: 'supports_vision', type: 'INTEGER DEFAULT 0', description: 'Model can process images' },
  { name: 'supports_tools', type: 'INTEGER DEFAULT 0', description: 'Model supports function/tool calling' },
  { name: 'supports_json', type: 'INTEGER DEFAULT 0', description: 'Model can output structured JSON' },
  { name: 'supports_streaming', type: 'INTEGER DEFAULT 1', description: 'Model supports streaming' },
  { name: 'input_modalities', type: 'TEXT', description: 'JSON array of input types' },
  { name: 'output_modalities', type: 'TEXT', description: 'JSON array of output types' },
  { name: 'max_output_tokens', type: 'INTEGER', description: 'Maximum output tokens' },
  { name: 'tokenizer', type: 'TEXT', description: 'Tokenizer type used' },
];

console.log('\nAdding capability columns to openrouter_models...\n');

for (const col of columnsToAdd) {
  if (columnExists('openrouter_models', col.name)) {
    console.log(`   ⏭ Column '${col.name}' already exists`);
  } else {
    try {
      db.exec(`ALTER TABLE openrouter_models ADD COLUMN ${col.name} ${col.type}`);
      console.log(`   ✓ Added column '${col.name}' (${col.description})`);
    } catch (error) {
      console.error(`   ✗ Failed to add column '${col.name}': ${error.message}`);
    }
  }
}

// Create indexes for capability filtering
console.log('\nCreating indexes for capability filtering...\n');

const indexes = [
  { name: 'idx_models_vision', column: 'supports_vision' },
  { name: 'idx_models_tools', column: 'supports_tools' },
  { name: 'idx_models_json', column: 'supports_json' },
];

for (const idx of indexes) {
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS ${idx.name} ON openrouter_models(${idx.column})`);
    console.log(`   ✓ Index '${idx.name}' ready`);
  } catch (error) {
    console.error(`   ✗ Failed to create index '${idx.name}': ${error.message}`);
  }
}

// Now update existing models with capabilities parsed from architecture
console.log('\nUpdating existing models with capability flags...\n');

const models = db.prepare('SELECT id, architecture, modality FROM openrouter_models').all();

const updateStmt = db.prepare(`
  UPDATE openrouter_models SET
    supports_vision = ?,
    supports_tools = ?,
    supports_json = ?,
    supports_streaming = ?,
    input_modalities = ?,
    output_modalities = ?,
    max_output_tokens = ?,
    tokenizer = ?
  WHERE id = ?
`);

let updated = 0;
for (const model of models) {
  try {
    let arch = null;
    if (model.architecture) {
      try {
        arch = JSON.parse(model.architecture);
      } catch (e) {
        // Invalid JSON, skip
      }
    }

    // Determine capabilities from architecture and modality
    const modality = model.modality || arch?.modality || '';
    const inputMods = arch?.input_modalities || [];
    const outputMods = arch?.output_modalities || [];

    // Vision support: check if image is in input modalities or modality string
    const supportsVision =
      inputMods.includes('image') ||
      modality.includes('image') ||
      model.id.includes('vision') ||
      model.id.includes('gpt-4o') ||
      model.id.includes('claude-3') ||
      model.id.includes('gemini');

    // Tool/function calling support: most modern models support it
    // Based on known models that support function calling
    const supportsTools =
      model.id.includes('gpt-4') ||
      model.id.includes('gpt-3.5') ||
      model.id.includes('claude-3') ||
      model.id.includes('claude-opus') ||
      model.id.includes('claude-sonnet') ||
      model.id.includes('gemini') ||
      model.id.includes('mistral') ||
      model.id.includes('mixtral') ||
      model.id.includes('llama-3') ||
      model.id.includes('command-r');

    // JSON mode support
    const supportsJson = supportsTools; // Generally same models

    // Streaming - most models support it
    const supportsStreaming = true;

    // Max output tokens from per_request_limits or default
    const maxOutput = arch?.max_output_tokens || null;

    // Tokenizer
    const tokenizer = arch?.tokenizer || null;

    updateStmt.run(
      supportsVision ? 1 : 0,
      supportsTools ? 1 : 0,
      supportsJson ? 1 : 0,
      supportsStreaming ? 1 : 0,
      JSON.stringify(inputMods.length > 0 ? inputMods : ['text']),
      JSON.stringify(outputMods.length > 0 ? outputMods : ['text']),
      maxOutput,
      tokenizer,
      model.id
    );
    updated++;
  } catch (error) {
    console.error(`   ✗ Failed to update model '${model.id}': ${error.message}`);
  }
}

console.log(`   ✓ Updated ${updated} models with capability flags`);

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Migration Complete!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Show capability summary
const summary = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(supports_vision) as vision,
    SUM(supports_tools) as tools,
    SUM(supports_json) as json_mode
  FROM openrouter_models
`).get();

console.log(`\nCapability Summary:`);
console.log(`   Total models: ${summary.total}`);
console.log(`   Vision support: ${summary.vision}`);
console.log(`   Tools/Functions: ${summary.tools}`);
console.log(`   JSON mode: ${summary.json_mode}`);

db.close();
