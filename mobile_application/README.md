# SwarmAI Mobile Agent

Android companion app that pairs with a SwarmAI server and provides mobile phone monitoring capabilities (SMS, notifications, device status, GPS) to the agentic AI system.

## Architecture

```
Phone App  →  WebSocket (wss://{server}/mobile-agent)  →  SwarmAI Backend
               ├── SMS events                               ├── mobile_events table
               ├── Notification events                      ├── AI tool: queryMobileEvents
               ├── Device status (battery, WiFi)            ├── AI tool: getMobileDeviceStatus
               ├── GPS location updates                     ├── AI tool: getMobileDeviceLocation
               └── Command results (send SMS)               └── AI tool: sendSmsViaDevice
```

## Setup

### Prerequisites
- Node.js 18+
- Java 17 (JDK)
- Android SDK (API 34+)
- Android device or emulator

### Install & Build

```bash
cd mobile_application
npm install

# Start Metro bundler
npm start

# Build and run on connected device
npm run android
```

### Android Permissions Required
- **SMS**: READ_SMS, RECEIVE_SMS, SEND_SMS
- **Phone**: READ_PHONE_STATE
- **Notifications**: NotificationListenerService (system settings toggle)
- **Location**: ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION
- **Network**: ACCESS_NETWORK_STATE, INTERNET
- **Background**: FOREGROUND_SERVICE

## Pairing Flow

1. Open app → Enter SwarmAI server URL (e.g., `agents.northpeak.app`)
2. App verifies server → Shows 6-digit pairing code
3. Go to SwarmAI dashboard → Enter the code
4. App receives API key → Connects via WebSocket
5. Monitoring starts automatically

## Project Structure

```
src/
├── App.tsx                      # Root navigation
├── screens/
│   ├── ServerSetupScreen.tsx    # Server URL input + verify
│   ├── PairingScreen.tsx        # 6-digit code display + polling
│   ├── HomeScreen.tsx           # Connected dashboard
│   └── SettingsScreen.tsx       # Permissions + unpair
├── services/
│   ├── SocketService.ts         # Socket.io client
│   ├── SmsMonitor.ts            # SMS inbox + incoming listener
│   ├── NotificationMonitor.ts   # NotificationListenerService
│   ├── DeviceMonitor.ts         # Battery, network, GPS
│   ├── BackgroundService.ts     # Foreground service orchestrator
│   └── EventBatcher.ts          # Event batching + queue
├── storage/
│   ├── SecureStore.ts           # API key (Android Keystore)
│   └── ConfigStore.ts           # AsyncStorage (settings)
└── utils/
    ├── constants.ts             # Types, event types, config
    └── permissions.ts           # Permission request helpers
```

## Backend API

All mobile agent endpoints live at `/api/mobile-agents/`:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /verify` | None | Verify SwarmAI server |
| `POST /pair/register-code` | None | Get 6-digit code |
| `GET /pair/status/:id` | None | Poll pairing result |
| `POST /pair/validate` | JWT | Dashboard validates code |
| `GET /devices` | JWT | List paired devices |
| `DELETE /devices/:id` | JWT | Unpair device |
| `GET /events` | JWT | Query mobile events |
| `GET /events/summary` | JWT | Event counts |
| `POST /devices/:id/command` | JWT | Send command to device |

## AI Tools Available

When a mobile device is paired, the agentic AI gains these tools:
- **queryMobileEvents** — Search SMS, notifications, calls, GPS by type/sender/keyword
- **getMobileDeviceStatus** — Live battery, connectivity, storage
- **getMobileDeviceLocation** — GPS coordinates (live or historical)
- **sendSmsViaDevice** — Send SMS through the phone's SIM
- **markMobileEventRead** — Mark events as processed
