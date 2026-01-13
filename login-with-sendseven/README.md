# Login with SendSeven (OAuth2/OIDC) Example

Implement "Sign in with SendSeven" using OAuth2 Authorization Code flow with PKCE.

## Overview

This example demonstrates the complete OAuth2/OIDC flow:

1. **PKCE Code Generation** - Secure code_verifier and code_challenge (SHA-256)
2. **State Parameter** - CSRF protection token
3. **Nonce Parameter** - ID token replay protection (OIDC)
4. **Authorization Request** - Redirect user to SendSeven consent screen
5. **Callback Handling** - Process authorization code
6. **Token Exchange** - Get access_token, refresh_token, and id_token
7. **ID Token Verification** - Validate JWT signature using JWKS
8. **User Info Retrieval** - Fetch user profile from userinfo endpoint
9. **Token Refresh** - Refresh expired tokens
10. **Logout/Revocation** - Revoke tokens on logout

## OAuth2 Endpoints

| Endpoint | URL | Description |
|----------|-----|-------------|
| Discovery | `/.well-known/openid-configuration` | OIDC discovery document |
| JWKS | `/.well-known/jwks.json` | Public keys for ID token verification |
| Authorize | `/api/v1/oauth-apps/authorize` | Start authorization flow |
| Token | `/api/v1/oauth-apps/token` | Exchange code for tokens |
| UserInfo | `/api/v1/oauth-apps/userinfo` | Get authenticated user info |
| Revoke | `/api/v1/oauth-apps/revoke` | Revoke tokens |

## OIDC Discovery Document

Fetch `/.well-known/openid-configuration` to dynamically discover endpoints:

```json
{
  "issuer": "https://api.sendseven.com",
  "authorization_endpoint": "https://app.sendseven.com/oauth/consent",
  "token_endpoint": "https://api.sendseven.com/api/v1/oauth-apps/token",
  "userinfo_endpoint": "https://api.sendseven.com/api/v1/oauth-apps/userinfo",
  "jwks_uri": "https://api.sendseven.com/.well-known/jwks.json",
  "revocation_endpoint": "https://api.sendseven.com/api/v1/oauth-apps/revoke",
  "scopes_supported": ["openid", "profile", "email", "offline_access", ...],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "code_challenge_methods_supported": ["S256", "plain"]
}
```

## Environment Variables

```bash
# OAuth App Credentials (from SendSeven dashboard)
SENDSEVEN_CLIENT_ID=s7_app_...
SENDSEVEN_CLIENT_SECRET=s7_secret_...

# API Configuration
SENDSEVEN_API_URL=https://api.sendseven.com

# Your Application
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
SESSION_SECRET=your-session-secret-at-least-32-characters
```

## OAuth2 Flow

### Step 1: Generate PKCE Codes

PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks.

```
code_verifier = random_string(43-128 chars, base64url-safe)
code_challenge = base64url(sha256(code_verifier))
```

### Step 2: Generate State and Nonce

- **state**: Random string for CSRF protection (required, min 8 chars)
- **nonce**: Random string for ID token replay protection (recommended for OIDC)

Store both in the user's session before redirecting.

### Step 3: Build Authorization URL

```
GET /api/v1/oauth-apps/authorize
  ?client_id=s7_app_...
  &redirect_uri=http://localhost:3000/callback
  &response_type=code
  &scope=openid profile email offline_access
  &state={random_state}
  &code_challenge={base64url_sha256_verifier}
  &code_challenge_method=S256
  &nonce={random_nonce}
```

### Step 4: User Consent

User logs in (if needed) and approves/denies the authorization request.
On approval, SendSeven redirects back with an authorization code:

```
GET /callback?code=auth_code_xxx&state={original_state}
```

### Step 5: Validate State

**Important:** Always verify the returned state matches the one stored in session.

### Step 6: Exchange Code for Tokens

```
POST /api/v1/oauth-apps/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=auth_code_xxx
&client_id=s7_app_...
&client_secret=s7_secret_...
&redirect_uri=http://localhost:3000/callback
&code_verifier={original_code_verifier}
```

