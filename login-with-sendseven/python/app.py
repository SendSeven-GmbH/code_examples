#!/usr/bin/env python3
"""
SendSeven API - Login with SendSeven Example (Python/Flask)

Demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".
"""

import os
import secrets
import hashlib
import base64
import json
from urllib.parse import urlencode
from functools import wraps

import requests
from flask import Flask, request, redirect, session, jsonify, render_template_string
from dotenv import load_dotenv
from jose import jwt, jwk
from jose.exceptions import JWTError

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SESSION_SECRET", secrets.token_hex(32))

# Configuration
CLIENT_ID = os.getenv("SENDSEVEN_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("SENDSEVEN_CLIENT_SECRET", "")
API_URL = os.getenv("SENDSEVEN_API_URL", "https://api.sendseven.com").rstrip("/")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:3000/callback")
PORT = int(os.getenv("PORT", 3000))

# OIDC endpoints (will be fetched from discovery)
DISCOVERY_URL = f"{API_URL}/.well-known/openid-configuration"
JWKS_CACHE = {"keys": [], "fetched_at": 0}


# =============================================================================
# PKCE Helpers
# =============================================================================

def generate_code_verifier(length: int = 64) -> str:
    """Generate a cryptographically random code verifier for PKCE."""
    # Use URL-safe base64 characters
    return secrets.token_urlsafe(length)[:128]


def generate_code_challenge(verifier: str) -> str:
    """Generate S256 code challenge from verifier."""
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("utf-8")


def generate_state() -> str:
    """Generate a random state parameter for CSRF protection."""
    return secrets.token_urlsafe(32)


def generate_nonce() -> str:
    """Generate a random nonce for ID token replay protection."""
    return secrets.token_urlsafe(32)


# =============================================================================
# OIDC Discovery and JWKS
# =============================================================================

def get_oidc_config() -> dict:
    """Fetch OIDC discovery document."""
    response = requests.get(DISCOVERY_URL)
    response.raise_for_status()
    return response.json()


def get_jwks(jwks_uri: str) -> dict:
    """Fetch JSON Web Key Set for ID token verification."""
    import time
    # Cache JWKS for 1 hour
    if time.time() - JWKS_CACHE["fetched_at"] > 3600:
        response = requests.get(jwks_uri)
        response.raise_for_status()
        JWKS_CACHE["keys"] = response.json().get("keys", [])
        JWKS_CACHE["fetched_at"] = time.time()
    return {"keys": JWKS_CACHE["keys"]}


def verify_id_token(id_token: str, nonce: str) -> dict:
    """Verify ID token signature and claims."""
    try:
        # Get OIDC config for issuer and jwks_uri
        oidc_config = get_oidc_config()
        jwks = get_jwks(oidc_config["jwks_uri"])

        # Decode header to get kid
        header = jwt.get_unverified_header(id_token)
        kid = header.get("kid")

        # Find matching key
        key = None
        for k in jwks["keys"]:
            if k.get("kid") == kid:
                key = k
                break

        if not key:
            raise JWTError(f"No matching key found for kid: {kid}")

        # Verify and decode token
        claims = jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=oidc_config["issuer"],
        )

        # Verify nonce
        if claims.get("nonce") != nonce:
            raise JWTError("Invalid nonce")

        return claims
    except JWTError as e:
        print(f"ID token verification failed: {e}")
        raise


# =============================================================================
# Auth Helpers
# =============================================================================

