# WhatsBots Process Flow Documentation

## Complete Flow: Agent Creation → Message Receiving

This document details the comprehensive process flow for WhatsApp and Telegram platforms from agent creation until message receiving.

---

## Table of Contents

1. [Overview Architecture](#overview-architecture)
2. [WhatsApp Process Flow](#whatsapp-process-flow)
3. [Telegram Bot Process Flow](#telegram-bot-process-flow)
4. [Telegram User (MTProto) Process Flow](#telegram-user-mtproto-process-flow)
5. [WebSocket Communication](#websocket-communication)
6. [Database Schema](#database-schema)
7. [Key Files Reference](#key-files-reference)

---

## Overview Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Agent List   │  │ QR Scanner   │  │ Chat Panel   │  │ Settings     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                              ▲                                               │
│                              │ WebSocket (ws://localhost:3211)              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    WebSocket Server (Port 3211)                      │   │
│  │  - Broadcasts: agentMessage, agentQR, agentStatusChanged            │   │
│  │  - Receives: getAgents, requestQR, ping                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Agent Manager                                │   │
│  │  - createAgent()  - deleteAgent()  - getAllAgents()                 │   │
│  │  - setupAgentMessageHandler()                                        │   │
│  └───────────────────────────┬─────────────────────────────────────────┘   │
│                              │                                               │
│  ┌───────────────────────────┼─────────────────────────────────────────┐   │
│  │                    Platform Factory                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ WhatsApp     │  │ Telegram Bot │  │ Telegram User│               │   │
│  │  │ Client       │  │ Client       │  │ Client       │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                    BACKEND (Express.js + Node.js)                           │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                              ▼                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │   SQLite     │  │    Redis     │  │  File System │                      │
│  │  (Messages)  │  │   (Cache)    │  │  (Sessions)  │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
│                         DATA LAYER                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## WhatsApp Process Flow

### Phase 1: Agent Creation

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Frontend - User Initiates Agent Creation                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User clicks "Create Agent" button                                           │
│      ↓                                                                       │
│  Frontend sends POST /api/agents                                             │
│  {                                                                           │
│    "name": "Support Agent",                                                  │
│    "phoneNumber": "+1234567890",                                             │
│    "platform": "whatsapp",                                                   │
│    "autoStart": true                                                         │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Backend - Agent Controller Creates Agent Record                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/controllers/agentController.cjs (Lines 19-76)                   │
│                                                                              │
│  1. Generate unique agentId using uuidv4()                                   │
│  2. Create agent directory: /data/agents/{agentId}/                          │
│  3. Save config to /data/agents/{agentId}/config.json:                       │
│     {                                                                        │
│       "id": "uuid-string",                                                   │
│       "name": "Support Agent",                                               │
│       "phoneNumber": "+1234567890",                                          │
│       "platform": "whatsapp",                                                │
│       "status": "disconnected",                                              │
│       "createdAt": "2026-01-24T...",                                         │
│       "browserId": "from-x-browser-id-header"                                │
│     }                                                                        │
│  4. If autoStart=true → Call agentManager.createAgent()                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Agent Manager - Initialize Platform Client                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/agents/agentManager.cjs (Lines 410-574)                         │
│                                                                              │
│  createAgent(agentId, agentData) {                                           │
│    1. Check if agent already exists in this.agents Map                       │
│    2. Check subscription limits (not suspended)                              │
│    3. Create directory structure:                                            │
│       /data/agents/{agentId}/                                                │
│       /data/agents/{agentId}/media/                                          │
│       /data/agents/{agentId}/logs/                                           │
│                                                                              │
│    4. Create Platform Client via Factory:                                    │
│       platformClient = PlatformFactory.createClient('whatsapp', agentId, {   │
│         authPath: '.wwebjs_auth',                                            │
│         ...agentData                                                         │
│       });                                                                    │
│                                                                              │
│    5. Create agent object:                                                   │
│       {                                                                      │
│         id: agentId,                                                         │
│         platformClient: WhatsAppClient,                                      │
│         platform: 'whatsapp',                                                │
│         data: agentData,                                                     │
│         activeChats: new Set(),                                              │
│         statistics: { messagesReceived: 0, ... }                             │
│       }                                                                      │
│                                                                              │
│    6. Store in this.agents Map                                               │
│    7. Initialize platform client: await platformClient.initialize()          │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: QR Code Generation & Authentication

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: WhatsApp Client - Initialize and Generate QR                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/whatsappClient.cjs (Lines 40-100)                     │
│                                                                              │
│  async initialize() {                                                        │
│    this.setConnectionState('connecting');                                    │
│                                                                              │
│    // Create WhatsApp Web.js client                                          │
│    this.client = new Client({                                                │
│      authStrategy: new LocalAuth({                                           │
│        clientId: this.agentId,                                               │
│        dataPath: '.wwebjs_auth'  // Session storage                          │
│      }),                                                                     │
│      puppeteer: {                                                            │
│        headless: true,                                                       │
│        args: ['--no-sandbox', '--disable-setuid-sandbox']                    │
│      }                                                                       │
│    });                                                                       │
│                                                                              │
│    this._attachEventHandlers();  // Register all event listeners             │
│    await this.client.initialize();  // Start Puppeteer browser               │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: WhatsApp Web.js - QR Code Event                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/whatsappClient.cjs (Lines 110-125)                    │
│                                                                              │
│  // WhatsApp Web.js generates QR code                                        │
│  this.client.on('qr', async (qr) => {                                        │
│    // Convert QR string to base64 image                                      │
│    const qrImage = await qrcode.toDataURL(qr);                               │
│    this.currentQR = qrImage.replace(/^data:image\/png;base64,/, '');         │
│                                                                              │
│    this.setConnectionState('authenticating');                                │
│                                                                              │
│    // Emit QR event (bubbles up to AgentManager)                             │
│    this.emit('qr', { qr: this.currentQR });                                  │
│  });                                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: Agent Manager - Relay QR to WebSocket                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/indexMultiAgentFull.cjs (Lines 780-800)                         │
│                                                                              │
│  // AgentManager listens to platform client events                           │
│  platformClient.on('qr', ({ qr }) => {                                       │
│    // Broadcast QR to all WebSocket clients with matching browserId          │
│    broadcast({                                                               │
│      type: "agentQR",                                                        │
│      agentId: agentId,                                                       │
│      qr: qr  // Base64 encoded PNG                                           │
│    }, agent.browserId);                                                      │
│  });                                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: Frontend - Display QR Code                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: src/components/agents/QRCodeDisplay.tsx                                │
│                                                                              │
│  // WebSocket receives message                                               │
│  ws.onmessage = (event) => {                                                 │
│    const data = JSON.parse(event.data);                                      │
│                                                                              │
│    if (data.type === 'agentQR') {                                            │
│      setQrCode(data.qr);                                                     │
│      // Display QR image for user to scan                                    │
│      <img src={`data:image/png;base64,${qrCode}`} />                         │
│    }                                                                         │
│  };                                                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 8: User Scans QR Code with WhatsApp Mobile                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User opens WhatsApp on phone                                                │
│      ↓                                                                       │
│  Settings → Linked Devices → Link a Device                                   │
│      ↓                                                                       │
│  Scans QR code displayed on screen                                           │
│      ↓                                                                       │
│  WhatsApp server validates and creates session                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 9: WhatsApp Client - Authentication Success                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/whatsappClient.cjs (Lines 130-145)                    │
│                                                                              │
│  this.client.on('authenticated', () => {                                     │
│    console.log(`[${this.agentId}] WhatsApp authenticated`);                  │
│    this.currentQR = null;  // Clear QR                                       │
│    this.setConnectionState('authenticated');                                 │
│    this.emit('authenticated');                                               │
│  });                                                                         │
│                                                                              │
│  // Session saved to: .wwebjs_auth/{agentId}/                                │
│  // Files: Default/IndexedDB, Default/Local Storage, etc.                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 10: WhatsApp Client - Ready State                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/whatsappClient.cjs (Lines 150-170)                    │
│                                                                              │
│  this.client.on('ready', async () => {                                       │
│    // Get WhatsApp info (phone number, name)                                 │
│    const info = this.client.info;                                            │
│    this.info = {                                                             │
│      phoneNumber: info.wid.user,                                             │
│      platform: 'whatsapp',                                                   │
│      name: info.pushname                                                     │
│    };                                                                        │
│                                                                              │
│    this.setConnectionState('connected');                                     │
│    this.emit('ready', { info: this.info });                                  │
│  });                                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 11: WebSocket - Broadcast Status Change                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/indexMultiAgentFull.cjs (Lines 820-840)                         │
│                                                                              │
│  platformClient.on('ready', ({ info }) => {                                  │
│    // Update agent status in memory                                          │
│    agent.status = 'ready';                                                   │
│    agent.info = info;                                                        │
│                                                                              │
│    // Broadcast to frontend                                                  │
│    broadcast({                                                               │
│      type: "agentStatusChanged",                                             │
│      agentId: agentId,                                                       │
│      previousStatus: "authenticating",                                       │
│      newStatus: "ready",                                                     │
│      info: info,                                                             │
│      timestamp: Date.now()                                                   │
│    }, agent.browserId);                                                      │
│                                                                              │
│    // Update database                                                        │
│    agentDataService.updateAgentStatus(agentId, 'ready');                     │
│  });                                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Message Receiving

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 12: WhatsApp - Incoming Message Event                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/whatsappClient.cjs (Lines 180-215)                    │
│                                                                              │
│  this.client.on('message', async (message) => {                              │
│    // Skip messages from self (unless explicitly enabled)                    │
│    if (message.fromMe) return;                                               │
│                                                                              │
│    // Normalize message to platform-agnostic format                          │
│    const normalizedMessage = this.normalizeMessage(message);                 │
│                                                                              │
│    // Emit message event                                                     │
│    this.emit('message', normalizedMessage);                                  │
│  });                                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 13: Message Normalization                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/whatsappClient.cjs (Lines 216-251)                    │
│                                                                              │
│  normalizeMessage(message) {                                                 │
│    return {                                                                  │
│      id: message.id._serialized,          // Unique message ID               │
│      platform: 'whatsapp',                 // Platform identifier            │
│      chatId: message.from,                 // Chat/conversation ID           │
│      senderId: message.author || message.from,  // Sender ID                 │
│      senderName: message._data?.notifyName,     // Display name              │
│      body: message.body,                   // Message text                   │
│      timestamp: message.timestamp,         // Unix timestamp                 │
│      type: this._mapMessageType(message.type),  // text/image/video/etc      │
│      hasMedia: message.hasMedia,           // Has attachment                 │
│      fromMe: message.fromMe,               // Sent by self                   │
│      replyTo: message.hasQuotedMsg ? {     // Quoted message                 │
│        id: quotedId,                                                         │
│        body: quotedBody                                                      │
│      } : null,                                                               │
│      meta: {                                                                 │
│        isGroup: message.from.endsWith('@g.us'),  // Is group message         │
│        isStatus: message.isStatus          // Is status update               │
│      }                                                                       │
│    };                                                                        │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 14: Agent Manager - Message Handler                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/indexMultiAgentFull.cjs (Lines 1100-1200)                       │
│                                                                              │
│  agentManager.on("agentMessage", async ({ agentId, message }) => {           │
│    const agent = agentManager.getAgent(agentId);                             │
│                                                                              │
│    // Build complete message data                                            │
│    const messageData = {                                                     │
│      ...message,                                                             │
│      agentId: agentId,                                                       │
│      agentPhoneNumber: agent.phoneNumber,                                    │
│      receivedAt: Date.now()                                                  │
│    };                                                                        │
│                                                                              │
│    // Update statistics                                                      │
│    agent.statistics.messagesReceived++;                                      │
│    agent.activeChats.add(message.chatId);                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 15: Media Download (if hasMedia)                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/indexMultiAgentFull.cjs (Lines 1210-1280)                       │
│                                                                              │
│  if (message.hasMedia) {                                                     │
│    try {                                                                     │
│      // Download media from WhatsApp                                         │
│      const media = await platformClient.downloadMedia(message);              │
│                                                                              │
│      // Cache in Redis for quick retrieval                                   │
│      await redisService.setMedia(                                            │
│        `agent:${agentId}:media:${message.id}`,                               │
│        media.data,                                                           │
│        3600  // 1 hour TTL                                                   │
│      );                                                                      │
│                                                                              │
│      messageData.mediaData = media.data;                                     │
│      messageData.mediaMimetype = media.mimetype;                             │
│      messageData.mediaFilename = media.filename;                             │
│      messageData.mediaCached = true;                                         │
│    } catch (err) {                                                           │
│      console.error('Media download failed:', err);                           │
│    }                                                                         │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 16: Profile Picture Update                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/indexMultiAgentFull.cjs (Lines 1290-1320)                       │
│                                                                              │
│  // Check if profile picture changed                                         │
│  const cachedPic = await redisService.get(                                   │
│    `agent:${agentId}:profilepic:${message.senderId}`                         │
│  );                                                                          │
│                                                                              │
│  const currentPic = await platformClient.getProfilePicUrl(message.senderId); │
│                                                                              │
│  if (currentPic !== cachedPic) {                                             │
│    // Update cache                                                           │
│    await redisService.set(                                                   │
│      `agent:${agentId}:profilepic:${message.senderId}`,                      │
│      currentPic,                                                             │
│      86400  // 24 hour TTL                                                   │
│    );                                                                        │
│                                                                              │
│    // Add to message data                                                    │
│    messageData.profilePicture = currentPic;                                  │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 17: Database Storage (SQLite)                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/services/agentDataService.cjs                                   │
│                                                                              │
│  INSERT INTO messages (                                                      │
│    agent_id,                                                                 │
│    agent_phone_number,                                                       │
│    chat_id,                                                                  │
│    message_id,                                                               │
│    from_me,                                                                  │
│    sender_number,                                                            │
│    sender_name,                                                              │
│    body,                                                                     │
│    message_type,                                                             │
│    media_url,                                                                │
│    timestamp,                                                                │
│    metadata                                                                  │
│  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 18: Redis Caching                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/services/redisService.cjs                                       │
│                                                                              │
│  // Cache message for quick retrieval                                        │
│  await redisService.lpush(                                                   │
│    `agent:${agentId}:messages:${chatId}`,                                    │
│    JSON.stringify(messageData)                                               │
│  );                                                                          │
│                                                                              │
│  // Update chat list                                                         │
│  await redisService.zadd(                                                    │
│    `agent:${agentId}:chats`,                                                 │
│    Date.now(),                                                               │
│    chatId                                                                    │
│  );                                                                          │
│                                                                              │
│  // Trim to keep only recent messages                                        │
│  await redisService.ltrim(                                                   │
│    `agent:${agentId}:messages:${chatId}`,                                    │
│    0, 99  // Keep last 100 messages                                          │
│  );                                                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 19: WebSocket Broadcast to Frontend                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/indexMultiAgentFull.cjs (Lines 1350-1380)                       │
│                                                                              │
│  broadcast({                                                                 │
│    type: "agentMessage",                                                     │
│    agentId: agentId,                                                         │
│    message: messageData,                                                     │
│    statistics: agent.statistics,                                             │
│    timestamp: Date.now(),                                                    │
│    messageCount: agent.statistics.messagesReceived                           │
│  }, agent.browserId);                                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 20: Frontend - Display Message                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: src/components/chat/ChatPanel.tsx                                      │
│                                                                              │
│  ws.onmessage = (event) => {                                                 │
│    const data = JSON.parse(event.data);                                      │
│                                                                              │
│    if (data.type === 'agentMessage') {                                       │
│      // Add message to state                                                 │
│      setMessages(prev => [...prev, data.message]);                           │
│                                                                              │
│      // Update unread count                                                  │
│      if (data.agentId !== selectedAgent) {                                   │
│        incrementUnread(data.agentId);                                        │
│      }                                                                       │
│                                                                              │
│      // Scroll to bottom                                                     │
│      scrollToBottom();                                                       │
│                                                                              │
│      // Play notification sound                                              │
│      playNotification();                                                     │
│    }                                                                         │
│  };                                                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 21: Optional - Command Processing / Auto-Response                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/indexMultiAgentFull.cjs (Lines 1400-1500)                       │
│                                                                              │
│  // Check for commands                                                       │
│  if (message.body.startsWith('/ai ')) {                                      │
│    await handleAICommand(agentId, message);                                  │
│  } else if (message.body.startsWith('/')) {                                  │
│    await handleMasterCommand(agentId, message);                              │
│  } else {                                                                    │
│    // Check for auto-response rules                                          │
│    const autoResponse = await checkAutoResponse(agentId, message);           │
│    if (autoResponse) {                                                       │
│      await platformClient.sendMessage(message.chatId, autoResponse);         │
│    }                                                                         │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### WhatsApp Complete Flow Diagram

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Frontend  │         │   Backend   │         │  WhatsApp   │
│   (React)   │         │  (Express)  │         │   Servers   │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  POST /api/agents     │                       │
       │──────────────────────>│                       │
       │                       │                       │
       │                       │ Create WhatsApp Client│
       │                       │───────────────────────│
       │                       │                       │
       │                       │    Request QR Code    │
       │                       │──────────────────────>│
       │                       │                       │
       │                       │    QR Code Data       │
       │                       │<──────────────────────│
       │                       │                       │
       │   WS: agentQR         │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │   Display QR Code     │                       │
       │   ┌───────────────┐   │                       │
       │   │ ▓▓▓▓▓▓▓▓▓▓▓▓ │   │                       │
       │   │ ▓▓▓▓▓▓▓▓▓▓▓▓ │   │                       │
       │   │ ▓▓▓▓▓▓▓▓▓▓▓▓ │   │                       │
       │   └───────────────┘   │                       │
       │                       │                       │
       │                       │                       │
 ┌─────┴─────┐                 │    User Scans QR     │
 │   User    │─────────────────┼─────────────────────>│
 │  (Phone)  │                 │                       │
 └───────────┘                 │                       │
       │                       │   authenticated       │
       │                       │<──────────────────────│
       │                       │                       │
       │                       │      ready            │
       │                       │<──────────────────────│
       │                       │                       │
       │  WS: agentStatusChanged                       │
       │<──────────────────────│                       │
       │                       │                       │
       │   Show "Connected"    │                       │
       │                       │                       │
       │                       │   Incoming Message    │
       │                       │<──────────────────────│
       │                       │                       │
       │                       │ Store in SQLite/Redis │
       │                       │                       │
       │  WS: agentMessage     │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │   Display Message     │                       │
       │                       │                       │
       ▼                       ▼                       ▼
```

---

## Telegram Bot Process Flow

### Phase 1: Agent Creation (Same as WhatsApp Steps 1-3)

Agent creation follows the same flow with `platform: "telegram-bot"`.

### Phase 2: Bot Initialization (No QR Required)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Telegram Bot Client - Initialize with Token                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramBotClient.cjs (Lines 30-80)                   │
│                                                                              │
│  async initialize() {                                                        │
│    if (!this.botToken) {                                                     │
│      throw new Error('Bot token is required');                               │
│    }                                                                         │
│                                                                              │
│    this.setConnectionState('connecting');                                    │
│                                                                              │
│    // Create Telegram Bot API client                                         │
│    this.bot = new TelegramBot(this.botToken, {                               │
│      polling: !this.useWebhook  // Default: polling mode                     │
│    });                                                                       │
│                                                                              │
│    // Get bot information                                                    │
│    this.botInfo = await this.bot.getMe();                                    │
│    console.log(`Connected as @${this.botInfo.username}`);                    │
│                                                                              │
│    this._attachEventHandlers();                                              │
│    this.setConnectionState('connected');                                     │
│                                                                              │
│    // Emit ready immediately (no QR needed)                                  │
│    this.emit('ready', {                                                      │
│      info: {                                                                 │
│        id: this.botInfo.id,                                                  │
│        username: this.botInfo.username,                                      │
│        firstName: this.botInfo.first_name                                    │
│      }                                                                       │
│    });                                                                       │
│  }                                                                           │
│                                                                              │
│  Configuration required:                                                     │
│  {                                                                           │
│    "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",  // From @BotFather   │
│    "useWebhook": false,  // Optional: use webhook instead of polling         │
│    "webhookUrl": "https://yourdomain.com/webhook"  // If useWebhook=true     │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: WebSocket - Broadcast Ready Status                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  // No QR code step for bots - directly connected                            │
│  broadcast({                                                                 │
│    type: "agentStatusChanged",                                               │
│    agentId: agentId,                                                         │
│    previousStatus: "connecting",                                             │
│    newStatus: "ready",                                                       │
│    info: {                                                                   │
│      username: "@mybot",                                                     │
│      platform: "telegram-bot"                                                │
│    },                                                                        │
│    timestamp: Date.now()                                                     │
│  }, agent.browserId);                                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Message Receiving

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: Telegram Bot - Message Event Handlers                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramBotClient.cjs (Lines 100-180)                 │
│                                                                              │
│  // Text/Media messages                                                      │
│  this.bot.on('message', async (msg) => {                                     │
│    const normalizedMessage = this.normalizeMessage(msg);                     │
│    this.emit('message', normalizedMessage);                                  │
│  });                                                                         │
│                                                                              │
│  // Inline button callbacks                                                  │
│  this.bot.on('callback_query', async (query) => {                            │
│    const normalizedMessage = this.normalizeCallbackQuery(query);             │
│    this.emit('message', normalizedMessage);                                  │
│  });                                                                         │
│                                                                              │
│  // Polling errors                                                           │
│  this.bot.on('polling_error', (error) => {                                   │
│    console.error('Telegram polling error:', error);                          │
│    this.emit('error', { error, recoverable: true });                         │
│  });                                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: Telegram Bot - Message Normalization                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramBotClient.cjs (Lines 200-280)                 │
│                                                                              │
│  normalizeMessage(msg) {                                                     │
│    return {                                                                  │
│      id: msg.message_id.toString(),                                          │
│      platform: 'telegram-bot',                                               │
│      chatId: msg.chat.id.toString(),                                         │
│      senderId: msg.from.id.toString(),                                       │
│      senderName: msg.from.first_name + (msg.from.last_name || ''),           │
│      senderUsername: msg.from.username,                                      │
│      body: msg.text || msg.caption || '',                                    │
│      timestamp: msg.date,                                                    │
│      type: this._determineMessageType(msg),                                  │
│      hasMedia: !!(msg.photo || msg.video || msg.audio || msg.document),      │
│      fromMe: false,  // Bots don't receive their own messages                │
│      replyTo: msg.reply_to_message ? {                                       │
│        id: msg.reply_to_message.message_id.toString(),                       │
│        body: msg.reply_to_message.text                                       │
│      } : null,                                                               │
│      meta: {                                                                 │
│        isGroup: msg.chat.type === 'group' || msg.chat.type === 'supergroup', │
│        chatType: msg.chat.type,                                              │
│        chatTitle: msg.chat.title                                             │
│      }                                                                       │
│    };                                                                        │
│  }                                                                           │
│                                                                              │
│  _determineMessageType(msg) {                                                │
│    if (msg.text) return 'text';                                              │
│    if (msg.photo) return 'image';                                            │
│    if (msg.video) return 'video';                                            │
│    if (msg.audio) return 'audio';                                            │
│    if (msg.voice) return 'voice';                                            │
│    if (msg.document) return 'document';                                      │
│    if (msg.sticker) return 'sticker';                                        │
│    if (msg.location) return 'location';                                      │
│    if (msg.contact) return 'contact';                                        │
│    return 'unknown';                                                         │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Telegram Bot Complete Flow Diagram

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Frontend  │         │   Backend   │         │  Telegram   │
│   (React)   │         │  (Express)  │         │   Servers   │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  POST /api/agents     │                       │
       │  platform: telegram-bot                       │
       │  botToken: 123:ABC... │                       │
       │──────────────────────>│                       │
       │                       │                       │
       │                       │    getMe()            │
       │                       │──────────────────────>│
       │                       │                       │
       │                       │   Bot Info            │
       │                       │<──────────────────────│
       │                       │                       │
       │  WS: agentStatusChanged                       │
       │  status: ready        │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │   Show "Connected"    │                       │
       │   @botusername        │                       │
       │                       │                       │
       │                       │   Polling Updates     │
       │                       │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
       │                       │                       │
       │                       │   New Message         │
       │                       │<──────────────────────│
       │                       │                       │
       │  WS: agentMessage     │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │   Display Message     │                       │
       │                       │                       │
       ▼                       ▼                       ▼
```

---

## Telegram User (MTProto) Process Flow

### Phase 1: Agent Creation (Same as Steps 1-3)

Agent creation follows the same flow with `platform: "telegram-user"`.

### Phase 2: Multi-Step Authentication

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Telegram User Client - Initialize MTProto                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramUserClient.cjs (Lines 30-60)                  │
│                                                                              │
│  async initialize() {                                                        │
│    this.setConnectionState('connecting');                                    │
│                                                                              │
│    // Load existing session if available                                     │
│    this.stringSession = this._loadSession();                                 │
│                                                                              │
│    // Create GramJS client                                                   │
│    this.client = new TelegramClient(                                         │
│      this.stringSession,     // Session string                               │
│      this.apiId,             // From https://my.telegram.org                 │
│      this.apiHash,           // From https://my.telegram.org                 │
│      {                                                                       │
│        connectionRetries: 5,                                                 │
│        useWSS: true                                                          │
│      }                                                                       │
│    );                                                                        │
│                                                                              │
│    // Start authentication process                                           │
│    await this._startAuthentication();                                        │
│  }                                                                           │
│                                                                              │
│  Configuration required:                                                     │
│  {                                                                           │
│    "apiId": 12345678,           // From https://my.telegram.org              │
│    "apiHash": "abc123def456",   // From https://my.telegram.org              │
│    "phoneNumber": "+1234567890" // User's phone number                       │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Authentication - Phone Number Request                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramUserClient.cjs (Lines 70-150)                 │
│                                                                              │
│  async _startAuthentication() {                                              │
│    await this.client.start({                                                 │
│                                                                              │
│      // Step 5a: Phone number callback                                       │
│      phoneNumber: async () => {                                              │
│        if (this.phoneNumber) {                                               │
│          return this.phoneNumber;  // Use provided number                    │
│        }                                                                     │
│                                                                              │
│        // Request phone from frontend                                        │
│        this.authState = 'awaiting_phone';                                    │
│        this.emit('auth_required', { type: 'phone' });                        │
│                                                                              │
│        // Wait for user input via WebSocket                                  │
│        return new Promise((resolve) => {                                     │
│          this.pendingAuthResolve = resolve;                                  │
│        });                                                                   │
│      },                                                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: Authentication - SMS/Call Code Request                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      // Step 6a: Phone code callback (SMS/Call)                              │
│      phoneCode: async () => {                                                │
│        this.authState = 'awaiting_code';                                     │
│                                                                              │
│        // Request code from frontend                                         │
│        this.emit('auth_required', { type: 'code' });                         │
│                                                                              │
│        // Wait for user to enter SMS code                                    │
│        return new Promise((resolve) => {                                     │
│          this.pendingAuthResolve = resolve;                                  │
│        });                                                                   │
│      },                                                                      │
│                                                                              │
│  WebSocket message from frontend:                                            │
│  {                                                                           │
│    type: "telegramAuth",                                                     │
│    agentId: "uuid",                                                          │
│    authType: "code",                                                         │
│    value: "12345"  // SMS code                                               │
│  }                                                                           │
│                                                                              │
│  Backend handler:                                                            │
│  agent.platformClient.submitAuthValue(value);                                │
│  // Resolves pendingAuthResolve promise                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: Authentication - 2FA Password (if enabled)                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      // Step 7a: Password callback (if 2FA enabled)                          │
│      password: async () => {                                                 │
│        this.authState = 'awaiting_password';                                 │
│                                                                              │
│        // Request 2FA password from frontend                                 │
│        this.emit('auth_required', { type: 'password' });                     │
│                                                                              │
│        return new Promise((resolve) => {                                     │
│          this.pendingAuthResolve = resolve;                                  │
│        });                                                                   │
│      },                                                                      │
│                                                                              │
│      onError: (err) => {                                                     │
│        console.error('Telegram auth error:', err);                           │
│        this.emit('error', { error: err, recoverable: false });               │
│      }                                                                       │
│    });                                                                       │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 8: Session Save & Ready                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramUserClient.cjs (Lines 160-200)                │
│                                                                              │
│  // After successful authentication                                          │
│  this._saveSession();  // Save to /data/agents/{agentId}/telegram_session.txt│
│                                                                              │
│  // Get user info                                                            │
│  this.userInfo = await this.client.getMe();                                  │
│  this.authState = 'authenticated';                                           │
│  this.setConnectionState('connected');                                       │
│                                                                              │
│  this.emit('ready', {                                                        │
│    info: {                                                                   │
│      id: this.userInfo.id.toString(),                                        │
│      username: this.userInfo.username,                                       │
│      firstName: this.userInfo.firstName,                                     │
│      lastName: this.userInfo.lastName,                                       │
│      phone: this.userInfo.phone                                              │
│    }                                                                         │
│  });                                                                         │
│                                                                              │
│  Session file content (encrypted StringSession):                             │
│  "1BQANOTEuVGVsZWdyYW1BZXJ2aWNlLmpz..."                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Message Receiving

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 9: Telegram User - Event Handlers                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramUserClient.cjs (Lines 220-300)                │
│                                                                              │
│  _attachEventHandlers() {                                                    │
│    // New message event (real-time via MTProto)                              │
│    this.client.addEventHandler(                                              │
│      async (event) => {                                                      │
│        const message = event.message;                                        │
│        if (!message) return;                                                 │
│                                                                              │
│        const normalizedMessage = await this.normalizeMessage(message);       │
│        this.emit('message', normalizedMessage);                              │
│      },                                                                      │
│      new NewMessage({})  // Listen to all new messages                       │
│    );                                                                        │
│                                                                              │
│    // Message edit event                                                     │
│    this.client.addEventHandler(                                              │
│      async (event) => {                                                      │
│        this.emit('message_edited', { message: event.message });              │
│      },                                                                      │
│      new EditedMessage({})                                                   │
│    );                                                                        │
│                                                                              │
│    // User typing event                                                      │
│    this.client.addEventHandler(                                              │
│      (update) => {                                                           │
│        this.emit('typing', { chatId: update.userId.toString() });            │
│      },                                                                      │
│      new Raw({ types: [Api.UpdateUserTyping] })                              │
│    );                                                                        │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 10: Telegram User - Message Normalization                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ File: server/platforms/telegramUserClient.cjs (Lines 320-400)                │
│                                                                              │
│  async normalizeMessage(message) {                                           │
│    // Get sender info                                                        │
│    const sender = await message.getSender();                                 │
│    const chat = await message.getChat();                                     │
│                                                                              │
│    return {                                                                  │
│      id: message.id.toString(),                                              │
│      platform: 'telegram-user',                                              │
│      chatId: message.chatId.toString(),                                      │
│      senderId: sender?.id?.toString(),                                       │
│      senderName: this._getSenderName(sender),                                │
│      senderUsername: sender?.username,                                       │
│      body: message.message || '',                                            │
│      timestamp: message.date,                                                │
│      type: this._determineMessageType(message),                              │
│      hasMedia: !!message.media,                                              │
│      fromMe: message.out,  // true if sent by authenticated user             │
│      replyTo: message.replyTo ? {                                            │
│        id: message.replyTo.replyToMsgId?.toString()                          │
│      } : null,                                                               │
│      meta: {                                                                 │
│        isGroup: chat?.className === 'Channel' || chat?.megagroup,            │
│        isChannel: chat?.broadcast,                                           │
│        chatTitle: chat?.title                                                │
│      }                                                                       │
│    };                                                                        │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Telegram User Complete Flow Diagram

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Frontend  │         │   Backend   │         │  Telegram   │
│   (React)   │         │  (Express)  │         │   Servers   │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  POST /api/agents     │                       │
       │  platform: telegram-user                      │
       │  apiId: 12345         │                       │
       │  apiHash: abc...      │                       │
       │  phoneNumber: +1...   │                       │
       │──────────────────────>│                       │
       │                       │                       │
       │                       │  client.start()       │
       │                       │──────────────────────>│
       │                       │                       │
       │                       │  Send Code Request    │
       │                       │<──────────────────────│
       │                       │                       │
       │  WS: auth_required    │                       │
       │  type: code           │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │  Show Code Input      │                       │
       │  ┌───────────────┐    │                       │
       │  │ Enter SMS Code│    │                       │
       │  │ [_____]       │    │                       │
       │  └───────────────┘    │                       │
       │                       │                       │
       │  WS: telegramAuth     │                       │
       │  code: 12345          │                       │
       │──────────────────────>│                       │
       │                       │                       │
       │                       │  Verify Code          │
       │                       │──────────────────────>│
       │                       │                       │
       │                       │  2FA Required?        │
       │                       │<──────────────────────│
       │                       │                       │
       │  WS: auth_required    │  (if 2FA enabled)     │
       │  type: password       │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │  Show Password Input  │                       │
       │  ┌───────────────┐    │                       │
       │  │ Enter 2FA Pass│    │                       │
       │  │ [_____]       │    │                       │
       │  └───────────────┘    │                       │
       │                       │                       │
       │  WS: telegramAuth     │                       │
       │  password: ****       │                       │
       │──────────────────────>│                       │
       │                       │                       │
       │                       │  Verify 2FA           │
       │                       │──────────────────────>│
       │                       │                       │
       │                       │  Authenticated        │
       │                       │<──────────────────────│
       │                       │                       │
       │                       │  Save Session         │
       │                       │  (telegram_session.txt)│
       │                       │                       │
       │  WS: agentStatusChanged                       │
       │  status: ready        │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │   Show "Connected"    │                       │
       │   @username           │                       │
       │                       │                       │
       │                       │   Real-time Events    │
       │                       │<═══════════════════════│
       │                       │   (MTProto stream)    │
       │                       │                       │
       │                       │   New Message         │
       │                       │<──────────────────────│
       │                       │                       │
       │  WS: agentMessage     │                       │
       │<──────────────────────│                       │
       │                       │                       │
       │   Display Message     │                       │
       │                       │                       │
       ▼                       ▼                       ▼
```

---

## WebSocket Communication

### WebSocket Server Setup

```javascript
// File: server/indexMultiAgentFull.cjs (Lines 541-542)

const WS_PORT = process.env.WS_PORT || 3211;
const wss = new WebSocketServer({ port: WS_PORT });
```

### Connection Handling

```javascript
// File: server/indexMultiAgentFull.cjs (Lines 9316-9360)

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://localhost:${WS_PORT}`);
  const browserId = url.searchParams.get('browserId');
  const userId = url.searchParams.get('userId');

  if (!browserId) {
    ws.close(1008, "Browser ID required");
    return;
  }

  ws.browserId = browserId;
  ws.userId = userId;
  ws.isAlive = true;

  // Send initial state
  const allAgents = agentManager.getAllAgents();
  const filteredAgents = allAgents.filter(a => a.browserId === browserId);

  ws.send(JSON.stringify({
    type: "connected",
    agents: filteredAgents
  }));
});
```

### Broadcast Events

| Event Type | Description | Payload |
|------------|-------------|---------|
| `agentQR` | QR code for WhatsApp auth | `{ agentId, qr }` |
| `agentStatusChanged` | Agent connection status | `{ agentId, previousStatus, newStatus, info, timestamp }` |
| `agentMessage` | New message received | `{ agentId, message, statistics, timestamp }` |
| `auth_required` | Telegram auth step needed | `{ agentId, type: 'phone'|'code'|'password' }` |
| `profilePicUpdate` | Profile picture changed | `{ agentId, chatId, profilePicture }` |
| `agentStatisticsUpdate` | Real-time stats | `{ agentId, statistics }` |

### Incoming Message Types

| Message Type | Description | Handler |
|--------------|-------------|---------|
| `getAgents` | Request agent list | Returns filtered agents by browserId |
| `requestQR` | Request new QR code | Triggers QR regeneration |
| `telegramAuth` | Submit auth value | `{ agentId, authType, value }` |
| `ping` | Keep-alive | Returns `{ type: "pong" }` |

---

## Database Schema

### Agent Profiles Table

```sql
CREATE TABLE agent_profiles (
  agent_id TEXT PRIMARY KEY,
  name TEXT,
  phone_number TEXT UNIQUE,
  role TEXT DEFAULT 'support',
  department TEXT DEFAULT 'general',
  skills TEXT DEFAULT '[]',
  max_concurrent_chats INTEGER DEFAULT 10,
  auto_reconnect INTEGER DEFAULT 0,
  browser_id TEXT,
  owner_id TEXT,
  owner_name TEXT,
  supervisors TEXT DEFAULT '[]',
  working_hours TEXT,
  status TEXT DEFAULT 'disconnected',
  kb_only_mode INTEGER DEFAULT 0,
  platform TEXT DEFAULT 'whatsapp',
  platform_config TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Messages Table

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  agent_phone_number TEXT,
  chat_id TEXT NOT NULL,
  message_id TEXT UNIQUE,
  from_me INTEGER DEFAULT 0,
  sender_number TEXT,
  sender_name TEXT,
  body TEXT,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_read INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (agent_id) REFERENCES agent_profiles(agent_id)
);
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `server/indexMultiAgentFull.cjs` | Main server, WebSocket setup, message routing |
| `server/agents/agentManager.cjs` | Agent lifecycle management |
| `server/controllers/agentController.cjs` | REST API handlers for agent CRUD |
| `server/routes/api/agentRoutes.cjs` | REST API route definitions |
| `server/platforms/whatsappClient.cjs` | WhatsApp Web.js wrapper |
| `server/platforms/telegramBotClient.cjs` | Telegram Bot API wrapper |
| `server/platforms/telegramUserClient.cjs` | Telegram User (MTProto) wrapper |
| `server/platforms/platformClient.cjs` | Base class for all platforms |
| `server/platforms/platformFactory.cjs` | Factory for creating platform clients |
| `server/services/agentDataService.cjs` | SQLite database operations |
| `server/services/redisService.cjs` | Redis caching layer |
| `src/components/agents/QRCodeDisplay.tsx` | Frontend QR code display |
| `src/components/chat/ChatPanel.tsx` | Frontend message display |

---

## Session Storage

### WhatsApp Sessions
- **Location:** `.wwebjs_auth/{agentId}/`
- **Type:** File-based (Puppeteer LocalAuth)
- **Contents:** IndexedDB, LocalStorage, Cookies
- **Auto-reconnect:** Yes, on server restart

### Telegram User Sessions
- **Location:** `/data/agents/{agentId}/telegram_session.txt`
- **Type:** Encrypted StringSession
- **Contents:** MTProto session data
- **Auto-reconnect:** Yes, if valid session exists

### Telegram Bot Sessions
- **Location:** Database (platform_config field)
- **Type:** Bot token only (no session file)
- **Auto-reconnect:** Yes, using stored token

---

## Error Handling

### WhatsApp Errors
- `auth_failure` - QR code expired, regenerate
- `disconnected` - Session invalidated, re-authenticate
- `TIMEOUT` - Network timeout, retry connection

### Telegram Bot Errors
- `ETELEGRAM` - API rate limit, implement backoff
- `polling_error` - Network issue, auto-retry

### Telegram User Errors
- `PHONE_CODE_INVALID` - Wrong SMS code
- `PASSWORD_HASH_INVALID` - Wrong 2FA password
- `SESSION_REVOKED` - Session expired, re-authenticate
- `FLOOD_WAIT_{X}` - Rate limited, wait X seconds

---

*Document generated: January 2026*
*Based on WhatsBots codebase analysis*
