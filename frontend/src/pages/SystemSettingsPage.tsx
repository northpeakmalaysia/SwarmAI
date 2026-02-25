import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Cloud,
  Share2,
  Database,
  Shield,
  Server,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { Tabs } from '../components/common/Tabs';
import { Card, CardBody } from '../components/common/Card';
import toast from 'react-hot-toast';
import {
  SystemAISettings,
  SystemPlatformSettings,
  SystemSwarmSettings,
  SystemInfrastructureSettings,
  SystemLogsSettings,
} from '../components/system-settings';

/**
 * SystemSettingsPage Component
 *
 * Admin-only page for managing system-wide settings:
 * - AI Providers (system-wide API keys and configuration)
 * - Platform Connections (WhatsApp, Telegram, Email)
 * - Swarm Configuration (default swarm behavior)
 * - Infrastructure (database, Redis, Qdrant health)
 * - System Logs (unified log viewer with filtering and export)
 *
 * Only accessible by users with admin role or isSuperuser flag.
 */
export default function SystemSettingsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Check admin access
  const isAdmin = user?.role === 'admin' || user?.isSuperuser;

  useEffect(() => {
    if (!isAdmin) {
      toast.error('Access denied. Admin privileges required.');
      navigate('/settings');
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="page-container-narrow">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="page-title">System Settings</h1>
            <p className="page-subtitle">
              Configure system-wide settings (Admin only)
            </p>
          </div>
        </div>
      </div>

      {/* Admin Warning Banner */}
      <Card variant="bordered" className="mb-6 border-amber-500/50 bg-amber-500/10">
        <CardBody className="py-3">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-200">
              These settings affect all users. Changes here will apply system-wide.
            </p>
          </div>
        </CardBody>
      </Card>

      <Tabs defaultValue="ai-providers">
        <Tabs.List>
          <Tabs.Trigger value="ai-providers" icon={<Cloud className="w-4 h-4" />}>
            AI Providers
          </Tabs.Trigger>
          <Tabs.Trigger value="platforms" icon={<Share2 className="w-4 h-4" />}>
            Platforms
          </Tabs.Trigger>
          <Tabs.Trigger value="swarm" icon={<Server className="w-4 h-4" />}>
            Swarm Config
          </Tabs.Trigger>
          <Tabs.Trigger value="infrastructure" icon={<Database className="w-4 h-4" />}>
            Infrastructure
          </Tabs.Trigger>
          <Tabs.Trigger value="logs" icon={<FileText className="w-4 h-4" />}>
            Logs
          </Tabs.Trigger>
        </Tabs.List>

        <div className="mt-6">
          <Tabs.Content value="ai-providers">
            <SystemAISettings />
          </Tabs.Content>

          <Tabs.Content value="platforms">
            <SystemPlatformSettings />
          </Tabs.Content>

          <Tabs.Content value="swarm">
            <SystemSwarmSettings />
          </Tabs.Content>

          <Tabs.Content value="infrastructure">
            <SystemInfrastructureSettings />
          </Tabs.Content>

          <Tabs.Content value="logs">
            <SystemLogsSettings />
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  );
}
