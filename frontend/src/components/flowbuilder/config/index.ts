/**
 * FlowBuilder Config Forms - Barrel Exports
 *
 * Rich configuration forms for FlowBuilder nodes.
 * Ported from WhatsBots with adaptations for SwarmAI patterns.
 */

// Trigger Config Forms
export { default as TriggerConfigForms } from './TriggerConfigForms';
export type { TriggerConfigFormsProps } from './TriggerConfigForms';

// Shared Form Components
export {
  ConfigInput,
  ConfigSelect,
  ConfigCheckbox,
  ConfigTextarea,
  ConfigSlider,
  SectionHeader,
  InfoBox,
  OutputVariablesDoc,
  ButtonGroup,
} from './shared/FormComponents';

// Future exports (to be implemented):
// export { default as ActionConfigForms } from './ActionConfigForms';
// export { default as ControlConfigForms } from './ControlConfigForms';
// export { default as DataConfigForms } from './DataConfigForms';
// export { default as AIConfigForms } from './AIConfigForms';
// export { default as TelegramConfigForms } from './TelegramConfigForms';
