/**
 * ApiKeySettings Component
 *
 * This component wraps the new ApiKeysContainer which provides
 * sub-tab navigation for AI Providers, HTTP API Keys, and Webhooks.
 *
 * The original implementation has been moved to the apikeys subfolder
 * with a more modular architecture.
 */

import React from 'react'
import { ApiKeysContainer } from './apikeys'

/**
 * ApiKeySettings - Main entry point for API Keys & Integrations settings
 *
 * This component serves as a wrapper for backwards compatibility.
 * The actual implementation is in the apikeys/ApiKeysContainer component.
 */
export const ApiKeySettings: React.FC = () => {
  return <ApiKeysContainer />
}

export default ApiKeySettings
