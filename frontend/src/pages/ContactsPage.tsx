import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  RefreshCw,
  Users,
  Star,
  Ban,
  Phone,
  Mail,
  MessageCircle,
  Building2,
  MoreVertical,
  Trash2,
  Edit,
  Merge,
  X,
  Tag,
  ChevronRight,
  Send,
  User,
  Briefcase,
} from 'lucide-react'
import { formatRelativeTime, formatDateTime } from '@/utils/dateFormat'
import {
  useContactStore,
  Contact,
  ContactCreateInput,
  ContactUpdateInput,
  PlatformType,
  TeamMembership,
} from '../stores/contactStore'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { Badge } from '../components/common/Badge'
import { Modal } from '../components/common/Modal'
import { ConfirmDialog } from '../components/common'
import toast from 'react-hot-toast'

// ==========================================
// Types
// ==========================================

type ViewMode = 'grid' | 'list'
type FilterType = 'all' | 'favorites' | 'blocked' | 'with-phone' | 'with-email'

// ==========================================
// Helper functions
// ==========================================

const getPlatformIcon = (platform: PlatformType) => {
  switch (platform) {
    case 'whatsapp':
    case 'whatsapp-business':
      return <MessageCircle className="w-4 h-4 text-green-400" />
    case 'telegram-bot':
    case 'telegram-user':
      return <Send className="w-4 h-4 text-blue-400" />
    case 'email':
      return <Mail className="w-4 h-4 text-amber-400" />
    case 'http-api':
      return <ChevronRight className="w-4 h-4 text-purple-400" />
    default:
      return null
  }
}

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const formatContactDate = (dateString: string | null): string => {
  if (!dateString) return 'Never'
  return formatRelativeTime(dateString)
}

// ==========================================
// ContactCard Component
// ==========================================

interface ContactCardProps {
  contact: Contact
  isSelected: boolean
  onSelect: (contact: Contact) => void
  onFavorite: (id: string, isFavorite: boolean) => void
  onBlock: (id: string, isBlocked: boolean) => void
  onDelete: (id: string) => void
  viewMode: ViewMode
}

