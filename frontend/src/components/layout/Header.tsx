import { Search, ChevronDown, User, Settings, LogOut, Menu } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { useIsMobile, useIsTablet } from '../../hooks/useMediaQuery'
import { clsx } from 'clsx'
import NotificationCenter from './NotificationCenter'
import SwarmIcon from '../common/SwarmIcon'
import SwarmHealthIndicator from './SwarmHealthIndicator'

export default function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { toggleMobileMenu } = useUIStore()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  // Close user menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    setIsUserMenuOpen(false)
    logout()
    navigate('/login')
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Global search shortcut placeholder - could implement command palette
    if (e.key === 'Escape') {
      (e.target as HTMLInputElement).blur()
    }
  }

  return (
    <header className={clsx(
      'h-14 sm:h-16 bg-swarm-card border-b border-swarm-border flex items-center justify-between',
      'px-3 sm:px-6'
    )}>
      {/* Left section: Mobile menu toggle + Search */}
      <div className="flex items-center gap-3 flex-1">
        {/* Mobile hamburger menu */}
        {isMobile && (
          <button
            onClick={toggleMobileMenu}
            className="p-2 text-gray-400 hover:text-white hover:bg-swarm-dark rounded-lg transition-colors touch-target"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        )}

        {/* Logo for mobile (since sidebar is hidden) */}
        {isMobile && (
          <div className="flex items-center gap-2">
            <SwarmIcon size={28} />
            <span className="text-lg font-semibold text-white">SwarmAI</span>
          </div>
        )}

        {/* Search - hidden on mobile, condensed on tablet */}
        {!isMobile && (
          <div className={clsx(
            'flex-1',
            isTablet ? 'max-w-xs' : 'max-w-xl'
          )}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder={isTablet ? "Search..." : "Search agents, conversations, flows..."}
                onKeyDown={handleSearchKeyDown}
                className="w-full pl-10 pr-20 py-2 bg-swarm-dark border border-swarm-border rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
              {!isTablet && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-gray-500 text-xs">
                  <kbd className="px-1.5 py-0.5 bg-swarm-dark border border-swarm-border rounded text-gray-400">
                    Ctrl
                  </kbd>
                  <kbd className="px-1.5 py-0.5 bg-swarm-dark border border-swarm-border rounded text-gray-400">
                    K
                  </kbd>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Swarm Health Indicator - clickable with troubleshooting */}
        {!isMobile && <SwarmHealthIndicator />}

        {/* Notification Center */}
        <NotificationCenter />

        <div className="h-8 w-px bg-swarm-border hidden sm:block" />

        {/* User Menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-swarm-dark transition-colors touch-target"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-swarm-accent flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <ChevronDown className={clsx(
              'w-4 h-4 text-gray-400 transition-transform hidden sm:block',
              isUserMenuOpen && 'rotate-180'
            )} />
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className={clsx(
              'absolute right-0 mt-2 w-56 bg-swarm-card border border-swarm-border rounded-lg shadow-xl z-50 overflow-hidden',
              // On mobile, make sure it doesn't go off screen
              isMobile && 'right-0 left-auto'
            )}>
              {/* User Info */}
              <div className="px-4 py-3 border-b border-swarm-border">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email || ''}
                </p>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <Link
                  to="/settings/profile"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:text-white hover:bg-swarm-dark transition-colors min-h-[44px]"
                >
                  <User className="w-4 h-4" />
                  <span className="text-sm">Profile</span>
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:text-white hover:bg-swarm-dark transition-colors min-h-[44px]"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Settings</span>
                </Link>
              </div>

              {/* Logout */}
              <div className="border-t border-swarm-border py-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-2 text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-colors min-h-[44px]"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
