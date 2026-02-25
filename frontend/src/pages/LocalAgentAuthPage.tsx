import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Monitor, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import api from '../services/api'
import { formatTime } from '@/utils/dateFormat'

interface ChallengeDetails {
  id: string
  status: string
  deviceName: string
  deviceInfo: {
    hostname?: string
    os?: string
    osVersion?: string
  }
  expiresAt: string
  createdAt: string
}

export default function LocalAgentAuthPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [challenge, setChallenge] = useState<ChallengeDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [result, setResult] = useState<'approved' | 'denied' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const fetchChallenge = async () => {
      try {
        const response = await api.get(`/local-agents/auth/challenge/${sessionId}`)
        setChallenge(response.data)
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { status: number } }
          if (axiosErr.response?.status === 404) {
            setError('This authorization request was not found.')
          } else {
            setError('Failed to load authorization request.')
          }
        } else {
          setError('Failed to load authorization request.')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchChallenge()
  }, [sessionId])

  const handleApprove = async () => {
    if (!sessionId) return
    setActionLoading(true)
    try {
      await api.post(`/local-agents/auth/approve/${sessionId}`)
      setResult('approved')
    } catch {
      setError('Failed to approve. The request may have expired.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeny = async () => {
    if (!sessionId) return
    setActionLoading(true)
    try {
      await api.post(`/local-agents/auth/deny/${sessionId}`)
      setResult('denied')
    } catch {
      setError('Failed to deny the request.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center border border-red-500/30">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  if (result === 'approved') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center border border-green-500/30">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Device Authorized</h2>
          <p className="text-gray-400 mb-4">
            <strong className="text-white">{challenge?.deviceName}</strong> has been authorized.
            The CLI will connect automatically.
          </p>
          <p className="text-gray-500 text-sm">You can close this window.</p>
        </div>
      </div>
    )
  }

  if (result === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center border border-gray-600/30">
          <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Request Denied</h2>
          <p className="text-gray-400">The authorization request has been denied.</p>
        </div>
      </div>
    )
  }

  if (challenge?.status !== 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center border border-yellow-500/30">
          <Clock className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            {challenge?.status === 'expired' ? 'Request Expired' : 'Already Resolved'}
          </h2>
          <p className="text-gray-400">
            This authorization request is no longer pending ({challenge?.status}).
          </p>
        </div>
      </div>
    )
  }

  const isExpired = challenge ? new Date(challenge.expiresAt) < new Date() : false

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center border border-yellow-500/30">
          <Clock className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Request Expired</h2>
          <p className="text-gray-400">
            This authorization request has expired. Please run the login command again on your device.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full border border-cyan-500/30">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-8 h-8 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Authorize Local Agent</h2>
          <p className="text-gray-400 mt-1">A device is requesting access to your SwarmAI account</p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Device Name</span>
            <span className="text-white font-medium">{challenge?.deviceName}</span>
          </div>
          {challenge?.deviceInfo?.hostname && (
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Hostname</span>
              <span className="text-gray-300">{challenge.deviceInfo.hostname}</span>
            </div>
          )}
          {challenge?.deviceInfo?.os && (
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">OS</span>
              <span className="text-gray-300">
                {challenge.deviceInfo.os}
                {challenge.deviceInfo.osVersion ? ` ${challenge.deviceInfo.osVersion}` : ''}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Expires</span>
            <span className="text-gray-300">
              {challenge ? formatTime(challenge.expiresAt) : ''}
            </span>
          </div>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-6">
          <p className="text-yellow-200 text-sm">
            This will allow the device to execute commands on your behalf. Only approve if you initiated this request.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDeny}
            disabled={actionLoading}
            className="flex-1 px-4 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Deny
          </button>
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="flex-1 px-4 py-3 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors font-medium disabled:opacity-50"
          >
            {actionLoading ? 'Processing...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}
