import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Bot,
  Search,
  Filter,
  Grid3X3,
  List,
  RefreshCw,
  X,
} from 'lucide-react';
import { useAgenticStore, AgenticProfile } from '../stores/agenticStore';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Badge } from '../components/common/Badge';
import { ConfirmDialog } from '../components/common';
import {
  ProfileCard,
  ProfileFormModal,
  ProfileDetailPanel,
} from '../components/agentic';
import toast from 'react-hot-toast';

/**
 * Filter options
 */
type StatusFilter = 'all' | 'active' | 'paused';
type ViewMode = 'grid' | 'list';

/**
 * AgenticProfilesPage - Main page for managing agentic profiles
 *
 * Features:
 * - List all agentic profiles with cards
 * - Search and filter functionality
 * - Create new profiles
 * - Create sub-agents
 * - View profile details in sidebar panel
 * - Edit profiles
 */
export default function AgenticProfilesPage() {
  const {
    profiles,
    selectedProfile,
    isLoadingProfiles,
    profilesError,
    fetchProfiles,
    updateProfile,
    deleteProfile,
    selectProfile,
    clearProfilesError,
  } = useAgenticStore();

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AgenticProfile | null>(null);
  const [parentIdForSubAgent, setParentIdForSubAgent] = useState<string | null>(null);

  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch profiles on mount
  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Clear errors on mount
  useEffect(() => {
    return () => clearProfilesError();
  }, [clearProfilesError]);

  /**
   * Filter profiles based on search and status
   */
  const filteredProfiles = useMemo(() => {
    if (!Array.isArray(profiles)) {
      console.warn('AgenticProfilesPage: profiles is not an array', profiles);
      return [];
    }

    return profiles.filter((profile) => {
      // Exclude deleted/terminated profiles from display
      if (profile.status === 'deleted' || profile.status === 'terminated') return false;

      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        profile.name.toLowerCase().includes(searchLower) ||
        profile.description?.toLowerCase().includes(searchLower);

      // Status filter
      const matchesStatus =
        statusFilter === 'all' || profile.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [profiles, searchQuery, statusFilter]);

  /**
   * Organize profiles by hierarchy (root profiles first)
   */
  const organizedProfiles = useMemo(() => {
    const rootProfiles = filteredProfiles.filter((p) => !p.parentProfileId);
    const childProfiles = filteredProfiles.filter((p) => p.parentProfileId);

    // Interleave children under their parents
    const organized: AgenticProfile[] = [];
    rootProfiles.forEach((root) => {
      organized.push(root);
      const children = childProfiles.filter((c) => c.parentProfileId === root.id);
      organized.push(...children);
    });

    // Add any orphaned children at the end
    const organizedIds = new Set(organized.map((p) => p.id));
    childProfiles.forEach((child) => {
      if (!organizedIds.has(child.id)) {
        organized.push(child);
      }
    });

    return organized;
  }, [filteredProfiles]);

  /**
   * Handle view details
   */
  const handleViewDetails = useCallback(
    (profile: AgenticProfile) => {
      selectProfile(profile);
    },
    [selectProfile]
  );

  /**
   * Handle edit profile
   */
  const handleEditProfile = useCallback((profile: AgenticProfile) => {
    setEditingProfile(profile);
    setShowCreateModal(true);
  }, []);

  /**
   * Handle create sub-agent
   */
  const handleToggleStatus = useCallback(async (profile: AgenticProfile) => {
    const newStatus = profile.status === 'active' ? 'inactive' : 'active';
    try {
      await updateProfile(profile.id, { status: newStatus });
      toast.success(`Agent ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    } catch {
      toast.error('Failed to update agent status');
    }
  }, [updateProfile]);

  const handleCreateSubAgent = useCallback((parentId: string) => {
    setParentIdForSubAgent(parentId);
    setEditingProfile(null);
    setShowCreateModal(true);
  }, []);

  /**
   * Handle close create/edit modal
   */
  const handleCloseModal = useCallback(() => {
    setShowCreateModal(false);
    setEditingProfile(null);
    setParentIdForSubAgent(null);
  }, []);

  /**
   * Handle delete profile click
   */
  const handleDeleteClick = useCallback((id: string) => {
    setDeleteDialog({ open: true, id });
  }, []);

  /**
   * Handle delete profile confirm
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog.id) return;
    setIsDeleting(true);
    try {
      await deleteProfile(deleteDialog.id);
      toast.success('Profile deleted');
      setDeleteDialog({ open: false, id: null });
      // Clear selection if deleted profile was selected
      if (selectedProfile?.id === deleteDialog.id) {
        selectProfile(null);
      }
    } catch {
      toast.error('Failed to delete profile');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteDialog.id, deleteProfile, selectedProfile, selectProfile]);

  /**
   * Get stats
   */
  const stats = useMemo(() => {
    const profileList = Array.isArray(profiles) ? profiles.filter((p) => p.status !== 'deleted' && p.status !== 'terminated') : [];
    return {
      total: profileList.length,
      active: profileList.filter((p) => p.status === 'active').length,
      paused: profileList.filter((p) => p.status === 'paused').length,
      rootProfiles: profileList.filter((p) => !p.parentProfileId).length,
    };
  }, [profiles]);

  return (
    <div className="page-container relative flex h-full">
      {/* Main content area */}
      <div className="flex-1">
        {/* Header */}
        <div className="page-header-actions">
          <div>
            <h1 className="page-title">Agentic Profiles</h1>
            <p className="text-gray-400 text-sm mt-1">
              Manage autonomous AI agent profiles with hierarchy and collaboration
            </p>
          </div>

          <Button
            onClick={() => {
              setEditingProfile(null);
              setParentIdForSubAgent(null);
              setShowCreateModal(true);
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Create Profile
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed hover:shadow-neu-pressed-glow transition-all duration-300">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-sm text-gray-400 mt-1">Total Profiles</div>
          </div>
          <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-emerald">
            <div className="text-2xl font-bold text-emerald-400">{stats.active}</div>
            <div className="text-sm text-gray-400 mt-1">Active</div>
          </div>
          <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-amber">
            <div className="text-2xl font-bold text-amber-400">{stats.paused}</div>
            <div className="text-sm text-gray-400 mt-1">Paused</div>
          </div>
          <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-purple">
            <div className="text-2xl font-bold text-purple-400">{stats.rootProfiles}</div>
            <div className="text-sm text-gray-400 mt-1">Root Profiles</div>
          </div>
        </div>

        {/* Error message */}
        {profilesError && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <X className="w-5 h-5 text-red-500" />
              <span className="text-red-400">{profilesError}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearProfilesError}
              className="text-red-400 hover:text-red-300"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <div className="flex-1">
            <Input
              placeholder="Search profiles by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              iconLeft={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex gap-2">
            {/* Filter toggle */}
            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              onClick={() => setShowFilters(!showFilters)}
              icon={<Filter className="w-4 h-4" />}
            >
              Filters
            </Button>

            {/* View mode toggle */}
            <div className="flex bg-swarm-dark rounded-lg p-1 border border-swarm-border/30 shadow-neu-pressed-sm">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-swarm-border text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Grid view"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-swarm-border text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh */}
            <Button
              variant="ghost"
              onClick={() => fetchProfiles()}
              loading={isLoadingProfiles}
              icon={<RefreshCw className="w-4 h-4" />}
              title="Refresh"
            />
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 p-4 mt-4 bg-swarm-dark border border-swarm-border/30 rounded-xl shadow-neu-pressed-sm">
            <span className="text-sm text-gray-400 mr-2">Status:</span>
            {(['all', 'active', 'paused'] as StatusFilter[]).map((status) => (
              <Badge
                key={status}
                variant={statusFilter === status ? 'info' : 'default'}
                className="cursor-pointer"
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
            ))}
          </div>
        )}

        {/* Profiles Grid/List */}
        {isLoadingProfiles && profiles.length === 0 ? (
          <div className="flex items-center justify-center py-16 mt-6">
            <div className="flex items-center gap-3 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Loading profiles...</span>
            </div>
          </div>
        ) : organizedProfiles.length > 0 ? (
          <div
            className={`mt-6 ${
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'flex flex-col gap-4'
            }`}
          >
            {organizedProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isSelected={selectedProfile?.id === profile.id}
                onClick={() => handleViewDetails(profile)}
                onViewDetails={() => handleViewDetails(profile)}
                onEdit={() => handleEditProfile(profile)}
                onToggleStatus={() => handleToggleStatus(profile)}
                onDelete={() => handleDeleteClick(profile.id)}
                onCreateSubAgent={() => handleCreateSubAgent(profile.id)}
              />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 shadow-neu-pressed mt-6 py-16 px-4">
            <div className="flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-swarm-darker flex items-center justify-center mb-6 shadow-neu-pressed-sm">
                <Bot className="w-10 h-10 text-gray-600" />
              </div>

              {searchQuery || statusFilter !== 'all' ? (
                <>
                  <h3 className="text-lg font-semibold text-white mb-2">No profiles found</h3>
                  <p className="text-gray-400 text-center mb-6 max-w-md">
                    No profiles match your current search or filter criteria.
                    Try adjusting your search or clearing filters.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('all');
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-white mb-2">No profiles yet</h3>
                  <p className="text-gray-400 text-center mb-6 max-w-md">
                    Create your first agentic profile to start building autonomous
                    AI agents with collaboration capabilities.
                  </p>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    icon={<Plus className="w-4 h-4" />}
                  >
                    Create Your First Profile
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel (full width overlay) */}
      {selectedProfile && (
        <div className="absolute inset-0 z-10 bg-swarm-darker overflow-y-auto">
          <ProfileDetailPanel
            profile={selectedProfile}
            onEdit={() => handleEditProfile(selectedProfile)}
            onClose={() => selectProfile(null)}
          />
        </div>
      )}

      {/* Create/Edit Profile Modal */}
      <ProfileFormModal
        open={showCreateModal}
        onClose={handleCloseModal}
        profile={editingProfile}
        parentId={parentIdForSubAgent}
        onSuccess={() => {
          fetchProfiles();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, id: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Profile"
        message="Are you sure you want to delete this profile? This will also affect any sub-agents. This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
