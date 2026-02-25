import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Users,
  UserCheck,
  UserX,
  RefreshCw,
  CheckCircle2,
  Clock,
  Save,
  Globe,
  Tag,
  Lock,
  UsersRound,
  X,
  MessageSquare,
  Info,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { SearchableSelect, SelectOption } from '../common/SearchableSelect';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { useAuthStore } from '../../stores/authStore';
import { formatDate } from '../../utils/dateFormat';

// Scope types matching the actual backend values
type ScopeType = 'unrestricted' | 'all_user_contacts' | 'contacts_whitelist' | 'contacts_tags' | 'team_only';

export interface PlatformAccount {
  id: string;
  name: string;
  platform: string;
  status?: string;
}

export interface ContactScopePanelProps {
  agenticId: string;
  className?: string;
  platformAccounts?: PlatformAccount[];
}

interface ScopeConfig {
  scopeType: ScopeType;
  platformAccountId: string | null;
  contacts: string[];
  whitelistTags: string[];
  whitelistGroupIds: string[];
  allowTeamMembers: boolean;
  allowMasterContact: boolean;
  notifyOnOutOfScope: boolean;
  autoAddApproved: boolean;
}

interface ScopeLogEntry {
  id: string;
  actionType: string;
  recipientName: string;
  recipientValue: string;
  status: 'allowed' | 'blocked' | 'pending_approval';
  reasonBlocked?: string;
  createdAt: string;
}

