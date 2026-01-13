/**
 * SendSeven API - Login with SendSeven Example (TypeScript/Express)
 *
 * Demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".
 *
 * Features:
 * - PKCE (Proof Key for Code Exchange) for secure code exchange
 * - State parameter for CSRF protection
 * - Nonce parameter for ID token replay protection
 * - ID token verification using JWKS
 * - Token refresh using refresh_token
 * - Token revocation on logout
 */

import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import session from 'express-session';
import crypto from 'crypto';
import dotenv from 'dotenv';
import * as jose from 'jose';

dotenv.config();

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * OIDC Discovery Document
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html
 */
interface OIDCConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  revocation_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  code_challenge_methods_supported: string[];
}

/**
 * Token response from /token endpoint
 */
interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

/**
 * User information from /userinfo endpoint
 */
interface UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  tenant_id?: string;
}

/**
 * ID Token claims after verification
 */
interface IDTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  tenant_id?: string;
}

/**
 * OAuth error response
 */
interface OAuthError {
  error: string;
  error_description?: string;
}

/**
 * JWKS (JSON Web Key Set)
 */
interface JWKS {
  keys: jose.JWK[];
}

/**
 * JWKS cache for performance
 */
interface JWKSCache {
  keys: jose.JWK[];
  fetchedAt: number;
}

/**
 * Session data stored during OAuth flow
 */
interface OAuthSessionData {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Token display info (safe to show in UI)
 */
interface TokenDisplayInfo {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  has_refresh_token: boolean;
  has_id_token: boolean;
}

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    oauth?: OAuthSessionData;
    user?: UserInfo;
    tokens?: TokenResponse;
  }
}

// =============================================================================
// Configuration
// =============================================================================

const config = {
  clientId: process.env.SENDSEVEN_CLIENT_ID || '',
  clientSecret: process.env.SENDSEVEN_CLIENT_SECRET || '',
  apiUrl: (process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com').replace(/\/$/, ''),
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/callback',
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
};

// JWKS cache (1 hour TTL)
const jwksCache: JWKSCache = {
  keys: [],
  fetchedAt: 0,
};

const JWKS_CACHE_TTL = 3600 * 1000; // 1 hour in ms

// =============================================================================
// PKCE Helpers
// =============================================================================

/**
 * Generate a cryptographically random code verifier for PKCE.
 * Must be between 43 and 128 characters, using URL-safe base64 characters.
 */
function generateCodeVerifier(length: number = 64): string {
  const buffer = crypto.randomBytes(length);
  return buffer.toString('base64url').slice(0, 128);
}

/**
 * Generate S256 code challenge from code verifier.
 * SHA-256 hash of the verifier, base64url encoded without padding.
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/**
 * Generate a random state parameter for CSRF protection.
 * At least 32 bytes for security.
 */
function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a random nonce for ID token replay protection.
 */
function generateNonce(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// =============================================================================
// OIDC Discovery and JWKS
// =============================================================================

/**
 * Fetch OIDC discovery document from well-known endpoint.
 */
async function getOIDCConfig(): Promise<OIDCConfig> {
  const response = await fetch(`${config.apiUrl}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC config: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<OIDCConfig>;
}

/**
 * Fetch JSON Web Key Set for ID token verification.
 * Caches keys for 1 hour to improve performance.
 */
async function getJWKS(jwksUri: string): Promise<JWKS> {
  const now = Date.now();

  // Return cached keys if still valid
  if (jwksCache.keys.length > 0 && now - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return { keys: jwksCache.keys };
  }

  // Fetch fresh keys
  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`);
  }

  const jwks = await response.json() as JWKS;
  jwksCache.keys = jwks.keys;
  jwksCache.fetchedAt = now;

  return jwks;
}

/**
 * Verify ID token signature and claims.
 *
 * Steps:
 * 1. Fetch OIDC config for issuer and jwks_uri
 * 2. Fetch JWKS and find matching key by kid
 * 3. Verify RS256 signature
 * 4. Validate claims (iss, aud, exp, nonce)
 */
async function verifyIDToken(idToken: string, expectedNonce: string): Promise<IDTokenClaims> {
  // Get OIDC config
  const oidcConfig = await getOIDCConfig();

  // Fetch JWKS
  const jwks = await getJWKS(oidcConfig.jwks_uri);

  // Decode header to get kid
  const protectedHeader = jose.decodeProtectedHeader(idToken);
  const kid = protectedHeader.kid;

  if (!kid) {
    throw new Error('ID token missing kid in header');
  }

  // Find matching key
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) {
    throw new Error(`No matching key found for kid: ${kid}`);
  }

  // Import the public key
  const publicKey = await jose.importJWK(jwk, 'RS256');

  // Verify and decode token
  const { payload } = await jose.jwtVerify(idToken, publicKey, {
    issuer: oidcConfig.issuer,
    audience: config.clientId,
  });

  const claims = payload as unknown as IDTokenClaims;

  // Verify nonce
  if (claims.nonce !== expectedNonce) {
    throw new Error(`Invalid nonce. Expected: ${expectedNonce}, Got: ${claims.nonce}`);
  }

  return claims;
}

