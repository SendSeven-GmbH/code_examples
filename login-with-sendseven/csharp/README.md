# Login with SendSeven - C# (ASP.NET Core)

A complete OAuth2/OIDC implementation for "Sign in with SendSeven" using ASP.NET Core 8.0 with Razor Pages.

## Features

- **PKCE (Proof Key for Code Exchange)** - SHA-256 code challenge for secure authorization
- **State Parameter** - CSRF protection with cryptographically random tokens
- **Nonce Parameter** - ID token replay attack protection
- **RS256 JWT Verification** - ID token signature validation using JWKS
- **Token Refresh** - Automatic token renewal using refresh tokens
- **Token Revocation** - Proper logout with token invalidation
- **Session Management** - Secure server-side session storage

## Requirements

- .NET 8.0 SDK or later
- SendSeven OAuth App credentials

## Quick Start

### 1. Clone and Navigate

```bash
cd sendseven-examples/login-with-sendseven/csharp
```

### 2. Configure Environment

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
SENDSEVEN_CLIENT_ID=s7_app_your_client_id
SENDSEVEN_CLIENT_SECRET=s7_secret_your_client_secret
SENDSEVEN_API_URL=https://api.sendseven.com
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
SESSION_SECRET=your-random-32-character-secret-here
```

### 3. Run the Application

```bash
dotnet run
```

Open http://localhost:3000 in your browser.

## Project Structure

```
csharp/
├── Program.cs                    # Main application with routes
├── Services/
│   └── OAuthService.cs           # OAuth2/OIDC service with PKCE, JWT verification
├── Models/
│   ├── TokenResponse.cs          # Token endpoint response
│   ├── UserInfo.cs               # UserInfo endpoint response
│   ├── OidcConfiguration.cs      # OIDC discovery document models
│   └── OAuthState.cs             # Session state models
├── Pages/
│   ├── _Layout.cshtml            # Shared layout with CSS
│   ├── Index.cshtml              # Home page (login/user info)
│   └── Error.cshtml              # Error page
├── LoginWithSendSeven.csproj     # Project file
├── appsettings.json              # Configuration
└── .env.example                  # Environment template
```

## OAuth2 Flow Implementation

### 1. Generate PKCE Codes

```csharp
// Generate cryptographically random code verifier (43-128 chars)
var codeVerifier = oauthService.GenerateCodeVerifier();

// Generate S256 code challenge
var codeChallenge = oauthService.GenerateCodeChallenge(codeVerifier);
```

### 2. Generate State and Nonce

```csharp
var state = oauthService.GenerateState();  // CSRF protection
var nonce = oauthService.GenerateNonce();  // ID token replay protection
```

### 3. Build Authorization URL

```csharp
var authUrl = oauthService.BuildAuthorizationUrl(oauthState);
// Redirects to: /api/v1/oauth-apps/authorize?client_id=...&code_challenge=...&state=...
```

### 4. Exchange Code for Tokens

```csharp
var tokens = await oauthService.ExchangeCodeForTokensAsync(code, codeVerifier);
// Returns: access_token, refresh_token, id_token, expires_in, scope
```

### 5. Verify ID Token

```csharp
// Fetches JWKS, finds matching key by kid, verifies RS256 signature
var claims = await oauthService.VerifyIdTokenAsync(tokens.IdToken, expectedNonce);
```

### 6. Get User Info

```csharp
var userInfo = await oauthService.GetUserInfoAsync(tokens.AccessToken);
// Returns: sub, email, name, picture, tenant_id
```

### 7. Refresh Token

```csharp
var newTokens = await oauthService.RefreshTokenAsync(tokens.RefreshToken);
```

### 8. Revoke Token (Logout)

```csharp
await oauthService.RevokeTokenAsync(tokens.RefreshToken, "refresh_token");
```

## API Endpoints

The demo exposes these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Home page (login button or user info) |
| `/login` | GET | Start OAuth2 flow (redirects to SendSeven) |
| `/callback` | GET | OAuth2 callback (exchanges code for tokens) |
| `/refresh` | GET | Refresh access token |
| `/logout` | GET | Revoke tokens and clear session |
| `/api/user` | GET | Get current user info (JSON) |
| `/api/tokens` | GET | Get token metadata (redacted) |

## Key Dependencies

```xml
<PackageReference Include="Microsoft.IdentityModel.Tokens" Version="7.2.0" />
<PackageReference Include="System.IdentityModel.Tokens.Jwt" Version="7.2.0" />
<PackageReference Include="DotNetEnv" Version="3.0.0" />
```

## Security Notes

1. **Always use HTTPS in production** - OAuth2 requires secure connections
2. **Store secrets securely** - Never commit credentials to version control
3. **Use PKCE** - Even for confidential clients
4. **Validate state** - Prevents CSRF attacks
5. **Validate nonce** - Prevents ID token replay attacks
6. **Verify ID token** - Don't trust claims without signature verification
7. **Handle token expiration** - Refresh before access token expires

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_client` | Wrong credentials | Verify client_id and client_secret |
| `invalid_grant` | Code expired/used | Codes expire in 10 min, single-use |
| `invalid_state` | CSRF attack or session issue | Check cookies, clear session |
| `access_denied` | User denied authorization | Handle gracefully |
| `No matching key found` | JWKS cache stale | Clear JWKS cache |

## Integration with Your App

To integrate into your own ASP.NET Core application:

1. Copy `Services/OAuthService.cs` and `Models/` to your project
2. Register the service: `builder.Services.AddHttpClient<OAuthService>();`
3. Configure session storage
4. Add the login/callback routes
5. Store user info in your auth system (Identity, JWT, etc.)

## Resources

- [SendSeven OAuth2 Documentation](https://sendseven.com/docs/oauth2)
- [OIDC Discovery Spec](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [JWT RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)
