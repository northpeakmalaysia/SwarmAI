import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Network,
  MessageSquare,
  Bot,
  GitBranch,
  Database,
  Terminal,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  Activity,
  Webhook,
  Cpu,
  Brain,
  ShieldAlert,
  Cog,
  UserCog,
  MonitorSmartphone,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { useIsMobile, useIsTablet } from '../../hooks/useMediaQuery'
import { clsx } from 'clsx'
import SwarmIcon from '../common/SwarmIcon'
import { useState, useRef, useEffect } from 'react'

// Main navigation items (visible to all users)
const mainNavItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/agents', icon: Bot, label: 'Agents' },
  { path: '/messages', icon: MessageSquare, label: 'Messages' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/flows', icon: GitBranch, label: 'FlowBuilder' },
  { path: '/knowledge', icon: Database, label: 'Knowledge' },
  { path: '/webhooks', icon: Webhook, label: 'Webhooks' },
  { path: '/agent-logs', icon: Activity, label: 'Agent Logs' },
  { path: '/terminal', icon: Terminal, label: 'Terminal' },
  { path: '/swarm', icon: Network, label: 'Swarm' },
  { path: '/agentic', icon: Cpu, label: 'Agentic AI' },
  { path: '/agentic-profiles', icon: UserCog, label: 'Agentic Profiles' },
  { path: '/local-agents', icon: MonitorSmartphone, label: 'Local Agents' },
]

// Settings navigation items (visible to all users)
const settingsNavItems = [
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/superbrain-settings', icon: Brain, label: 'SuperBrain' },
]

// Admin navigation items (visible only to superadmins)
const adminNavItems = [
  { path: '/admin/system', icon: Cog, label: 'System Settings' },
  { path: '/admin/users', icon: ShieldAlert, label: 'User Management' },
]

// Legacy export for backwards compatibility
const navItems = mainNavItems

interface TooltipProps {
  children: React.ReactNode
  text: string
  visible: boolean
}

