/**
 * Socket Service — WebSocket connection to SwarmAI backend
 *
 * Connects to wss://{serverUrl}/mobile-agent namespace with API key auth.
 * Auto-reconnects with exponential backoff.
 * Handles heartbeat, event pushing, and incoming commands.
 */
import { io, Socket } from 'socket.io-client';
import { getApiKey } from '../storage/SecureStore';
import { getServerUrl } from '../storage/ConfigStore';
import { MobileEvent, DeviceStatus, MobileAlert, DEFAULT_CONFIG } from '../utils/constants';

type CommandHandler = (command: string, params: Record<string, unknown>, commandId: string) => Promise<unknown>;

class SocketService {
  private socket: Socket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private commandHandler: CommandHandler | null = null;
  private reconnectAttempt = 0;
  private _isConnected = false;
  private onStatusChange: ((connected: boolean) => void) | null = null;
  private onRevoked: (() => void) | null = null;
  private onConfigUpdate: ((config: Record<string, unknown>) => void) | null = null;
  private onAlert: ((alert: MobileAlert) => void) | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  setOnStatusChange(cb: (connected: boolean) => void): void {
    this.onStatusChange = cb;
  }

  setOnRevoked(cb: () => void): void {
    this.onRevoked = cb;
  }

  setOnConfigUpdate(cb: (config: Record<string, unknown>) => void): void {
    this.onConfigUpdate = cb;
  }

  setOnAlert(cb: (alert: MobileAlert) => void): void {
    this.onAlert = cb;
  }

  setCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  async connect(): Promise<void> {
    const serverUrl = await getServerUrl();
    const apiKey = await getApiKey();

    if (!serverUrl || !apiKey) {
      console.warn('[SocketService] Missing serverUrl or apiKey');
      return;
    }

    // Ensure URL has protocol
    const url = serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`;

    this.socket = io(`${url}/mobile-agent`, {
      auth: { apiKey },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: DEFAULT_CONFIG.reconnectBaseMs,
      reconnectionDelayMax: DEFAULT_CONFIG.reconnectMaxMs,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] Connected to /mobile-agent');
      this._isConnected = true;
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      this.onStatusChange?.(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[SocketService] Disconnected: ${reason}`);
      this._isConnected = false;
      this.stopHeartbeat();
      this.onStatusChange?.(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[SocketService] Connection error: ${error.message}`);
      this._isConnected = false;
      this.onStatusChange?.(false);
    });

    this.socket.on('heartbeat:ack', (_data: { timestamp: string }) => {
      // Heartbeat acknowledged — connection is healthy
    });

    this.socket.on('command', async (data: { commandId: string; command: string; params: Record<string, unknown> }) => {
      if (this.commandHandler) {
        try {
          const result = await this.commandHandler(data.command, data.params, data.commandId);
          this.socket?.emit('command:result', { commandId: data.commandId, result });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.socket?.emit('command:result', { commandId: data.commandId, error: message });
        }
      }
    });

    this.socket.on('config:update', (data: { pushConfig: Record<string, unknown> }) => {
      this.onConfigUpdate?.(data.pushConfig);
    });

    this.socket.on('revoked', (_data: { reason: string }) => {
      console.log('[SocketService] Device revoked by server');
      this.disconnect();
      this.onRevoked?.();
    });

    this.socket.on('mobile:alert', (data: MobileAlert) => {
      console.log(`[SocketService] Alert received: ${data.alertType} — ${data.title}`);
      this.onAlert?.(data);
    });
  }

  pushEvents(events: MobileEvent[]): void {
    if (!this.socket?.connected || events.length === 0) return;
    this.socket.emit('mobile:events', { events });
  }

  pushDeviceStatus(status: DeviceStatus): void {
    if (!this.socket?.connected) return;
    this.socket.emit('mobile:device-status', status);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat', { metrics: {} });
      }
    }, DEFAULT_CONFIG.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this._isConnected = false;
    this.onStatusChange?.(false);
  }
}

// Singleton
let instance: SocketService | null = null;

export function getSocketService(): SocketService {
  if (!instance) {
    instance = new SocketService();
  }
  return instance;
}
