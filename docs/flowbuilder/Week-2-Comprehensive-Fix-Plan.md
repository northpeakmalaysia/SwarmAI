# Week 2: Comprehensive Fix Plan
## Based on Actual Audit Findings

**Created:** 2026-02-03
**Status:** Ready for Implementation
**Total Estimated Time:** 40 hours (1 week)

---

## Priority Framework

| Priority | Timeline | Criteria |
|----------|----------|----------|
| 🔴 **CRITICAL** | Day 1 | Blocks basic functionality, security issues |
| 🟡 **HIGH** | Days 2-3 | Core features, user-facing functionality |
| 🟢 **MEDIUM** | Days 4-5 | Enhancement, nice-to-have features |
| ⚪ **LOW** | Future | Can be worked around, non-essential |

---

## 🔴 CRITICAL PRIORITY (Day 1: 8 hours)

### 1. Fix Registration Gap (2 hours)
**Issue:** MessageTriggerNode & AIRouterNode exist but not registered in main index

**Files to Update:**
- `server/services/flow/nodes/index.cjs`

**Changes:**
```javascript
// ADD to nodeExecutors object:
triggers: {
  ManualTriggerNode: triggers.ManualTriggerNode,
  WebhookTriggerNode: triggers.WebhookTriggerNode,
  MessageTriggerNode: triggers.MessageTriggerNode, // ADD THIS
},
ai: {
  ChatCompletionNode: ai.ChatCompletionNode,
  RAGQueryNode: ai.RAGQueryNode,
  AIRouterNode: ai.AIRouterNode, // ADD THIS
},
```

**Testing:**
- Verify MessageTriggerNode appears in available nodes
- Verify AIRouterNode appears in available nodes
- Test flow execution with both nodes

**Impact:** Unlocks 2 complete, production-ready nodes immediately

---

### 2. Add Webhook Authentication (4 hours)
**Issue:** Webhook trigger has no authentication (security risk)

**File:** `server/services/flow/nodes/triggers/WebhookTriggerNode.cjs`

**Add Features:**
- Bearer token authentication
- API key validation
- HMAC signature verification
- Response configuration (status, headers, body)

**New Properties:**
```javascript
{
  webhookPath: string,
  authentication: {
    enabled: boolean,
    type: 'bearer' | 'apikey' | 'hmac',
    tokenField: string,
    secret: string, // template
  },
  response: {
    statusCode: number,
    body: string, // template
    headers: object,
  }
}
```

**Testing:**
- Test bearer token validation
- Test API key validation
- Test custom response configuration
- Test security: reject invalid auth

**Impact:** Critical security enhancement

---

### 3. Create Logic:Loop Node (2 hours)
**Issue:** No loop node (for-each, while, until)

**File:** CREATE `server/services/flow/nodes/logic/LoopNode.cjs`

**Loop Types:**
1. **For-Each:** Iterate over array/object
2. **While:** Loop with condition
3. **Count:** Loop N times

**Properties:**
```javascript
{
  loopType: 'forEach' | 'while' | 'count',
  arraySource: string, // template for forEach
  condition: string, // template for while
  count: number, // for count type
  maxIterations: number, // safety limit
}
```

**Output Variables:**
```javascript
{
  currentItem: any, // forEach
  currentIndex: number,
  totalIterations: number,
  completed: boolean,
}
```

**Testing:**
- Test forEach with array
- Test while with condition
- Test count loop
- Test maxIterations safety limit

**Impact:** Unlocks powerful workflow automation

---

## 🟡 HIGH PRIORITY (Days 2-3: 16 hours)

### 4. Create Trigger:Schedule Node (4 hours)
**Issue:** No schedule trigger (cron-based automation)

**File:** CREATE `server/services/flow/nodes/triggers/ScheduleTriggerNode.cjs`

**Features:**
- Cron expression support
- Timezone handling
- One-time schedule (specific date/time)
- Recurring schedule (daily, weekly, monthly)

**Properties:**
```javascript
{
  scheduleType: 'cron' | 'recurring' | 'oneTime',
  cronExpression: string,
  timezone: string,
  startDate: string,
  endDate: string,
  interval: {
    value: number,
    unit: 'minutes' | 'hours' | 'days',
  }
}
```

**Implementation:**
- Use node-cron or similar library
- Store active schedules in database
- Background scheduler service