function Tooltip({ children, text, visible }: TooltipProps) {
  return (
    <div className="relative">
      {children}
      {visible && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2 py-1 bg-gray-900 text-white text-sm rounded shadow-lg whitespace-nowrap pointer-events-none">
          {text}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  /** For mobile: is this rendered in a drawer overlay? */
  isMobileDrawer?: boolean
  /** Callback when a nav link is clicked (for closing mobile drawer) */
  onNavClick?: () => void
}

export default function Sidebar({ isMobileDrawer = false, onNavClick }: SidebarProps) {
  const { logout, user } = useAuthStore()
  const { sidebarCollapsed, collapseSidebar, setMobileMenuOpen } = useUIStore()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()

  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  // Auto-collapse on tablet
  useEffect(() => {
    if (isTablet && !isMobileDrawer) {
      collapseSidebar(true)
    }
  }, [isTablet, collapseSidebar, isMobileDrawer])

  // Don't render sidebar on mobile unless it's the drawer version
  if (isMobile && !isMobileDrawer) {
    return null
  }

  const handleToggle = () => {
    collapseSidebar(!sidebarCollapsed)
  }

  const handleMouseEnter = (path: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(path)
    }, 200)
  }

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredItem(null)
  }

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  // Handle navigation click - close mobile menu if on mobile
  const handleNavLinkClick = () => {
    if (isMobileDrawer) {
      setMobileMenuOpen(false)
      onNavClick?.()
    }
  }

  const handleLogout = () => {
    if (isMobileDrawer) {
      setMobileMenuOpen(false)
    }
    logout()
  }

  // In mobile drawer mode, always show expanded
  const isCollapsed = isMobileDrawer ? false : sidebarCollapsed

  return (
    <aside
      className={clsx(
        'bg-swarm-dark flex flex-col transition-all duration-300 ease-in-out h-full',
        // Border styling
        !isMobileDrawer && 'border-r border-gray-800',
        // Width based on collapsed state
        isMobileDrawer ? 'w-64' : (isCollapsed ? 'w-20' : 'w-64')
      )}
    >
      {/* Logo */}
      <div className={clsx(
        'border-b border-gray-800 transition-all duration-300 flex items-center justify-between',
        isCollapsed && !isMobileDrawer ? 'p-4' : 'p-6'
      )}>
        <div className="flex items-center gap-3">
          <div className={clsx(
            'flex items-center justify-center transition-all duration-300',
            isCollapsed && !isMobileDrawer ? 'w-12 h-12' : 'w-10 h-10'
          )}>
            <SwarmIcon size={isCollapsed && !isMobileDrawer ? 48 : 40} />
          </div>
          {(!isCollapsed || isMobileDrawer) && (
            <div className="overflow-hidden">
              <h1 className="text-lg font-semibold text-white whitespace-nowrap">SwarmAI</h1>
              <p className="text-xs text-gray-500 whitespace-nowrap">Intelligence Platform</p>
            </div>
          )}
        </div>

        {/* Close button for mobile drawer */}
        {isMobileDrawer && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors touch-target"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Toggle button - only show on non-mobile */}
      {!isMobileDrawer && (
        <div className="px-2 py-3 border-b border-gray-800/50 hidden md:block">
          <button
            onClick={handleToggle}
            className={clsx(
              'flex items-center gap-2 w-full px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all duration-200',
              isCollapsed && 'justify-center'
            )}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm">Collapse</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className={clsx(
        'flex-1 overflow-y-auto',
        isCollapsed && !isMobileDrawer ? 'p-2' : 'p-4'
      )}>
        {/* Main Navigation */}
        <div className="space-y-1">
          {mainNavItems.map((item) => (
            <Tooltip
              key={item.path}
              text={item.label}
              visible={isCollapsed && !isMobileDrawer && hoveredItem === item.path}
            >
              <NavLink
                to={item.path}
                onClick={handleNavLinkClick}
                onMouseEnter={() => handleMouseEnter(item.path)}
                onMouseLeave={handleMouseLeave}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center rounded-lg transition-all duration-200',
                    isMobileDrawer ? 'min-h-[44px]' : '',
                    isCollapsed && !isMobileDrawer
                      ? 'justify-center p-3'
                      : 'gap-3 px-4 py-3',
                    isActive
                      ? 'bg-primary-600/20 text-primary-400 border-l-2 border-primary-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  )
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {(!isCollapsed || isMobileDrawer) && (
                  <span className="font-medium whitespace-nowrap overflow-hidden">{item.label}</span>
                )}
              </NavLink>
            </Tooltip>
          ))}
        </div>

        {/* Settings Section */}
        <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-1">
          {(!isCollapsed || isMobileDrawer) && (
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Settings
            </div>
          )}
          {settingsNavItems.map((item) => (
            <Tooltip
              key={item.path}
              text={item.label}
              visible={isCollapsed && !isMobileDrawer && hoveredItem === item.path}
            >
              <NavLink
                to={item.path}
                onClick={handleNavLinkClick}
                onMouseEnter={() => handleMouseEnter(item.path)}
                onMouseLeave={handleMouseLeave}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center rounded-lg transition-all duration-200',
                    isMobileDrawer ? 'min-h-[44px]' : '',
                    isCollapsed && !isMobileDrawer
                      ? 'justify-center p-3'
                      : 'gap-3 px-4 py-3',
                    isActive
                      ? 'bg-primary-600/20 text-primary-400 border-l-2 border-primary-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  )
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {(!isCollapsed || isMobileDrawer) && (
                  <span className="font-medium whitespace-nowrap overflow-hidden">{item.label}</span>
                )}
              </NavLink>
            </Tooltip>
          ))}
        </div>

        {/* Admin Section (only visible to superadmins) */}
        {(user?.role === 'admin' || user?.isSuperuser) && (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-1">
            {(!isCollapsed || isMobileDrawer) && (
              <div className="px-4 py-2 text-xs font-semibold text-red-500/70 uppercase tracking-wider">
                Admin
              </div>
            )}
            {adminNavItems.map((item) => (
              <Tooltip
                key={item.path}
                text={item.label}
                visible={isCollapsed && !isMobileDrawer && hoveredItem === item.path}
              >
                <NavLink
                  to={item.path}
                  onClick={handleNavLinkClick}
                  onMouseEnter={() => handleMouseEnter(item.path)}
                  onMouseLeave={handleMouseLeave}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-lg transition-all duration-200',
                      isMobileDrawer ? 'min-h-[44px]' : '',
                      isCollapsed && !isMobileDrawer
                        ? 'justify-center p-3'
                        : 'gap-3 px-4 py-3',
                      isActive
                        ? 'bg-red-600/20 text-red-400 border-l-2 border-red-500'
                        : 'text-gray-400 hover:text-red-400 hover:bg-red-500/10'
                    )
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {(!isCollapsed || isMobileDrawer) && (
                    <span className="font-medium whitespace-nowrap overflow-hidden">{item.label}</span>
                  )}
                </NavLink>
              </Tooltip>
            ))}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className={clsx(
        'border-t border-gray-800 transition-all duration-300',
        isCollapsed && !isMobileDrawer ? 'p-2' : 'p-4'
      )}>
        <div className={clsx(
          'flex items-center mb-4',
          isCollapsed && !isMobileDrawer ? 'justify-center' : 'gap-3'
        )}>
          <div className={clsx(
            'rounded-full bg-gradient-to-br from-primary-500 to-swarm-accent flex items-center justify-center flex-shrink-0 transition-all duration-300',
            isCollapsed && !isMobileDrawer ? 'w-12 h-12' : 'w-10 h-10'
          )}>
            <span className={clsx(
              'text-white font-medium',
              isCollapsed && !isMobileDrawer && 'text-lg'
            )}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          {(!isCollapsed || isMobileDrawer) && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">
                {user?.name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email || ''}
              </p>
            </div>
          )}
        </div>
        <Tooltip text="Sign out" visible={isCollapsed && !isMobileDrawer && hoveredItem === 'logout'}>
          <button
            onClick={handleLogout}
            onMouseEnter={() => handleMouseEnter('logout')}
            onMouseLeave={handleMouseLeave}
            className={clsx(
              'flex items-center w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors',
              // Touch-friendly sizing on mobile
              isMobileDrawer ? 'min-h-[44px]' : '',
              isCollapsed && !isMobileDrawer
                ? 'justify-center p-3'
                : 'gap-2 px-4 py-2'
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {(!isCollapsed || isMobileDrawer) && (
              <span className="text-sm whitespace-nowrap">Sign out</span>
            )}
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