Response:

```json
{
  "access_token": "oauth_xxx...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_xxx...",
  "scope": "openid profile email offline_access",
  "id_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

### Step 7: Verify ID Token

The `id_token` is a JWT signed with RS256. To verify:

1. Fetch JWKS from `/.well-known/jwks.json`
2. Find the key matching the token's `kid` header
3. Verify the signature using the public key
4. Validate claims:
   - `iss` matches the issuer
   - `aud` matches your client_id
   - `exp` is in the future
   - `nonce` matches the one you sent

### Step 8: Get User Info

```
GET /api/v1/oauth-apps/userinfo
Authorization: Bearer {access_token}
```

Response:

```json
{
  "sub": "user_xxx",
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "picture": "https://...",
  "tenant_id": "tenant_xxx"
}
```

### Step 9: Refresh Tokens

When the access token expires, use the refresh token:

```
POST /api/v1/oauth-apps/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=refresh_xxx...
&client_id=s7_app_...
&client_secret=s7_secret_...
```

### Step 10: Revoke Tokens (Logout)

On logout, revoke the tokens:

```
POST /api/v1/oauth-apps/revoke
Content-Type: application/x-www-form-urlencoded

token={access_token_or_refresh_token}
&token_type_hint=refresh_token
&client_id=s7_app_...
&client_secret=s7_secret_...
```

## Scopes

### OIDC Standard Scopes

| Scope | Claims Returned |
|-------|-----------------|
| `openid` | `sub` (required for OIDC) |
| `profile` | `name`, `picture` |
| `email` | `email`, `email_verified` |
| `offline_access` | Enables refresh tokens |

### SendSeven API Scopes

| Scope | Permission |
|-------|------------|
| `conversations:read` | View conversations and messages |
| `conversations:write` | Reply to conversations |
| `contacts:read` | View contacts |
| `contacts:write` | Edit contacts |
| `campaigns:read` | View campaigns |
| ... | See API docs for full list |

## Run the Examples

### Python (Flask)

```bash
cd python
pip install -r requirements.txt
python app.py
```

### JavaScript (Express)

```bash
cd javascript
npm install
node app.js
```

### TypeScript (Express)

```bash
cd typescript
npm install
npx ts-node app.ts
```

### PHP (Built-in Server)

```bash
cd php
cp .env.example .env
# Edit .env with your credentials
composer install
php -S localhost:3000 app.php
```

### Go (Chi Router)

```bash
cd go
go run main.go
```

### Java (Spring Boot)

```bash
cd java
mvn spring-boot:run
```

### C# (ASP.NET Core)

```bash
cd csharp
dotnet run
```

### Ruby (Sinatra)

```bash
cd ruby
bundle install
ruby app.rb
```

## Security Best Practices

1. **Always use HTTPS in production** - OAuth2 requires secure connections
2. **Store secrets securely** - Never commit credentials to version control
3. **Use PKCE** - Required for public clients, recommended for all
4. **Validate state** - Prevents CSRF attacks
5. **Validate nonce** - Prevents ID token replay attacks
6. **Validate ID token** - Verify signature and claims before trusting
7. **Use short-lived sessions** - Don't rely solely on token expiration
8. **Revoke tokens on logout** - Properly invalidate sessions

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_client` | Wrong client_id or client_secret | Verify credentials |
| `invalid_grant` | Code expired or already used | Codes are single-use, expire in 10 min |
| `invalid_request` | Missing required parameter | Check all required params |
| `invalid_scope` | Scope not allowed for app | Request only allowed scopes |
| `access_denied` | User denied authorization | Handle gracefully in UI |
| State mismatch | CSRF attack or session issue | Verify session handling |

## Next Steps

- [Send Message](../send-message) - Make API calls with the access token
- [Webhook Listener](../webhook-listener) - Receive real-time events
- [Contact Management](../contact-management) - Manage contacts via API
