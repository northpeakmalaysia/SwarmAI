import React, { useState, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  Webhook,
  Copy,
  RefreshCw,
  Building2,
  ExternalLink,
  Bot,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { QRCodeDisplay } from './QRCodeDisplay';
import { AgenticAIConfigPanel } from './AgenticAIConfigPanel';
import { api } from '../../services/api';
import type { AgenticAIPlatformConfig } from '../../types/frontend';

/**
 * Supported platforms
 */
// Note: 'agentic-ai' removed - Agentic AI agents are now created exclusively in the Agentic module
export type Platform = 'whatsapp' | 'whatsapp-business' | 'telegram-bot' | 'telegram-user' | 'email' | 'http-api';

/**
 * Platform configuration
 */
export interface PlatformConfig {
  platform: Platform;
  // WhatsApp (Web.js)
  phoneNumber?: string;
  // WhatsApp Business (Official API)
  wabAccessToken?: string;        // Permanent access token from Meta
  wabPhoneNumberId?: string;      // Phone number ID from Meta Dashboard
  wabBusinessAccountId?: string;  // WhatsApp Business Account ID
  wabVerifyToken?: string;        // Webhook verification token
  wabAppSecret?: string;          // App secret for signature validation
  // Telegram Bot
  botToken?: string;
  // Telegram User
  apiId?: string;
  apiHash?: string;
  phone?: string;
  // Email
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  email?: string;
  password?: string;
  useTLS?: boolean;
  // HTTP API
  webhookUrl?: string;
  webhookSecret?: string;
  responseUrl?: string;
  authType?: 'none' | 'bearer' | 'basic' | 'custom-header';
  authToken?: string;
  customHeaderName?: string;
  // Agentic AI
  agenticConfig?: AgenticAIPlatformConfig;
}

export interface PlatformSetupWizardProps {
  /** Selected platform */
  platform: Platform;
  /** Callback when setup is complete */
  onComplete: (config: PlatformConfig) => void;
  /** Callback when user goes back */
  onBack?: () => void;
  /** Agent ID for QR code subscription */
  agentId?: string;
  /** Initial config values */
  initialConfig?: Partial<PlatformConfig>;
  /** Initial QR code data (for auto-popup from WebSocket) */
  initialQRData?: string;
  /** Additional className */
  className?: string;
}

/**
 * Platform metadata
 */
const platformMeta: Record<
  Platform,
  { name: string; icon: React.FC<{ className?: string }>; color: string; bgColor: string; description?: string }
> = {
  whatsapp: {
    name: 'WhatsApp',
    icon: MessageSquare,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    description: 'Personal WhatsApp via Web.js',
  },
  'whatsapp-business': {
    name: 'WhatsApp Business',
    icon: Building2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    description: 'Official Meta Business API',
  },
  'telegram-bot': {
    name: 'Telegram Bot',
    icon: Send,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
    description: 'Telegram Bot API',
  },
  'telegram-user': {
    name: 'Telegram User',
    icon: Send,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
    description: 'Telegram User Account',
  },
  email: {
    name: 'Email',
    icon: Mail,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/20',
    description: 'IMAP/SMTP Email',
  },
  'http-api': {
    name: 'HTTP API',
    icon: Webhook,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/20',
    description: 'Custom webhook integration',
  },
  // Note: 'agentic-ai' removed - Agentic AI agents are now created exclusively in the Agentic module
};

// Text size classes - reduced by 20% from standard sizes
const textSizes = {
  heading: 'text-base font-semibold', // was text-lg
  subheading: 'text-sm font-medium',  // was text-base
  body: 'text-xs',                     // was text-sm
  helper: 'text-[10px]',               // was text-xs
};

/**
 * WhatsApp Setup - QR Code scanning flow
 */
const WhatsAppSetup: React.FC<{
  agentId?: string;
  onComplete: (config: PlatformConfig) => void;
  initialQRData?: string;
}> = ({ agentId, onComplete, initialQRData }) => {
  const [isLoading, setIsLoading] = useState(false);
  // If initialQRData is provided, connection was already initiated
  const [isInitiated, setIsInitiated] = useState(!!initialQRData);
  const [error, setError] = useState<string | null>(null);

  // Debug logging
  console.log('[WhatsAppSetup] Rendered with:', {
    agentId,
    hasInitialQRData: !!initialQRData,
    initialQRDataLength: initialQRData?.length,
    isInitiated
  });

  /**
   * Initiate WhatsApp connection - QR will be pushed via WebSocket
   */
  const initiateConnection = useCallback(async () => {
    if (!agentId) return;
    setIsLoading(true);
    setError(null);

    try {
      // POST to initiate WhatsApp connection
      // QR code will be pushed via WebSocket when ready
      await api.post('/platforms/whatsapp', { agentId });
      setIsInitiated(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (err as { message?: string })?.message || 'Failed to initiate WhatsApp connection';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  /**
   * Request new QR code (for refresh)
   */
  const requestNewQR = useCallback(async () => {
    if (!agentId) return;
    setError(null);

    try {
      // Request new QR code - will be pushed via WebSocket
      // Note: This endpoint may need to be created or use a different pattern
      await api.post('/platforms/whatsapp/qr/refresh', { agentId });
    } catch (err: unknown) {
      // Fallback: re-initiate connection
      await initiateConnection();
    }
  }, [agentId, initiateConnection]);

  // Initiate connection on mount - ONLY if no QR data was already provided
  // When initialQRData is provided, the connection was already initiated elsewhere
  React.useEffect(() => {
    if (agentId && !isInitiated && !initialQRData) {
      initiateConnection();
    }
  }, [agentId, isInitiated, initialQRData, initiateConnection]);

  const handleSuccess = () => {
    onComplete({
      platform: 'whatsapp',
    });
  };

  return (
    <div className="flex flex-col items-center justify-center py-4">
      {/* Description only - title is in Modal header */}
      <p className={cn(textSizes.body, 'text-gray-400 mb-4 text-center max-w-sm')}>
        Scan the QR code with your WhatsApp app to connect this agent.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg mb-3 w-full max-w-sm">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className={cn(textSizes.body, 'text-red-400')}>{error}</p>
        </div>
      )}

      {/* QRCodeDisplay receives QR via WebSocket subscription or initial prop */}
      <QRCodeDisplay
        agentId={agentId}
        initialQRData={initialQRData}
        onSuccess={handleSuccess}
        onError={setError}
        onRefresh={requestNewQR}
        size="md"
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 mt-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className={textSizes.body}>Initializing WhatsApp connection...</span>
        </div>
      )}
    </div>
  );
};

/**
 * WhatsApp Business Setup - Official Meta Business API configuration
 */
const WhatsAppBusinessSetup: React.FC<{
  agentId?: string;
  initialConfig?: Partial<PlatformConfig>;
  onComplete: (config: PlatformConfig) => void;
}> = ({ agentId, initialConfig, onComplete }) => {
  const [accessToken, setAccessToken] = useState(initialConfig?.wabAccessToken || '');
  const [phoneNumberId, setPhoneNumberId] = useState(initialConfig?.wabPhoneNumberId || '');
  const [businessAccountId, setBusinessAccountId] = useState(initialConfig?.wabBusinessAccountId || '');
  const [verifyToken, setVerifyToken] = useState(initialConfig?.wabVerifyToken || '');
  const [appSecret, setAppSecret] = useState(initialConfig?.wabAppSecret || '');
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'url' | 'verify' | null>(null);

  // Generate webhook URL based on agent ID
  const webhookUrl = agentId
    ? `${window.location.origin}/api/webhook/whatsapp-business/${agentId}`
    : `${window.location.origin}/api/webhook/whatsapp-business/{agent-id}`;

  // Generate a random verify token
  const generateVerifyToken = useCallback(() => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    setVerifyToken(token);
  }, []);

  // Generate initial verify token if not provided
  React.useEffect(() => {
    if (!verifyToken) {
      generateVerifyToken();
    }
  }, [verifyToken, generateVerifyToken]);

  const copyToClipboard = useCallback(async (text: string, type: 'url' | 'verify') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, []);

  const validateAndSubmit = async () => {
    if (!accessToken.trim()) {
      setError('Access token is required');
      return;
    }
    if (!phoneNumberId.trim()) {
      setError('Phone number ID is required');
      return;
    }
    if (!businessAccountId.trim()) {
      setError('Business Account ID is required');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Validate the access token by making a test API call
      const response = await api.post<{ valid: boolean; error?: string }>('/platforms/whatsapp-business/validate', {
        accessToken: accessToken.trim(),
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim(),
      });

      if (response.valid) {
        onComplete({
          platform: 'whatsapp-business',
          wabAccessToken: accessToken.trim(),
          wabPhoneNumberId: phoneNumberId.trim(),
          wabBusinessAccountId: businessAccountId.trim(),
          wabVerifyToken: verifyToken.trim(),
          wabAppSecret: appSecret.trim() || undefined,
        });
      } else {
        setError(response.error || 'Invalid credentials');
      }
    } catch (err: unknown) {
      // If validation endpoint doesn't exist yet, allow proceeding
      console.warn('Validation endpoint not available, proceeding anyway');
      onComplete({
        platform: 'whatsapp-business',
        wabAccessToken: accessToken.trim(),
        wabPhoneNumberId: phoneNumberId.trim(),
        wabBusinessAccountId: businessAccountId.trim(),
        wabVerifyToken: verifyToken.trim(),
        wabAppSecret: appSecret.trim() || undefined,
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={cn(platformMeta['whatsapp-business'].bgColor, 'p-2.5 rounded-full')}>
          <Building2 className={cn('w-5 h-5', platformMeta['whatsapp-business'].color)} />
        </div>
        <div>
          <h3 className={cn(textSizes.heading, 'text-white')}>WhatsApp Business API</h3>
          <p className={cn(textSizes.body, 'text-gray-400')}>Official Meta Business Platform Integration</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className={cn(textSizes.body, 'text-red-400')}>{error}</p>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
        <div className="flex items-start gap-2.5">
          <Building2 className="w-4 h-4 text-emerald-400 mt-0.5" />
          <div>
            <h4 className={cn(textSizes.body, 'font-medium text-emerald-300 mb-1')}>
              Meta Business Platform Setup Required
            </h4>
            <p className={cn(textSizes.helper, 'text-gray-400 mb-1.5')}>
              To use the official WhatsApp Business API, you need a Meta Business account with WhatsApp Business configured.
            </p>
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(textSizes.helper, 'inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300')}
            >
              View setup guide <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="space-y-1.5">
        <label className={cn(textSizes.body, 'font-medium text-gray-300')}>Webhook URL</label>
        <div className="flex gap-1.5">
          <div className={cn('flex-1 p-2.5 bg-slate-800 border border-slate-600 rounded-lg font-mono text-gray-300 overflow-x-auto', textSizes.helper)}>
            {webhookUrl}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(webhookUrl, 'url')}
            icon={copied === 'url' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          />
        </div>
        <p className={cn(textSizes.helper, 'text-gray-500')}>Configure this URL in Meta Business Manager → WhatsApp → Configuration</p>
      </div>

      {/* Verify Token */}
      <div className="space-y-1.5">
        <label className={cn(textSizes.body, 'font-medium text-gray-300')}>Webhook Verify Token</label>
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              placeholder="Verification token for webhook setup"
              className="text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(verifyToken, 'verify')}
            icon={copied === 'verify' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={generateVerifyToken}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            title="Generate new token"
          />
        </div>
        <p className={cn(textSizes.helper, 'text-gray-500')}>Use this token when configuring the webhook in Meta dashboard</p>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <h4 className={cn(textSizes.body, 'font-medium text-gray-300 mb-2.5')}>API Credentials</h4>

        {/* Access Token */}
        <div className="space-y-2.5">
          <Input
            label="Access Token"
            type={showToken ? 'text' : 'password'}
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Permanent access token from Meta"
            helperText="Generate a permanent token in Meta Business Settings → System Users"
            className="text-xs"
            iconRight={
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-gray-400 hover:text-white"
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            }
          />

          {/* Phone Number ID */}
          <Input
            label="Phone Number ID"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
            helperText="From Meta Business Manager → WhatsApp → Phone Numbers"
            className="text-xs"
          />

          {/* Business Account ID */}
          <Input
            label="WhatsApp Business Account ID"
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="123456789012345"
            helperText="From Meta Business Manager → WhatsApp → Account Settings"
            className="text-xs"
          />

          {/* App Secret (Optional) */}
          <Input
            label="App Secret (Optional)"
            type={showSecret ? 'text' : 'password'}
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="App secret for signature validation"
            helperText="Used to validate incoming webhook signatures. Found in Meta App Settings."
            className="text-xs"
            iconRight={
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="text-gray-400 hover:text-white"
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            }
          />
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-slate-700/30 rounded-lg p-3">
        <h4 className={cn(textSizes.body, 'font-medium text-white mb-1.5')}>Setup Steps:</h4>
        <ol className={cn(textSizes.helper, 'text-gray-400 space-y-1 list-decimal list-inside')}>
          <li>Create a Meta Business account at <span className="text-emerald-400">business.facebook.com</span></li>
          <li>Add WhatsApp to your app in Meta Developer Dashboard</li>
          <li>Configure the webhook URL and verify token above</li>
          <li>Create a System User and generate a permanent access token</li>
          <li>Copy the Phone Number ID and Business Account ID</li>
          <li>Subscribe to webhook events: <code className="text-emerald-400">messages</code>, <code className="text-emerald-400">message_deliveries</code></li>
        </ol>
      </div>

      <Button
        onClick={validateAndSubmit}
        loading={isValidating}
        fullWidth
        size="sm"
        icon={<CheckCircle className="w-3.5 h-3.5" />}
      >
        Connect WhatsApp Business
      </Button>
    </div>
  );
};

/**
 * Telegram Bot Setup - Bot token input
 */
const TelegramBotSetup: React.FC<{
  agentId?: string;
  initialConfig?: Partial<PlatformConfig>;
  onComplete: (config: PlatformConfig) => void;
}> = ({ agentId, initialConfig, onComplete }) => {
  const [botToken, setBotToken] = useState(initialConfig?.botToken || '');
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndSubmit = async () => {
    if (!agentId) {
      setError('Agent ID is required');
      return;
    }

    if (!botToken.trim()) {
      setError('Bot token is required');
      return;
    }

    // Basic validation: Telegram bot tokens follow pattern like 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
    const tokenPattern = /^\d+:[A-Za-z0-9_-]{35}$/;
    if (!tokenPattern.test(botToken.trim())) {
      setError('Invalid bot token format');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Call backend to connect Telegram Bot
      await api.post<{ id: string; status: string; connectionMetadata: unknown }>(
        '/platforms/telegram-bot',
        {
          agentId,
          token: botToken.trim(),
          polling: true, // Use polling mode by default
        }
      );

      onComplete({
        platform: 'telegram-bot',
        botToken: botToken.trim(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (err as { message?: string })?.message || 'Failed to connect Telegram bot';
      setError(message);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={cn(platformMeta['telegram-bot'].bgColor, 'p-2.5 rounded-full')}>
          <Send className={cn('w-5 h-5', platformMeta['telegram-bot'].color)} />
        </div>
        <div>
          <h3 className={cn(textSizes.heading, 'text-white')}>Telegram Bot</h3>
          <p className={cn(textSizes.body, 'text-gray-400')}>Enter your bot token from @BotFather</p>
        </div>
      </div>

      <div className="relative">
        <Input
          label="Bot Token"
          type={showToken ? 'text' : 'password'}
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
          error={error || undefined}
          helperText="Get this from @BotFather on Telegram"
          className="text-xs"
          iconRight={
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="text-gray-400 hover:text-white"
            >
              {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          }
        />
      </div>

      <div className="bg-slate-700/30 rounded-lg p-3">
        <h4 className={cn(textSizes.body, 'font-medium text-white mb-1.5')}>How to get a bot token:</h4>
        <ol className={cn(textSizes.helper, 'text-gray-400 space-y-1 list-decimal list-inside')}>
          <li>Open Telegram and search for @BotFather</li>
          <li>Send /newbot and follow the prompts</li>
          <li>Copy the API token provided</li>
        </ol>
      </div>

      <Button
        onClick={validateAndSubmit}
        loading={isValidating}
        fullWidth
        size="sm"
        icon={<ArrowRight className="w-3.5 h-3.5" />}
        iconRight
      >
        Connect Bot
      </Button>
    </div>
  );
};

/**
 * Telegram User Setup - API credentials + phone verification
 */
const TelegramUserSetup: React.FC<{
  agentId?: string;
  initialConfig?: Partial<PlatformConfig>;
  onComplete: (config: PlatformConfig) => void;
}> = ({ agentId, initialConfig, onComplete }) => {
  const [step, setStep] = useState<'credentials' | 'verify' | 'password'>('credentials');
  const [phone, setPhone] = useState(initialConfig?.phone || '');
  const [otp, setOtp] = useState('');
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [showTwoFaPassword, setShowTwoFaPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  const handleCredentialsSubmit = async () => {
    if (!agentId) {
      setError('Agent ID is required');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call backend to initiate Telegram User connection
      // API credentials are configured via system environment variables
      const response = await api.post<{ id: string; accountId: string; status: string; authState: string; hint: string }>(
        '/platforms/telegram-user',
        {
          agentId,
          phoneNumber: phone.trim(),
        }
      );

      setAccountId(response.id || response.accountId);

      if (response.authState === 'connected') {
        // Already authenticated (session restored)
        onComplete({ platform: 'telegram-user', phone });
      } else {
        // Needs verification code
        setStep('verify');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (err as { message?: string })?.message || 'Failed to initiate Telegram connection';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async () => {
    if (!otp.trim()) {
      setError('OTP is required');
      return;
    }

    if (!agentId || !accountId) {
      setError('Missing agent or account ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call backend to verify OTP using the auth/code endpoint
      const codeResponse = await api.post<{ success: boolean; nextStep: string }>(`/platforms/telegram-user/${accountId}/auth/code`, {
        code: otp.trim(),
      });

      // Wait briefly for gramJS to process the code and determine next auth state
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if 2FA password is needed (nextStep indicates password_or_connected)
      // Poll the account's auth state to determine next step
      try {
        const statusRes = await api.get<{ authState?: string }>(`/platforms/telegram-user/${accountId}/auth/status`);
        if (statusRes.authState === 'password_required') {
          setStep('password');
          setIsLoading(false);
          return;
        }
      } catch (_) {
        // Status check failed — assume connected or check via WebSocket
      }

      onComplete({
        platform: 'telegram-user',
        phone,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (err as { message?: string })?.message || 'Failed to verify code';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!twoFaPassword.trim()) {
      setError('2FA password is required');
      return;
    }

    if (!accountId) {
      setError('Missing account ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await api.post(`/platforms/telegram-user/${accountId}/auth/password`, {
        password: twoFaPassword.trim(),
      });

      onComplete({
        platform: 'telegram-user',
        phone,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (err as { message?: string })?.message || 'Failed to verify password';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'verify') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className={cn(platformMeta['telegram-user'].bgColor, 'p-2.5 rounded-full')}>
            <Send className={cn('w-5 h-5', platformMeta['telegram-user'].color)} />
          </div>
          <div>
            <h3 className={cn(textSizes.heading, 'text-white')}>Verify Phone</h3>
            <p className={cn(textSizes.body, 'text-gray-400')}>Enter the code sent to {phone}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className={cn(textSizes.body, 'text-red-400')}>{error}</p>
          </div>
        )}

        <Input
          label="Verification Code"
          type="text"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          placeholder="12345"
          error={error || undefined}
          className="text-xs"
        />

        <div className="flex gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep('credentials')}
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            Back
          </Button>
          <Button
            onClick={handleOTPSubmit}
            loading={isLoading}
            fullWidth
            size="sm"
            icon={<CheckCircle className="w-3.5 h-3.5" />}
          >
            Verify
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className={cn(platformMeta['telegram-user'].bgColor, 'p-2.5 rounded-full')}>
            <Send className={cn('w-5 h-5', platformMeta['telegram-user'].color)} />
          </div>
          <div>
            <h3 className={cn(textSizes.heading, 'text-white')}>Two-Step Verification</h3>
            <p className={cn(textSizes.body, 'text-gray-400')}>Enter your Telegram 2FA password</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className={cn(textSizes.body, 'text-red-400')}>{error}</p>
          </div>
        )}

        <div className="relative">
          <Input
            label="2FA Password"
            type={showTwoFaPassword ? 'text' : 'password'}
            value={twoFaPassword}
            onChange={(e) => setTwoFaPassword(e.target.value)}
            placeholder="Your Telegram 2FA password"
            className="text-xs"
          />
          <button type="button" className="absolute right-2.5 top-8 p-1 text-gray-400 hover:text-white" onClick={() => setShowTwoFaPassword(!showTwoFaPassword)}>
            {showTwoFaPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        <p className={cn(textSizes.helper, 'text-gray-500')}>
          This is the password you set in Telegram Settings &gt; Privacy &amp; Security &gt; Two-Step Verification
        </p>

        <div className="flex gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep('verify')}
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            Back
          </Button>
          <Button
            onClick={handlePasswordSubmit}
            loading={isLoading}
            fullWidth
            size="sm"
            icon={<CheckCircle className="w-3.5 h-3.5" />}
          >
            Verify Password
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={cn(platformMeta['telegram-user'].bgColor, 'p-2.5 rounded-full')}>
          <Send className={cn('w-5 h-5', platformMeta['telegram-user'].color)} />
        </div>
        <div>
          <h3 className={cn(textSizes.heading, 'text-white')}>Telegram User</h3>
          <p className={cn(textSizes.body, 'text-gray-400')}>Connect using your Telegram account</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className={cn(textSizes.body, 'text-red-400')}>{error}</p>
        </div>
      )}

      <Input
        label="Phone Number"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+1234567890"
        helperText="Include country code (e.g., +1 for US)"
        className="text-xs"
      />

      <Button
        onClick={handleCredentialsSubmit}
        loading={isLoading}
        fullWidth
        size="sm"
        icon={<ArrowRight className="w-3.5 h-3.5" />}
        iconRight
      >
        Send Verification Code
      </Button>
    </div>
  );
};

/**
 * Email Setup - IMAP/SMTP configuration
 */
const EmailSetup: React.FC<{
  agentId?: string;
  initialConfig?: Partial<PlatformConfig>;
  onComplete: (config: PlatformConfig) => void;
}> = ({ agentId, initialConfig, onComplete }) => {
  const [email, setEmail] = useState(initialConfig?.email || '');
  const [password, setPassword] = useState(initialConfig?.password || '');
  const [imapHost, setImapHost] = useState(initialConfig?.imapHost || '');
  const [imapPort, setImapPort] = useState(initialConfig?.imapPort?.toString() || '993');
  const [smtpHost, setSmtpHost] = useState(initialConfig?.smtpHost || '');
  const [smtpPort, setSmtpPort] = useState(initialConfig?.smtpPort?.toString() || '587');
  const [useTLS, setUseTLS] = useState(initialConfig?.useTLS ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndSubmit = async () => {
    if (!agentId) {
      setError('Agent ID is required');
      return;
    }

    if (!email.trim() || !password.trim() || !imapHost.trim() || !smtpHost.trim()) {
      setError('Email, password, IMAP host, and SMTP host are required');
      return;
    }

    // Basic email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      setError('Invalid email format');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Call backend to connect Email account
      await api.post<{ id: string; status: string; connectionMetadata: unknown }>(
        '/platforms/email',
        {
          agentId,
          email: email.trim(),
          password: password.trim(),
          imap: {
            host: imapHost.trim(),
            port: parseInt(imapPort, 10),
            tls: useTLS,
          },
          smtp: {
            host: smtpHost.trim(),
            port: parseInt(smtpPort, 10),
            secure: useTLS,
          },
        }
      );

      onComplete({
        platform: 'email',
        email: email.trim(),
        password: password.trim(),
        imapHost: imapHost.trim(),
        imapPort: parseInt(imapPort, 10),
        smtpHost: smtpHost.trim(),
        smtpPort: parseInt(smtpPort, 10),
        useTLS,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (err as { message?: string })?.message || 'Failed to connect email account';
      setError(message);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={cn(platformMeta.email.bgColor, 'p-2.5 rounded-full')}>
          <Mail className={cn('w-5 h-5', platformMeta.email.color)} />
        </div>
        <div>
          <h3 className={cn(textSizes.heading, 'text-white')}>Email</h3>
          <p className={cn(textSizes.body, 'text-gray-400')}>Configure IMAP/SMTP connection</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className={cn(textSizes.body, 'text-red-400')}>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@example.com"
            className="text-xs"
          />
        </div>

        <div className="col-span-2 relative">
          <Input
            label="Password / App Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            helperText="Use an app-specific password for Gmail/Outlook"
            className="text-xs"
            iconRight={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            }
          />
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <h4 className={cn(textSizes.body, 'font-medium text-gray-300 mb-2.5')}>IMAP Settings (Incoming)</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label="IMAP Host"
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
              placeholder="imap.gmail.com"
              className="text-xs"
            />
          </div>
          <Input
            label="Port"
            type="number"
            value={imapPort}
            onChange={(e) => setImapPort(e.target.value)}
            placeholder="993"
            className="text-xs"
          />
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <h4 className={cn(textSizes.body, 'font-medium text-gray-300 mb-2.5')}>SMTP Settings (Outgoing)</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label="SMTP Host"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
              className="text-xs"
            />
          </div>
          <Input
            label="Port"
            type="number"
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value)}
            placeholder="587"
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="useTLS"
          checked={useTLS}
          onChange={(e) => setUseTLS(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
        />
        <label htmlFor="useTLS" className={cn(textSizes.body, 'text-gray-300')}>
          Use TLS/SSL encryption
        </label>
      </div>

      <Button
        onClick={validateAndSubmit}
        loading={isValidating}
        fullWidth
        size="sm"
        icon={<CheckCircle className="w-3.5 h-3.5" />}
      >
        Connect Email
      </Button>
    </div>
  );
};

/**
 * HTTP API Setup - Webhook endpoint configuration
 */
const HttpApiSetup: React.FC<{
  agentId?: string;
  initialConfig?: Partial<PlatformConfig>;
  onComplete: (config: PlatformConfig) => void;
}> = ({ agentId, initialConfig, onComplete }) => {
  const [webhookSecret, setWebhookSecret] = useState(initialConfig?.webhookSecret || '');
  const [responseUrl, setResponseUrl] = useState(initialConfig?.responseUrl || '');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'basic' | 'custom-header'>(
    initialConfig?.authType || 'none'
  );
  const [authToken, setAuthToken] = useState(initialConfig?.authToken || '');
  const [customHeaderName, setCustomHeaderName] = useState(initialConfig?.customHeaderName || 'X-API-Key');
  const [showSecret, setShowSecret] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'url' | 'secret' | null>(null);

  // Generate webhook URL based on agent ID
  const webhookUrl = agentId
    ? `${window.location.origin}/api/webhook/agent/${agentId}`
    : `${window.location.origin}/api/webhook/agent/{agent-id}`;

  // Generate a random secret
  const generateSecret = useCallback(() => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    setWebhookSecret(secret);
  }, []);

  // Generate initial secret if not provided
  React.useEffect(() => {
    if (!webhookSecret) {
      generateSecret();
    }
  }, [webhookSecret, generateSecret]);

  const copyToClipboard = useCallback(async (text: string, type: 'url' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, []);

  const validateAndSubmit = async () => {
    if (authType !== 'none' && !authToken.trim()) {
      setError('Authentication token is required when auth type is selected');
      return;
    }

    if (authType === 'custom-header' && !customHeaderName.trim()) {
      setError('Custom header name is required');
      return;
    }

    // Validate response URL if provided
    if (responseUrl.trim()) {
      try {
        new URL(responseUrl.trim());
      } catch {
        setError('Invalid response URL format');
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    // In production, save the webhook config to the backend
    setTimeout(() => {
      setIsLoading(false);
      onComplete({
        platform: 'http-api',
        webhookUrl,
        webhookSecret,
        responseUrl: responseUrl.trim() || undefined,
        authType,
        authToken: authType !== 'none' ? authToken.trim() : undefined,
        customHeaderName: authType === 'custom-header' ? customHeaderName.trim() : undefined,
      });
    }, 500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={cn(platformMeta['http-api'].bgColor, 'p-2.5 rounded-full')}>
          <Webhook className={cn('w-5 h-5', platformMeta['http-api'].color)} />
        </div>
        <div>
          <h3 className={cn(textSizes.heading, 'text-white')}>HTTP API Integration</h3>
          <p className={cn(textSizes.body, 'text-gray-400')}>Receive messages via webhook endpoint</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className={cn(textSizes.body, 'text-red-400')}>{error}</p>
        </div>
      )}

      {/* Webhook Endpoint URL */}
      <div className="space-y-1.5">
        <label className={cn(textSizes.body, 'font-medium text-gray-300')}>Webhook Endpoint</label>
        <div className="flex gap-1.5">
          <div className={cn('flex-1 p-2.5 bg-slate-800 border border-slate-600 rounded-lg font-mono text-gray-300 overflow-x-auto', textSizes.helper)}>
            {webhookUrl}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(webhookUrl, 'url')}
            icon={copied === 'url' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          />
        </div>
        <p className={cn(textSizes.helper, 'text-gray-500')}>External systems should POST messages to this URL</p>
      </div>

      {/* Webhook Secret */}
      <div className="space-y-1.5">
        <label className={cn(textSizes.body, 'font-medium text-gray-300')}>Webhook Secret</label>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="Webhook secret for signature validation"
              className="text-xs"
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-gray-400 hover:text-white"
                >
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              }
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(webhookSecret, 'secret')}
            icon={copied === 'secret' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={generateSecret}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            title="Generate new secret"
          />
        </div>
        <p className={cn(textSizes.helper, 'text-gray-500')}>Used to validate incoming webhook signatures (X-Webhook-Signature header)</p>
      </div>

      {/* Response URL */}
      <Input
        label="Response URL (Optional)"
        type="url"
        value={responseUrl}
        onChange={(e) => setResponseUrl(e.target.value)}
        placeholder="https://your-server.com/webhook/response"
        helperText="Where to POST agent responses. Leave empty to return responses synchronously."
        className="text-xs"
      />

      {/* Authentication for outgoing responses */}
      <div className="border-t border-slate-700 pt-3">
        <h4 className={cn(textSizes.body, 'font-medium text-gray-300 mb-2')}>Response Authentication</h4>
        <p className={cn(textSizes.helper, 'text-gray-500 mb-2.5')}>Configure authentication for outgoing responses to your server</p>

        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {(['none', 'bearer', 'basic', 'custom-header'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAuthType(type)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg border transition-colors',
                textSizes.helper,
                authType === type
                  ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                  : 'bg-slate-800 border-slate-600 text-gray-400 hover:text-white hover:border-slate-500'
              )}
            >
              {type === 'none' ? 'None' :
               type === 'bearer' ? 'Bearer' :
               type === 'basic' ? 'Basic' : 'Custom'}
            </button>
          ))}
        </div>

        {authType !== 'none' && (
          <div className="space-y-2.5">
            {authType === 'custom-header' && (
              <Input
                label="Header Name"
                value={customHeaderName}
                onChange={(e) => setCustomHeaderName(e.target.value)}
                placeholder="X-API-Key"
                className="text-xs"
              />
            )}
            <Input
              label={authType === 'basic' ? 'Credentials (user:password)' : 'Token'}
              type={showAuthToken ? 'text' : 'password'}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder={authType === 'basic' ? 'username:password' : 'your-api-token'}
              className="text-xs"
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowAuthToken(!showAuthToken)}
                  className="text-gray-400 hover:text-white"
                >
                  {showAuthToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              }
            />
          </div>
        )}
      </div>

      {/* Integration example */}
      <div className="bg-slate-700/30 rounded-lg p-3">
        <h4 className={cn(textSizes.body, 'font-medium text-white mb-1.5')}>Integration Example:</h4>
        <pre className={cn(textSizes.helper, 'text-gray-400 overflow-x-auto')}>
{`POST ${webhookUrl}
Content-Type: application/json
X-Webhook-Signature: sha256=...

{
  "message": "Hello from external system",
  "sender": "user@example.com",
  "metadata": { "source": "crm" }
}`}
        </pre>
      </div>

      <Button
        onClick={validateAndSubmit}
        loading={isLoading}
        fullWidth
        size="sm"
        icon={<CheckCircle className="w-3.5 h-3.5" />}
      >
        Configure HTTP API
      </Button>
    </div>
  );
};

/**
 * PlatformSetupWizard - Platform-specific setup flows
 *
 * @example
 * ```tsx
 * <PlatformSetupWizard
 *   platform="whatsapp"
 *   agentId={agent.id}
 *   onComplete={(config) => console.log(config)}
 *   onBack={() => setStep('select')}
 * />
 * ```
 */
export const PlatformSetupWizard: React.FC<PlatformSetupWizardProps> = ({
  platform,
  onComplete,
  onBack,
  agentId,
  initialConfig,
  initialQRData,
  className,
}) => {
  const meta = platformMeta[platform];

  const renderPlatformSetup = () => {
    switch (platform) {
      case 'whatsapp':
        return <WhatsAppSetup agentId={agentId} initialQRData={initialQRData} onComplete={onComplete} />;
      case 'whatsapp-business':
        return <WhatsAppBusinessSetup agentId={agentId} initialConfig={initialConfig} onComplete={onComplete} />;
      case 'telegram-bot':
        return <TelegramBotSetup agentId={agentId} initialConfig={initialConfig} onComplete={onComplete} />;
      case 'telegram-user':
        return <TelegramUserSetup agentId={agentId} initialConfig={initialConfig} onComplete={onComplete} />;
      case 'email':
        return <EmailSetup agentId={agentId} initialConfig={initialConfig} onComplete={onComplete} />;
      case 'http-api':
        return <HttpApiSetup agentId={agentId} initialConfig={initialConfig} onComplete={onComplete} />;
      // Note: 'agentic-ai' case removed - Agentic AI agents are now created exclusively in the Agentic module
      default:
        return (
          <div className="text-center py-8">
            <p className="text-gray-400">Unsupported platform</p>
          </div>
        );
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to platform selection
        </button>
      )}

      {renderPlatformSetup()}
    </div>
  );
};

// Export platform metadata for use in other components
export { platformMeta };

PlatformSetupWizard.displayName = 'PlatformSetupWizard';

export default PlatformSetupWizard;
