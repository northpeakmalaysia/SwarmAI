import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  User,
  Shield,
  Bell,
  Palette,
  CreditCard,
  BarChart3,
  Database,
  Link2,
  Brain,
  Languages,
  MessageSquare,
  Zap,
  Settings as SettingsIcon,
  Cloud,
  Share2,
  Server,
  Users,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import {
  ProfileSettings,
  SecuritySettings,
  NotificationSettings,
  AppearanceSettings,
  SubscriptionSettings,
  UsageStats,
  DataRetentionSettings,
  IntegrationsSettings,
} from '../components/settings';
import {
  TranslationSettings as SuperBrainTranslation,
  RephraseSettings as SuperBrainRephrase,
  TaskRoutingSettings as SuperBrainRouting,
  AdvancedSettings as SuperBrainAdvanced,
} from '../components/settings/superbrain';
import {
  SystemAISettings,
  SystemPlatformSettings,
  SystemSwarmSettings,
  SystemInfrastructureSettings,
  SystemLogsSettings,
} from '../components/system-settings';
import UserManagementContent from '../components/settings/admin/UserManagementContent';

// Define nav item type
interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  adminOnly?: boolean;
}

interface NavGroup {
  category: string;
  adminOnly?: boolean;
  items: NavItem[];
}

// Navigation items grouped by category
const settingsNavItems: NavGroup[] = [
  {
    category: 'Account',
    items: [
      { id: 'profile', icon: User, label: 'Profile', description: 'Your personal details and preferences' },
      { id: 'security', icon: Shield, label: 'Security', description: 'Password, 2FA, and sessions' },
      { id: 'notifications', icon: Bell, label: 'Notifications', description: 'Email and push notifications' },
      { id: 'appearance', icon: Palette, label: 'Appearance', description: 'Font size and theme settings' },
    ],
  },
  {
    category: 'Billing',
    items: [
      { id: 'subscription', icon: CreditCard, label: 'Subscription', description: 'Plan, billing, and payment' },
      { id: 'usage', icon: BarChart3, label: 'Usage', description: 'Resource consumption metrics' },
    ],
  },
  {
    category: 'System',
    items: [
      { id: 'data-retention', icon: Database, label: 'Data Retention', description: 'Data storage and cleanup' },
      { id: 'integrations', icon: Link2, label: 'Integrations', description: 'API keys and webhooks' },
    ],
  },
  {
    category: 'SuperBrain AI',
    items: [
      { id: 'superbrain-translation', icon: Languages, label: 'Translation', description: 'Language and auto-translate' },
      { id: 'superbrain-rephrase', icon: MessageSquare, label: 'Rephrase', description: 'Message rephrasing styles' },
      { id: 'superbrain-routing', icon: Zap, label: 'Task Routing', description: 'AI provider per task tier' },
      { id: 'superbrain-advanced', icon: SettingsIcon, label: 'Advanced', description: 'Models and failover chains' },
    ],
  },
  {
    category: 'Administration',
    adminOnly: true,
    items: [
      { id: 'admin-ai-providers', icon: Cloud, label: 'AI Providers', description: 'System-wide AI configuration', adminOnly: true },
      { id: 'admin-platforms', icon: Share2, label: 'Platforms', description: 'WhatsApp, Telegram, Email', adminOnly: true },
      { id: 'admin-swarm', icon: Server, label: 'Swarm Config', description: 'Default swarm behavior', adminOnly: true },
      { id: 'admin-infrastructure', icon: Database, label: 'Infrastructure', description: 'Database, Redis, Qdrant health', adminOnly: true },
      { id: 'admin-logs', icon: FileText, label: 'System Logs', description: 'View and export system logs', adminOnly: true },
      { id: 'admin-users', icon: Users, label: 'User Management', description: 'Manage users and roles', adminOnly: true },
    ],
  },
];

// Flat list for lookup
const allNavItems = settingsNavItems.flatMap(group => group.items);

/**
 * SettingsPage Component
 *
 * Unified settings page with left navigation panel for:
 * - Account settings (profile, security, notifications)
 * - Billing settings (subscription, usage)
 * - System settings (data retention, integrations)
 * - SuperBrain AI settings (translation, rephrase, routing, advanced)
 * - Admin settings (AI providers, platforms, swarm, infrastructure, users) - superadmin only
 */
