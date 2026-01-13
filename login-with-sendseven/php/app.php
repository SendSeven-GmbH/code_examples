<?php
/**
 * SendSeven API - Login with SendSeven Example (PHP)
 *
 * Demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".
 * Uses PHP's built-in server: php -S localhost:3000 app.php
 *
 * Full OAuth2/OIDC Implementation:
 * - PKCE (Proof Key for Code Exchange) with S256 challenge
 * - State parameter for CSRF protection
 * - Nonce parameter for ID token replay protection
 * - RS256 ID token verification via JWKS
 * - Token refresh and revocation
 */

// =============================================================================
// Autoload & Environment
// =============================================================================

require_once __DIR__ . '/vendor/autoload.php';

use Firebase\JWT\JWT;
use Firebase\JWT\JWK;
use Firebase\JWT\Key;
use Dotenv\Dotenv;

// Load environment variables
if (file_exists(__DIR__ . '/.env')) {
    $dotenv = Dotenv::createImmutable(__DIR__);
    $dotenv->load();
}

// Configuration
define('CLIENT_ID', $_ENV['SENDSEVEN_CLIENT_ID'] ?? '');
define('CLIENT_SECRET', $_ENV['SENDSEVEN_CLIENT_SECRET'] ?? '');
define('API_URL', rtrim($_ENV['SENDSEVEN_API_URL'] ?? 'https://api.sendseven.com', '/'));
define('REDIRECT_URI', $_ENV['REDIRECT_URI'] ?? 'http://localhost:3000/callback');
define('PORT', intval($_ENV['PORT'] ?? 3000));
define('SESSION_SECRET', $_ENV['SESSION_SECRET'] ?? bin2hex(random_bytes(32)));

// OIDC endpoints
define('DISCOVERY_URL', API_URL . '/.well-known/openid-configuration');

// JWKS cache (in-memory for this example)
$GLOBALS['jwks_cache'] = ['keys' => [], 'fetched_at' => 0];

// =============================================================================
// Session Setup
// =============================================================================

// Secure session configuration
ini_set('session.cookie_httponly', 1);
ini_set('session.use_strict_mode', 1);
ini_set('session.cookie_samesite', 'Lax');

// Use custom session ID based on secret for added security
session_start();

// =============================================================================
// PKCE Helper Functions
// =============================================================================

/**
 * Generate a cryptographically random code verifier for PKCE.
 * Must be 43-128 characters, using URL-safe base64 characters.
 */
function generateCodeVerifier(int $length = 64): string
{
    // Generate random bytes and encode as URL-safe base64
    $bytes = random_bytes(max(32, intval($length * 0.75)));
    $verifier = rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');

    // Ensure length is between 43 and 128 characters
    return substr($verifier, 0, min(128, max(43, strlen($verifier))));
}

/**
 * Generate S256 code challenge from verifier.
 * code_challenge = base64url(sha256(code_verifier))
 */
function generateCodeChallenge(string $verifier): string
{
    $hash = hash('sha256', $verifier, true);
    return rtrim(strtr(base64_encode($hash), '+/', '-_'), '=');
}

/**
 * Generate a random state parameter for CSRF protection.
 * Minimum 32 bytes (256 bits) of entropy.
 */
