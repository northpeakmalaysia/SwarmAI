import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { initializeTheme } from './stores/uiStore'
import SwarmIcon from './components/common/SwarmIcon'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import SwarmPage from './pages/SwarmPage'
import MessagesPageV2 from './pages/MessagesPageV2'
import AgentsPage from './pages/AgentsPage'
import FlowBuilderPage from './pages/FlowBuilderPage'
import KnowledgePage from './pages/KnowledgePage'
import TerminalPage from './pages/TerminalPage'
import SettingsPage from './pages/SettingsPage'
import SystemSettingsPage from './pages/SystemSettingsPage'
import ContactsPage from './pages/ContactsPage'
import AgentLogsPage from './pages/AgentLogsPage'
import WebhooksPage from './pages/WebhooksPage'
import AgenticDashboardPage from './pages/AgenticDashboardPage'
import AgenticProfilesPage from './pages/AgenticProfilesPage'
import SuperBrainSettingsPage from './pages/SuperBrainSettingsPage'
import UserManagementPage from './pages/UserManagementPage'
import LocalAgentsPage from './pages/LocalAgentsPage'
import LocalAgentAuthPage from './pages/LocalAgentAuthPage'

function ProtectedRoute({ children, requireOnboarding = true }: { children: React.ReactNode; requireOnboarding?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-swarm-darker">
        {/* Swarm icon with pulse animation */}
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" style={{ width: '80px', height: '80px' }} />
          <div className="relative">
            <SwarmIcon size={80} />
          </div>
        </div>
        {/* Loading text */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Connecting to Swarm</h2>
          <p className="text-gray-400 text-sm animate-pulse">Initializing swarm intelligence...</p>
        </div>
        {/* Progress dots */}
        <div className="flex gap-1 mt-4">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Check if onboarding is required and not completed
  if (requireOnboarding && user && user.onboardingCompleted === false && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

function App() {
  const { checkAuth } = useAuthStore()

  useEffect(() => {
    // Initialize theme and font scale from persisted settings
    initializeTheme()
    checkAuth()
  }, [checkAuth])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/magic-link" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireOnboarding={false}>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/local-agent/auth/:sessionId"
        element={
          <ProtectedRoute>
            <LocalAgentAuthPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="swarm" element={<SwarmPage />} />
        <Route path="messages" element={<MessagesPageV2 />} />
        <Route path="messages/:conversationId" element={<MessagesPageV2 />} />
        {/* Legacy V2 route redirect */}
        <Route path="messages-v2/*" element={<Navigate to="/messages" replace />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="flows" element={<FlowBuilderPage />} />
        <Route path="flows/:flowId" element={<FlowBuilderPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:contactId" element={<ContactsPage />} />
        <Route path="agent-logs" element={<AgentLogsPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="terminal" element={<TerminalPage />} />
        <Route path="agentic" element={<AgenticDashboardPage />} />
        <Route path="agentic-profiles" element={<AgenticProfilesPage />} />
        <Route path="local-agents" element={<LocalAgentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="superbrain-settings" element={<SuperBrainSettingsPage />} />
        {/* Admin routes */}
        <Route path="admin/system" element={<SystemSettingsPage />} />
        <Route path="admin/users" element={<UserManagementPage />} />
        {/* Legacy route redirect */}
        <Route path="system-settings" element={<Navigate to="/admin/system" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
