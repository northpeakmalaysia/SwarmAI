#!/usr/bin/env node
/**
 * Test: Auto-generate Athena's personality using PersonalityService
 * Proves the concept of AI-powered personality generation for Agentic AI agents
 */

const path = require('path');
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Initialize database
const { initDatabase, getDatabase } = require('../services/database.cjs');
initDatabase();
const db = getDatabase();

// Get Athena's profile
const athenaProfile = db.prepare(`
  SELECT id, user_id, name, role, description, system_prompt,
         personality_soul, personality_agents, personality_user, personality_identity
  FROM agentic_profiles WHERE name = 'Athena' AND status = 'active'
`).get();

if (!athenaProfile) {
  console.error('Athena profile not found. Run setup-athena.cjs first.');
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Test: Auto-Generate Athena Personality');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Profile: ${athenaProfile.name} (${athenaProfile.id})`);
console.log(`Role: ${athenaProfile.role}`);
console.log(`Description: ${athenaProfile.description}`);
console.log(`Has existing personality: ${!!(athenaProfile.personality_soul || athenaProfile.personality_identity)}`);

// Step 1: Show what context is gathered
console.log('\n[1/4] Gathering agent context...');

const { getPersonalityService } = require('../services/agentic/PersonalityService.cjs');
const personalityService = getPersonalityService();
const context = personalityService.gatherAgentContext(athenaProfile.id);

console.log(`   Profile: ${context.profile.name} (${context.profile.role})`);
console.log(`   Description: ${context.profile.description || 'none'}`);
console.log(`   System Prompt: ${context.profile.system_prompt ? context.profile.system_prompt.substring(0, 80) + '...' : 'none'}`);
console.log(`   Background: ${context.background ? 'yes' : 'no'}`);
console.log(`   Goals: ${context.goals.length}`);
console.log(`   Skills: ${context.skills.length}`);
console.log(`   Team Members: ${context.teamMembers.length}`);
console.log(`   Schedules: ${context.schedules.length}`);
console.log(`   Monitoring Sources: ${context.monitoring.length}`);

const contextSummary = personalityService.buildContextSummary(context);
console.log(`\n   Context Summary (${contextSummary.length} chars):`);
console.log('   ' + contextSummary.substring(0, 300).replace(/\n/g, '\n   ') + '...');

// Step 2: Generate personality with AI
console.log('\n[2/4] Generating personality with AI (SuperBrain complex tier)...');
console.log('   This may take 15-30 seconds...\n');

async function run() {
  try {
    // Initialize SuperBrain
    const { initializeSuperBrain } = require('../services/ai/index.cjs');
    initializeSuperBrain();

    const result = await personalityService.generateWithAI(
      athenaProfile.id,
      athenaProfile.user_id,
      {
        guidance: 'Athena is a Personal Assistant that monitors all other AI agents and sends WhatsApp notifications to the Master. She should be professional yet warm, proactive, concise in notifications, and protective of the master\'s time. She uses the owl emoji. She operates 24/7 monitoring agent health, email arrivals, and task completions.',
        language: 'English',
      }
    );

    console.log('[3/4] Personality generated successfully!');
    console.log(`   AI Provider: ${result.aiProvider}`);
    console.log(`   AI Model: ${result.aiModel}`);
    console.log(`   Context Used:`);
    console.log(`     - Description: ${result.contextUsed.hasDescription}`);
    console.log(`     - System Prompt: ${result.contextUsed.hasSystemPrompt}`);
    console.log(`     - Goals: ${result.contextUsed.goalsCount}`);
    console.log(`     - Skills: ${result.contextUsed.skillsCount}`);
    console.log(`     - Team: ${result.contextUsed.teamMembersCount}`);
    console.log(`     - Schedules: ${result.contextUsed.schedulesCount}`);
    console.log(`     - Monitoring: ${result.contextUsed.monitoringCount}`);

    // Step 3: Show generated personality
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('GENERATED IDENTITY.md:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result.identity?.substring(0, 600) || 'null');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('GENERATED SOUL.md:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result.soul?.substring(0, 600) || 'null');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('GENERATED AGENTS.md:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result.agents?.substring(0, 600) || 'null');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('GENERATED USER.md:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result.user?.substring(0, 600) || 'null');

    // Step 4: Generate system prompt from personality
    console.log('\n[4/4] Generating combined system prompt from personality...');
    const systemPrompt = personalityService.generateSystemPrompt(athenaProfile.id);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('COMBINED SYSTEM PROMPT (first 800 chars):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(systemPrompt.substring(0, 800));
    console.log(`\n... (${systemPrompt.length} total characters)`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PROOF OF CONCEPT: SUCCESS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Personality auto-generation works. This same flow can be');
    console.log('called by the Agent Auto Generator after creating a new agent.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\nFailed to generate personality:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

run();
