/**
 * SendSeven API - Login with SendSeven Example (JavaScript/Express)
 *
 * Demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".
 *
 * Features:
 * - PKCE code generation (code_verifier, code_challenge with SHA-256)
 * - State parameter for CSRF protection
 * - Nonce parameter for ID token replay protection
 * - Full token exchange flow
 * - ID token verification using JWKS
 * - User info retrieval
 * - Token refresh
 * - Token revocation (logout)
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const app = express();

// =============================================================================
// Configuration
// =============================================================================

const CLIENT_ID = process.env.SENDSEVEN_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SENDSEVEN_CLIENT_SECRET || '';
const API_URL = (process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com').replace(/\/$/, '');
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const PORT = parseInt(process.env.PORT || '3000', 10);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// OIDC endpoints
const DISCOVERY_URL = `${API_URL}/.well-known/openid-configuration`;

// JWKS cache
let jwksCache = {
  keys: null,
  fetchedAt: 0,
  jwksSet: null,
};

// =============================================================================
// PKCE Helpers
// =============================================================================

/**
 * Generate a cryptographically random code verifier for PKCE.
 * Length must be between 43 and 128 characters, URL-safe.
 *
 * @param {number} length - Length of the verifier (43-128)
 * @returns {string} URL-safe random string
 */
function generateCodeVerifier(length = 64) {
  // Generate random bytes and convert to base64url
  const buffer = crypto.randomBytes(Math.ceil(length * 0.75));
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, length);
}

/**
 * Generate S256 code challenge from verifier.
 *
 * @param {string} verifier - The code verifier
 * @returns {string} Base64url-encoded SHA-256 hash
 */
function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a random state parameter for CSRF protection.
 *
 * @returns {string} 32-byte URL-safe random string
 */
function generateState() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a random nonce for ID token replay protection.
 *
 * @returns {string} 32-byte URL-safe random string
 */
function generateNonce() {
  return crypto.randomBytes(32).toString('base64url');
}

// =============================================================================
// OIDC Discovery and JWKS
// =============================================================================

/**
 * Fetch OIDC discovery document.
 *
 * @returns {Promise<Object>} OIDC configuration
 */