// =============================================================================
// Token Operations
// =============================================================================

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const tokenUrl = `${config.apiUrl}/api/v1/oauth-apps/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json() as OAuthError;
    throw new Error(`Token exchange failed: ${error.error} - ${error.error_description || ''}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Refresh access token using refresh token.
 */
async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const tokenUrl = `${config.apiUrl}/api/v1/oauth-apps/token`;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json() as OAuthError;
    throw new Error(`Token refresh failed: ${error.error} - ${error.error_description || ''}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Revoke a token (access or refresh token).
 */
async function revokeToken(
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token' = 'refresh_token'
): Promise<void> {
  const revokeUrl = `${config.apiUrl}/api/v1/oauth-apps/revoke`;

  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(revokeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  // Revocation endpoint returns 200 even if token is invalid (per RFC 7009)
  if (!response.ok && response.status !== 200) {
    console.error('Token revocation failed:', response.status);
  }
}

/**
 * Fetch user information using access token.
 */
async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const userinfoUrl = `${config.apiUrl}/api/v1/oauth-apps/userinfo`;

  const response = await fetch(userinfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<UserInfo>;
}

// =============================================================================
// Express App
// =============================================================================

const app = express();

// Session middleware
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// =============================================================================
// Middleware
// =============================================================================

/**
 * Middleware to require authentication.
 */
const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// =============================================================================
// HTML Templates
// =============================================================================

function renderHome(user?: UserInfo, tokens?: TokenDisplayInfo): string {
  const userSection = user
    ? `
        <div class="card">
          <div class="user-info">
            <img src="${user.picture || ''}" alt="Avatar" class="avatar"
                 onerror="this.style.background='#6366f1'; this.src=''">
            <div>
              <h2 style="margin: 0;">${escapeHtml(user.name || 'Unknown User')}</h2>
              <p style="margin: 4px 0; color: #64748b;">${escapeHtml(user.email || '')}</p>
              ${user.tenant_id ? `<p style="margin: 4px 0; color: #94a3b8; font-size: 12px;">Tenant: ${escapeHtml(user.tenant_id)}</p>` : ''}
            </div>
          </div>
        </div>

        <h3>User Info</h3>
        <pre>${escapeHtml(JSON.stringify(user, null, 2))}</pre>

        ${tokens ? `
        <h3>Tokens</h3>
        <pre>${escapeHtml(JSON.stringify(tokens, null, 2))}</pre>
        ` : ''}

        <p>
          <a href="/refresh" class="btn">Refresh Token</a>
          <a href="/logout" class="logout" style="margin-left: 20px;">Logout</a>
        </p>
      `
    : `
        <p>This demo shows how to implement "Sign in with SendSeven" using OAuth2/OIDC.</p>
        <div class="features">
          <h3>Features Demonstrated:</h3>
          <ul>
            <li><strong>PKCE</strong> - Secure code exchange with S256 challenge</li>
            <li><strong>State</strong> - CSRF protection</li>
            <li><strong>Nonce</strong> - ID token replay protection</li>
            <li><strong>ID Token Verification</strong> - RS256 signature validation via JWKS</li>
            <li><strong>Token Refresh</strong> - Automatic token renewal</li>
            <li><strong>Token Revocation</strong> - Proper logout handling</li>
          </ul>
        </div>
        <p style="margin-top: 30px;">
          <a href="/login" class="btn">
            <svg style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
            Sign in with SendSeven
          </a>
        </p>
      `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login with SendSeven - Demo</title>
    <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f8fafc;
          color: #1e293b;
        }
        h1 {
          color: #0f172a;
          border-bottom: 2px solid #6366f1;
          padding-bottom: 12px;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          padding: 14px 28px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 16px;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
        }
        .card {
          background: white;
          border-radius: 16px;
          padding: 24px;
          margin: 20px 0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          object-fit: cover;
        }
        pre {
          background: #1e293b;
          color: #e2e8f0;
          padding: 20px;
          border-radius: 12px;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.5;
        }
        .logout {
          color: #ef4444;
          text-decoration: none;
          font-weight: 500;
        }
        .logout:hover {
          text-decoration: underline;
        }
        .features {
          background: white;
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
        }
        .features ul {
          margin: 12px 0;
          padding-left: 20px;
        }
        .features li {
          margin: 8px 0;
          color: #475569;
        }
        .features li strong {
          color: #6366f1;
        }
        h3 {
          color: #334155;
          margin-top: 30px;
        }
    </style>
</head>
<body>
    <h1>Login with SendSeven</h1>
    ${userSection}
</body>
</html>
  `;
}