const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  isSelected,
  onSelect,
  onFavorite,
  onBlock,
  onDelete,
  viewMode,
}) => {
  const [showMenu, setShowMenu] = useState(false)

  if (viewMode === 'list') {
    return (
      <div
        onClick={() => onSelect(contact)}
        className={`flex items-center gap-4 p-4 bg-swarm-dark rounded-xl border cursor-pointer transition-all ${
          isSelected
            ? 'border-sky-500/50 shadow-lg shadow-sky-500/10'
            : 'border-swarm-border/30 hover:border-swarm-border/50'
        }`}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center text-white font-semibold">
          {contact.avatarUrl ? (
            <img src={contact.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
          ) : (
            getInitials(contact.displayName)
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white truncate">{contact.displayName}</span>
            {contact.isFavorite && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
            {contact.isBlocked && <Ban className="w-4 h-4 text-red-400" />}
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            {contact.primaryPhone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {contact.primaryPhone}
              </span>
            )}
            {contact.primaryEmail && (
              <span className="flex items-center gap-1 truncate">
                <Mail className="w-3 h-3" />
                {contact.primaryEmail}
              </span>
            )}
          </div>
        </div>

        {/* Last contact */}
        <div className="text-sm text-gray-500 hidden md:block">
          {formatContactDate(contact.lastContactAt)}
        </div>

        {/* Actions */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-2 text-gray-400 hover:text-white hover:bg-swarm-border/30 rounded-lg transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onFavorite(contact.id, contact.isFavorite)
                  setShowMenu(false)
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 first:rounded-t-lg"
              >
                <Star className="w-4 h-4" />
                {contact.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onBlock(contact.id, contact.isBlocked)
                  setShowMenu(false)
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-slate-700"
              >
                <Ban className="w-4 h-4" />
                {contact.isBlocked ? 'Unblock' : 'Block'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(contact.id)
                  setShowMenu(false)
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 last:rounded-b-lg"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Grid view
  return (
    <div
      onClick={() => onSelect(contact)}
      className={`p-4 bg-swarm-dark rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'border-sky-500/50 shadow-lg shadow-sky-500/10'
          : 'border-swarm-border/30 hover:border-swarm-border/50'
      }`}
    >
      {/* Header with actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center text-white font-semibold">
          {contact.avatarUrl ? (
            <img src={contact.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
          ) : (
            getInitials(contact.displayName)
          )}
        </div>
        <div className="flex items-center gap-1">
          {contact.isFavorite && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
          {contact.isBlocked && <Ban className="w-4 h-4 text-red-400" />}
        </div>
      </div>

      {/* Name and company */}
      <h3 className="font-medium text-white truncate">{contact.displayName}</h3>
      {contact.company && (
        <p className="text-sm text-gray-400 truncate flex items-center gap-1">
          <Building2 className="w-3 h-3" />
          {contact.company}
        </p>
      )}

      {/* Contact info */}
      <div className="mt-3 space-y-1">
        {contact.primaryPhone && (
          <div className="text-sm text-gray-400 truncate flex items-center gap-2">
            <Phone className="w-3 h-3 flex-shrink-0" />
            {contact.primaryPhone}
          </div>
        )}
        {contact.primaryEmail && (
          <div className="text-sm text-gray-400 truncate flex items-center gap-2">
            <Mail className="w-3 h-3 flex-shrink-0" />
            {contact.primaryEmail}
          </div>
        )}
      </div>

      {/* Last contact */}
      <div className="mt-3 pt-3 border-t border-swarm-border/30">
        <p className="text-xs text-gray-500">Last contact: {formatContactDate(contact.lastContactAt)}</p>
      </div>
    </div>
  )
}

// ==========================================
// CreateContactModal Component
// ==========================================

interface CreateContactModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: ContactCreateInput) => Promise<void>
}

const CreateContactModal: React.FC<CreateContactModalProps> = ({ open, onClose, onCreate }) => {
  const [formData, setFormData] = useState<ContactCreateInput>({
    displayName: '',
    primaryPhone: '',
    primaryEmail: '',
    company: '',
    notes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!formData.displayName.trim()) {
      toast.error('Display name is required')
      return
    }

    setIsSubmitting(true)
    try {
      await onCreate(formData)
      setFormData({ displayName: '', primaryPhone: '', primaryEmail: '', company: '', notes: '', gender: null })
      onClose()
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Contact"
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isSubmitting}>
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Display Name"
          placeholder="John Doe"
          value={formData.displayName}
          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
          required
        />
        <Input
          label="Phone Number"
          placeholder="+1234567890"
          value={formData.primaryPhone || ''}
          onChange={(e) => setFormData({ ...formData, primaryPhone: e.target.value })}
        />
        <Input
          label="Email"
          type="email"
          placeholder="john@example.com"
          value={formData.primaryEmail || ''}
          onChange={(e) => setFormData({ ...formData, primaryEmail: e.target.value })}
        />
        <Input
          label="Company"
          placeholder="Acme Inc."
          value={formData.company || ''}
          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
        />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Gender</label>
          <select
            title="Gender"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            value={formData.gender || ''}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value || null })}
          >
            <option value="">Auto-detect from name</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Additional notes..."
            rows={3}
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  )
}

// ==========================================
// ContactDetailPanel Component
// ==========================================

interface ContactDetailPanelProps {
  contact: Contact
  onClose: () => void
  onEdit: () => void
}

const ContactDetailPanel: React.FC<ContactDetailPanelProps> = ({ contact, onClose, onEdit }) => {
  const {
    selectedContactIdentifiers,
    selectedContactTags,
    selectedContactConversations,
    addTag,
    removeTag,
    blockContact,
    unblockContact,
    favoriteContact,
    unfavoriteContact,
  } = useContactStore()

  const [newTag, setNewTag] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    try {
      await addTag(contact.id, newTag.trim())
      setNewTag('')
      setShowAddTag(false)
      toast.success('Tag added')
    } catch {
      toast.error('Failed to add tag')
    }
  }

  const handleRemoveTag = async (tagName: string) => {
    try {
      await removeTag(contact.id, tagName)
      toast.success('Tag removed')
    } catch {
      toast.error('Failed to remove tag')
    }
  }

  const handleToggleFavorite = async () => {
    try {
      if (contact.isFavorite) {
        await unfavoriteContact(contact.id)
        toast.success('Removed from favorites')
      } else {
        await favoriteContact(contact.id)
        toast.success('Added to favorites')
      }
    } catch {
      toast.error('Action failed')
    }
  }

  const handleToggleBlock = async () => {
    try {
      if (contact.isBlocked) {
        await unblockContact(contact.id)
        toast.success('Contact unblocked')
      } else {
        await blockContact(contact.id)
        toast.success('Contact blocked')
      }
    } catch {
      toast.error('Action failed')
    }
  }

  return (
    <div className="w-96 bg-swarm-dark border-l border-swarm-border/30 h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-swarm-border/30 flex items-center justify-between">
        <h3 className="font-semibold text-white">Contact Details</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white hover:bg-swarm-border/30 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Profile */}
      <div className="p-4">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center text-white text-2xl font-semibold">
            {contact.avatarUrl ? (
              <img src={contact.avatarUrl} alt="" className="w-20 h-20 rounded-full" />
            ) : (
              getInitials(contact.displayName)
            )}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">{contact.displayName}</h2>
          {contact.company && (
            <p className="text-gray-400 flex items-center gap-1">
              <Building2 className="w-4 h-4" />
              {contact.company}
            </p>
          )}
          {contact.gender && (
            <Badge variant="default" className="mt-2 flex items-center gap-1">
              <User className="w-3 h-3" />
              {contact.gender.charAt(0).toUpperCase() + contact.gender.slice(1)}
            </Badge>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onEdit} icon={<Edit className="w-4 h-4" />}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleFavorite}
            icon={
              <Star
                className={`w-4 h-4 ${contact.isFavorite ? 'text-amber-400 fill-amber-400' : ''}`}
              />
            }
          >
            {contact.isFavorite ? 'Unfavorite' : 'Favorite'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleBlock}
            icon={<Ban className={`w-4 h-4 ${contact.isBlocked ? 'text-red-400' : ''}`} />}
          >
            {contact.isBlocked ? 'Unblock' : 'Block'}
          </Button>
        </div>
      </div>

      {/* Contact Info */}
      <div className="p-4 border-t border-swarm-border/30">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Contact Information</h4>
        <div className="space-y-3">
          {contact.primaryPhone && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Phone className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Phone</p>
                <p className="text-white">{contact.primaryPhone}</p>
              </div>
            </div>
          )}
          {contact.primaryEmail && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Mail className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Email</p>
                <p className="text-white truncate">{contact.primaryEmail}</p>
              </div>
            </div>
          )}
          {contact.primaryTelegramUsername && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Send className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Telegram</p>
                <p className="text-white">@{contact.primaryTelegramUsername}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Platform Identifiers */}
      {selectedContactIdentifiers.length > 0 && (
        <div className="p-4 border-t border-swarm-border/30">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Platform Identifiers</h4>
          <div className="space-y-2">
            {selectedContactIdentifiers.map((identifier) => (
              <div
                key={identifier.id}
                className="flex items-center gap-2 p-2 bg-swarm-darker rounded-lg"
              >
                {getPlatformIcon(identifier.platform)}
                <span className="text-sm text-white flex-1 truncate">
                  {identifier.identifierValue}
                </span>
                {identifier.isPrimary && (
                  <Badge variant="success" size="sm">
                    Primary
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="p-4 border-t border-swarm-border/30">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-400">Tags</h4>
          <button
            onClick={() => setShowAddTag(!showAddTag)}
            className="text-sky-400 hover:text-sky-300 text-sm"
          >
            + Add Tag
          </button>
        </div>

        {showAddTag && (
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Tag name"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAddTag}>
              Add
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {selectedContactTags.map((tag) => (
            <Badge
              key={tag.name}
              variant="default"
              className="flex items-center gap-1 cursor-pointer group"
            >
              <Tag className="w-3 h-3" />
              {tag.name}
              <button
                onClick={() => handleRemoveTag(tag.name)}
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {selectedContactTags.length === 0 && (
            <p className="text-sm text-gray-500">No tags</p>
          )}
        </div>
      </div>

      {/* Team Memberships */}
      {contact.teamMemberships && contact.teamMemberships.length > 0 && (
        <div className="p-4 border-t border-swarm-border/30">
          <h4 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Team Memberships ({contact.teamMemberships.length})
          </h4>
          <div className="space-y-3">
            {contact.teamMemberships.map((membership: TeamMembership, index: number) => (
              <div key={`${membership.agenticId}-${index}`} className="p-3 bg-swarm-darker rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-medium text-white">{membership.agenticName}</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  {membership.role && (
                    <p>Role: <span className="text-gray-300">{membership.role}</span></p>
                  )}
                  {membership.department && (
                    <p>Department: <span className="text-gray-300">{membership.department}</span></p>
                  )}
                </div>
                {membership.skills && membership.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {membership.skills.map((skill: string) => (
                      <Badge key={skill} variant="default" size="sm">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversations */}
      <div className="p-4 border-t border-swarm-border/30">
        <h4 className="text-sm font-medium text-gray-400 mb-3">
          Conversations ({selectedContactConversations.length})
        </h4>
        {selectedContactConversations.length > 0 ? (
          <div className="space-y-2">
            {selectedContactConversations.slice(0, 5).map((conv: any) => (
              <div key={conv.id} className="p-2 bg-swarm-darker rounded-lg">
                <div className="flex items-center gap-2">
                  {getPlatformIcon(conv.platform)}
                  <span className="text-sm text-white truncate">{conv.title || conv.id}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formatContactDate(conv.lastMessageAt || conv.updatedAt)}
                </p>
              </div>
            ))}
            {selectedContactConversations.length > 5 && (
              <p className="text-sm text-gray-500 text-center">
                +{selectedContactConversations.length - 5} more
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No conversations yet</p>
        )}
      </div>

      {/* Notes */}
      {contact.notes && (
        <div className="p-4 border-t border-swarm-border/30">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Notes</h4>
          <p className="text-sm text-white whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="p-4 border-t border-swarm-border/30 text-xs text-gray-500">
        <p>Created: {formatDateTime(contact.createdAt)}</p>
        <p>Updated: {formatDateTime(contact.updatedAt)}</p>
      </div>
    </div>
  )
}

// ==========================================
// Main ContactsPage Component
// ==========================================

export default function ContactsPage() {
  const {
    contacts,
    selectedContact,
    stats,
    isLoading,
    fetchContacts,
    fetchStats,
    createContact,
    deleteContact,
    selectContact,
    clearSelection,
    favoriteContact,
    unfavoriteContact,
    blockContact,
    unblockContact,
    findDuplicates,
    duplicates,
  } = useContactStore()

  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    fetchContacts()
    fetchStats()
  }, [fetchContacts, fetchStats])

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        contact.displayName.toLowerCase().includes(searchLower) ||
        contact.primaryPhone?.toLowerCase().includes(searchLower) ||
        contact.primaryEmail?.toLowerCase().includes(searchLower) ||
        contact.company?.toLowerCase().includes(searchLower)

      // Type filter
      let matchesFilter = true
      switch (filterType) {
        case 'favorites':
          matchesFilter = contact.isFavorite
          break
        case 'blocked':
          matchesFilter = contact.isBlocked
          break
        case 'with-phone':
          matchesFilter = !!contact.primaryPhone
          break
        case 'with-email':
          matchesFilter = !!contact.primaryEmail
          break
      }

      return matchesSearch && matchesFilter
    })
  }, [contacts, searchQuery, filterType])

  // Handlers
  const handleCreateContact = useCallback(
    async (input: ContactCreateInput) => {
      try {
        await createContact(input)
        toast.success('Contact created')
      } catch {
        toast.error('Failed to create contact')
        throw new Error('Failed to create contact')
      }
    },
    [createContact]
  )

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteDialog({ open: true, id })
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog.id) return
    setIsDeleting(true)
    try {
      await deleteContact(deleteDialog.id)
      toast.success('Contact deleted')
      setDeleteDialog({ open: false, id: null })
    } catch {
      toast.error('Failed to delete contact')
    } finally {
      setIsDeleting(false)
    }
  }, [deleteDialog.id, deleteContact])

  const handleFavorite = useCallback(
    async (id: string, isFavorite: boolean) => {
      try {
        if (isFavorite) {
          await unfavoriteContact(id)
          toast.success('Removed from favorites')
        } else {
          await favoriteContact(id)
          toast.success('Added to favorites')
        }
      } catch {
        toast.error('Action failed')
      }
    },
    [favoriteContact, unfavoriteContact]
  )

  const handleBlock = useCallback(
    async (id: string, isBlocked: boolean) => {
      try {
        if (isBlocked) {
          await unblockContact(id)
          toast.success('Contact unblocked')
        } else {
          await blockContact(id)
          toast.success('Contact blocked')
        }
      } catch {
        toast.error('Action failed')
      }
    },
    [blockContact, unblockContact]
  )

  const handleSelectContact = useCallback(
    (contact: Contact) => {
      selectContact(contact)
    },
    [selectContact]
  )

  const handleFindDuplicates = useCallback(async () => {
    await findDuplicates()
    if (duplicates.length > 0) {
      toast.success(`Found ${duplicates.length} potential duplicate groups`)
    } else {
      toast.success('No duplicates found')
    }
  }, [findDuplicates, duplicates.length])

  return (
    <div className="page-container flex h-[calc(100vh-4rem)]">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${selectedContact ? 'pr-0' : ''}`}>
        {/* Header */}
        <div className="page-header-actions">
          <div>
            <h1 className="page-title">Contacts</h1>
            <p className="text-gray-400 text-sm mt-1">
              Manage your contacts across all platforms
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={handleFindDuplicates}
              icon={<Merge className="w-4 h-4" />}
            >
              Find Duplicates
            </Button>
            <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
              Add Contact
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6">
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
              <div className="text-2xl font-bold text-white">{stats.total}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Users className="w-4 h-4" /> Total
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-amber">
              <div className="text-2xl font-bold text-amber-400">{stats.favorites}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Star className="w-4 h-4" /> Favorites
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
              <div className="text-2xl font-bold text-red-400">{stats.blocked}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Ban className="w-4 h-4" /> Blocked
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-emerald">
              <div className="text-2xl font-bold text-green-400">{stats.withPhone}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Phone className="w-4 h-4" /> With Phone
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
              <div className="text-2xl font-bold text-amber-400">{stats.withEmail}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Mail className="w-4 h-4" /> With Email
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
              <div className="text-2xl font-bold text-blue-400">{stats.withTelegram}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Send className="w-4 h-4" /> Telegram
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <div className="flex-1">
            <Input
              placeholder="Search contacts by name, phone, email, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              iconLeft={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              onClick={() => setShowFilters(!showFilters)}
              icon={<Filter className="w-4 h-4" />}
            >
              Filters
            </Button>

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

            <Button
              variant="ghost"
              onClick={() => fetchContacts()}
              loading={isLoading}
              icon={<RefreshCw className="w-4 h-4" />}
              title="Refresh"
            />
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 p-4 mt-4 bg-swarm-dark border border-swarm-border/30 rounded-xl shadow-neu-pressed-sm">
            <span className="text-sm text-gray-400 mr-2">Show:</span>
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'favorites', label: 'Favorites' },
                { key: 'blocked', label: 'Blocked' },
                { key: 'with-phone', label: 'With Phone' },
                { key: 'with-email', label: 'With Email' },
              ] as { key: FilterType; label: string }[]
            ).map((filter) => (
              <Badge
                key={filter.key}
                variant={filterType === filter.key ? 'info' : 'default'}
                className="cursor-pointer"
                onClick={() => setFilterType(filter.key)}
              >
                {filter.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto mt-6">
          {isLoading && contacts.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-3 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading contacts...</span>
              </div>
            </div>
          ) : filteredContacts.length > 0 ? (
            <div
              className={`${
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                  : 'flex flex-col gap-3'
              }`}
            >
              {filteredContacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  isSelected={selectedContact?.id === contact.id}
                  onSelect={handleSelectContact}
                  onFavorite={handleFavorite}
                  onBlock={handleBlock}
                  onDelete={handleDeleteClick}
                  viewMode={viewMode}
                />
              ))}
            </div>
          ) : (
            <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 shadow-neu-pressed py-16 px-4">
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-swarm-darker flex items-center justify-center mb-6 shadow-neu-pressed-sm">
                  <Users className="w-10 h-10 text-gray-600" />
                </div>

                {searchQuery || filterType !== 'all' ? (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">No contacts found</h3>
                    <p className="text-gray-400 text-center mb-6 max-w-md">
                      No contacts match your current search or filter criteria.
                    </p>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSearchQuery('')
                        setFilterType('all')
                      }}
                    >
                      Clear Filters
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">No contacts yet</h3>
                    <p className="text-gray-400 text-center mb-6 max-w-md">
                      Contacts are automatically created when messages are received, or you can
                      add them manually.
                    </p>
                    <Button
                      onClick={() => setShowCreateModal(true)}
                      icon={<Plus className="w-4 h-4" />}
                    >
                      Add Your First Contact
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contact Detail Panel */}
      {selectedContact && (
        <ContactDetailPanel
          contact={selectedContact}
          onClose={clearSelection}
          onEdit={() => toast('Edit modal coming soon')}
        />
      )}

      {/* Create Contact Modal */}
      <CreateContactModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateContact}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, id: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}
