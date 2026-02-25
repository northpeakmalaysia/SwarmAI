import { create } from 'zustand'
import api from '../services/api'

export interface PlatformAccount {
  id: string
  platform: 'whatsapp' | 'telegram' | 'telegram-user' | 'email' | string
  status: string
  agentId: string
  agentName?: string
  displayLabel: string  // e.g., "+62 812 3456 7890" or "@mybot"
  metadata?: Record<string, any> | null
  lastConnectedAt?: string
  lastError?: string
  errorCount?: number
}

export interface PlatformGroup {
  platform: 'whatsapp' | 'telegram'
  accounts: PlatformAccount[]
}

interface PlatformAccountState {
  accounts: PlatformAccount[]
  isLoading: boolean
  error: string | null
  fetchAccounts: () => Promise<void>
  getGroupedAccounts: () => PlatformGroup[]
  getAccountsByPlatform: (platform: string) => PlatformAccount[]
  getConnectedPlatformTypes: () => string[]
}

function extractDisplayLabel(account: any): string {
  const meta = account.metadata
  if (!meta) return account.agentName || account.id

  switch (account.platform) {
    case 'whatsapp':
      return meta.phoneNumber || meta.wid || account.agentName || 'WhatsApp'
    case 'telegram':
    case 'telegram-bot':
      return meta.botUsername ? `@${meta.botUsername}` : (account.agentName || 'Telegram Bot')
    case 'telegram-user':
      return meta.username ? `@${meta.username}` : (account.agentName || 'Telegram User')
    case 'email':
      return meta.email || meta.address || account.agentName || 'Email'
    default:
      return account.agentName || account.platform
  }
}

function normalizePlatformType(platform: string): string {
  // Normalize telegram variants to 'telegram' for grouping
  if (platform === 'telegram-bot' || platform === 'telegram-user') return 'telegram'
  return platform
}

export const usePlatformAccountStore = create<PlatformAccountState>((set, get) => ({
  accounts: [],
  isLoading: false,
  error: null,

  fetchAccounts: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/platforms')
      const raw = response.data?.accounts || response.data?.data || response.data || []
      const accounts: PlatformAccount[] = (Array.isArray(raw) ? raw : []).map((acc: any) => ({
        id: acc.id,
        platform: acc.platform,
        status: acc.status,
        agentId: acc.agentId || acc.agent_id,
        agentName: acc.agentName || acc.agent_name,
        displayLabel: extractDisplayLabel(acc),
        metadata: acc.metadata,
        lastConnectedAt: acc.lastConnectedAt,
        lastError: acc.lastError,
        errorCount: acc.errorCount,
      }))
      set({ accounts, isLoading: false })
    } catch (error: any) {
      set({ error: error?.message || 'Failed to fetch platform accounts', isLoading: false })
    }
  },

  getGroupedAccounts: () => {
    const { accounts } = get()
    const groups: Record<string, PlatformAccount[]> = {}

    for (const acc of accounts) {
      // Only group WhatsApp and Telegram (Email handled separately)
      const normalized = normalizePlatformType(acc.platform)
      if (normalized !== 'whatsapp' && normalized !== 'telegram') continue

      if (!groups[normalized]) groups[normalized] = []
      groups[normalized].push(acc)
    }

    const result: PlatformGroup[] = []
    if (groups.whatsapp?.length) {
      result.push({ platform: 'whatsapp', accounts: groups.whatsapp })
    }
    if (groups.telegram?.length) {
      result.push({ platform: 'telegram', accounts: groups.telegram })
    }
    return result
  },

  getAccountsByPlatform: (platform: string) => {
    return get().accounts.filter(a => normalizePlatformType(a.platform) === platform)
  },

  getConnectedPlatformTypes: () => {
    const { accounts } = get()
    const types = new Set<string>()
    for (const acc of accounts) {
      types.add(normalizePlatformType(acc.platform))
    }
    return Array.from(types)
  },
}))