function renderError(error: string, errorDescription: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Login with SendSeven</title>
    <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background: #f8fafc;
        }
        .error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 12px;
          padding: 24px;
        }
        .error h2 {
          color: #dc2626;
          margin-top: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .error h2::before {
          content: '';
          display: inline-block;
          width: 24px;
          height: 24px;
          background: #dc2626;
          border-radius: 50%;
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'/%3E%3C/svg%3E");
          -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'/%3E%3C/svg%3E");
        }
        .error p {
          color: #991b1b;
          margin-bottom: 0;
        }
        a {
          color: #6366f1;
          font-weight: 500;
        }
        a:hover {
          text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="error">
        <h2>${escapeHtml(error)}</h2>
        <p>${escapeHtml(errorDescription)}</p>
    </div>
    <p style="margin-top: 20px;"><a href="/">&larr; Back to Home</a></p>
</body>
</html>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// =============================================================================
// Routes
// =============================================================================

/**
 * Home page - show login button or user info
 */
app.get('/', (req: Request, res: Response) => {
  const user = req.session.user;
  let tokens: TokenDisplayInfo | undefined;

  if (user && req.session.tokens) {
    // Show safe token info (not full tokens)
    tokens = {
      access_token: req.session.tokens.access_token.slice(0, 20) + '...',
      token_type: req.session.tokens.token_type,
      expires_in: req.session.tokens.expires_in,
      scope: req.session.tokens.scope,
      has_refresh_token: !!req.session.tokens.refresh_token,
      has_id_token: !!req.session.tokens.id_token,
    };
  }

  res.send(renderHome(user, tokens));
});

/**
 * Initiate OAuth2 authorization flow.
 *
 * 1. Generate PKCE codes (code_verifier, code_challenge)
 * 2. Generate state (CSRF protection)
 * 3. Generate nonce (ID token replay protection)
 * 4. Store in session
 * 5. Redirect to SendSeven authorization endpoint
 */
app.get('/login', (req: Request, res: Response) => {
  // Generate PKCE codes
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Generate state and nonce
  const state = generateState();
  const nonce = generateNonce();

  // Store in session for callback verification
  req.session.oauth = {
    state,
    nonce,
    codeVerifier,
  };

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
  });

  const authUrl = `${config.apiUrl}/api/v1/oauth-apps/authorize?${params.toString()}`;
  console.log(`[Login] Redirecting to authorization endpoint`);
  console.log(`[Login] State: ${state.slice(0, 10)}...`);
  console.log(`[Login] Code challenge: ${codeChallenge.slice(0, 10)}...`);

  res.redirect(authUrl);
});

/**
 * OAuth2 callback handler.
 *
 * 1. Check for error response
 * 2. Validate state (CSRF protection)
 * 3. Exchange code for tokens
 * 4. Verify ID token (if present)
 * 5. Fetch user info
 * 6. Store in session
 */