def login_required(f):
    """Decorator to require authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user" not in session:
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated_function


# =============================================================================
# HTML Templates
# =============================================================================

HOME_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Login with SendSeven - Demo</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .btn { display: inline-block; padding: 12px 24px; background: #6366f1; color: white;
               text-decoration: none; border-radius: 8px; font-weight: 500; }
        .btn:hover { background: #4f46e5; }
        .card { background: #f8fafc; border-radius: 12px; padding: 24px; margin: 20px 0; }
        .user-info { display: flex; align-items: center; gap: 16px; }
        .avatar { width: 64px; height: 64px; border-radius: 50%; background: #e2e8f0; }
        pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
        .logout { color: #ef4444; text-decoration: none; }
    </style>
</head>
<body>
    <h1>Login with SendSeven</h1>
    {% if user %}
        <div class="card">
            <div class="user-info">
                <img src="{{ user.picture or '' }}" alt="Avatar" class="avatar"
                     onerror="this.style.background='#6366f1'">
                <div>
                    <h2 style="margin: 0;">{{ user.name or 'Unknown User' }}</h2>
                    <p style="margin: 4px 0; color: #64748b;">{{ user.email }}</p>
                </div>
            </div>
        </div>

        <h3>User Info</h3>
        <pre>{{ user | tojson(indent=2) }}</pre>

        {% if tokens %}
        <h3>Tokens</h3>
        <pre>{{ tokens | tojson(indent=2) }}</pre>
        {% endif %}

        <p>
            <a href="/refresh" class="btn">Refresh Token</a>
            <a href="/logout" class="logout" style="margin-left: 20px;">Logout</a>
        </p>
    {% else %}
        <p>This demo shows how to implement "Sign in with SendSeven" using OAuth2/OIDC.</p>
        <p><a href="/login" class="btn">Sign in with SendSeven</a></p>
    {% endif %}
</body>
</html>
"""