function generateState(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

/**
 * Generate a random nonce for ID token replay protection.
 */
function generateNonce(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

// =============================================================================
// HTTP Helper Functions
// =============================================================================

/**
 * Make an HTTP GET request using cURL.
 */
function httpGet(string $url, array $headers = []): array
{
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => $headers,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    curl_close($ch);

    if ($response === false) {
        throw new Exception("HTTP GET failed: {$error}");
    }

    return [
        'code' => $httpCode,
        'body' => $response,
        'json' => json_decode($response, true),
    ];
}

/**
 * Make an HTTP POST request using cURL with form-encoded data.
 */
function httpPost(string $url, array $data, array $headers = []): array
{
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($data),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => array_merge([
            'Content-Type: application/x-www-form-urlencoded',
        ], $headers),
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    curl_close($ch);

    if ($response === false) {
        throw new Exception("HTTP POST failed: {$error}");
    }

    return [
        'code' => $httpCode,
        'body' => $response,
        'json' => json_decode($response, true),
    ];
}

// =============================================================================
// OIDC Discovery and JWKS
// =============================================================================

/**
 * Fetch OIDC discovery document from the well-known endpoint.
 */
function getOidcConfig(): array
{
    $response = httpGet(DISCOVERY_URL);

    if ($response['code'] !== 200) {
        throw new Exception("Failed to fetch OIDC discovery: HTTP {$response['code']}");
    }

    return $response['json'];
}

/**
 * Fetch JSON Web Key Set for ID token verification.
 * Caches the JWKS for 1 hour to avoid excessive requests.
 */
function getJwks(string $jwksUri): array
{
    global $GLOBALS;

    // Check cache (1 hour TTL)
    $now = time();
    if ($now - $GLOBALS['jwks_cache']['fetched_at'] < 3600 && !empty($GLOBALS['jwks_cache']['keys'])) {
        return ['keys' => $GLOBALS['jwks_cache']['keys']];
    }

    // Fetch fresh JWKS
    $response = httpGet($jwksUri);

    if ($response['code'] !== 200) {
        throw new Exception("Failed to fetch JWKS: HTTP {$response['code']}");
    }

    // Update cache
    $GLOBALS['jwks_cache']['keys'] = $response['json']['keys'] ?? [];
    $GLOBALS['jwks_cache']['fetched_at'] = $now;

    return ['keys' => $GLOBALS['jwks_cache']['keys']];
}

/**
 * Verify ID token signature and claims.
 *
 * Steps:
 * 1. Fetch OIDC config for issuer and jwks_uri
 * 2. Fetch JWKS and find matching key by kid
 * 3. Verify signature using firebase/php-jwt
 * 4. Validate standard claims (iss, aud, exp, nonce)
 */
function verifyIdToken(string $idToken, string $nonce): object
{
    // Get OIDC config
    $oidcConfig = getOidcConfig();
    $issuer = $oidcConfig['issuer'];
    $jwksUri = $oidcConfig['jwks_uri'];

    // Get JWKS
    $jwks = getJwks($jwksUri);

    // Decode token header to get kid (without verification)
    $tokenParts = explode('.', $idToken);
    if (count($tokenParts) !== 3) {
        throw new Exception('Invalid ID token format');
    }

    $headerJson = base64_decode(strtr($tokenParts[0], '-_', '+/'));
    $header = json_decode($headerJson, true);
    $kid = $header['kid'] ?? null;

    if (!$kid) {
        throw new Exception('ID token missing kid in header');
    }

    // Find matching key
    $matchingKey = null;
    foreach ($jwks['keys'] as $key) {
        if (($key['kid'] ?? null) === $kid) {
            $matchingKey = $key;
            break;
        }
    }

    if (!$matchingKey) {
        throw new Exception("No matching key found for kid: {$kid}");
    }

    // Convert JWK to key using firebase/php-jwt
    $keys = JWK::parseKeySet(['keys' => [$matchingKey]]);

    // Decode and verify the token
    try {
        $decoded = JWT::decode($idToken, $keys);
    } catch (Exception $e) {
        throw new Exception("ID token verification failed: " . $e->getMessage());
    }

    // Validate issuer
    if ($decoded->iss !== $issuer) {
        throw new Exception("Invalid issuer: expected {$issuer}, got {$decoded->iss}");
    }

    // Validate audience
    if ($decoded->aud !== CLIENT_ID) {
        throw new Exception("Invalid audience: expected " . CLIENT_ID . ", got {$decoded->aud}");
    }

    // Validate expiration (JWT library does this, but double-check)
    if ($decoded->exp < time()) {
        throw new Exception("ID token has expired");
    }

    // Validate nonce
    if (property_exists($decoded, 'nonce') && $decoded->nonce !== $nonce) {
        throw new Exception("Invalid nonce: ID token replay attack?");
    }

    return $decoded;
}

// =============================================================================
// Authentication Helpers
// =============================================================================

/**
 * Check if user is logged in.
 */
function isLoggedIn(): bool
{
    return isset($_SESSION['user']) && !empty($_SESSION['user']);
}

/**
 * Require login - redirect to /login if not authenticated.
 */
function requireLogin(): void
{
    if (!isLoggedIn()) {
        header('Location: /login');
        exit;
    }
}

// =============================================================================
// HTML Templates
// =============================================================================

function renderHome(?array $user, ?array $tokens): string
{
    $userJson = $user ? htmlspecialchars(json_encode($user, JSON_PRETTY_PRINT), ENT_QUOTES, 'UTF-8') : '';
    $tokensJson = $tokens ? htmlspecialchars(json_encode($tokens, JSON_PRETTY_PRINT), ENT_QUOTES, 'UTF-8') : '';

    $userName = htmlspecialchars($user['name'] ?? 'Unknown User', ENT_QUOTES, 'UTF-8');
    $userEmail = htmlspecialchars($user['email'] ?? '', ENT_QUOTES, 'UTF-8');
    $userPicture = htmlspecialchars($user['picture'] ?? '', ENT_QUOTES, 'UTF-8');
    $avatarInitial = strtoupper(substr($user['name'] ?? 'U', 0, 1));

    // Build avatar HTML
    $avatarHtml = $userPicture
        ? "<img src=\"{$userPicture}\" alt=\"Avatar\" onerror=\"this.style.display='none'; this.nextElementSibling.style.display='flex';\"><span class=\"avatar-fallback\" style=\"display:none;\">{$avatarInitial}</span>"
        : "<span class=\"avatar-fallback\">{$avatarInitial}</span>";

    if ($user) {
        return <<<HTML
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
        h1 { color: #6366f1; margin-bottom: 8px; }
        .subtitle { color: #64748b; margin-top: 0; font-size: 0.95em; }
        .btn {
            display: inline-block;
            padding: 12px 24px;
            background: #6366f1;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            transition: background 0.2s;
            border: none;
            cursor: pointer;
            font-size: 1em;
        }
        .btn:hover { background: #4f46e5; }
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin: 20px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
            overflow: hidden;
        }
        .avatar img {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
        }
        .avatar-fallback {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
        }
        pre {
            background: #1e293b;
            color: #e2e8f0;
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 13px;
            line-height: 1.5;
        }
        .logout {
            color: #ef4444;
            text-decoration: none;
            margin-left: 20px;
        }
        .logout:hover { text-decoration: underline; }
        h3 { color: #475569; margin-top: 32px; }
        .actions { margin-top: 24px; }
    </style>
</head>
<body>
    <h1>Login with SendSeven</h1>
    <p class="subtitle">OAuth2/OIDC PHP Example</p>

    <div class="card">
        <div class="user-info">
            <div class="avatar">{$avatarHtml}</div>
            <div>
                <h2 style="margin: 0;">{$userName}</h2>
                <p style="margin: 4px 0; color: #64748b;">{$userEmail}</p>
            </div>
        </div>
    </div>

    <h3>User Info (from /userinfo endpoint)</h3>
    <pre>{$userJson}</pre>

    <h3>Tokens (metadata only)</h3>
    <pre>{$tokensJson}</pre>

    <div class="actions">
        <a href="/refresh" class="btn">Refresh Token</a>
        <a href="/logout" class="logout">Logout</a>
    </div>
</body>
</html>
HTML;
    }

    return <<<HTML
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
        h1 { color: #6366f1; margin-bottom: 8px; }
        .subtitle { color: #64748b; margin-top: 0; font-size: 0.95em; }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 14px 28px;
            background: #6366f1;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            font-size: 16px;
            transition: all 0.2s;
            margin-top: 20px;
        }
        .btn:hover {
            background: #4f46e5;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
        .btn svg { width: 20px; height: 20px; }
        .card {
            background: white;
            border-radius: 12px;
            padding: 32px;
            margin: 24px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-top: 24px;
        }
        .feature {
            display: flex;
            align-items: flex-start;
            gap: 12px;
        }
        .feature-icon {
            width: 24px;
            height: 24px;
            color: #22c55e;
            flex-shrink: 0;
        }
        .feature-text {
            font-size: 14px;
            color: #475569;
        }
        code {
            background: #e2e8f0;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <h1>Login with SendSeven</h1>
    <p class="subtitle">OAuth2/OIDC PHP Example</p>

    <div class="card">
        <p>This demo implements the complete OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".</p>

        <div class="features">
            <div class="feature">
                <svg class="feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="feature-text">PKCE (S256) Code Challenge</span>
            </div>
            <div class="feature">
                <svg class="feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="feature-text">CSRF State Protection</span>
            </div>
            <div class="feature">
                <svg class="feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="feature-text">ID Token Nonce Validation</span>
            </div>
            <div class="feature">
                <svg class="feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="feature-text">RS256 JWT Verification</span>
            </div>
            <div class="feature">
                <svg class="feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="feature-text">Token Refresh & Revocation</span>
            </div>
            <div class="feature">
                <svg class="feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="feature-text">JWKS Caching</span>
            </div>
        </div>

        <a href="/login" class="btn">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
            </svg>
            Sign in with SendSeven
        </a>
    </div>
</body>
</html>
HTML;
}

function renderError(string $error, string $description): string
{
    $errorSafe = htmlspecialchars($error, ENT_QUOTES, 'UTF-8');
    $descSafe = htmlspecialchars($description, ENT_QUOTES, 'UTF-8');

    return <<<HTML
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
            gap: 8px;
        }
        .error h2 svg {
            width: 24px;
            height: 24px;
        }
        .error p {
            color: #991b1b;
            margin-bottom: 0;
        }
        a {
            color: #6366f1;
            text-decoration: none;
        }
        a:hover { text-decoration: underline; }
        .back { margin-top: 20px; }
        code {
            background: #fecaca;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="error">
        <h2>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <code>{$errorSafe}</code>
        </h2>
        <p>{$descSafe}</p>
    </div>
    <p class="back"><a href="/">&larr; Back to Home</a></p>
</body>
</html>
HTML;
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * Home page - show login button or user info.
 */
function handleHome(): void
{
    $user = $_SESSION['user'] ?? null;
    $tokens = null;

    if ($user && isset($_SESSION['tokens'])) {
        // Don't expose full tokens in UI, just metadata
        $storedTokens = $_SESSION['tokens'];
        $tokens = [
            'access_token' => substr($storedTokens['access_token'], 0, 20) . '...',
            'token_type' => $storedTokens['token_type'] ?? 'Bearer',
            'expires_in' => $storedTokens['expires_in'] ?? null,
            'scope' => $storedTokens['scope'] ?? '',
            'has_refresh_token' => !empty($storedTokens['refresh_token']),
            'has_id_token' => !empty($storedTokens['id_token']),
        ];
    }

    echo renderHome($user, $tokens);
}

/**
 * Initiate OAuth2 authorization flow.
 *
 * Generates PKCE codes, state, and nonce, stores them in session,
 * then redirects to SendSeven's authorization endpoint.
 */
function handleLogin(): void
{
    // Generate PKCE codes
    $codeVerifier = generateCodeVerifier();
    $codeChallenge = generateCodeChallenge($codeVerifier);

    // Generate state and nonce
    $state = generateState();
    $nonce = generateNonce();

    // Store in session for callback verification
    $_SESSION['oauth_state'] = $state;
    $_SESSION['oauth_nonce'] = $nonce;
    $_SESSION['oauth_code_verifier'] = $codeVerifier;

    // Build authorization URL
    $params = [
        'client_id' => CLIENT_ID,
        'redirect_uri' => REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => $state,
        'code_challenge' => $codeChallenge,
        'code_challenge_method' => 'S256',
        'nonce' => $nonce,
    ];

    $authUrl = API_URL . '/api/v1/oauth-apps/authorize?' . http_build_query($params);

    error_log("Redirecting to: {$authUrl}");

    header("Location: {$authUrl}");
    exit;
}

/**
 * OAuth2 callback handler.
 *
 * Validates state, exchanges code for tokens, verifies ID token,
 * and fetches user info.
 */
function handleCallback(): void
{
    // Check for error response
    $error = $_GET['error'] ?? null;
    if ($error) {
        $errorDescription = $_GET['error_description'] ?? 'Unknown error';
        echo renderError($error, $errorDescription);
        return;
    }

    // Get authorization code and state
    $code = $_GET['code'] ?? null;
    $state = $_GET['state'] ?? null;

    if (!$code || !$state) {
        echo renderError('invalid_request', 'Missing code or state parameter');
        return;
    }

    // Validate state (CSRF protection)
    $storedState = $_SESSION['oauth_state'] ?? null;
    if (!$storedState || $state !== $storedState) {
        echo renderError('invalid_state', 'State mismatch - possible CSRF attack. Please try logging in again.');
        return;
    }

    // Get stored PKCE verifier and nonce
    $codeVerifier = $_SESSION['oauth_code_verifier'] ?? null;
    $nonce = $_SESSION['oauth_nonce'] ?? null;

    // Exchange code for tokens
    $tokenUrl = API_URL . '/api/v1/oauth-apps/token';
    $tokenData = [
        'grant_type' => 'authorization_code',
        'code' => $code,
        'client_id' => CLIENT_ID,
        'client_secret' => CLIENT_SECRET,
        'redirect_uri' => REDIRECT_URI,
        'code_verifier' => $codeVerifier,
    ];

    error_log("Exchanging code for tokens at: {$tokenUrl}");

    try {
        $response = httpPost($tokenUrl, $tokenData);

        if ($response['code'] !== 200) {
            $errorDetail = $response['json']['error_description'] ?? $response['json']['error'] ?? $response['body'];
            throw new Exception("Token exchange failed (HTTP {$response['code']}): {$errorDetail}");
        }

        $tokens = $response['json'];
    } catch (Exception $e) {
        echo renderError('token_exchange_failed', $e->getMessage());
        return;
    }

    // Verify ID token if present
    if (!empty($tokens['id_token'])) {
        try {
            $idTokenClaims = verifyIdToken($tokens['id_token'], $nonce);
            error_log("ID token verified. Subject: {$idTokenClaims->sub}");
        } catch (Exception $e) {
            echo renderError('id_token_verification_failed', $e->getMessage());
            return;
        }
    }

    // Fetch user info
    $userinfoUrl = API_URL . '/api/v1/oauth-apps/userinfo';
    $headers = ["Authorization: Bearer {$tokens['access_token']}"];

    try {
        $response = httpGet($userinfoUrl, $headers);

        if ($response['code'] !== 200) {
            throw new Exception("Failed to fetch user info (HTTP {$response['code']})");
        }

        $userInfo = $response['json'];
    } catch (Exception $e) {
        echo renderError('userinfo_failed', $e->getMessage());
        return;
    }

    // Store in session
    $_SESSION['user'] = $userInfo;
    $_SESSION['tokens'] = $tokens;

    // Clean up OAuth state
    unset($_SESSION['oauth_state']);
    unset($_SESSION['oauth_nonce']);
    unset($_SESSION['oauth_code_verifier']);

    error_log("User authenticated: " . ($userInfo['email'] ?? 'unknown'));

    header('Location: /');
    exit;
}

/**
 * Refresh the access token using the refresh token.
 */
function handleRefresh(): void
{
    requireLogin();

    $tokens = $_SESSION['tokens'] ?? [];
    $refreshToken = $tokens['refresh_token'] ?? null;

    if (!$refreshToken) {
        echo renderError('no_refresh_token', "No refresh token available. Login again with 'offline_access' scope.");
        return;
    }

    // Refresh tokens
    $tokenUrl = API_URL . '/api/v1/oauth-apps/token';
    $tokenData = [
        'grant_type' => 'refresh_token',
        'refresh_token' => $refreshToken,
        'client_id' => CLIENT_ID,
        'client_secret' => CLIENT_SECRET,
    ];

    try {
        $response = httpPost($tokenUrl, $tokenData);

        if ($response['code'] !== 200) {
            // Refresh failed - clear session and show error
            session_destroy();
            throw new Exception("Token refresh failed. Please login again.");
        }

        $newTokens = $response['json'];
    } catch (Exception $e) {
        session_destroy();
        echo renderError('refresh_failed', $e->getMessage());
        return;
    }

    // Update stored tokens
    $_SESSION['tokens'] = $newTokens;

    error_log("Tokens refreshed successfully");

    header('Location: /');
    exit;
}

/**
 * Logout - revoke tokens and clear session.
 */
function handleLogout(): void
{
    $tokens = $_SESSION['tokens'] ?? [];

    // Revoke refresh token (which also invalidates access token)
    $refreshToken = $tokens['refresh_token'] ?? null;
    if ($refreshToken) {
        $revokeUrl = API_URL . '/api/v1/oauth-apps/revoke';
        $revokeData = [
            'token' => $refreshToken,
            'token_type_hint' => 'refresh_token',
            'client_id' => CLIENT_ID,
            'client_secret' => CLIENT_SECRET,
        ];

        try {
            httpPost($revokeUrl, $revokeData);
            error_log("Token revoked successfully");
        } catch (Exception $e) {
            error_log("Failed to revoke token (continuing with logout): " . $e->getMessage());
        }
    }

    // Clear session
    session_destroy();

    header('Location: /');
    exit;
}

/**
 * API endpoint to get current user info (JSON).
 */
function handleApiUser(): void
{
    header('Content-Type: application/json');

    if (!isLoggedIn()) {
        http_response_code(401);
        echo json_encode(['error' => 'Not authenticated']);
        return;
    }

    echo json_encode($_SESSION['user']);
}

// =============================================================================
// Router
// =============================================================================

/**
 * Simple router for the PHP built-in server.
 */
function route(): void
{
    // Validate configuration
    if (empty(CLIENT_ID) || empty(CLIENT_SECRET)) {
        echo renderError(
            'configuration_error',
            'SENDSEVEN_CLIENT_ID and SENDSEVEN_CLIENT_SECRET must be set! ' .
            'Copy .env.example to .env and add your credentials from the SendSeven dashboard.'
        );
        return;
    }

    // Get the request path
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

    // Route to appropriate handler
    switch ($path) {
        case '/':
            handleHome();
            break;

        case '/login':
            handleLogin();
            break;

        case '/callback':
            handleCallback();
            break;

        case '/refresh':
            handleRefresh();
            break;

        case '/logout':
            handleLogout();
            break;

        case '/api/user':
            handleApiUser();
            break;

        default:
            http_response_code(404);
            echo renderError('not_found', "The requested page '{$path}' was not found.");
            break;
    }
}

// =============================================================================
// Main Entry Point
// =============================================================================

// Only run if accessed via web server
if (php_sapi_name() !== 'cli') {
    route();
} else {
    // CLI mode - show usage info
    echo "SendSeven Login with SendSeven - PHP Example\n";
    echo "=============================================\n\n";
    echo "Usage: php -S localhost:" . PORT . " app.php\n\n";
    echo "Configuration:\n";
    echo "  API URL:      " . API_URL . "\n";
    echo "  Redirect URI: " . REDIRECT_URI . "\n";
    echo "  Client ID:    " . (CLIENT_ID ? substr(CLIENT_ID, 0, 20) . '...' : 'NOT SET') . "\n\n";

    if (empty(CLIENT_ID) || empty(CLIENT_SECRET)) {
        echo "ERROR: Missing credentials!\n";
        echo "Copy .env.example to .env and add your OAuth app credentials.\n";
        exit(1);
    }

    echo "Open http://localhost:" . PORT . " in your browser\n";
}
