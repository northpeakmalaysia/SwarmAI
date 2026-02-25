/**
 * Contact Picker Field Component
 *
 * Multi-select field for selecting contacts in FlowBuilder.
 * Loads contacts from the selected agent's contact list based on platform.
 *
 * Features:
 * - Loads contacts from API based on selected agent
 * - Filters by platform (WhatsApp, Telegram, Email)
 * - Real-time search filtering
 * - Multi-select with chips display
 * - Shows contact identifiers (phone, email, username)
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Info, AlertCircle, ChevronDown, Check, Search, X, User, Users, Phone, Mail, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BaseFieldProps } from './types'

interface ContactIdentifier {
  type: string
  value: string
  platform: string
  isPrimary: boolean
}

interface Contact {
  id: string
  displayName: string
  avatarUrl?: string
  company?: string
  tags?: string[]
  lastMessageAt?: string
  identifiers: ContactIdentifier[]
}

interface ContactPickerFieldProps extends BaseFieldProps<string[]> {
  /** Agent ID to load contacts from */
  agentId?: string
  /** Platform to filter contacts by */
  platform?: string
  /** Whether to allow multiple selections */
  multiple?: boolean
  /** Maximum number of selections */
  maxSelections?: number
  /** Callback when contacts change */
  onContactsChange?: (contacts: Contact[]) => void
}