export default function SettingsPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  // Check admin access
  const isAdmin = user?.role === 'admin' || user?.isSuperuser;

  // Update URL when tab changes
  useEffect(() => {
    if (activeTab !== tabFromUrl) {
      setSearchParams({ tab: activeTab });
    }
  }, [activeTab, tabFromUrl, setSearchParams]);

  // Update active tab when URL changes
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      const item = allNavItems.find(item => item.id === tabFromUrl);
      if (item) {
        // Check if admin-only and user has access
        if (item.adminOnly && !isAdmin) {
          setActiveTab('profile');
        } else {
          setActiveTab(tabFromUrl);
        }
      }
    }
  }, [tabFromUrl, isAdmin]);

  const handleNavClick = (id: string) => {
    setActiveTab(id);
  };

  const renderContent = () => {
    // Check admin access for admin tabs
    if (activeTab.startsWith('admin-') && !isAdmin) {
      return (
        <div className="text-center py-12">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Access Denied</h3>
          <p className="text-dark-400">Admin privileges required to access this section.</p>
        </div>
      );
    }

    switch (activeTab) {
      // Account
      case 'profile':
        return <ProfileSettings />;
      case 'security':
        return <SecuritySettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'appearance':
        return <AppearanceSettings />;

      // Billing
      case 'subscription':
        return <SubscriptionSettings />;
      case 'usage':
        return <UsageStats />;

      // System
      case 'data-retention':
        return <DataRetentionSettings />;
      case 'integrations':
        return <IntegrationsSettings />;

      // SuperBrain AI
      case 'superbrain-translation':
        return <SuperBrainTranslation />;
      case 'superbrain-rephrase':
        return <SuperBrainRephrase />;
      case 'superbrain-routing':
        return <SuperBrainRouting />;
      case 'superbrain-advanced':
        return <SuperBrainAdvanced />;

      // Admin
      case 'admin-ai-providers':
        return <SystemAISettings />;
      case 'admin-platforms':
        return <SystemPlatformSettings />;
      case 'admin-swarm':
        return <SystemSwarmSettings />;
      case 'admin-infrastructure':
        return <SystemInfrastructureSettings />;
      case 'admin-logs':
        return <SystemLogsSettings />;
      case 'admin-users':
        return <UserManagementContent />;

      default:
        return <ProfileSettings />;
    }
  };

  const currentItem = allNavItems.find(item => item.id === activeTab);

  // Filter nav items based on admin status
  const visibleNavItems = settingsNavItems.filter(group => !group.adminOnly || isAdmin);

  return (
    <div className="page-container">
      <div className="page-header mb-6">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Manage your account settings, security, and AI preferences
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left Navigation Panel */}
        <div className="w-64 flex-shrink-0">
          <div className="card p-0 overflow-hidden sticky top-6">
            <nav className="divide-y divide-dark-700">
              {visibleNavItems.map((group) => (
                <div key={group.category} className="py-3">
                  <h3 className={`px-4 text-xs font-semibold uppercase tracking-wider mb-2 ${
                    group.adminOnly ? 'text-red-400' : 'text-dark-400'
                  }`}>
                    {group.category}
                    {group.adminOnly && (
                      <ShieldAlert className="w-3 h-3 inline-block ml-1" />
                    )}
                  </h3>
                  <ul className="space-y-1 px-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      const isSuperBrain = item.id.startsWith('superbrain-');
                      const isAdminItem = item.id.startsWith('admin-');

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleNavClick(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
                              isActive
                                ? isAdminItem
                                  ? 'bg-red-500/20 text-red-400 border-l-2 border-red-500 -ml-0.5 pl-[calc(0.75rem+2px)]'
                                  : isSuperBrain
                                    ? 'bg-purple-500/20 text-purple-400 border-l-2 border-purple-500 -ml-0.5 pl-[calc(0.75rem+2px)]'
                                    : 'bg-primary-500/20 text-primary-400 border-l-2 border-primary-500 -ml-0.5 pl-[calc(0.75rem+2px)]'
                                : isAdminItem
                                  ? 'text-dark-300 hover:text-red-400 hover:bg-red-500/10'
                                  : isSuperBrain
                                    ? 'text-dark-300 hover:text-purple-400 hover:bg-purple-500/10'
                                    : 'text-dark-300 hover:text-white hover:bg-dark-700/50'
                            }`}
                          >
                            <Icon className={`w-5 h-5 flex-shrink-0 ${
                              isActive
                                ? isAdminItem
                                  ? 'text-red-400'
                                  : isSuperBrain
                                    ? 'text-purple-400'
                                    : 'text-primary-400'
                                : isAdminItem
                                  ? 'text-red-500/70'
                                  : isSuperBrain
                                    ? 'text-purple-500/70'
                                    : 'text-dark-400'
                            }`} />
                            <span className="font-medium text-sm">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {/* Breadcrumb header */}
          {currentItem && (
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${
                currentItem.id.startsWith('admin-')
                  ? 'bg-red-500/20'
                  : currentItem.id.startsWith('superbrain-')
                    ? 'bg-purple-500/20'
                    : 'bg-primary-500/20'
              }`}>
                <currentItem.icon className={`w-5 h-5 ${
                  currentItem.id.startsWith('admin-')
                    ? 'text-red-400'
                    : currentItem.id.startsWith('superbrain-')
                      ? 'text-purple-400'
                      : 'text-primary-400'
                }`} />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white">
                  {currentItem.id.startsWith('admin-') && (
                    <span className="text-red-400 mr-2">
                      <ShieldAlert className="w-4 h-4 inline-block mr-1" />
                      Admin &rsaquo;
                    </span>
                  )}
                  {currentItem.id.startsWith('superbrain-') && (
                    <span className="text-purple-400 mr-2">
                      <Brain className="w-4 h-4 inline-block mr-1" />
                      SuperBrain &rsaquo;
                    </span>
                  )}
                  {currentItem.label}
                </h2>
                <p className="text-sm text-dark-400">{currentItem.description}</p>
              </div>
            </div>
          )}

          {/* Admin Warning Banner for admin sections */}
          {currentItem?.id.startsWith('admin-') && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-200">
                These settings affect all users. Changes here will apply system-wide.
              </p>
            </div>
          )}

          {/* Settings Content */}
          <div className="card">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