**Testing:**
- Test cron expression parsing
- Test timezone handling
- Test recurring schedules

**Impact:** Enables time-based automation

---

### 5. Create Logic:ErrorHandler Node (3 hours)
**Issue:** No dedicated error handler node

**File:** CREATE `server/services/flow/nodes/logic/ErrorHandlerNode.cjs`

**Features:**
- Catch errors from previous nodes
- Retry logic with exponential backoff
- Fallback actions
- Error logging

**Properties:**
```javascript
{
  errorSource: string, // node ID to watch
  retryCount: number,
  retryDelay: number,
  retryBackoff: number,
  fallbackAction: 'continue' | 'stop' | 'route',
  fallbackNodeId: string,
}
```

**Output Variables:**
```javascript
{
  error: {
    message: string,
    code: string,
    nodeId: string,
  },
  retryAttempts: number,
  recovered: boolean,
}
```

**Testing:**
- Test error catching
- Test retry logic
- Test fallback routing

**Impact:** Better error handling in workflows

---

### 6. Add AI Tool Authorization to AI:Router (3 hours)
**Issue:** AI Router can execute any tool without user confirmation

**File:** `server/services/flow/nodes/ai/AIRouterNode.cjs`

**Add Features:**
- Tool authorization levels (safe, prompt, admin)
- User confirmation for destructive tools
- Tool blacklist/whitelist per flow

**New Properties:**
```javascript
{
  toolAuthorization: {
    requireConfirmation: string[], // tool IDs
    allowedTools: string[],
    deniedTools: string[],
  }
}
```

**Implementation:**
- Add authorization check before tool execution
- Emit event for confirmation requests
- Block execution until confirmed

**Testing:**
- Test safe tools (auto-execute)
- Test prompt tools (require confirmation)
- Test denied tools (blocked)

**Impact:** Critical security for production

---

### 7. Enhance Messaging:SendText Platform Features (6 hours)
**Issue:** Missing platform-specific features

**File:** `server/services/flow/nodes/messaging/SendTextNode.cjs`

**Add Features:**

**WhatsApp:**
- Mentions support (`@user`)
- Link preview control
- Reply to message (already has basic support)

**Telegram:**
- Inline keyboards (buttons field exists but not implemented)
- Reply markup
- Silent messages
- Disable web page preview

**Email:**
- Attachments (file paths or URLs)
- CC/BCC recipients
- Reply-To headers
- Custom headers

**New Properties:**
```javascript
{
  // WhatsApp
  mentions: string[], // phone numbers
  linkPreview: boolean,

  // Telegram
  inlineKeyboard: {
    buttons: [{text, url, callbackData}],
  },
  replyMarkup: object,
  disableNotification: boolean,
  disableWebPagePreview: boolean,

  // Email
  attachments: [{path, filename, contentType}],
  cc: string[],
  bcc: string[],
  replyTo: string,
  customHeaders: object,
}
```

**Testing:**
- Test WhatsApp mentions
- Test Telegram inline keyboards
- Test Email attachments

**Impact:** Essential for production messaging workflows

---

## 🟢 MEDIUM PRIORITY (Days 4-5: 16 hours)

### 8. Create Data:Query Node (4 hours)
**Issue:** No database query node

**File:** CREATE `server/services/flow/nodes/data/QueryNode.cjs`

**Features:**
- SQL query execution
- Parameter binding ({{template}})
- Connection pooling
- Multiple row results

**Properties:**
```javascript
{
  query: string, // SQL with {{params}}
  parameters: object,
  connectionString: string, // optional override
  maxRows: number,
  timeout: number,
}
```

**Output Variables:**
```javascript
{
  rows: any[],
  rowCount: number,
  columns: string[],
  executionTime: number,
}
```

**Testing:**
- Test SELECT queries
- Test parameter binding
- Test multiple rows

**Impact:** Enables database integration

---

### 9. Create Data:Insert Node (3 hours)
**Issue:** No database insert node

**File:** CREATE `server/services/flow/nodes/data/InsertNode.cjs`

**Features:**
- Single row insert
- Bulk insert
- Return inserted ID
- Upsert support

**Testing:**
- Test single insert
- Test bulk insert
- Test upsert

**Impact:** Database write operations

---

### 10. Create Data:Update Node (2 hours)
**Issue:** No database update node

**File:** CREATE `server/services/flow/nodes/data/UpdateNode.cjs`

