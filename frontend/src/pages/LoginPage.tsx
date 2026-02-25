import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, User, Loader2, KeyRound, Fingerprint, Sparkles, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import SwarmIcon from '../components/common/SwarmIcon'
import toast from 'react-hot-toast'
import api from '../services/api'

type AuthMethod = 'password' | 'magiclink' | 'passkey'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password')
  const [preferredMethod, setPreferredMethod] = useState<AuthMethod | null>(null)
  const [hasPassword, setHasPassword] = useState(true)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [emailChecked, setEmailChecked] = useState(false)
  const { login, register, isLoading, setLoading, loginWithMagicLink } = useAuthStore()
  const navigate = useNavigate()

  // Check for magic link token in URL
  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      handleMagicLinkVerify(token)
    }
  }, [searchParams])

  // Check preferred auth method when email changes
  const checkPreferredMethod = async () => {
    if (!email || !email.includes('@')) return

    setIsCheckingEmail(true)
    try {
      const response = await api.post('/auth/preferred-method', { email })
      setPreferredMethod(response.data.method)
      setHasPassword(response.data.hasPassword)
      setHasPasskey(response.data.hasPasskey)
      setAuthMethod(response.data.method)
      setEmailChecked(true)
    } catch {
      // User doesn't exist yet, default to password for new users
      setPreferredMethod('password')
      setHasPassword(true)
      setHasPasskey(false)
      setEmailChecked(true)
    } finally {
      setIsCheckingEmail(false)
    }
  }

  const handleMagicLinkVerify = async (token: string) => {
    setLoading(true)
    try {
      await loginWithMagicLink(token)
      toast.success('Successfully signed in!')
      navigate('/dashboard')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid or expired magic link')
      navigate('/login')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (isLogin) {
        await login(email, password)
        toast.success('Welcome back!')
      } else {
        await register(email, password, name)
        toast.success('Account created successfully!')
      }
      navigate('/dashboard')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Authentication failed')
    }
  }

  const handleMagicLinkRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await api.post('/auth/magic-link/request', { email })
      setMagicLinkSent(true)
      toast.success(response.data.message)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send magic link')
    } finally {
      setLoading(false)
    }
  }

  const handlePasskeyAuth = async () => {
    if (!email) {
      toast.error('Please enter your email first')
      return
    }

    setLoading(true)
    try {
      // Get authentication options from server
      const optionsResponse = await api.post('/auth/passkey/auth-options', { email })
      const options = optionsResponse.data

      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('Passkeys are not supported in this browser')
      }

      // Convert challenge to ArrayBuffer
      const challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

      // Convert allowed credentials
      const allowCredentials = options.allowCredentials.map((cred: any) => ({
        type: cred.type,
        id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
      }))

      // Request credential from authenticator
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: options.timeout,
          rpId: options.rpId,
          allowCredentials,
          userVerification: options.userVerification,
        },
      }) as PublicKeyCredential

      if (!credential) {
        throw new Error('No credential returned')
      }

      const response = credential.response as AuthenticatorAssertionResponse

      // Convert responses to base64url
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const authenticatorData = btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const signature = btoa(String.fromCharCode(...new Uint8Array(response.signature)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const clientDataJSON = btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

      // Authenticate with server
      const authResponse = await api.post('/auth/passkey/authenticate', {
        email,
        credentialId,
        authenticatorData,
        signature,
        clientDataJSON,
      })

      const { user, token, refreshToken } = authResponse.data

      // Store tokens and user
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      useAuthStore.setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      })
      localStorage.setItem('swarm-auth', JSON.stringify({ token }))

      toast.success('Signed in with passkey!')
      navigate('/dashboard')
    } catch (error: any) {
      console.error('Passkey auth error:', error)
      toast.error(error.response?.data?.message || error.message || 'Passkey authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const renderAuthMethodSelector = () => (
    <div className="flex gap-2 mb-6">
      <button
        type="button"
        onClick={() => setAuthMethod('password')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-all ${
          authMethod === 'password'
            ? 'border-primary-500 bg-primary-500/10 text-primary-400'
            : 'border-gray-700 text-gray-400 hover:border-gray-600'
        }`}
      >
        <Lock className="w-4 h-4" />
        <span className="text-sm font-medium">Password</span>
      </button>
      <button
        type="button"
        onClick={() => setAuthMethod('magiclink')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-all ${
          authMethod === 'magiclink'
            ? 'border-primary-500 bg-primary-500/10 text-primary-400'
            : 'border-gray-700 text-gray-400 hover:border-gray-600'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-medium">Magic Link</span>
      </button>
      {hasPasskey && (
        <button
          type="button"
          onClick={() => setAuthMethod('passkey')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-all ${
            authMethod === 'passkey'
              ? 'border-primary-500 bg-primary-500/10 text-primary-400'
              : 'border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          <span className="text-sm font-medium">Passkey</span>
        </button>
      )}
    </div>
  )

  const renderPasswordForm = () => (
    <form onSubmit={handlePasswordSubmit} className="stack-md">
      {!isLogin && (
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="input pl-10"
              required={!isLogin}
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailChecked(false)
            }}
            onBlur={checkPreferredMethod}
            placeholder="you@example.com"
            className="input pl-10"
            required
          />
          {isCheckingEmail && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
          )}
        </div>
        {emailChecked && preferredMethod && preferredMethod !== 'password' && (
          <p className="text-xs text-primary-400 mt-1">
            Last signed in with {preferredMethod === 'magiclink' ? 'magic link' : 'passkey'}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input pl-10"
            required
            minLength={6}
          />
        </div>
      </div>

      <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{isLogin ? 'Signing in...' : 'Creating account...'}</span>
          </>
        ) : (
          <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
        )}
      </button>
    </form>
  )

  const renderMagicLinkForm = () => {
    if (magicLinkSent) {
      return (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-primary-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Check your email</h3>
          <p className="text-gray-400 text-sm mb-4">
            We sent a magic link to <strong className="text-white">{email}</strong>
          </p>
          <button
            onClick={() => setMagicLinkSent(false)}
            className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Try another email
          </button>
        </div>
      )
    }

    return (
      <form onSubmit={handleMagicLinkRequest} className="stack-md">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input pl-10"
              required
            />
          </div>
        </div>

        <p className="text-sm text-gray-400">
          We'll send you a magic link to sign in instantly - no password needed.
        </p>

        <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Sending link...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>Send Magic Link</span>
            </>
          )}
        </button>
      </form>
    )
  }

  const renderPasskeyForm = () => (
    <div className="stack-md">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailChecked(false)
            }}
            onBlur={checkPreferredMethod}
            placeholder="you@example.com"
            className="input pl-10"
            required
          />
        </div>
      </div>

      <p className="text-sm text-gray-400">
        Use your device's biometric authentication (Face ID, Touch ID, or Windows Hello) to sign in securely.
      </p>

      <button
        type="button"
        onClick={handlePasskeyAuth}
        disabled={isLoading || !email}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Authenticating...</span>
          </>
        ) : (
          <>
            <Fingerprint className="w-5 h-5" />
            <span>Sign in with Passkey</span>
          </>
        )}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-swarm-darker flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-swarm-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <SwarmIcon size={80} />
          </div>
          <h1 className="text-3xl font-bold text-white">SwarmAI</h1>
          <p className="text-gray-400 mt-2">Multi-Agent Intelligence Platform</p>
        </div>

        {/* Form card */}
        <div className="card">
          {/* Sign In / Sign Up toggle - only for password method */}
          {authMethod === 'password' && (
            <div className="flex mb-6">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2 text-center font-medium transition-colors ${
                  isLogin
                    ? 'text-primary-400 border-b-2 border-primary-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2 text-center font-medium transition-colors ${
                  !isLogin
                    ? 'text-primary-400 border-b-2 border-primary-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Auth method selector */}
          {isLogin && renderAuthMethodSelector()}

          {/* Forms based on selected method */}
          {authMethod === 'password' && renderPasswordForm()}
          {authMethod === 'magiclink' && renderMagicLinkForm()}
          {authMethod === 'passkey' && renderPasskeyForm()}
        </div>

        {/* Session Trust Warning */}
        <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 text-sm font-medium">Trusted Device Required</p>
              <p className="text-amber-400/80 text-xs mt-1">
                Your session will remain active for 90 days. Only sign in on devices you trust and control.
                Anyone with access to this browser can access your account.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-4">
          By continuing, you agree to SwarmAI's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
