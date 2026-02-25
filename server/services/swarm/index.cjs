/**
 * Swarm Services Index
 *
 * Central export for all swarm-related services.
 */

const { AgentDiscoveryService, getAgentDiscoveryService } = require('./AgentDiscoveryService.cjs');
const { HandoffService, getHandoffService } = require('./HandoffService.cjs');
const { CollaborationService, getCollaborationService } = require('./CollaborationService.cjs');
const { ConsensusService, getConsensusService } = require('./ConsensusService.cjs');
const { SwarmOrchestrator, getSwarmOrchestrator } = require('./SwarmOrchestrator.cjs');
const { EmailCoordinationService, getEmailCoordinationService } = require('./EmailCoordinationService.cjs');

module.exports = {
  // Agent Discovery
  AgentDiscoveryService,
  getAgentDiscoveryService,

  // Handoffs
  HandoffService,
  getHandoffService,

  // Collaboration
  CollaborationService,
  getCollaborationService,

  // Consensus
  ConsensusService,
  getConsensusService,

  // Orchestrator
  SwarmOrchestrator,
  getSwarmOrchestrator,

  // Email Coordination
  EmailCoordinationService,
  getEmailCoordinationService,
};
