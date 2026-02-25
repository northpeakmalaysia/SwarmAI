import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

export type AuthMethod = 'password' | 'magiclink' | 'passkey'

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  timezone: string
  dateFormat: string
  timeFormat: '12h' | '24h'
}

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  isSuperuser?: boolean
  lastAuthMethod?: AuthMethod
  onboardingCompleted?: boolean
  createdAt: string
  avatar?: string
  preferences?: UserPreferences
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  loginWithMagicLink: (token: string, name?: string) => Promise<void>
  completeOnboarding: (name: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  refreshUser: () => Promise<void>
  updateUserLocally: (updates: Partial<User>) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/login', { email, password })
          const { user, token } = response.data

          api.defaults.headers.common['Authorization'] = `Bearer ${token}`

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/register', { email, password, name })
          const { user, token } = response.data

          api.defaults.headers.common['Authorization'] = `Bearer ${token}`

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      loginWithMagicLink: async (token: string, name?: string) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/magic-link/verify', { token, name })
          const { user, token: accessToken } = response.data

          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`

          set({
            user,
            token: accessToken,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      completeOnboarding: async (name: string) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/onboarding/complete', { name })
          set({
            user: response.data,
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: () => {
        delete api.defaults.headers.common['Authorization']
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      },

      checkAuth: async () => {
        const { token } = get()
        if (!token) {
          set({ isLoading: false })
          return
        }

        try {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
          const response = await api.get('/auth/me')
          // API returns { user: {...} } so extract the user object
          const userData = response.data.user || response.data
          set({
            user: userData,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      },

      refreshUser: async () => {
        const { token } = get()
        if (!token) return

        try {
          const response = await api.get('/auth/me')
          const userData = response.data?.user || response.data
          set({ user: userData })
        } catch {
          // Silently fail, don't log out user
        }
      },

      updateUserLocally: (updates: Partial<User>) => {
        const { user } = get()
        if (user) {
          set({ user: { ...user, ...updates } })
        }
      },

      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: 'swarm-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