**Features:**
- WHERE clause with parameters
- Return affected rows count

**Impact:** Database update operations

---

### 11. Create Logic:GetVariable Node (2 hours)
**Issue:** No dedicated get variable node (currently use {{templates}})

**File:** CREATE `server/services/flow/nodes/logic/GetVariableNode.cjs`

**Features:**
- Get variable by name
- Default value if not exists
- Type conversion

**Note:** Low priority since {{var.name}} templates already work

---

### 12. Create Messaging:SendMedia Node (3 hours)
**Issue:** No media sending support

**File:** CREATE `server/services/flow/nodes/messaging/SendMediaNode.cjs`

**Features:**
- Image, video, audio, document sending
- File path or URL support
- Caption support
- Platform detection (WhatsApp, Telegram)

**Impact:** Essential for rich messaging

---

### 13. Create AI:Translate & AI:Summarize Nodes (2 hours)
**Issue:** No dedicated translate/summarize nodes

**Files:**
- CREATE `server/services/flow/nodes/ai/TranslateNode.cjs`
- CREATE `server/services/flow/nodes/ai/SummarizeNode.cjs`

**Note:** Can use ChatCompletion as workaround, but dedicated nodes provide better UX

**Impact:** Convenience nodes for common AI tasks

---

## ⚪ LOW PRIORITY (Future/Week 3+)

### 14. Create Swarm Integration Nodes (12 hours)
**Issue:** No swarm integration nodes

**Files:** CREATE `server/services/flow/nodes/swarm/` directory with:
- BroadcastNode.cjs
- ConsensusNode.cjs
- HandoffNode.cjs
- CreateTaskNode.cjs

**Note:** Swarm is a core feature but can be accessed via direct API calls as workaround

---

### 15. Create Messaging:SendTemplate Node (4 hours)
**Issue:** No WhatsApp Business template support

**File:** CREATE `server/services/flow/nodes/messaging/SendTemplateNode.cjs`

**Impact:** WhatsApp Business API compliance

---

## Implementation Order

### Day 1: Critical Fixes (8 hours)
1. ✅ Fix registration gap (2h)
2. ✅ Add webhook authentication (4h)
3. ✅ Create logic:loop node (2h)

### Day 2: High Priority Part 1 (8 hours)
4. ✅ Create trigger:schedule node (4h)
5. ✅ Create logic:errorHandler node (3h)
6. ✅ Start AI Router tool authorization (1h setup)

### Day 3: High Priority Part 2 (8 hours)
7. ✅ Complete AI Router tool authorization (2h)
8. ✅ Enhance messaging:sendText features (6h)

### Day 4: Data Nodes (8 hours)
9. ✅ Create data:query node (4h)
10. ✅ Create data:insert node (3h)
11. ✅ Start data:update node (1h)

### Day 5: Remaining & Polish (8 hours)
12. ✅ Complete data:update node (1h)
13. ✅ Create messaging:sendMedia node (3h)
14. ✅ Create AI translate/summarize nodes (2h)
15. ✅ Testing & documentation (2h)

---

## Testing Strategy

### Unit Tests (Per Node)
- Input validation
- Template resolution
- Output format
- Error handling

### Integration Tests (Per Flow)
- Multi-node execution
- Variable passing
- Error propagation

### End-to-End Tests
- Real platform integration
- Execution monitoring
- Database persistence

---

## Success Criteria

✅ All CRITICAL items complete (Day 1)
✅ All HIGH priority items complete (Days 2-3)
✅ 80% of MEDIUM priority items complete (Days 4-5)
✅ Registration gap fixed (MessageTrigger & AIRouter usable)
✅ Security enhancements in place (webhook auth, tool authorization)
✅ Core workflow features unlocked (loop, schedule, error handling)
✅ Database integration working (query, insert, update)
✅ 80%+ test coverage on new nodes

---

## Risks & Mitigation

**Risk:** Schedule trigger requires background service
**Mitigation:** Use existing job queue system or node-cron library

**Risk:** Database nodes need connection pooling
**Mitigation:** Use existing database service with pooling

**Risk:** Platform-specific features need testing
**Mitigation:** Manual testing with real WhatsApp/Telegram accounts

---

**Document Status:** Ready for Week 2 Implementation
**Last Updated:** 2026-02-03
**Next Review:** End of Week 2 (Day 5)