async function getOidcConfig() {
  const response = await fetch(DISCOVERY_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC config: ${response.status}`);
  }
  return response.json();
}

/**
 * Get JWKS (JSON Web Key Set) for ID token verification.
 * Caches the JWKS for 1 hour.
 *
 * @param {string} jwksUri - URL to fetch JWKS from
 * @returns {Promise<Function>} jose remote JWK set function
 */
async function getJwks(jwksUri) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  // Refresh cache if older than 1 hour or if URI changed
  if (!jwksCache.jwksSet || now - jwksCache.fetchedAt > oneHour) {
    jwksCache.jwksSet = createRemoteJWKSet(new URL(jwksUri));
    jwksCache.fetchedAt = now;
    console.log('JWKS cache refreshed');
  }

  return jwksCache.jwksSet;
}

/**
 * Verify ID token signature and claims.
 *
 * @param {string} idToken - The ID token to verify
 * @param {string} nonce - Expected nonce value
 * @returns {Promise<Object>} Verified token claims
 */
async function verifyIdToken(idToken, nonce) {
  // Get OIDC config for issuer and jwks_uri
  const oidcConfig = await getOidcConfig();
  const jwks = await getJwks(oidcConfig.jwks_uri);

  // Verify the token
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: oidcConfig.issuer,
    audience: CLIENT_ID,
    algorithms: ['RS256'],
  });

  // Verify nonce
  if (payload.nonce !== nonce) {
    throw new Error(`Invalid nonce: expected ${nonce}, got ${payload.nonce}`);
  }

  return payload;
}

// =============================================================================
// Express App Setup
// =============================================================================

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
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
// HTML Templates
// =============================================================================

const homeTemplate = (user, tokens) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login with SendSeven - Demo</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.6;
    }
    h1 { color: #0f172a; margin-bottom: 8px; }
    h2 { color: #334155; margin: 0; font-size: 1.25rem; }
    h3 { color: #475569; margin-top: 24px; margin-bottom: 12px; }
    p { color: #64748b; }
    .subtitle { color: #64748b; margin-top: 0; }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      border: none;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }
    .btn-secondary {
      background: #e2e8f0;
      color: #475569;
    }
    .btn-secondary:hover {
      background: #cbd5e1;
      box-shadow: none;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin: 20px 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 24px;
      font-weight: bold;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    .user-meta { color: #64748b; margin: 4px 0; font-size: 0.9rem; }
    pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.85rem;
      line-height: 1.5;
    }
    code { font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; }
    .logout { color: #ef4444; text-decoration: none; font-weight: 500; }
    .logout:hover { text-decoration: underline; }
    .actions { display: flex; gap: 12px; align-items: center; margin-top: 24px; }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      background: #dcfce7;
      color: #166534;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .feature-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin: 24px 0;
    }
    .feature {
      background: white;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .feature h4 { margin: 0 0 8px; color: #1e293b; font-size: 0.9rem; }
    .feature p { margin: 0; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>Login with SendSeven</h1>
  <p class="subtitle">OAuth2/OIDC Authorization Code flow with PKCE</p>

  ${
    user
      ? `
    <div class="card">
      <div class="user-info">
        <div class="avatar">
          ${user.picture ? `<img src="${escapeHtml(user.picture)}" alt="Avatar" onerror="this.parentElement.innerHTML='${escapeHtml((user.name || 'U')[0].toUpperCase())}'">` : escapeHtml((user.name || 'U')[0].toUpperCase())}
        </div>
        <div>
          <h2>${escapeHtml(user.name || 'Unknown User')}</h2>
          <p class="user-meta">${escapeHtml(user.email || '')}</p>
          ${user.email_verified ? '<span class="badge">Email Verified</span>' : ''}
        </div>
      </div>
    </div>

    <h3>User Info (from /userinfo endpoint)</h3>
    <pre><code>${escapeHtml(JSON.stringify(user, null, 2))}</code></pre>

    ${
      tokens
        ? `
    <h3>Token Information</h3>
    <pre><code>${escapeHtml(JSON.stringify(tokens, null, 2))}</code></pre>
    `
        : ''
    }

    <div class="actions">
      <a href="/refresh" class="btn btn-secondary">Refresh Token</a>
      <a href="/logout" class="logout">Sign Out</a>
    </div>
  `
      : `
    <p>This demo shows how to implement "Sign in with SendSeven" using OAuth2/OIDC.</p>

    <div class="feature-list">
      <div class="feature">
        <h4>PKCE Security</h4>
        <p>Code verifier + SHA-256 challenge</p>
      </div>
      <div class="feature">
        <h4>CSRF Protection</h4>
        <p>State parameter validation</p>
      </div>
      <div class="feature">
        <h4>ID Token Verification</h4>
        <p>RS256 signature via JWKS</p>
      </div>
      <div class="feature">
        <h4>Token Refresh</h4>
        <p>Automatic token renewal</p>
      </div>
    </div>

    <a href="/login" class="btn">Sign in with SendSeven</a>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Click "Sign in"</strong> - Generates PKCE codes, state, and nonce</li>
      <li><strong>Redirect to SendSeven</strong> - User authenticates and grants consent</li>
      <li><strong>Handle callback</strong> - Validate state, exchange code for tokens</li>
      <li><strong>Verify ID token</strong> - Check RS256 signature using JWKS</li>
      <li><strong>Fetch user info</strong> - Get user profile from /userinfo</li>
    </ol>
  `
  }
</body>
</html>
`;

const errorTemplate = (error, description, details = null) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Login with SendSeven</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f8fafc;
      color: #1e293b;
    }
    h1 { color: #0f172a; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 12px;
      padding: 24px;
    }
    .error h2 { color: #dc2626; margin-top: 0; font-size: 1.25rem; }
    .error p { color: #991b1b; margin-bottom: 0; }
    .error-code {
      font-family: monospace;
      background: #fee2e2;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    a { color: #6366f1; }
    pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.85rem;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <h1>Authentication Error</h1>
  <div class="error">
    <h2><span class="error-code">${escapeHtml(error)}</span></h2>
    <p>${escapeHtml(description)}</p>
    ${details ? `<pre>${escapeHtml(typeof details === 'string' ? details : JSON.stringify(details, null, 2))}</pre>` : ''}
  </div>
  <p style="margin-top: 24px;"><a href="/">Back to Home</a></p>
</body>
</html>
`;

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// Routes
// =============================================================================

/**
 * Home page - Show login button or user info.
 */
app.get('/', (req, res) => {
  const user = req.session.user || null;
  let tokens = null;

  if (user && req.session.tokens) {
    // Don't expose full tokens in UI, just metadata
    tokens = {
      access_token: req.session.tokens.access_token.slice(0, 20) + '...',
      token_type: req.session.tokens.token_type,
      expires_in: req.session.tokens.expires_in,
      scope: req.session.tokens.scope,
      has_refresh_token: Boolean(req.session.tokens.refresh_token),
      has_id_token: Boolean(req.session.tokens.id_token),
    };
  }

  res.send(homeTemplate(user, tokens));
});

/**
 * Login - Initiate OAuth2 authorization flow.
 *
 * 1. Generates PKCE code verifier and challenge
 * 2. Generates state for CSRF protection
 * 3. Generates nonce for ID token replay protection
 * 4. Stores all in session
 * 5. Redirects to SendSeven's authorization endpoint
 */
app.get('/login', async (req, res) => {
  try {
    // Generate PKCE codes
    const codeVerifier = generateCodeVerifier(64);
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Generate state and nonce
    const state = generateState();
    const nonce = generateNonce();

    // Store in session for callback verification
    req.session.oauthState = state;
    req.session.oauthNonce = nonce;
    req.session.oauthCodeVerifier = codeVerifier;

    // Save session before redirect
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile email offline_access',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      nonce: nonce,
    });

    const authUrl = `${API_URL}/api/v1/oauth-apps/authorize?${params.toString()}`;
    console.log(`Redirecting to: ${authUrl}`);

    res.redirect(authUrl);
  } catch (error) {
    console.error('Login initiation failed:', error);
    res.status(500).send(errorTemplate('login_failed', 'Failed to initiate login', error.message));
  }
});

/**
 * Callback - Handle OAuth2 callback.
 *
 * 1. Validates state (CSRF protection)
 * 2. Exchanges authorization code for tokens
 * 3. Verifies ID token signature and claims
 * 4. Fetches user info from /userinfo endpoint
 * 5. Stores user and tokens in session
 */
app.get('/callback', async (req, res) => {
  try {
    // Check for error response from authorization server
    if (req.query.error) {
      return res.status(400).send(
        errorTemplate(
          req.query.error,
          req.query.error_description || 'Authorization failed'
        )
      );
    }

    // Get authorization code and state
    const code = req.query.code;
    const state = req.query.state;

    if (!code || !state) {
      return res.status(400).send(
        errorTemplate(
          'invalid_request',
          'Missing code or state parameter in callback'
        )
      );
    }

    // Validate state (CSRF protection)
    const storedState = req.session.oauthState;
    if (!storedState || state !== storedState) {
      return res.status(400).send(
        errorTemplate(
          'invalid_state',
          'State mismatch - possible CSRF attack. The state parameter does not match the one stored in your session.'
        )
      );
    }

    // Get stored PKCE verifier and nonce
    const codeVerifier = req.session.oauthCodeVerifier;
    const nonce = req.session.oauthNonce;

    if (!codeVerifier) {
      return res.status(400).send(
        errorTemplate(
          'invalid_request',
          'Missing code verifier. Session may have expired.'
        )
      );
    }

    // Exchange authorization code for tokens
    console.log('Exchanging authorization code for tokens...');

    const tokenUrl = `${API_URL}/api/v1/oauth-apps/token`;
    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenData,
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      let errorDetail;
      try {
        errorDetail = JSON.parse(errorBody);
      } catch {
        errorDetail = errorBody;
      }
      return res.status(400).send(
        errorTemplate(
          'token_exchange_failed',
          'Failed to exchange authorization code for tokens',
          errorDetail
        )
      );
    }

    const tokens = await tokenResponse.json();
    console.log('Token exchange successful');

    // Verify ID token if present
    if (tokens.id_token && nonce) {
      try {
        console.log('Verifying ID token...');
        const idTokenClaims = await verifyIdToken(tokens.id_token, nonce);
        console.log('ID token verified. Subject:', idTokenClaims.sub);
      } catch (error) {
        console.error('ID token verification failed:', error);
        return res.status(400).send(
          errorTemplate(
            'id_token_verification_failed',
            'Failed to verify ID token signature or claims',
            error.message
          )
        );
      }
    }

    // Fetch user info
    console.log('Fetching user info...');
    const userInfoUrl = `${API_URL}/api/v1/oauth-apps/userinfo`;
    const userInfoResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      const errorBody = await userInfoResponse.text();
      return res.status(400).send(
        errorTemplate(
          'userinfo_failed',
          'Failed to fetch user information',
          errorBody
        )
      );
    }

    const userInfo = await userInfoResponse.json();
    console.log('User authenticated:', userInfo.email);

    // Store in session
    req.session.user = userInfo;
    req.session.tokens = tokens;

    // Clean up OAuth state
    delete req.session.oauthState;
    delete req.session.oauthNonce;
    delete req.session.oauthCodeVerifier;

    // Redirect to home
    res.redirect('/');
  } catch (error) {
    console.error('Callback handling failed:', error);
    res.status(500).send(
      errorTemplate(
        'callback_error',
        'An unexpected error occurred during authentication',
        error.message
      )
    );
  }
});

/**
 * Refresh - Refresh the access token using the refresh token.
 */
app.get('/refresh', async (req, res) => {
  // Check if user is logged in
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const tokens = req.session.tokens || {};
  const refreshToken = tokens.refresh_token;

  if (!refreshToken) {
    return res.status(400).send(
      errorTemplate(
        'no_refresh_token',
        'No refresh token available. Login again with "offline_access" scope to get a refresh token.'
      )
    );
  }

  try {
    console.log('Refreshing tokens...');

    const tokenUrl = `${API_URL}/api/v1/oauth-apps/token`;
    const tokenData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenData,
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      // Clear session on refresh failure (token likely revoked)
      req.session.destroy(() => {});
      return res.status(400).send(
        errorTemplate(
          'refresh_failed',
          'Failed to refresh token. Your session may have been revoked. Please login again.',
          errorBody
        )
      );
    }

    const newTokens = await tokenResponse.json();
    console.log('Tokens refreshed successfully');

    // Update stored tokens
    req.session.tokens = newTokens;

    res.redirect('/');
  } catch (error) {
    console.error('Token refresh failed:', error);
    res.status(500).send(
      errorTemplate(
        'refresh_error',
        'An unexpected error occurred while refreshing tokens',
        error.message
      )
    );
  }
});

/**
 * Logout - Revoke tokens and clear session.
 */
app.get('/logout', async (req, res) => {
  const tokens = req.session.tokens || {};

  // Revoke refresh token (which also invalidates the authorization)
  const refreshToken = tokens.refresh_token;
  if (refreshToken) {
    try {
      console.log('Revoking tokens...');

      const revokeUrl = `${API_URL}/api/v1/oauth-apps/revoke`;
      const revokeData = new URLSearchParams({
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });

      await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: revokeData,
      });

      console.log('Token revoked successfully');
    } catch (error) {
      // Log but don't fail - user should be logged out either way
      console.error('Failed to revoke token (continuing with logout):', error);
    }
  }

  // Clear session
  req.session.destroy((err) => {
    if (err) {
      console.error('Failed to destroy session:', err);
    }
    res.redirect('/');
  });
});

/**
 * API endpoint to get current user info (for programmatic access).
 */
app.get('/api/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

/**
 * API endpoint to get current tokens (for debugging).
 */
app.get('/api/tokens', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const tokens = req.session.tokens || {};
  res.json({
    access_token: tokens.access_token ? `${tokens.access_token.slice(0, 20)}...` : null,
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
    has_refresh_token: Boolean(tokens.refresh_token),
    has_id_token: Boolean(tokens.id_token),
  });
});

// =============================================================================
// Server Startup
// =============================================================================

function validateConfig() {
  const errors = [];

  if (!CLIENT_ID) {
    errors.push('SENDSEVEN_CLIENT_ID environment variable is required');
  }

  if (!CLIENT_SECRET) {
    errors.push('SENDSEVEN_CLIENT_SECRET environment variable is required');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error('\nGet your OAuth app credentials from the SendSeven dashboard.');
    process.exit(1);
  }
}

// Validate configuration
validateConfig();

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('====================================================');
  console.log('  Login with SendSeven - OAuth2/OIDC Demo');
  console.log('====================================================');
  console.log('');
  console.log(`  Server:       http://localhost:${PORT}`);
  console.log(`  API URL:      ${API_URL}`);
  console.log(`  Redirect URI: ${REDIRECT_URI}`);
  console.log(`  Client ID:    ${CLIENT_ID.slice(0, 20)}...`);
  console.log('');
  console.log('  Open http://localhost:' + PORT + ' in your browser');
  console.log('');
});
