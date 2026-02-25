import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, XCircle, Loader2, Smartphone } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { websocket } from '../../services/websocket';
import { api } from '../../services/api';

/**
 * QR Code status states
 */
export type QRStatus = 'loading' | 'ready' | 'scanning' | 'success' | 'error' | 'expired';

export interface QRCodeDisplayProps {
  /** Agent ID for WebSocket subscription */
  agentId?: string;
  /** Initial QR code data (base64 or URL) */
  initialQRData?: string;
  /** Callback when QR is successfully scanned */
  onSuccess?: () => void;
  /** Callback when QR expires or errors */
  onError?: (error: string) => void;
  /** Callback to request new QR code */
  onRefresh?: () => Promise<string | void>;
  /** Status text override */
  statusText?: string;
  /** Size of the QR code display */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

/**
 * Size configuration
 */
const sizeConfig: Record<'sm' | 'md' | 'lg', { container: string; qr: string; icon: string }> = {
  sm: {
    container: 'w-48 h-48',
    qr: 'w-40 h-40',
    icon: 'w-12 h-12',
  },
  md: {
    container: 'w-64 h-64',
    qr: 'w-56 h-56',
    icon: 'w-16 h-16',
  },
  lg: {
    container: 'w-80 h-80',
    qr: 'w-72 h-72',
    icon: 'w-20 h-20',
  },
};

/**
 * Status configuration
 */
const statusMessages: Record<QRStatus, string> = {
  loading: 'Generating QR code...',
  ready: 'Scan with WhatsApp',
  scanning: 'Scanning...',
  success: 'Successfully connected!',
  error: 'Connection failed',
  expired: 'QR code expired',
};

/**
 * QRCodeDisplay - Renders QR code for WhatsApp connection with real-time updates
 *
 * @example
 * ```tsx
 * <QRCodeDisplay
 *   agentId={agent.id}
 *   onSuccess={() => toast.success('Connected!')}
 *   onRefresh={async () => await api.post(`/agents/${agent.id}/qr`)}
 * />
 * ```
 */
export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  agentId,
  initialQRData,
  onSuccess,
  onError,
  onRefresh,
  statusText,
  size = 'md',
  className,
}) => {
  const [qrData, setQrData] = useState<string | null>(initialQRData || null);
  const [status, setStatus] = useState<QRStatus>(initialQRData ? 'ready' : 'loading');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const sizes = sizeConfig[size];

  // Debug logging for QR display state
  console.log('[QRCodeDisplay] Render state:', {
    agentId,
    hasInitialQRData: !!initialQRData,
    initialQRDataLength: initialQRData?.length,
    hasQrData: !!qrData,
    qrDataLength: qrData?.length,
    status
  });

  /**
   * Sync internal state when initialQRData prop changes
   */
  useEffect(() => {
    if (initialQRData && initialQRData !== qrData) {
      setQrData(initialQRData);
      setStatus('ready');
    }
  }, [initialQRData, qrData]);

  /**
   * Handle QR code refresh
   */
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;

    setIsRefreshing(true);
    setStatus('loading');

    try {
      const newQRData = await onRefresh();
      if (newQRData) {
        setQrData(newQRData);
        setStatus('ready');
      }
    } catch (error) {
      setStatus('error');
      onError?.('Failed to refresh QR code');
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, onError]);

  /**
   * Subscribe to WebSocket QR updates with polling fallback
   */
  useEffect(() => {
    if (!agentId) return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let qrReceived = false;

    console.log('[QRCodeDisplay] Starting subscription for agent:', agentId);
    console.log('[QRCodeDisplay] WebSocket connected:', websocket.isConnected);

    // Subscribe to agent for QR updates
    websocket.subscribeToAgent(agentId);

    // Handle QR code updates
    // Server wraps data in { data: {...}, timestamp } structure
    const unsubscribeQR = websocket.subscribe<{
      data: {
        agentId: string;
        qrData?: string;
        status: QRStatus;
        error?: string;
      };
      timestamp: string;
    }>('agent:qr', (event) => {
      const data = event.data || event; // Handle both wrapped and unwrapped formats
      console.log('[QRCodeDisplay] Received agent:qr event:', { agentId: data.agentId, status: data.status, hasQR: !!data.qrData });
      if (data.agentId !== agentId) return;

      qrReceived = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      if (data.qrData) {
        setQrData(data.qrData);
      }
      if (data.status) {
        setStatus(data.status);
      }

      if (data.status === 'success') {
        onSuccess?.();
      } else if (data.status === 'error' && data.error) {
        onError?.(data.error);
      }
    });

    // Handle platform status changes
    // Server wraps data in { data: {...}, timestamp } structure
    const unsubscribePlatform = websocket.subscribe<{
      data: {
        agentId: string;
        platform: string;
        connected: boolean;
        status?: string;
      };
      timestamp: string;
    }>('agent:platform_status', (event) => {
      const data = event.data || event; // Handle both wrapped and unwrapped formats
      console.log('[QRCodeDisplay] Received agent:platform_status event:', data);
      if (data.agentId !== agentId) return;

      qrReceived = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      // Check both connected flag and status
      if (data.connected || data.status === 'connected') {
        console.log('[QRCodeDisplay] Platform connected! Setting status to success');
        setStatus('success');
        onSuccess?.();
      }
    });

    // Polling fallback: if no QR received via WebSocket after 3 seconds, start polling
    const pollFallbackTimeout = setTimeout(() => {
      if (!qrReceived) {
        console.log('[QRCodeDisplay] No WebSocket QR received, starting polling fallback');
        pollInterval = setInterval(async () => {
          try {
            // Stop polling if already connected via WebSocket (qrReceived flag is set by WebSocket handler)
            if (qrReceived) {
              console.log('[QRCodeDisplay] Already connected via WebSocket, stopping poll');
              if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
              }
              return;
            }

            const response = await api.get<{ qrCode?: string; status?: string }>(`/platforms/${agentId}/whatsapp/qr`);
            console.log('[QRCodeDisplay] Poll response:', { status: response.status, hasQR: !!response.qrCode });
            // IMPORTANT: Check status FIRST - if already connected, ignore any stale QR codes
            if (response.status === 'connected') {
              console.log('[QRCodeDisplay] Poll detected connected status! Setting success');
              qrReceived = true;
              setStatus('success');
              onSuccess?.();
              if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
              }
            } else if (response.qrCode) {
              // Only show QR code if NOT connected (status check above takes priority)
              qrReceived = true;
              setQrData(response.qrCode);
              // Don't overwrite 'success' status if already connected via WebSocket
              setStatus((currentStatus) => currentStatus === 'success' ? 'success' : 'ready');
              if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
              }
            }
          } catch (err) {
            console.error('[QRCodeDisplay] Polling error:', err);
          }
        }, 2000);
      }
    }, 3000);

    return () => {
      unsubscribeQR();
      unsubscribePlatform();
      websocket.unsubscribeFromAgent(agentId);
      clearTimeout(pollFallbackTimeout);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [agentId, onSuccess, onError]);

  /**
   * Render status icon overlay
   */
  const renderStatusOverlay = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-xl">
            <Loader2 className={cn(sizes.icon, 'text-sky-400 animate-spin')} />
          </div>
        );
      case 'scanning':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/60 rounded-xl">
            <div className="text-center">
              <Smartphone className={cn(sizes.icon, 'text-amber-400 mx-auto animate-pulse')} />
              <p className="text-sm text-amber-400 mt-2">Scanning...</p>
            </div>
          </div>
        );
      case 'success':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 rounded-xl">
            <CheckCircle className={cn(sizes.icon, 'text-emerald-400')} />
          </div>
        );
      case 'error':
      case 'expired':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 rounded-xl">
            <div className="text-center">
              <XCircle className={cn(sizes.icon, 'text-red-400 mx-auto')} />
              <p className="text-sm text-red-400 mt-2">
                {status === 'expired' ? 'QR Expired' : 'Failed'}
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* QR Code container */}
      <div
        className={cn(
          'relative rounded-xl border-2 border-slate-600 bg-white p-2 mb-4',
          sizes.container
        )}
      >
        {/* QR Code image */}
        {qrData ? (
          <img
            src={qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`}
            alt="WhatsApp QR Code"
            className={cn(sizes.qr, 'rounded-lg')}
          />
        ) : (
          <div
            className={cn(
              sizes.qr,
              'flex items-center justify-center bg-slate-100 rounded-lg'
            )}
          >
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        )}

        {/* Status overlay */}
        {renderStatusOverlay()}
      </div>

      {/* Status text */}
      <p
        className={cn(
          'text-sm font-medium mb-3',
          status === 'success' && 'text-emerald-400',
          status === 'error' && 'text-red-400',
          status === 'expired' && 'text-amber-400',
          (status === 'loading' || status === 'ready' || status === 'scanning') && 'text-gray-400'
        )}
      >
        {statusText || statusMessages[status]}
      </p>

      {/* Refresh button */}
      {(status === 'ready' || status === 'expired' || status === 'error') && onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          loading={isRefreshing}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          {status === 'expired' ? 'Get New QR' : 'Refresh'}
        </Button>
      )}

      {/* Instructions */}
      {status === 'ready' && (
        <div className="mt-4 text-center text-xs text-gray-500 max-w-xs">
          <p>1. Open WhatsApp on your phone</p>
          <p>2. Go to Settings &gt; Linked Devices</p>
          <p>3. Tap &quot;Link a Device&quot; and scan this QR code</p>
        </div>
      )}
    </div>
  );
};

QRCodeDisplay.displayName = 'QRCodeDisplay';

export default QRCodeDisplay;