export const ContactPickerField: React.FC<ContactPickerFieldProps> = ({
  name,
  label,
  value = [],
  onChange,
  placeholder = 'Select contacts...',
  helpText,
  error,
  disabled,
  required,
  className,
  agentId,
  platform,
  multiple = true,
  maxSelections,
  onContactsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch contacts when agent or platform changes
  useEffect(() => {
    const fetchContacts = async () => {
      if (!agentId) {
        setContacts([])
        return
      }

      setLoading(true)
      setFetchError(null)

      try {
        const params = new URLSearchParams()
        if (platform) params.append('platform', platform)
        if (search) params.append('search', search)
        params.append('limit', '100')

        const response = await fetch(`/api/agents/${agentId}/contacts?${params}`, {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('Failed to load contacts')
        }

        const data = await response.json()
        setContacts(data.contacts || [])
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to load contacts')
      } finally {
        setLoading(false)
      }
    }

    // Debounce search
    const timer = setTimeout(fetchContacts, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [agentId, platform, search])

  // Find selected contacts
  const selectedContacts = useMemo(() => {
    return contacts.filter((c) => value.includes(c.id))
  }, [contacts, value])

  // Filter contacts based on search (already filtered by API, but client-side fallback)
  const filteredContacts = useMemo(() => {
    if (!search) return contacts
    const searchLower = search.toLowerCase()
    return contacts.filter(
      (contact) =>
        contact.displayName.toLowerCase().includes(searchLower) ||
        contact.identifiers.some((id) => id.value.toLowerCase().includes(searchLower))
    )
  }, [contacts, search])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = useCallback((contact: Contact) => {
    let newValue: string[]

    if (multiple) {
      const isSelected = value.includes(contact.id)
      if (isSelected) {
        newValue = value.filter((id) => id !== contact.id)
      } else {
        // Check max selections
        if (maxSelections && value.length >= maxSelections) {
          return
        }
        newValue = [...value, contact.id]
      }
    } else {
      newValue = [contact.id]
      setIsOpen(false)
    }

    onChange(newValue)
    const newContacts = contacts.filter((c) => newValue.includes(c.id))
    onContactsChange?.(newContacts)
  }, [value, multiple, maxSelections, onChange, contacts, onContactsChange])

  const handleRemove = useCallback((contactId: string) => {
    const newValue = value.filter((id) => id !== contactId)
    onChange(newValue)
    const newContacts = contacts.filter((c) => newValue.includes(c.id))
    onContactsChange?.(newContacts)
  }, [value, onChange, contacts, onContactsChange])

  const handleClearAll = useCallback(() => {
    onChange([])
    onContactsChange?.([])
    setIsOpen(false)
  }, [onChange, onContactsChange])

  // Get identifier icon
  const getIdentifierIcon = (type: string) => {
    switch (type) {
      case 'phone':
      case 'whatsapp':
        return Phone
      case 'email':
        return Mail
      case 'telegram':
        return MessageCircle
      default:
        return User
    }
  }

  // Get primary identifier for display
  const getPrimaryIdentifier = (contact: Contact): ContactIdentifier | undefined => {
    // Prefer primary, then filter by platform, then first available
    if (platform) {
      return contact.identifiers.find((id) => id.platform === platform || id.type === platform)
    }
    return contact.identifiers.find((id) => id.isPrimary) || contact.identifiers[0]
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
        {maxSelections && (
          <span className="text-slate-500 ml-2">
            ({value.length}/{maxSelections})
          </span>
        )}
      </label>

      <div ref={dropdownRef} className="relative">
        {/* Selected chips */}
        {selectedContacts.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {selectedContacts.map((contact) => {
              const identifier = getPrimaryIdentifier(contact)
              return (
                <span
                  key={contact.id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full"
                >
                  {contact.avatarUrl ? (
                    <img src={contact.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                  ) : (
                    <User className="w-3 h-3" />
                  )}
                  <span className="truncate max-w-[120px]">{contact.displayName}</span>
                  {identifier && (
                    <span className="text-indigo-400 text-[10px]">
                      {identifier.value.slice(-4)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(contact.id)}
                    className="hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Dropdown trigger */}
        <button
          type="button"
          id={name}
          onClick={() => !disabled && agentId && setIsOpen(!isOpen)}
          disabled={disabled || loading || !agentId}
          className={cn(
            'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-left',
            'flex items-center justify-between gap-2',
            'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors',
            (disabled || loading || !agentId) && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500',
            'text-slate-500'
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
            ) : (
              <Users className="w-4 h-4 text-slate-400" />
            )}
            <span>
              {!agentId
                ? 'Select an agent first'
                : selectedContacts.length > 0
                  ? `${selectedContacts.length} contact${selectedContacts.length > 1 ? 's' : ''} selected`
                  : placeholder}
            </span>
          </div>
          <ChevronDown
            className={cn('w-4 h-4 text-slate-400 transition-transform flex-shrink-0', isOpen && 'rotate-180')}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {/* Clear all option */}
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-700 transition-colors border-b border-slate-700"
                >
                  Clear all selections
                </button>
              )}

              {/* Error state */}
              {fetchError && (
                <div className="px-3 py-4 text-center">
                  <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-400">{fetchError}</p>
                </div>
              )}

              {/* Contact list */}
              {filteredContacts.map((contact) => {
                const isSelected = value.includes(contact.id)
                const identifier = getPrimaryIdentifier(contact)
                const IdentifierIcon = identifier ? getIdentifierIcon(identifier.type) : User
                const atMaxSelections = !!(maxSelections && value.length >= maxSelections && !isSelected)

                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelect(contact)}
                    disabled={atMaxSelections}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm flex items-center gap-2',
                      'hover:bg-slate-700 transition-colors',
                      isSelected && 'bg-indigo-500/20',
                      atMaxSelections && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {/* Avatar */}
                    {contact.avatarUrl ? (
                      <img src={contact.avatarUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                    )}

                    {/* Contact info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-100 truncate">{contact.displayName}</span>
                        {contact.company && (
                          <span className="text-xs text-slate-500 truncate">@ {contact.company}</span>
                        )}
                      </div>
                      {identifier && (
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <IdentifierIcon className="w-3 h-3" />
                          <span className="truncate">{identifier.value}</span>
                        </div>
                      )}
                    </div>

                    {/* Selection indicator */}
                    {multiple && (
                      <div
                        className={cn(
                          'w-4 h-4 rounded border flex-shrink-0',
                          isSelected
                            ? 'bg-indigo-500 border-indigo-500'
                            : 'border-slate-500'
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white m-auto" />}
                      </div>
                    )}
                    {!multiple && isSelected && (
                      <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    )}
                  </button>
                )
              })}

              {/* Empty state */}
              {!loading && !fetchError && filteredContacts.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-slate-500">
                  {search ? 'No contacts found' : 'No contacts available'}
                </div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="px-3 py-4 text-center">
                  <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(helpText || error) && (
        <div className="text-xs">
          {error ? (
            <p className="flex items-start text-red-400">
              <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {error}
            </p>
          ) : (
            <p className="flex items-start text-slate-500">
              <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {helpText}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