app.get('/callback', async (req: Request, res: Response) => {
  try {
    // Check for error response
    const error = req.query.error as string | undefined;
    if (error) {
      const errorDescription = (req.query.error_description as string) || 'Unknown error';
      return res.send(renderError(error, errorDescription));
    }

    // Get authorization code and state
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      return res.send(renderError('invalid_request', 'Missing code or state parameter'));
    }

    // Validate state (CSRF protection)
    const storedOAuth = req.session.oauth;
    if (!storedOAuth || state !== storedOAuth.state) {
      return res.send(renderError('invalid_state', 'State mismatch - possible CSRF attack'));
    }

    const { codeVerifier, nonce } = storedOAuth;

    console.log(`[Callback] Received authorization code`);
    console.log(`[Callback] State validated successfully`);

    // Exchange code for tokens
    console.log(`[Callback] Exchanging code for tokens...`);
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    console.log(`[Callback] Tokens received successfully`);

    // Verify ID token if present
    if (tokens.id_token) {
      console.log(`[Callback] Verifying ID token...`);
      const claims = await verifyIDToken(tokens.id_token, nonce);
      console.log(`[Callback] ID token verified. Subject: ${claims.sub}`);
    }

    // Fetch user info
    console.log(`[Callback] Fetching user info...`);
    const userInfo = await fetchUserInfo(tokens.access_token);
    console.log(`[Callback] User authenticated: ${userInfo.email}`);

    // Store in session
    req.session.user = userInfo;
    req.session.tokens = tokens;

    // Clean up OAuth state
    delete req.session.oauth;

    res.redirect('/');
  } catch (err) {
    const error = err as Error;
    console.error('[Callback] Error:', error.message);
    res.send(renderError('callback_error', error.message));
  }
});

/**
 * Refresh access token using refresh token.
 */
app.get('/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    const tokens = req.session.tokens;
    if (!tokens?.refresh_token) {
      return res.send(
        renderError(
          'no_refresh_token',
          "No refresh token available. Login again with 'offline_access' scope."
        )
      );
    }

    console.log('[Refresh] Refreshing tokens...');
    const newTokens = await refreshTokens(tokens.refresh_token);
    console.log('[Refresh] Tokens refreshed successfully');

    // Update stored tokens
    req.session.tokens = newTokens;

    res.redirect('/');
  } catch (err) {
    const error = err as Error;
    console.error('[Refresh] Error:', error.message);

    // Clear session on refresh failure
    req.session.destroy(() => {});
    res.send(renderError('refresh_failed', `${error.message}. Please login again.`));
  }
});

/**
 * Logout - revoke tokens and clear session.
 */
app.get('/logout', async (req: Request, res: Response) => {
  try {
    const tokens = req.session.tokens;

    // Revoke refresh token (which also invalidates access token)
    if (tokens?.refresh_token) {
      console.log('[Logout] Revoking refresh token...');
      await revokeToken(tokens.refresh_token, 'refresh_token');
      console.log('[Logout] Token revoked successfully');
    }
  } catch (err) {
    const error = err as Error;
    console.error('[Logout] Token revocation failed (continuing):', error.message);
  }

  // Clear session
  req.session.destroy(() => {
    res.redirect('/');
  });
});

/**
 * API endpoint to get current user info (JSON).
 */
app.get('/api/user', requireAuth, (req: Request, res: Response) => {
  res.json(req.session.user);
});

/**
 * API endpoint to get OIDC discovery document.
 */
app.get('/api/oidc-config', async (req: Request, res: Response) => {
  try {
    const config = await getOIDCConfig();
    res.json(config);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// Main
// =============================================================================

function validateConfig(): void {
  if (!config.clientId || !config.clientSecret) {
    console.error('ERROR: SENDSEVEN_CLIENT_ID and SENDSEVEN_CLIENT_SECRET must be set!');
    console.error('Get your credentials from the SendSeven dashboard.');
    process.exit(1);
  }

  if (config.sessionSecret.length < 32) {
    console.warn('WARNING: SESSION_SECRET should be at least 32 characters for security.');
  }
}

validateConfig();

app.listen(config.port, () => {
  console.log('');
  console.log('========================================');
  console.log('  Login with SendSeven - TypeScript Demo');
  console.log('========================================');
  console.log('');
  console.log(`API URL:      ${config.apiUrl}`);
  console.log(`Redirect URI: ${config.redirectUri}`);
  console.log(`Port:         ${config.port}`);
  console.log('');
  console.log(`Open http://localhost:${config.port} in your browser`);
  console.log('');
});

export { app };