ERROR_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Error - Login with SendSeven</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; }
        .error h2 { color: #dc2626; margin-top: 0; }
        a { color: #6366f1; }
    </style>
</head>
<body>
    <div class="error">
        <h2>{{ error }}</h2>
        <p>{{ error_description }}</p>
    </div>
    <p><a href="/">Back to Home</a></p>
</body>
</html>
"""


# =============================================================================
# Routes
# =============================================================================

@app.route("/")
def home():
    """Home page - show login button or user info."""
    user = session.get("user")
    tokens = None
    if user and "tokens" in session:
        # Don't expose full tokens in UI, just metadata
        tokens = {
            "access_token": session["tokens"]["access_token"][:20] + "...",
            "token_type": session["tokens"]["token_type"],
            "expires_in": session["tokens"]["expires_in"],
            "scope": session["tokens"]["scope"],
            "has_refresh_token": bool(session["tokens"].get("refresh_token")),
            "has_id_token": bool(session["tokens"].get("id_token")),
        }
    return render_template_string(HOME_TEMPLATE, user=user, tokens=tokens)


@app.route("/login")
def login():
    """
    Initiate OAuth2 authorization flow.

    Generates PKCE codes, state, and nonce, stores them in session,
    then redirects to SendSeven's authorization endpoint.
    """
    # Generate PKCE codes
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)

    # Generate state and nonce
    state = generate_state()
    nonce = generate_nonce()

    # Store in session for callback verification
    session["oauth_state"] = state
    session["oauth_nonce"] = nonce
    session["oauth_code_verifier"] = code_verifier

    # Build authorization URL
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "openid profile email offline_access",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "nonce": nonce,
    }

    auth_url = f"{API_URL}/api/v1/oauth-apps/authorize?{urlencode(params)}"
    print(f"Redirecting to: {auth_url}")

    return redirect(auth_url)


@app.route("/callback")
def callback():
    """
    OAuth2 callback handler.

    Validates state, exchanges code for tokens, verifies ID token,
    and fetches user info.
    """
    # Check for error response
    error = request.args.get("error")
    if error:
        error_description = request.args.get("error_description", "Unknown error")
        return render_template_string(ERROR_TEMPLATE, error=error, error_description=error_description)

    # Get authorization code
    code = request.args.get("code")
    state = request.args.get("state")

    if not code or not state:
        return render_template_string(ERROR_TEMPLATE,
            error="invalid_request",
            error_description="Missing code or state parameter")

    # Validate state (CSRF protection)
    stored_state = session.get("oauth_state")
    if not stored_state or state != stored_state:
        return render_template_string(ERROR_TEMPLATE,
            error="invalid_state",
            error_description="State mismatch - possible CSRF attack")

    # Get stored PKCE verifier and nonce
    code_verifier = session.get("oauth_code_verifier")
    nonce = session.get("oauth_nonce")

    # Exchange code for tokens
    token_url = f"{API_URL}/api/v1/oauth-apps/token"
    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier,
    }

    print(f"Exchanging code for tokens at: {token_url}")

    try:
        response = requests.post(token_url, data=token_data)
        response.raise_for_status()
        tokens = response.json()
    except requests.RequestException as e:
        error_detail = ""
        try:
            error_detail = e.response.json() if e.response else str(e)
        except:
            error_detail = str(e)
        return render_template_string(ERROR_TEMPLATE,
            error="token_exchange_failed",
            error_description=f"Failed to exchange code for tokens: {error_detail}")

    # Verify ID token if present
    if "id_token" in tokens:
        try:
            id_token_claims = verify_id_token(tokens["id_token"], nonce)
            print(f"ID token verified. Claims: {id_token_claims}")
        except Exception as e:
            return render_template_string(ERROR_TEMPLATE,
                error="id_token_verification_failed",
                error_description=f"Failed to verify ID token: {e}")

    # Fetch user info
    userinfo_url = f"{API_URL}/api/v1/oauth-apps/userinfo"
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    try:
        response = requests.get(userinfo_url, headers=headers)
        response.raise_for_status()
        user_info = response.json()
    except requests.RequestException as e:
        return render_template_string(ERROR_TEMPLATE,
            error="userinfo_failed",
            error_description=f"Failed to fetch user info: {e}")

    # Store in session
    session["user"] = user_info
    session["tokens"] = tokens

    # Clean up OAuth state
    session.pop("oauth_state", None)
    session.pop("oauth_nonce", None)
    session.pop("oauth_code_verifier", None)

    print(f"User authenticated: {user_info.get('email')}")

    return redirect("/")


@app.route("/refresh")
@login_required
def refresh():
    """Refresh the access token using the refresh token."""
    tokens = session.get("tokens", {})
    refresh_token = tokens.get("refresh_token")

    if not refresh_token:
        return render_template_string(ERROR_TEMPLATE,
            error="no_refresh_token",
            error_description="No refresh token available. Login again with 'offline_access' scope.")

    # Refresh tokens
    token_url = f"{API_URL}/api/v1/oauth-apps/token"
    token_data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }

    try:
        response = requests.post(token_url, data=token_data)
        response.raise_for_status()
        new_tokens = response.json()
    except requests.RequestException as e:
        session.clear()
        return render_template_string(ERROR_TEMPLATE,
            error="refresh_failed",
            error_description=f"Failed to refresh token: {e}. Please login again.")

    # Update stored tokens
    session["tokens"] = new_tokens
    print("Tokens refreshed successfully")

    return redirect("/")


@app.route("/logout")
def logout():
    """Logout - revoke tokens and clear session."""
    tokens = session.get("tokens", {})

    # Revoke refresh token (which also invalidates access token)
    refresh_token = tokens.get("refresh_token")
    if refresh_token:
        revoke_url = f"{API_URL}/api/v1/oauth-apps/revoke"
        revoke_data = {
            "token": refresh_token,
            "token_type_hint": "refresh_token",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        }

        try:
            requests.post(revoke_url, data=revoke_data)
            print("Token revoked successfully")
        except requests.RequestException as e:
            print(f"Failed to revoke token (continuing with logout): {e}")

    # Clear session
    session.clear()

    return redirect("/")


@app.route("/api/user")
@login_required
def api_user():
    """API endpoint to get current user info."""
    return jsonify(session.get("user"))


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    if not CLIENT_ID or not CLIENT_SECRET:
        print("ERROR: SENDSEVEN_CLIENT_ID and SENDSEVEN_CLIENT_SECRET must be set!")
        print("Get your credentials from the SendSeven dashboard.")
        exit(1)

    print(f"Starting Login with SendSeven demo on port {PORT}")
    print(f"API URL: {API_URL}")
    print(f"Redirect URI: {REDIRECT_URI}")
    print(f"Open http://localhost:{PORT} in your browser")

    app.run(host="0.0.0.0", port=PORT, debug=True)
