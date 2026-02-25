import React, { useState, useEffect } from 'react';
import {
  Database,
  Server,
  HardDrive,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Clock,
  Cpu,
  MemoryStick,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Service health status interface
 */
interface ServiceHealth {
  name: string;
  type: 'database' | 'cache' | 'vector' | 'storage';
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  latency?: number;
  version?: string;
  details?: string;
  metrics?: {
    memory?: string;
    connections?: number;
    size?: string;
    uptime?: string;
  };
}

/**
 * Status badge component
 */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const statusConfig = {
    healthy: { variant: 'success', icon: CheckCircle, label: 'Healthy' },
    degraded: { variant: 'warning', icon: AlertTriangle, label: 'Degraded' },
    offline: { variant: 'error', icon: XCircle, label: 'Offline' },
    unknown: { variant: 'default', icon: AlertTriangle, label: 'Unknown' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant as any} className="flex items-center gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
};

/**
 * Service icon mapping
 */
const ServiceIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
  const icons = {
    database: Database,
    cache: MemoryStick,
    vector: Cpu,
    storage: HardDrive,
  };
  const Icon = icons[type as keyof typeof icons] || Server;
  return <Icon className={className} />;
};

/**
 * SystemInfrastructureSettings Component
 *
 * Displays infrastructure health and metrics:
 * - SQLite database status
 * - Redis cache status
 * - Qdrant vector database status
 * - File storage status
 */
export const SystemInfrastructureSettings: React.FC = () => {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealthStatus = async () => {
    try {
      const response = await api.get('/health/detailed');
      const health = response.data;

      // Map to our service format
      const serviceList: ServiceHealth[] = [
        {
          name: 'SQLite Database',
          type: 'database',
          status: health.database?.status || 'unknown',
          latency: health.database?.latency,
          version: health.database?.version,
          details: health.database?.details,
          metrics: {
            size: health.database?.size,
            connections: health.database?.connections,
          },
        },
        {
          name: 'Redis Cache',
          type: 'cache',
          status: health.redis?.status || 'unknown',
          latency: health.redis?.latency,
          version: health.redis?.version,
          details: health.redis?.details,
          metrics: {
            memory: health.redis?.memory,
            connections: health.redis?.connections,
            uptime: health.redis?.uptime,
          },
        },
        {
          name: 'Qdrant Vector DB',
          type: 'vector',
          status: health.qdrant?.status || 'unknown',
          latency: health.qdrant?.latency,
          version: health.qdrant?.version,
          details: health.qdrant?.details,
          metrics: {
            size: health.qdrant?.collectionsSize,
          },
        },
        {
          name: 'File Storage',
          type: 'storage',
          status: health.storage?.status || 'healthy',
          details: health.storage?.details,
          metrics: {
            size: health.storage?.size,
          },
        },
      ];

      setServices(serviceList);
    } catch (error) {
      console.error('Failed to fetch health status:', error);
      // Set default offline status if fetch fails
      setServices([
        { name: 'SQLite Database', type: 'database', status: 'unknown' },
        { name: 'Redis Cache', type: 'cache', status: 'unknown' },
        { name: 'Qdrant Vector DB', type: 'vector', status: 'unknown' },
        { name: 'File Storage', type: 'storage', status: 'unknown' },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealthStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHealthStatus();
  };

  const handleClearCache = async () => {
    try {
      await api.post('/admin/cache/clear');
      toast.success('Cache cleared successfully');
      fetchHealthStatus();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      toast.error('Failed to clear cache');
    }
  };

  const handleOptimizeDB = async () => {
    try {
      await api.post('/admin/database/optimize');
      toast.success('Database optimization started');
    } catch (error) {
      console.error('Failed to optimize database:', error);
      toast.error('Failed to optimize database');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const overallHealth = services.every((s) => s.status === 'healthy')
    ? 'healthy'
    : services.some((s) => s.status === 'offline')
    ? 'degraded'
    : 'degraded';

  return (
    <div className="space-y-6">
      {/* Overall Health */}
      <Card
        variant="bordered"
        className={cn(
          'border-l-4',
          overallHealth === 'healthy'
            ? 'border-l-emerald-500 bg-emerald-500/10'
            : 'border-l-amber-500 bg-amber-500/10'
        )}
      >
        <CardBody className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity
                className={cn(
                  'w-5 h-5',
                  overallHealth === 'healthy' ? 'text-emerald-400' : 'text-amber-400'
                )}
              />
              <div>
                <span
                  className={cn(
                    'font-medium',
                    overallHealth === 'healthy' ? 'text-emerald-300' : 'text-amber-300'
                  )}
                >
                  System Status: {overallHealth === 'healthy' ? 'All Systems Operational' : 'Some Services Degraded'}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={handleRefresh}
              loading={refreshing}
            >
              Refresh
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((service) => (
          <Card key={service.name} variant="pressed">
            <CardBody>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      service.status === 'healthy'
                        ? 'bg-emerald-500/20'
                        : service.status === 'degraded'
                        ? 'bg-amber-500/20'
                        : 'bg-red-500/20'
                    )}
                  >
                    <ServiceIcon
                      type={service.type}
                      className={cn(
                        'w-5 h-5',
                        service.status === 'healthy'
                          ? 'text-emerald-400'
                          : service.status === 'degraded'
                          ? 'text-amber-400'
                          : 'text-red-400'
                      )}
                    />
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{service.name}</h4>
                    {service.version && (
                      <p className="text-xs text-gray-500">v{service.version}</p>
                    )}
                  </div>
                </div>
                <StatusBadge status={service.status} />
              </div>

              {/* Metrics */}
              <div className="space-y-2">
                {service.latency !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Latency</span>
                    <span className="text-white">{service.latency}ms</span>
                  </div>
                )}
                {service.metrics?.memory && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Memory</span>
                    <span className="text-white">{service.metrics.memory}</span>
                  </div>
                )}
                {service.metrics?.connections !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Connections</span>
                    <span className="text-white">{service.metrics.connections}</span>
                  </div>
                )}
                {service.metrics?.size && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Size</span>
                    <span className="text-white">{service.metrics.size}</span>
                  </div>
                )}
                {service.metrics?.uptime && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Uptime</span>
                    <span className="text-white">{service.metrics.uptime}</span>
                  </div>
                )}
                {service.details && (
                  <p className="text-xs text-gray-500 mt-2">{service.details}</p>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Maintenance Actions */}
      <Card variant="pressed">
        <CardHeader
          title="Maintenance Actions"
          subtitle="Database optimization and cache management"
        />
        <CardBody>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={handleClearCache}
            >
              Clear Cache
            </Button>
            <Button
              variant="outline"
              icon={<Database className="w-4 h-4" />}
              onClick={handleOptimizeDB}
            >
              Optimize Database
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            These actions are safe to run but may temporarily affect performance.
            Clear cache to free memory. Optimize database to improve query performance.
          </p>
        </CardBody>
      </Card>
    </div>
  );
};

export default SystemInfrastructureSettings;
