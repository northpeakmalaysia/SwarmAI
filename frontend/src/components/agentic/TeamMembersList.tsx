import React, { useState, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  CheckCircle,
  XCircle,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import { SearchableSelect, SelectOption } from '../common/SearchableSelect';
import { useAgenticStore, AgenticTeamMember } from '../../stores/agenticStore';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { formatDate } from '@/utils/dateFormat';

export interface TeamMembersListProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Team members to display */
  members: AgenticTeamMember[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Role badge colors
 */
const roleBadgeColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  admin: 'error',
  manager: 'warning',
  operator: 'info',
  viewer: 'default',
};

/**
 * TeamMembersList - Displays and manages team members for an agentic profile
 *
 * @example
 * ```tsx
 * <TeamMembersList
 *   agenticId={profile.id}
 *   members={teamMembers}
 *   isLoading={isLoading}
 * />
 * ```
 */
export const TeamMembersList: React.FC<TeamMembersListProps> = ({
  agenticId,
  members,
  isLoading = false,
  className,
}) => {
  const { addTeamMember, removeTeamMember, fetchTeamMembers } = useAgenticStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Add member form state
  const [newMember, setNewMember] = useState({
    contactId: '',
    contactName: '',
    role: '',
    skills: '',
    department: '',
    gender: '',
    canAssignTasks: false,
  });

  // Format phone number for display (strip LID suffix, add + prefix for real numbers)
  const formatPhone = (phone?: string | null): string => {
    if (!phone) return '';
    // Strip @lid suffix
    const clean = phone.replace(/@lid$/, '');
    // If it looks like a real phone number (starts with digits, reasonable length)
    if (/^\d{8,15}$/.test(clean)) return `+${clean}`;
    return clean;
  };

  // Fetch contacts for searchable dropdown
  const fetchContacts = useCallback(async (query: string): Promise<SelectOption[]> => {
    try {
      const params = new URLSearchParams();
      if (query) params.append('search', query);
      params.append('limit', '50');

      const response = await api.get(`/contacts?${params.toString()}`);
      const contacts = response.data?.contacts || response.data || [];

      return contacts.map((c: {
        id: string;
        display_name?: string;
        displayName?: string;
        avatar?: string;
        avatarUrl?: string;
        primaryPhone?: string;
        primaryEmail?: string;
        primaryTelegramUsername?: string;
        identifiers?: Array<{ identifierType: string; identifierValue: string }>;
      }) => {
        // Build sublabel from available identifiers
        const phone = formatPhone(c.primaryPhone);
        const email = c.primaryEmail || '';
        const telegram = c.primaryTelegramUsername ? `@${c.primaryTelegramUsername}` : '';

        // Show the most useful identifier
        const sublabel = phone || email || telegram || '';

        return {
          id: c.id,
          label: c.display_name || c.displayName || 'Unknown',
          sublabel,
          avatar: c.avatar || c.avatarUrl,
        };
      });
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
      return [];
    }
  }, []);

  // Filter members by search (name, role, skills)
  const filteredMembers = members.filter(
    (member) => {
      const q = searchQuery.toLowerCase();
      return member.contactName.toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q) ||
        (member.skills && (Array.isArray(member.skills) ? member.skills : []).some(
          (s: string) => s.toLowerCase().includes(q)
        ));
    }
  );

  // Handle add member
  const handleAddMember = async () => {
    if (!newMember.contactId) {
      toast.error('Please select a contact');
      return;
    }

    setIsSubmitting(true);
    try {
      await addTeamMember(agenticId, {
        contactId: newMember.contactId,
        contactName: newMember.contactName,
        role: newMember.role || 'member',
        skills: newMember.skills ? newMember.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
        department: newMember.department || undefined,
        gender: newMember.gender || undefined,
        canAssignTasks: newMember.canAssignTasks,
        permissions: {},
      });
      toast.success('Team member added successfully');
      setShowAddModal(false);
      setNewMember({
        contactId: '',
        contactName: '',
        role: '',
        skills: '',
        department: '',
        gender: '',
        canAssignTasks: false,
      });
      fetchTeamMembers(agenticId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add team member';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle remove member
  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId);
    try {
      await removeTeamMember(agenticId, memberId);
      toast.success('Team member removed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove team member';
      toast.error(message);
    } finally {
      setRemovingMemberId(null);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">
          Team Members ({members.length})
        </h4>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAddModal(true)}
          icon={<UserPlus className="w-4 h-4" />}
          className="text-sky-400 hover:bg-sky-500/10"
        >
          Add Member
        </Button>
      </div>

      {/* Search */}
      {members.length > 0 && (
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          iconLeft={<Search className="w-4 h-4" />}
          className="text-sm"
        />
      )}

      {/* Members List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
        </div>
      ) : filteredMembers.length > 0 ? (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filteredMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-swarm-darker rounded-lg border border-swarm-border/20 hover:border-swarm-border/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Avatar placeholder */}
                <div className="w-10 h-10 rounded-full bg-swarm-dark flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-400" />
                </div>

                {/* Member info */}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{member.contactName}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge
                      variant={roleBadgeColors[member.role?.toLowerCase()] || 'info'}
                      size="sm"
                    >
                      {member.role || 'member'}
                    </Badge>
                    {member.gender && (
                      <Badge variant="default" size="sm">
                        {member.gender === 'male' ? 'Male' : member.gender === 'female' ? 'Female' : member.gender}
                      </Badge>
                    )}
                    {member.canAssignTasks && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Shield className="w-3 h-3" />
                        Can assign tasks
                      </span>
                    )}
                  </div>
                  {/* Skills tags */}
                  {member.skills && Array.isArray(member.skills) && member.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(member.skills as string[]).slice(0, 4).map((skill: string, idx: number) => (
                        <span key={idx} className="px-1.5 py-0.5 text-[10px] bg-sky-500/10 text-sky-400 rounded-md border border-sky-500/20">
                          {skill}
                        </span>
                      ))}
                      {(member.skills as string[]).length > 4 && (
                        <span className="px-1.5 py-0.5 text-[10px] text-gray-500">
                          +{(member.skills as string[]).length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  Added {formatDate(member.createdAt)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveMember(member.id)}
                  loading={removingMemberId === member.id}
                  className="text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                  title="Remove member"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No team members yet</p>
          <p className="text-sm mt-1">Add team members to collaborate on tasks</p>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No members found matching "{searchQuery}"</p>
        </div>
      )}

      {/* Add Member Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Team Member"
        size="sm"
        footer={
          <div className="flex gap-3 w-full justify-end">
            <Button
              variant="ghost"
              onClick={() => setShowAddModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddMember}
              loading={isSubmitting}
            >
              Add Member
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Contact Selection */}
          <SearchableSelect
            label="Contact"
            value={newMember.contactId || null}
            onChange={(id, option) => {
              setNewMember((prev) => ({
                ...prev,
                contactId: id || '',
                contactName: option?.label || '',
              }));
            }}
            fetchOptions={fetchContacts}
            placeholder="Search contacts..."
            showAvatars
            required
            disabled={isSubmitting}
            helperText="Select a contact to add as team member"
          />

          {/* Role (open text) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Role / Position
            </label>
            <input
              type="text"
              value={newMember.role}
              onChange={(e) =>
                setNewMember((prev) => ({ ...prev, role: e.target.value }))
              }
              placeholder="e.g. Senior Developer, Marketing Lead, Accountant..."
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50"
            />
            <p className="text-xs text-gray-500 mt-1">Describe this person's role so AI can route tasks intelligently</p>
          </div>

          {/* Skills (open text, comma-separated) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Skills
            </label>
            <input
              type="text"
              value={newMember.skills}
              onChange={(e) =>
                setNewMember((prev) => ({ ...prev, skills: e.target.value }))
              }
              placeholder="e.g. accounting, financial reporting, budgeting..."
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50"
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated skills for AI-powered task assignment</p>
          </div>

          {/* Department (open text) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Department <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={newMember.department}
              onChange={(e) =>
                setNewMember((prev) => ({ ...prev, department: e.target.value }))
              }
              placeholder="e.g. Finance, Engineering, Marketing..."
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Gender <span className="text-gray-600">(optional)</span>
            </label>
            <select
              value={newMember.gender}
              onChange={(e) =>
                setNewMember((prev) => ({ ...prev, gender: e.target.value }))
              }
              disabled={isSubmitting}
              aria-label="Gender"
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50"
            >
              <option value="">Auto-detect</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Leave as auto-detect to infer from contact name</p>
          </div>

          {/* Can Assign Tasks */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setNewMember((prev) => ({ ...prev, canAssignTasks: !prev.canAssignTasks }))
              }
              disabled={isSubmitting}
              className={cn(
                'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                newMember.canAssignTasks
                  ? 'bg-sky-500 border-sky-500'
                  : 'border-swarm-border/50 hover:border-sky-500/50'
              )}
            >
              {newMember.canAssignTasks && <CheckCircle className="w-4 h-4 text-white" />}
            </button>
            <label className="text-sm text-gray-300">Can assign tasks to this agent</label>
          </div>
        </div>
      </Modal>
    </div>
  );
};

TeamMembersList.displayName = 'TeamMembersList';

export default TeamMembersList;
