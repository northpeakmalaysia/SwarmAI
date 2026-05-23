import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { setAuthToken } from '../services/api'

export function useAuth() {
  const token = useAuthStore((state) => state.token)

  useEffect(() => {
    setAuthToken(token)
  }, [token])

  return { isAuthenticated: Boolean(token) }
}
