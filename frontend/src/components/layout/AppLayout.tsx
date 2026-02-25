import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { TopNavigation } from './TopNavigation'
import { useAuthStore } from '../../stores/authStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useAgentStatus } from '../../hooks/useAgentStatus'

export default function AppLayout() {
  const { checkAuth } = useAuthStore()
  // useWebSocket automatically connects when authenticated and disconnects on logout
  useWebSocket()
  // Subscribe to agent/platform status updates globally (needed for sync buttons on messages page)
  useAgentStatus()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <div className="h-screen bg-swarm-dark overflow-hidden">
      {/* Top Navigation (fixed positioned) */}
      <TopNavigation />

      {/* Main content area - calc height: 100vh - header(3.5rem) - mobile-nav(4rem on mobile, 0 on desktop) */}
      <main className="h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)] mt-14 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
