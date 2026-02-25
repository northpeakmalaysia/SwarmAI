import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Share2,
  MessageSquare,
  GitBranch,
  BookOpen,
  Terminal,
  Bell,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSwarmStore } from '../../stores/swarmStore';
import { useState, useRef, useEffect } from 'react';
import { websocket } from '../../services/websocket';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { path: '/swarm', label: 'Swarm', shortLabel: 'Swarm', icon: Share2 },
  { path: '/messages', label: 'Messages', shortLabel: 'Chat', icon: MessageSquare },
  { path: '/flows', label: 'FlowBuilder', shortLabel: 'Flows', icon: GitBranch },
  { path: '/knowledge', label: 'Knowledge', shortLabel: 'Docs', icon: BookOpen },
  { path: '/terminal', label: 'Terminal', shortLabel: 'Term', icon: Terminal },
  { path: '/agentic-profiles', label: 'Agentic', shortLabel: 'Agent', icon: Cpu },
];

export function TopNavigation() {
  const { user, logout } = useAuthStore();
  const { status, fetchStatus } = useSwarmStore();

  // Fetch swarm status on mount, poll every 30s, and listen for realtime updates
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);

    // Subscribe to agent status changes for realtime updates
    const unsubscribe = websocket.subscribe('agent:status_changed', () => {
      fetchStatus();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchStatus]);
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (showMobileMenu) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showMobileMenu]);

  // API returns { agents: { active, total, ... } } not { activeAgents }
  const activeAgentsCount = (status as any)?.agents?.active || status?.activeAgents || 0;
  const isSwarmActive = activeAgentsCount > 0;

  return (
    <>
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 h-14 bg-swarm-card border-b border-swarm-border z-50 flex items-center px-2 md:px-4 safe-top">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setShowMobileMenu(true)}
          className="md:hidden p-2 hover:bg-swarm-dark rounded-lg transition-colors text-gray-400 hover:text-white mr-2"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Logo Section */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 rounded-lg gradient-animate flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <circle cx="5" cy="8" r="2"/>
              <circle cx="19" cy="8" r="2"/>
              <circle cx="5" cy="16" r="2"/>
              <circle cx="19" cy="16" r="2"/>
              <line x1="9" y1="10" x2="7" y2="9"/>
              <line x1="15" y1="10" x2="17" y2="9"/>
              <line x1="9" y1="14" x2="7" y2="15"/>
              <line x1="15" y1="14" x2="17" y2="15"/>
            </svg>
          </div>
          <span className="font-bold text-lg text-white hidden sm:inline">SwarmAI</span>
          <span className="font-bold text-lg text-white sm:hidden">Swarm</span>
          <span className="text-xs px-2 py-0.5 bg-swarm-primary/20 text-swarm-primary rounded-full hidden sm:inline">v2.0</span>
        </div>

        {/* Centered Navigation Tabs - Desktop Only */}
        <div className="flex-1 justify-center hidden md:flex">
          <div className="flex items-center gap-1 bg-swarm-dark rounded-xl p-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-swarm-primary text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_rgba(255,255,255,0.1)]'
                      : 'text-gray-400 hover:text-white hover:bg-swarm-darker/50 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:bg-swarm-darker'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 md:gap-4 ml-auto">
          {/* Swarm Status Indicator - Desktop */}
          <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
            isSwarmActive
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-gray-500/20 text-gray-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              isSwarmActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
            }`}></span>
            {isSwarmActive ? 'Swarm Active' : 'Swarm Offline'}
          </div>

          {/* Swarm Status Indicator - Mobile (just dot) */}
          <div className={`md:hidden w-2.5 h-2.5 rounded-full ${
            isSwarmActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
          }`} title={isSwarmActive ? 'Swarm Active' : 'Swarm Offline'}></div>

          {/* Notifications */}
          <button
            type="button"
            className="p-2 hover:bg-swarm-dark rounded-lg transition-colors text-gray-400 hover:text-white touch-target"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
          </button>

          {/* Settings - Desktop Only */}
          <NavLink
            to="/settings"
            className="hidden md:block p-2 hover:bg-swarm-dark rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <Settings className="w-5 h-5" />
          </NavLink>

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-swarm-primary to-swarm-secondary cursor-pointer hover:ring-2 hover:ring-swarm-primary/50 transition-all touch-target flex items-center justify-center"
              aria-label="User menu"
            />

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-swarm-card border border-swarm-border rounded-lg shadow-xl py-2 z-50">
                <div className="px-4 py-2 border-b border-swarm-border">
                  <p className="text-sm font-medium text-white">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
                <NavLink
                  to="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-swarm-dark transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </NavLink>
                {(user?.role === 'admin' || user?.isSuperuser) && (
                  <NavLink
                    to="/system-settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-amber-300 hover:bg-swarm-dark transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    System Settings
                  </NavLink>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-swarm-dark transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      {showMobileMenu && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden"
          onClick={() => setShowMobileMenu(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        ref={mobileMenuRef}
        className={`fixed left-0 top-0 bottom-0 w-72 bg-swarm-card border-r border-swarm-border z-50 transform transition-transform duration-300 ease-in-out md:hidden ${
          showMobileMenu ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-swarm-border safe-top">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-animate flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <circle cx="5" cy="8" r="2"/>
                <circle cx="19" cy="8" r="2"/>
                <circle cx="5" cy="16" r="2"/>
                <circle cx="19" cy="16" r="2"/>
              </svg>
            </div>
            <span className="font-bold text-white">SwarmAI</span>
          </div>
          <button
            onClick={() => setShowMobileMenu(false)}
            className="p-2 hover:bg-swarm-dark rounded-lg transition-colors text-gray-400 hover:text-white"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="p-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setShowMobileMenu(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors touch-target ${
                    isActive
                      ? 'bg-swarm-primary/20 text-swarm-primary'
                      : 'text-gray-300 hover:bg-swarm-dark hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-2 border-t border-swarm-border safe-bottom">
          <NavLink
            to="/settings"
            onClick={() => setShowMobileMenu(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-swarm-dark hover:text-white transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </NavLink>
          {(user?.role === 'admin' || user?.isSuperuser) && (
            <NavLink
              to="/system-settings"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-amber-300 hover:bg-swarm-dark hover:text-amber-200 transition-colors"
            >
              <Shield className="w-5 h-5" />
              <span>System Settings</span>
            </NavLink>
          )}
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-swarm-dark hover:text-white transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
            <span>Help & Support</span>
          </a>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-swarm-card border-t border-swarm-border z-40 md:hidden safe-bottom">
        <div className="flex justify-around items-center py-2 px-1">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors touch-target ${
                  isActive
                    ? 'text-swarm-primary'
                    : 'text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.shortLabel}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
