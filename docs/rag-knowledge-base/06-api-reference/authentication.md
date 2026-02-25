# Authentication API Reference

SwarmAI supports multiple authentication methods: JWT tokens, magic links, and passkeys (WebAuthn).

## Base URL

```
Local: http://localhost:3031/api
Production: https://agents.northpeak.app/api
```

## Authentication Methods

### 1. Username/Password Login

**Endpoint**: `POST /auth/login`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin"
  }'
```

**Response** (200 OK):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "superadmin",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "expiresIn": "7d"
}
```

**Response** (401 Unauthorized):
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

### 2. Magic Link (Email)

**Step 1: Request Magic Link**

**Endpoint**: `POST /auth/magic-link/request`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/magic-link/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Magic link sent to user@example.com",
  "expiresIn": 900
}
```

**Step 2: Verify Magic Link**

**Endpoint**: `GET /auth/magic-link/verify?token=<token>`

User clicks link in email → Redirects to dashboard with JWT token set in cookie.

### 3. Passkeys (WebAuthn)

**Step 1: Request Registration Challenge**

**Endpoint**: `POST /auth/passkey/register/start`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/passkey/register/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Response** (200 OK):
```json
{
  "challenge": "base64-encoded-challenge",
  "rp": {
    "name": "SwarmAI",
    "id": "agents.northpeak.app"
  },
  "user": {
    "id": "user-id-base64",
    "name": "user@example.com",
    "displayName": "John Doe"
  },
  "pubKeyCredParams": [...]
}
```

**Step 2: Complete Registration**

**Endpoint**: `POST /auth/passkey/register/finish`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/passkey/register/finish \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credential": { ... }
  }'
```

**Step 3: Authenticate with Passkey**

**Endpoint**: `POST /auth/passkey/login`

Similar flow to registration.

### 4. Test Bypass Token (Development Only)

**⚠️ Only works in development mode (`NODE_ENV=development`)**

**Request**:
```bash
curl -H "Authorization: Bearer swarm-test-bypass-2026" \
  http://localhost:3031/api/agents
```

Authenticates as admin user without login. Disabled in production.

## Token Usage

### Include Token in Requests

**Header**:
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3031/api/agents
```

**Cookie** (set automatically by magic link/passkey):
```bash
curl --cookie "token=YOUR_JWT_TOKEN" \
  http://localhost:3031/api/agents
```

### Token Expiration

- **Default**: 7 days
- **Configurable**: Set `JWT_EXPIRY` in `.env`
- **Refresh**: Re-login before expiration

### Token Validation

**Endpoint**: `GET /auth/validate`

**Request**:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3031/api/auth/validate
```

**Response** (200 OK):
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "superadmin"
  },
  "expiresAt": "2026-02-10T10:00:00.000Z"
}
```

## User Registration

**Endpoint**: `POST /auth/register`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "SecurePass123!",
    "fullName": "New User"
  }'
```

**Response** (201 Created):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 2,
    "username": "newuser",
    "email": "newuser@example.com",
    "role": "user",
    "createdAt": "2026-02-03T10:00:00.000Z"
  }
}
```

**Validation Rules**:
- Username: 3-30 characters, alphanumeric + underscore
- Email: Valid email format
- Password: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number

## User Roles

| Role | Permissions |
|------|-------------|
| **superadmin** | Full system access, user management, all agents |
| **admin** | Manage own agents, flows, knowledge, limited user management |
| **user** | Create and manage own agents, flows, knowledge |
| **viewer** | Read-only access to shared agents and conversations |

## Logout

**Endpoint**: `POST /auth/logout`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

Clears server-side session (if using sessions) and invalidates token.

## Password Reset

**Step 1: Request Reset**

**Endpoint**: `POST /auth/password/reset-request`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/password/reset-request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

**Step 2: Reset Password**

**Endpoint**: `POST /auth/password/reset`

**Request**:
```bash
curl -X POST http://localhost:3031/api/auth/password/reset \
  -H "Content-Type: application/json" \
  -d '{
    "token": "reset-token-from-email",
    "newPassword": "NewSecurePass123!"
  }'
```

## Rate Limiting

Authentication endpoints are rate-limited:

| Endpoint | Limit |
|----------|-------|
| `/auth/login` | 5 attempts per 15 minutes per IP |
| `/auth/register` | 3 registrations per hour per IP |
| `/auth/magic-link/request` | 3 requests per hour per email |
| `/auth/password/reset-request` | 3 requests per hour per email |

**Response** (429 Too Many Requests):
```json
{
  "success": false,
  "error": "Too many requests. Please try again in 15 minutes.",
  "retryAfter": 900
}
```

## Security Best Practices

### 1. Store Tokens Securely

**Browser**:
```javascript
// Use httpOnly cookies (preferred)
// or localStorage (less secure)
localStorage.setItem('token', response.token);
```

**Mobile/Desktop Apps**:
```javascript
// Use secure storage (Keychain, Keystore)
await SecureStore.setItemAsync('token', response.token);
```

### 2. Include CSRF Protection

For cookie-based auth:
```bash
curl -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  --cookie "token=YOUR_TOKEN" \
  http://localhost:3031/api/agents
```

### 3. Use HTTPS in Production

Never send tokens over HTTP:
```bash
# Bad
http://agents.northpeak.app/api/auth/login

# Good
https://agents.northpeak.app/api/auth/login
```

### 4. Rotate Tokens

Refresh tokens before expiration:
```javascript
async function refreshToken() {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${oldToken}`
    }
  });
  const { token } = await response.json();
  localStorage.setItem('token', token);
}
```

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Bad Request | Invalid input format |
| 401 | Unauthorized | Invalid or missing credentials |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | User not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

## Example: Complete Authentication Flow

```javascript
// 1. Login
async function login(username, password) {
  const response = await fetch('http://localhost:3031/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const { token, user } = await response.json();

  // Store token
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));

  return { token, user };
}

// 2. Make Authenticated Request
async function getAgents() {
  const token = localStorage.getItem('token');

  const response = await fetch('http://localhost:3031/api/agents', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    // Token expired, redirect to login
    window.location.href = '/login';
    return;
  }

  return await response.json();
}

// 3. Logout
async function logout() {
  const token = localStorage.getItem('token');

  await fetch('http://localhost:3031/api/auth/logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  // Clear local storage
  localStorage.removeItem('token');
  localStorage.removeItem('user');

  // Redirect to login
  window.location.href = '/login';
}
```

## Related Topics

- [User Management](user-management.md)
- [API Overview](overview.md)
- [Security Best Practices](../03-developer-guides/security.md)

---

**Keywords**: Authentication, JWT, magic link, passkeys, WebAuthn, login, security, tokens
