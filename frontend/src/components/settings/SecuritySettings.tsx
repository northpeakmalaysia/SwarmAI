import React, { useState, useEffect } from 'react';
import {
  Lock,
  Shield,
  Key,
  Smartphone,
  Monitor,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Plus,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardBody, CardFooter } from '../common/Card';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime } from '@/utils/dateFormat';

/**
 * Active session interface
 */
interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
}

/**
 * API Key interface
 */
interface APIKey {
  id: string;
  name: string;
  prefix: string;
  lastUsed: string | null;
  createdAt: string;
  expiresAt: string | null;
}

/**
 * SecuritySettings Component
 *
 * Manages user security settings including password change,
 * two-factor authentication, active sessions, and API keys.
 */
export const SecuritySettings: React.FC = () => {
  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeySecret, setNewKeySecret] = useState('');
  const [createKeyLoading, setCreateKeyLoading] = useState(false);

  // Fetch sessions and API keys on mount
  useEffect(() => {
    fetchSessions();
    fetchApiKeys();
    fetch2FAStatus();
  }, []);

  const fetch2FAStatus = async () => {
    try {
      const response = await api.get('/auth/2fa/status');
      setTwoFactorEnabled(response.data.enabled);
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error);
    }
  };

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const response = await api.get('/auth/sessions');
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      // Mock data for development
      setSessions([
        {
          id: '1',
          device: 'Windows PC',
          browser: 'Chrome 120',
          location: 'Jakarta, Indonesia',
          ip: '192.168.1.1',
          lastActive: new Date().toISOString(),
          isCurrent: true,
        },
        {
          id: '2',
          device: 'iPhone 15',
          browser: 'Safari Mobile',
          location: 'Singapore',
          ip: '192.168.1.2',
          lastActive: new Date(Date.now() - 86400000).toISOString(),
          isCurrent: false,
        },
      ]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    setApiKeysLoading(true);
    try {
      const response = await api.get('/settings/api-keys');
      // Transform backend response to match frontend interface
      const keys = (response.data || []).map((key: {
        id: string;
        name: string;
        createdAt: string;
        lastUsedAt: string | null;
        expiresAt: string | null;
      }) => ({
        id: key.id,
        name: key.name,
        prefix: 'swarm_****', // Backend doesn't store prefix, show generic
        lastUsed: key.lastUsedAt,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      }));
      setApiKeys(keys);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      setApiKeys([]);
    } finally {
      setApiKeysLoading(false);
    }
  };

  const validatePassword = (): boolean => {
    const errors: Record<string, string> = {};

    if (!passwordForm.currentPassword) {
      errors.currentPassword = 'Current password is required';
    }
    if (!passwordForm.newPassword) {
      errors.newPassword = 'New password is required';
    } else if (passwordForm.newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(passwordForm.newPassword)) {
      errors.newPassword = 'Password must contain an uppercase letter';
    } else if (!/[0-9]/.test(passwordForm.newPassword)) {
      errors.newPassword = 'Password must contain a number';
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePasswordChange = async () => {
    if (!validatePassword()) return;

    setPasswordLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      toast.success('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordErrors({});
    } catch (error) {
      console.error('Password change error:', error);
      toast.error('Failed to change password. Check your current password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleToggle2FA = async () => {
    setTwoFactorLoading(true);
    try {
      if (twoFactorEnabled) {
        await api.post('/auth/2fa/disable');
        setTwoFactorEnabled(false);
        toast.success('Two-factor authentication disabled');
      } else {
        const response = await api.post('/auth/2fa/setup');
        setQrCodeUrl(response.data.qrCodeUrl);
        setShowQRCode(true);
      }
    } catch (error) {
      console.error('2FA toggle error:', error);
      toast.error('Failed to update two-factor authentication');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (verificationCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    setTwoFactorLoading(true);
    try {
      await api.post('/auth/2fa/verify', { code: verificationCode });
      setTwoFactorEnabled(true);
      setShowQRCode(false);
      setVerificationCode('');
      toast.success('Two-factor authentication enabled');
    } catch (error) {
      console.error('2FA verification error:', error);
      toast.error('Invalid verification code');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      setSessions(sessions.filter(s => s.id !== sessionId));
      toast.success('Session revoked successfully');
    } catch (error) {
      console.error('Session revoke error:', error);
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await api.delete('/auth/sessions');
      setSessions(sessions.filter(s => s.isCurrent));
      toast.success('All other sessions revoked');
    } catch (error) {
      console.error('Revoke all sessions error:', error);
      toast.error('Failed to revoke sessions');
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }

    setCreateKeyLoading(true);
    try {
      const response = await api.post('/settings/api-keys', { name: newKeyName });
      // Backend returns { id, name, apiKey, createdAt, expiresAt, ... }
      setNewKeySecret(response.data.apiKey);
      // Add the new key to the list (transform to match frontend interface)
      setApiKeys([...apiKeys, {
        id: response.data.id,
        name: response.data.name,
        prefix: 'swarm_****',
        lastUsed: null,
        createdAt: response.data.createdAt,
        expiresAt: response.data.expiresAt,
      }]);
    } catch (error) {
      console.error('Create API key error:', error);
      toast.error('Failed to create API key');
      setShowCreateKeyModal(false);
    } finally {
      setCreateKeyLoading(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    try {
      await api.delete(`/settings/api-keys/${keyId}`);
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
      toast.success('API key revoked successfully');
    } catch (error) {
      console.error('Revoke API key error:', error);
      toast.error('Failed to revoke API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return formatDateTime(dateString);
  };

  const getDeviceIcon = (device: string) => {
    if (device.toLowerCase().includes('iphone') || device.toLowerCase().includes('android')) {
      return <Smartphone className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
  };

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card>
        <CardHeader
          title="Change Password"
          subtitle="Update your password to keep your account secure"
        />
        <CardBody>
          <div className="space-y-4">
            <Input
              label="Current Password"
              type={showPasswords.current ? 'text' : 'password'}
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
              placeholder="Enter current password"
              iconLeft={<Lock className="w-4 h-4" />}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                  className="text-gray-400 hover:text-white"
                >
                  {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={passwordErrors.currentPassword}
            />

            <Input
              label="New Password"
              type={showPasswords.new ? 'text' : 'password'}
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
              placeholder="Enter new password"
              iconLeft={<Lock className="w-4 h-4" />}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                  className="text-gray-400 hover:text-white"
                >
                  {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={passwordErrors.newPassword}
              helperText="Must be at least 8 characters with uppercase and number"
            />

            <Input
              label="Confirm New Password"
              type={showPasswords.confirm ? 'text' : 'password'}
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
              placeholder="Confirm new password"
              iconLeft={<Lock className="w-4 h-4" />}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                  className="text-gray-400 hover:text-white"
                >
                  {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={passwordErrors.confirmPassword}
            />
          </div>
        </CardBody>
        <CardFooter>
          <Button
            variant="primary"
            onClick={handlePasswordChange}
            loading={passwordLoading}
            disabled={passwordLoading}
          >
            Update Password
          </Button>
        </CardFooter>
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader
          title="Two-Factor Authentication"
          subtitle="Add an extra layer of security to your account"
        />
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                twoFactorEnabled ? 'bg-emerald-500/20' : 'bg-slate-700'
              )}>
                <Shield className={cn(
                  'w-5 h-5',
                  twoFactorEnabled ? 'text-emerald-400' : 'text-gray-400'
                )} />
              </div>
              <div>
                <p className="text-white font-medium">Authenticator App</p>
                <p className="text-sm text-gray-400">
                  {twoFactorEnabled
                    ? 'Enabled - Your account is protected'
                    : 'Use an app like Google Authenticator or Authy'}
                </p>
              </div>
            </div>
            <Button
              variant={twoFactorEnabled ? 'danger' : 'primary'}
              size="sm"
              onClick={handleToggle2FA}
              loading={twoFactorLoading}
            >
              {twoFactorEnabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader
          title="Active Sessions"
          subtitle="Manage devices where you're logged in"
          action={
            sessions.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevokeAllSessions}
                className="text-red-400 hover:text-red-300"
              >
                Revoke All Others
              </Button>
            )
          }
        />
        <CardBody noPadding>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-gray-400">
                      {getDeviceIcon(session.device)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium">{session.device}</p>
                        {session.isCurrent && (
                          <Badge variant="success" size="sm">Current</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">
                        {session.browser} - {session.location}
                      </p>
                      <p className="text-xs text-gray-500">
                        Last active: {formatDate(session.lastActive)}
                      </p>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeSession(session.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader
          title="API Keys"
          subtitle="Manage your API keys for programmatic access"
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateKeyModal(true)}
            >
              Generate Key
            </Button>
          }
        />
        <CardBody noPadding>
          {apiKeysLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No API keys yet</p>
              <p className="text-sm text-gray-500">Generate a key to access the API programmatically</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-gray-400">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{key.name}</p>
                      <p className="text-sm text-gray-400 font-mono">{key.prefix}</p>
                      <p className="text-xs text-gray-500">
                        Created: {formatDate(key.createdAt)} | Last used: {formatDate(key.lastUsed)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => handleRevokeApiKey(key.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 2FA QR Code Modal */}
      <Modal
        open={showQRCode}
        onClose={() => {
          setShowQRCode(false);
          setVerificationCode('');
        }}
        title="Enable Two-Factor Authentication"
        size="md"
      >
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-gray-400 mb-4">
              Scan this QR code with your authenticator app
            </p>
            {qrCodeUrl ? (
              <div className="inline-block p-4 bg-white rounded-lg">
                <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
              </div>
            ) : (
              <div className="inline-block p-4 bg-slate-700 rounded-lg w-56 h-56 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
              </div>
            )}
          </div>

          <div>
            <Input
              label="Verification Code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit code"
              className="text-center tracking-widest text-lg"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                setShowQRCode(false);
                setVerificationCode('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleVerify2FA}
              loading={twoFactorLoading}
              disabled={verificationCode.length !== 6}
            >
              Verify & Enable
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create API Key Modal */}
      <Modal
        open={showCreateKeyModal}
        onClose={() => {
          setShowCreateKeyModal(false);
          setNewKeyName('');
          setNewKeySecret('');
        }}
        title={newKeySecret ? 'API Key Created' : 'Create API Key'}
        size="md"
      >
        {newKeySecret ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 font-medium">Save your API key now</p>
                <p className="text-sm text-amber-300/80">
                  This is the only time you'll see this key. Store it securely.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-700 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">Your API Key</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-white font-mono text-sm break-all">
                  {newKeySecret}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Copy className="w-4 h-4" />}
                  onClick={() => copyToClipboard(newKeySecret)}
                />
              </div>
            </div>

            <Button
              variant="primary"
              fullWidth
              icon={<CheckCircle className="w-4 h-4" />}
              onClick={() => {
                setShowCreateKeyModal(false);
                setNewKeyName('');
                setNewKeySecret('');
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Key Name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g., Production API Key"
              helperText="A descriptive name to identify this key"
            />

            <div className="flex gap-3">
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setShowCreateKeyModal(false);
                  setNewKeyName('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleCreateApiKey}
                loading={createKeyLoading}
                disabled={!newKeyName.trim()}
              >
                Generate Key
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SecuritySettings;