const scopeTypeConfig: Record<ScopeType, { icon: React.ReactNode; label: string; description: string; color: string; bgColor: string }> = {
  unrestricted: {
    icon: <Globe className="w-5 h-5" />,
    label: 'Unrestricted',
    description: 'Responds to everyone',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  all_user_contacts: {
    icon: <Users className="w-5 h-5" />,
    label: 'All Contacts',
    description: 'Any saved contact',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
  contacts_whitelist: {
    icon: <UserCheck className="w-5 h-5" />,
    label: 'Whitelist Only',
    description: 'Specific contacts only',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
  },
  contacts_tags: {
    icon: <Tag className="w-5 h-5" />,
    label: 'By Tags',
    description: 'Contacts with specific tags',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
  team_only: {
    icon: <Lock className="w-5 h-5" />,
    label: 'Team Only',
    description: 'Team members + master only',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
};

const DEFAULT_CONFIG: ScopeConfig = {
  scopeType: 'team_only',
  platformAccountId: null,
  contacts: [],
  whitelistTags: [],
  whitelistGroupIds: [],
  allowTeamMembers: true,
  allowMasterContact: true,
  notifyOnOutOfScope: true,
  autoAddApproved: false,
};

/**
 * ContactScopePanel - Manage contact access restrictions per platform
 */
export const ContactScopePanel: React.FC<ContactScopePanelProps> = ({
  agenticId,
  className,
  platformAccounts = [],
}) => {
  const { token } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Platform tab: null = global, string = specific platform account
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  // Track which platforms have overrides
  const [platformOverrides, setPlatformOverrides] = useState<Set<string>>(new Set());

  // Scope configuration
  const [scopeConfig, setScopeConfig] = useState<ScopeConfig>({ ...DEFAULT_CONFIG });
  const [originalConfig, setOriginalConfig] = useState<ScopeConfig | null>(null);

  // Scope log
  const [scopeLog, setScopeLog] = useState<ScopeLogEntry[]>([]);
  const [logStats, setLogStats] = useState({ allowed: 0, blocked: 0, pendingApproval: 0 });

  // Contact/group selection
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Contact names cache
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  // Group names cache
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});

  // Fetch contacts for searchable select
  const fetchContacts = useCallback(async (query: string): Promise<SelectOption[]> => {
    try {
      const response = await fetch(
        `/api/contacts?search=${encodeURIComponent(query)}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.contacts || []).map((c: any) => ({
        id: c.id,
        label: c.displayName || c.display_name || 'Unknown',
        sublabel: c.email || c.phone || '',
        avatar: c.avatarUrl || c.avatar,
      }));
    } catch {
      return [];
    }
  }, [token]);

  // Fetch group conversations for searchable select
  const fetchGroups = useCallback(async (query: string): Promise<SelectOption[]> => {
    try {
      const response = await fetch(
        `/api/conversations?isGroup=true&search=${encodeURIComponent(query)}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return [];
      const data = await response.json();
      const convs = data.conversations || data || [];
      return (Array.isArray(convs) ? convs : []).map((c: any) => ({
        id: c.id,
        label: c.title || c.name || 'Unnamed Group',
        sublabel: c.platform || '',
      }));
    } catch {
      return [];
    }
  }, [token]);

  // Fetch all scope rows to detect per-platform overrides
  const fetchAllScopes = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/contact-scope/all`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return;
      const data = await response.json();
      const overrides = new Set<string>();
      for (const s of (data.scopes || [])) {
        if (s.platformAccountId) overrides.add(s.platformAccountId);
      }
      setPlatformOverrides(overrides);
    } catch {
      // Silently fail
    }
  }, [agenticId, token]);

  // Fetch scope configuration for selected platform
  const fetchScopeConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = selectedPlatform
        ? `/api/agentic/profiles/${agenticId}/contact-scope?platformAccountId=${encodeURIComponent(selectedPlatform)}`
        : `/api/agentic/profiles/${agenticId}/contact-scope`;

      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!response.ok) {
        if (response.status === 404) {
          const def = { ...DEFAULT_CONFIG, platformAccountId: selectedPlatform };
          setScopeConfig(def);
          setOriginalConfig(def);
          return;
        }
        throw new Error('Failed to fetch scope configuration');
      }

      const data = await response.json();
      const scope = data.contactScope;
      const config: ScopeConfig = {
        scopeType: scope?.scopeType || 'team_only',
        platformAccountId: scope?.platformAccountId || null,
        contacts: scope?.whitelistContactIds || [],
        whitelistTags: scope?.whitelistTags || [],
        whitelistGroupIds: scope?.whitelistGroupIds || [],
        allowTeamMembers: scope?.allowTeamMembers !== false,
        allowMasterContact: scope?.allowMasterContact !== false,
        notifyOnOutOfScope: scope?.notifyOnOutOfScope !== false,
        autoAddApproved: !!scope?.autoAddApproved,
      };
      setScopeConfig(config);
      setOriginalConfig(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scope');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, token, selectedPlatform]);

  // Fetch scope log
  const fetchScopeLog = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/scope-log?limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return;
      const data = await response.json();
      setScopeLog(data.logs || []);
      setLogStats(data.stats || { allowed: 0, blocked: 0, pendingApproval: 0 });
    } catch {
      // Silently fail
    }
  }, [agenticId, token]);

  useEffect(() => {
    fetchScopeConfig();
    fetchAllScopes();
    fetchScopeLog();
  }, [fetchScopeConfig, fetchAllScopes, fetchScopeLog]);

  // Re-fetch when platform tab changes
  useEffect(() => {
    fetchScopeConfig();
  }, [selectedPlatform, fetchScopeConfig]);

  // Check if config has changed
  const hasChanges = originalConfig && (
    scopeConfig.scopeType !== originalConfig.scopeType ||
    scopeConfig.notifyOnOutOfScope !== originalConfig.notifyOnOutOfScope ||
    scopeConfig.allowTeamMembers !== originalConfig.allowTeamMembers ||
    scopeConfig.allowMasterContact !== originalConfig.allowMasterContact ||
    scopeConfig.autoAddApproved !== originalConfig.autoAddApproved ||
    JSON.stringify([...scopeConfig.contacts].sort()) !== JSON.stringify([...originalConfig.contacts].sort()) ||
    JSON.stringify([...scopeConfig.whitelistTags].sort()) !== JSON.stringify([...originalConfig.whitelistTags].sort()) ||
    JSON.stringify([...scopeConfig.whitelistGroupIds].sort()) !== JSON.stringify([...originalConfig.whitelistGroupIds].sort())
  );

  // Save scope configuration
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch(`/api/agentic/profiles/${agenticId}/contact-scope`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contactScope: {
            scopeType: scopeConfig.scopeType,
            platformAccountId: selectedPlatform || undefined,
            whitelistContactIds: scopeConfig.contacts,
            whitelistTags: scopeConfig.whitelistTags,
            whitelistGroupIds: scopeConfig.whitelistGroupIds,
            allowTeamMembers: scopeConfig.allowTeamMembers,
            allowMasterContact: scopeConfig.allowMasterContact,
            notifyOnOutOfScope: scopeConfig.notifyOnOutOfScope,
            autoAddApproved: scopeConfig.autoAddApproved,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to save scope configuration');

      setOriginalConfig({ ...scopeConfig });
      // If saving a per-platform scope, track the override
      if (selectedPlatform) {
        setPlatformOverrides(prev => new Set([...prev, selectedPlatform]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete per-platform override
  const handleDeleteOverride = async () => {
    if (!selectedPlatform) return;
    try {
      setIsSaving(true);
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/contact-scope?platformAccountId=${encodeURIComponent(selectedPlatform)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to delete override');

      setPlatformOverrides(prev => {
        const next = new Set(prev);
        next.delete(selectedPlatform);
        return next;
      });
      // Re-fetch to show global fallback
      fetchScopeConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete override');
    } finally {
      setIsSaving(false);
    }
  };

  // Add contact to list
  const handleAddContact = () => {
    if (!selectedContactId || scopeConfig.contacts.includes(selectedContactId)) return;
    setScopeConfig({ ...scopeConfig, contacts: [...scopeConfig.contacts, selectedContactId] });
    setSelectedContactId(null);
    setShowAddContact(false);
  };

  // Remove contact from list
  const handleRemoveContact = (contactId: string) => {
    setScopeConfig({ ...scopeConfig, contacts: scopeConfig.contacts.filter(id => id !== contactId) });
  };

  // Add group
  const handleAddGroup = () => {
    if (!selectedGroupId || scopeConfig.whitelistGroupIds.includes(selectedGroupId)) return;
    setScopeConfig({ ...scopeConfig, whitelistGroupIds: [...scopeConfig.whitelistGroupIds, selectedGroupId] });
    setSelectedGroupId(null);
    setShowAddGroup(false);
  };

  // Remove group
  const handleRemoveGroup = (groupId: string) => {
    setScopeConfig({ ...scopeConfig, whitelistGroupIds: scopeConfig.whitelistGroupIds.filter(id => id !== groupId) });
  };

  // Fetch contact names
  useEffect(() => {
    const fetchNames = async () => {
      const missingIds = scopeConfig.contacts.filter(id => !contactNames[id]);
      if (missingIds.length === 0) return;
      for (const id of missingIds) {
        try {
          const response = await fetch(`/api/contacts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) {
            const data = await response.json();
            setContactNames(prev => ({ ...prev, [id]: data.displayName || data.display_name || 'Unknown' }));
          }
        } catch { /* ignore */ }
      }
    };
    fetchNames();
  }, [scopeConfig.contacts, token, contactNames]);

  // Fetch group names
  useEffect(() => {
    const fetchNames = async () => {
      const missingIds = scopeConfig.whitelistGroupIds.filter(id => !groupNames[id]);
      if (missingIds.length === 0) return;
      for (const id of missingIds) {
        try {
          const response = await fetch(`/api/conversations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) {
            const data = await response.json();
            const conv = data.conversation || data;
            setGroupNames(prev => ({ ...prev, [id]: conv.title || conv.name || 'Unnamed Group' }));
          }
        } catch { /* ignore */ }
      }
    };
    fetchNames();
  }, [scopeConfig.whitelistGroupIds, token, groupNames]);

  const showContactList = scopeConfig.scopeType === 'contacts_whitelist';
  const showTagList = scopeConfig.scopeType === 'contacts_tags';

  // Platform icon helper
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'whatsapp': return '💬';
      case 'telegram': return '✈';
      case 'email': return '📧';
      default: return '🔗';
    }
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-sky-400" />
          <h3 className="font-medium text-white">Contact Scope</h3>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => originalConfig && setScopeConfig(originalConfig)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={isSaving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Platform Account Tabs */}
      {platformAccounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedPlatform(null)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
              !selectedPlatform
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                : 'bg-swarm-darker/50 text-gray-400 border border-swarm-border/20 hover:border-swarm-border/40'
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            Global
          </button>
          {platformAccounts.map(pa => (
            <button
              key={pa.id}
              onClick={() => setSelectedPlatform(pa.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                selectedPlatform === pa.id
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'bg-swarm-darker/50 text-gray-400 border border-swarm-border/20 hover:border-swarm-border/40'
              )}
            >
              <span>{getPlatformIcon(pa.platform)}</span>
              {pa.name}
              {platformOverrides.has(pa.id) && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="Has custom scope" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Per-platform override indicator */}
      {selectedPlatform && platformOverrides.has(selectedPlatform) && (
        <div className="flex items-center justify-between p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-sky-300">
            <Info className="w-4 h-4" />
            This platform has a custom scope override.
          </div>
          <Button variant="ghost" size="sm" onClick={handleDeleteOverride} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4 mr-1" />
            Remove Override
          </Button>
        </div>
      )}

      {/* Scope Type Selection */}
      <div className="grid grid-cols-5 gap-2">
        {(Object.keys(scopeTypeConfig) as ScopeType[]).map((type) => {
          const config = scopeTypeConfig[type];
          const isSelected = scopeConfig.scopeType === type;

          return (
            <button
              key={type}
              onClick={() => setScopeConfig({ ...scopeConfig, scopeType: type })}
              className={cn(
                'p-3 rounded-xl border transition-all text-left',
                isSelected
                  ? `${config.bgColor} border-current/30`
                  : 'bg-swarm-darker/50 border-swarm-border/20 hover:border-swarm-border/40'
              )}
            >
              <div className={cn('mb-1.5', isSelected ? config.color : 'text-gray-400')}>
                {config.icon}
              </div>
              <div className={cn('text-sm font-medium', isSelected ? 'text-white' : 'text-gray-300')}>
                {config.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {config.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Boolean toggles */}
      <div className="space-y-3">
        {[
          { key: 'allowTeamMembers' as const, label: 'Allow Team Members', desc: 'Team members always have access' },
          { key: 'allowMasterContact' as const, label: 'Allow Master Contact', desc: 'Master contact always has access' },
          { key: 'notifyOnOutOfScope' as const, label: 'Notify on Out-of-Scope', desc: 'Send approval request when someone outside scope messages' },
          { key: 'autoAddApproved' as const, label: 'Auto-add Approved', desc: 'Automatically whitelist contacts after approval' },
        ].map(({ key, label, desc }) => (
          <ToggleSwitch
            key={key}
            checked={scopeConfig[key]}
            onChange={(val) => setScopeConfig({ ...scopeConfig, [key]: val })}
            label={label}
            description={desc}
            size="sm"
            className="p-3 bg-swarm-darker/50 rounded-lg border border-swarm-border/20"
          />
        ))}
      </div>

      {/* Whitelist Contacts (for contacts_whitelist type) */}
      {showContactList && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-300">Whitelisted Contacts</h4>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddContact(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Add Contact
            </Button>
          </div>

          {scopeConfig.contacts.length === 0 ? (
            <div className="text-center py-6 bg-swarm-darker/30 rounded-xl border border-dashed border-swarm-border/30">
              <Users className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No contacts whitelisted</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scopeConfig.contacts.map(contactId => (
                <div
                  key={contactId}
                  className="flex items-center justify-between p-3 bg-swarm-darker/50 rounded-lg border border-swarm-border/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                      <span className="text-xs text-white">
                        {(contactNames[contactId] || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="text-white text-sm">{contactNames[contactId] || contactId}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveContact(contactId)} className="text-gray-400 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tag display (for contacts_tags type) */}
      {showTagList && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300">Allowed Tags</h4>
          {scopeConfig.whitelistTags.length === 0 ? (
            <div className="text-center py-6 bg-swarm-darker/30 rounded-xl border border-dashed border-swarm-border/30">
              <Tag className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No tags configured</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {scopeConfig.whitelistTags.map(tag => (
                <Badge key={tag} variant="info" className="flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => setScopeConfig({
                      ...scopeConfig,
                      whitelistTags: scopeConfig.whitelistTags.filter(t => t !== tag),
                    })}
                    className="ml-1 text-gray-400 hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Whitelisted Groups */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-300">Whitelisted Groups</h4>
            <p className="text-xs text-gray-500 mt-0.5">Agent responds when mentioned by name in these groups</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddGroup(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Group
          </Button>
        </div>

        {scopeConfig.whitelistGroupIds.length === 0 ? (
          <div className="text-center py-6 bg-swarm-darker/30 rounded-xl border border-dashed border-swarm-border/30">
            <UsersRound className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No groups whitelisted</p>
            <p className="text-xs text-gray-600 mt-1">Add groups to enable agent responses when mentioned</p>
          </div>
        ) : (
          <div className="space-y-2">
            {scopeConfig.whitelistGroupIds.map(groupId => (
              <div
                key={groupId}
                className="flex items-center justify-between p-3 bg-swarm-darker/50 rounded-lg border border-swarm-border/20"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                  </div>
                  <span className="text-white text-sm">{groupNames[groupId] || groupId}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemoveGroup(groupId)} className="text-gray-400 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Access Log Stats */}
      <div className="pt-4 border-t border-swarm-border/20">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Access Log</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-emerald-400">{logStats.allowed}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs text-gray-400">Allowed</span>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-red-400">{logStats.blocked}</span>
              <UserX className="w-4 h-4 text-red-400" />
            </div>
            <span className="text-xs text-gray-400">Blocked</span>
          </div>
          <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-yellow-400">{logStats.pendingApproval}</span>
              <Clock className="w-4 h-4 text-yellow-400" />
            </div>
            <span className="text-xs text-gray-400">Pending</span>
          </div>
        </div>

        {/* Recent Log Entries */}
        {scopeLog.length > 0 && (
          <div className="mt-4 space-y-2">
            <h5 className="text-xs font-medium text-gray-400 uppercase">Recent Activity</h5>
            {scopeLog.slice(0, 5).map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-2 bg-swarm-darker/30 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2">
                  {entry.status === 'allowed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {entry.status === 'blocked' && <UserX className="w-4 h-4 text-red-400" />}
                  {entry.status === 'pending_approval' && <Clock className="w-4 h-4 text-yellow-400" />}
                  <span className="text-gray-300">{entry.recipientName || entry.recipientValue}</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      <Modal
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        title="Add to Whitelist"
        size="sm"
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Select Contact</label>
            <SearchableSelect
              value={selectedContactId}
              onChange={(value) => setSelectedContactId(value)}
              fetchOptions={fetchContacts}
              placeholder="Search contacts..."
              showAvatars
              debounceMs={300}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowAddContact(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddContact} disabled={!selectedContactId}>Add Contact</Button>
          </div>
        </div>
      </Modal>

      {/* Add Group Modal */}
      <Modal
        open={showAddGroup}
        onClose={() => setShowAddGroup(false)}
        title="Add Group to Whitelist"
        size="sm"
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Select Group</label>
            <SearchableSelect
              value={selectedGroupId}
              onChange={(value) => setSelectedGroupId(value)}
              fetchOptions={fetchGroups}
              placeholder="Search groups..."
              debounceMs={300}
            />
          </div>
          <p className="text-xs text-gray-500">
            Agent will only respond when mentioned by name in whitelisted groups.
          </p>
          <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowAddGroup(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddGroup} disabled={!selectedGroupId}>Add Group</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

ContactScopePanel.displayName = 'ContactScopePanel';

export default ContactScopePanel;
