// SendSeven API - Login with SendSeven Example (Go/Chi)
//
// Demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".
// Implements complete OIDC flow including:
// - PKCE code generation (code_verifier, code_challenge)
// - State parameter for CSRF protection
// - Nonce parameter for ID token replay protection
// - ID token verification using JWKS
// - Token refresh and revocation
package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/sessions"
	"github.com/joho/godotenv"
)

// =============================================================================
// Configuration
// =============================================================================

var (
	clientID     string
	clientSecret string
	apiURL       string
	redirectURI  string
	port         string
	store        *sessions.CookieStore
)

const sessionName = "sendseven_session"

// OIDCConfig holds the OIDC discovery document
type OIDCConfig struct {
	Issuer                string   `json:"issuer"`
	AuthorizationEndpoint string   `json:"authorization_endpoint"`
	TokenEndpoint         string   `json:"token_endpoint"`
	UserinfoEndpoint      string   `json:"userinfo_endpoint"`
	JwksURI               string   `json:"jwks_uri"`
	RevocationEndpoint    string   `json:"revocation_endpoint"`
	ScopesSupported       []string `json:"scopes_supported"`
}

// TokenResponse represents the OAuth2 token response
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope"`
	IDToken      string `json:"id_token,omitempty"`
}

// UserInfo represents the OIDC userinfo response
type UserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email,omitempty"`
	EmailVerified bool   `json:"email_verified,omitempty"`
	Name          string `json:"name,omitempty"`
	Picture       string `json:"picture,omitempty"`
	TenantID      string `json:"tenant_id,omitempty"`
}

// ErrorResponse represents OAuth2 error response
type ErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

// =============================================================================
// JWKS Cache for ID Token Verification
// =============================================================================

type jwksCache struct {
	mu        sync.RWMutex
	jwks      *keyfunc.JWKS
	fetchedAt time.Time
	jwksURI   string
}

var globalJWKS = &jwksCache{}

func (c *jwksCache) getJWKS(ctx context.Context, jwksURI string) (*keyfunc.JWKS, error) {
	c.mu.RLock()
	// Cache JWKS for 1 hour
	if c.jwks != nil && time.Since(c.fetchedAt) < time.Hour && c.jwksURI == jwksURI {
		defer c.mu.RUnlock()
		return c.jwks, nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	// Double-check after acquiring write lock
	if c.jwks != nil && time.Since(c.fetchedAt) < time.Hour && c.jwksURI == jwksURI {
		return c.jwks, nil
	}

	// Close previous JWKS if exists
	if c.jwks != nil {
		c.jwks.EndBackground()
	}

	// Create new JWKS from URI
	options := keyfunc.Options{
		Ctx: ctx,
		RefreshErrorHandler: func(err error) {
			log.Printf("JWKS refresh error: %v", err)
		},
		RefreshInterval:   time.Hour,
		RefreshRateLimit:  time.Minute * 5,
		RefreshTimeout:    time.Second * 10,
		RefreshUnknownKID: true,
	}

	jwks, err := keyfunc.Get(jwksURI, options)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}

	c.jwks = jwks
	c.fetchedAt = time.Now()
	c.jwksURI = jwksURI

	return jwks, nil
}

// =============================================================================
// PKCE Helpers
// =============================================================================

// generateCodeVerifier creates a cryptographically random code verifier for PKCE
// Length must be between 43 and 128 characters
func generateCodeVerifier() (string, error) {
	// Generate 64 random bytes, which will produce ~86 base64url characters
	b := make([]byte, 64)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	// base64url encode without padding
	verifier := base64.RawURLEncoding.EncodeToString(b)
	// Ensure we're within 43-128 character range (86 chars from 64 bytes)
	return verifier, nil
}

// generateCodeChallenge creates a S256 code challenge from the verifier
func generateCodeChallenge(verifier string) string {
	h := sha256.New()
	h.Write([]byte(verifier))
	digest := h.Sum(nil)
	// base64url encode without padding
	return base64.RawURLEncoding.EncodeToString(digest)
}

// generateRandomString creates a cryptographically random URL-safe string
func generateRandomString(length int) (string, error) {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// =============================================================================
// OIDC Discovery
// =============================================================================

func getOIDCConfig() (*OIDCConfig, error) {
	discoveryURL := apiURL + "/.well-known/openid-configuration"

	resp, err := http.Get(discoveryURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch OIDC config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("OIDC discovery failed with status %d: %s", resp.StatusCode, string(body))
	}

	var config OIDCConfig
	if err := json.NewDecoder(resp.Body).Decode(&config); err != nil {
		return nil, fmt.Errorf("failed to decode OIDC config: %w", err)
	}

	return &config, nil
}

// =============================================================================
// ID Token Verification
// =============================================================================

// IDTokenClaims represents the claims in an ID token
type IDTokenClaims struct {
	jwt.RegisteredClaims
	Email         string `json:"email,omitempty"`
	EmailVerified bool   `json:"email_verified,omitempty"`
	Name          string `json:"name,omitempty"`
	Picture       string `json:"picture,omitempty"`
	TenantID      string `json:"tenant_id,omitempty"`
	Nonce         string `json:"nonce,omitempty"`
}

// verifyIDToken verifies the ID token signature and claims
func verifyIDToken(ctx context.Context, idToken, expectedNonce string) (*IDTokenClaims, error) {
	// Get OIDC config
	oidcConfig, err := getOIDCConfig()
	if err != nil {
		return nil, err
	}

	// Get JWKS
	jwks, err := globalJWKS.getJWKS(ctx, oidcConfig.JwksURI)
	if err != nil {
		return nil, err
	}

	// Parse and verify token
	token, err := jwt.ParseWithClaims(idToken, &IDTokenClaims{}, jwks.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(oidcConfig.Issuer),
		jwt.WithAudience(clientID),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to verify ID token: %w", err)
	}

	claims, ok := token.Claims.(*IDTokenClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Verify nonce
	if claims.Nonce != expectedNonce {
		return nil, fmt.Errorf("invalid nonce: expected %s, got %s", expectedNonce, claims.Nonce)
	}

	return claims, nil
}

// =============================================================================
// OAuth2 API Calls
// =============================================================================

// exchangeCodeForTokens exchanges an authorization code for tokens
func exchangeCodeForTokens(code, codeVerifier string) (*TokenResponse, error) {
	tokenURL := apiURL + "/api/v1/oauth-apps/token"

	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	data.Set("redirect_uri", redirectURI)
	data.Set("code_verifier", codeVerifier)

	resp, err := http.Post(tokenURL, "application/x-www-form-urlencoded", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp ErrorResponse
		if err := json.Unmarshal(body, &errResp); err != nil {
			return nil, fmt.Errorf("token exchange failed with status %d: %s", resp.StatusCode, string(body))
		}
		return nil, fmt.Errorf("token exchange failed: %s - %s", errResp.Error, errResp.ErrorDescription)
	}

	var tokens TokenResponse
	if err := json.Unmarshal(body, &tokens); err != nil {
		return nil, fmt.Errorf("failed to decode tokens: %w", err)
	}

	return &tokens, nil
}

// refreshAccessToken uses a refresh token to get new tokens
func refreshAccessToken(refreshToken string) (*TokenResponse, error) {
	tokenURL := apiURL + "/api/v1/oauth-apps/token"

	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", refreshToken)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)

	resp, err := http.Post(tokenURL, "application/x-www-form-urlencoded", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp ErrorResponse
		if err := json.Unmarshal(body, &errResp); err != nil {
			return nil, fmt.Errorf("token refresh failed with status %d: %s", resp.StatusCode, string(body))
		}
		return nil, fmt.Errorf("token refresh failed: %s - %s", errResp.Error, errResp.ErrorDescription)
	}

	var tokens TokenResponse
	if err := json.Unmarshal(body, &tokens); err != nil {
		return nil, fmt.Errorf("failed to decode tokens: %w", err)
	}

	return &tokens, nil
}

// revokeToken revokes a token (access or refresh)
func revokeToken(token, tokenTypeHint string) error {
	revokeURL := apiURL + "/api/v1/oauth-apps/revoke"

	data := url.Values{}
	data.Set("token", token)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	if tokenTypeHint != "" {
		data.Set("token_type_hint", tokenTypeHint)
	}

	resp, err := http.Post(revokeURL, "application/x-www-form-urlencoded", strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("failed to revoke token: %w", err)
	}
	defer resp.Body.Close()

	// Per RFC 7009, revocation always returns 200 OK
	return nil
}

// getUserInfo fetches user information using the access token
func getUserInfo(accessToken string) (*UserInfo, error) {
	userinfoURL := apiURL + "/api/v1/oauth-apps/userinfo"

	req, err := http.NewRequest("GET", userinfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch user info: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo failed with status %d: %s", resp.StatusCode, string(body))
	}

	var userInfo UserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		return nil, fmt.Errorf("failed to decode user info: %w", err)
	}

	return &userInfo, nil
}

// =============================================================================
// HTTP Handlers
// =============================================================================

func homeHandler(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, sessionName)

	data := struct {
		User   *UserInfo
		Tokens map[string]interface{}
	}{}

	if userJSON, ok := session.Values["user"].([]byte); ok {
		var user UserInfo
		if err := json.Unmarshal(userJSON, &user); err == nil {
			data.User = &user
		}
	}

	if tokensJSON, ok := session.Values["tokens"].([]byte); ok {
		var tokens TokenResponse
		if err := json.Unmarshal(tokensJSON, &tokens); err == nil {
			// Don't expose full tokens in UI
			data.Tokens = map[string]interface{}{
				"access_token":      tokens.AccessToken[:min(20, len(tokens.AccessToken))] + "...",
				"token_type":        tokens.TokenType,
				"expires_in":        tokens.ExpiresIn,
				"scope":             tokens.Scope,
				"has_refresh_token": tokens.RefreshToken != "",
				"has_id_token":      tokens.IDToken != "",
			}
		}
	}

	tmpl := template.Must(template.New("home").Parse(homeTemplate))
	if err := tmpl.Execute(w, data); err != nil {
		http.Error(w, "Template error: "+err.Error(), http.StatusInternalServerError)
	}
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	// Generate PKCE codes
	codeVerifier, err := generateCodeVerifier()
	if err != nil {
		renderError(w, "pkce_error", "Failed to generate PKCE verifier: "+err.Error())
		return
	}
	codeChallenge := generateCodeChallenge(codeVerifier)

	// Generate state and nonce
	state, err := generateRandomString(32)
	if err != nil {
		renderError(w, "state_error", "Failed to generate state: "+err.Error())
		return
	}
	nonce, err := generateRandomString(32)
	if err != nil {
		renderError(w, "nonce_error", "Failed to generate nonce: "+err.Error())
		return
	}

	// Store in session
	session, _ := store.Get(r, sessionName)
	session.Values["oauth_state"] = state
	session.Values["oauth_nonce"] = nonce
	session.Values["oauth_code_verifier"] = codeVerifier
	if err := session.Save(r, w); err != nil {
		renderError(w, "session_error", "Failed to save session: "+err.Error())
		return
	}

	// Build authorization URL
	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("redirect_uri", redirectURI)
	params.Set("response_type", "code")
	params.Set("scope", "openid profile email offline_access")
	params.Set("state", state)
	params.Set("code_challenge", codeChallenge)
	params.Set("code_challenge_method", "S256")
	params.Set("nonce", nonce)

	authURL := fmt.Sprintf("%s/api/v1/oauth-apps/authorize?%s", apiURL, params.Encode())
	log.Printf("Redirecting to: %s", authURL)

	http.Redirect(w, r, authURL, http.StatusFound)
}

func callbackHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Check for error response
	if errorCode := r.URL.Query().Get("error"); errorCode != "" {
		errorDesc := r.URL.Query().Get("error_description")
		if errorDesc == "" {
			errorDesc = "Unknown error"
		}
		renderError(w, errorCode, errorDesc)
		return
	}

	// Get authorization code and state
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	if code == "" || state == "" {
		renderError(w, "invalid_request", "Missing code or state parameter")
		return
	}

	// Get session and validate state
	session, _ := store.Get(r, sessionName)
	storedState, ok := session.Values["oauth_state"].(string)
	if !ok || state != storedState {
		renderError(w, "invalid_state", "State mismatch - possible CSRF attack")
		return
	}

	// Get stored PKCE verifier and nonce
	codeVerifier, _ := session.Values["oauth_code_verifier"].(string)
	nonce, _ := session.Values["oauth_nonce"].(string)

	// Exchange code for tokens
	tokens, err := exchangeCodeForTokens(code, codeVerifier)
	if err != nil {
		renderError(w, "token_exchange_failed", err.Error())
		return
	}

	// Verify ID token if present
	if tokens.IDToken != "" {
		claims, err := verifyIDToken(ctx, tokens.IDToken, nonce)
		if err != nil {
			renderError(w, "id_token_verification_failed", err.Error())
			return
		}
		log.Printf("ID token verified. Subject: %s, Email: %s", claims.Subject, claims.Email)
	}

	// Fetch user info
	userInfo, err := getUserInfo(tokens.AccessToken)
	if err != nil {
		renderError(w, "userinfo_failed", err.Error())
		return
	}

	// Store in session
	userJSON, _ := json.Marshal(userInfo)
	tokensJSON, _ := json.Marshal(tokens)
	session.Values["user"] = userJSON
	session.Values["tokens"] = tokensJSON

	// Clean up OAuth state
	delete(session.Values, "oauth_state")
	delete(session.Values, "oauth_nonce")
	delete(session.Values, "oauth_code_verifier")

	if err := session.Save(r, w); err != nil {
		renderError(w, "session_error", "Failed to save session: "+err.Error())
		return
	}

	log.Printf("User authenticated: %s", userInfo.Email)

	http.Redirect(w, r, "/", http.StatusFound)
}

func refreshHandler(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, sessionName)

	tokensJSON, ok := session.Values["tokens"].([]byte)
	if !ok {
		renderError(w, "not_logged_in", "You are not logged in")
		return
	}

	var tokens TokenResponse
	if err := json.Unmarshal(tokensJSON, &tokens); err != nil {
		renderError(w, "session_error", "Invalid session data")
		return
	}

	if tokens.RefreshToken == "" {
		renderError(w, "no_refresh_token", "No refresh token available. Login again with 'offline_access' scope.")
		return
	}

	// Refresh tokens
	newTokens, err := refreshAccessToken(tokens.RefreshToken)
	if err != nil {
		// Clear session on refresh failure
		session.Options.MaxAge = -1
		session.Save(r, w)
		renderError(w, "refresh_failed", err.Error()+". Please login again.")
		return
	}

	// Update stored tokens
	newTokensJSON, _ := json.Marshal(newTokens)
	session.Values["tokens"] = newTokensJSON
	if err := session.Save(r, w); err != nil {
		renderError(w, "session_error", "Failed to save session: "+err.Error())
		return
	}

	log.Println("Tokens refreshed successfully")

	http.Redirect(w, r, "/", http.StatusFound)
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, sessionName)

	// Revoke refresh token if available
	if tokensJSON, ok := session.Values["tokens"].([]byte); ok {
		var tokens TokenResponse
		if err := json.Unmarshal(tokensJSON, &tokens); err == nil && tokens.RefreshToken != "" {
			if err := revokeToken(tokens.RefreshToken, "refresh_token"); err != nil {
				log.Printf("Failed to revoke token (continuing with logout): %v", err)
			} else {
				log.Println("Token revoked successfully")
			}
		}
	}

	// Clear session
	session.Options.MaxAge = -1
	session.Save(r, w)

	http.Redirect(w, r, "/", http.StatusFound)
}

func apiUserHandler(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, sessionName)

	userJSON, ok := session.Values["user"].([]byte)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "not_authenticated"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(userJSON)
}

// renderError renders an error page
func renderError(w http.ResponseWriter, errorCode, errorDescription string) {
	tmpl := template.Must(template.New("error").Parse(errorTemplate))
	data := struct {
		Error            string
		ErrorDescription string
	}{
		Error:            errorCode,
		ErrorDescription: errorDescription,
	}
	w.WriteHeader(http.StatusBadRequest)
	tmpl.Execute(w, data)
}

// =============================================================================
// HTML Templates
// =============================================================================

const homeTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>Login with SendSeven - Go Demo</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #f8fafc; }
        h1 { color: #1e293b; }
        .btn { display: inline-block; padding: 12px 24px; background: #6366f1; color: white;
               text-decoration: none; border-radius: 8px; font-weight: 500; border: none; cursor: pointer; }
        .btn:hover { background: #4f46e5; }
        .card { background: white; border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .user-info { display: flex; align-items: center; gap: 16px; }
        .avatar { width: 64px; height: 64px; border-radius: 50%; background: #e2e8f0; object-fit: cover; }
        pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; }
        .logout { color: #ef4444; text-decoration: none; margin-left: 20px; }
        .logout:hover { text-decoration: underline; }
        .tech-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 4px; font-size: 14px; margin-bottom: 16px; }
    </style>
</head>
<body>
    <span class="tech-badge">Go + Chi Router</span>
    <h1>Login with SendSeven</h1>
    {{if .User}}
        <div class="card">
            <div class="user-info">
                <img src="{{.User.Picture}}" alt="Avatar" class="avatar" onerror="this.style.background='#6366f1'; this.src='';">
                <div>
                    <h2 style="margin: 0;">{{if .User.Name}}{{.User.Name}}{{else}}Unknown User{{end}}</h2>
                    <p style="margin: 4px 0; color: #64748b;">{{.User.Email}}</p>
                    {{if .User.TenantID}}<p style="margin: 4px 0; color: #94a3b8; font-size: 12px;">Tenant: {{.User.TenantID}}</p>{{end}}
                </div>
            </div>
        </div>

        <h3>User Info</h3>
        <pre>{{printf "%+v" .User}}</pre>

        {{if .Tokens}}
        <h3>Tokens (truncated for security)</h3>
        <pre>{{range $k, $v := .Tokens}}{{$k}}: {{$v}}
{{end}}</pre>
        {{end}}

        <p>
            <a href="/refresh" class="btn">Refresh Token</a>
            <a href="/logout" class="logout">Logout</a>
        </p>
    {{else}}
        <div class="card">
            <p>This demo shows how to implement "Sign in with SendSeven" using OAuth2/OIDC with PKCE in Go.</p>
            <p><strong>Features demonstrated:</strong></p>
            <ul>
                <li>PKCE Code Generation (code_verifier, code_challenge with S256)</li>
                <li>State parameter for CSRF protection</li>
                <li>Nonce parameter for ID token replay protection</li>
                <li>RS256 JWT verification using JWKS</li>
                <li>Token refresh and revocation</li>
            </ul>
        </div>
        <p><a href="/login" class="btn">Sign in with SendSeven</a></p>
    {{end}}
</body>
</html>`

const errorTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>Error - Login with SendSeven</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8fafc; }
        .error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; }
        .error h2 { color: #dc2626; margin-top: 0; }
        a { color: #6366f1; }
    </style>
</head>
<body>
    <div class="error">
        <h2>{{.Error}}</h2>
        <p>{{.ErrorDescription}}</p>
    </div>
    <p><a href="/">Back to Home</a></p>
</body>
</html>`

// =============================================================================
// Main
// =============================================================================

func main() {
	// Load .env file
	godotenv.Load()

	// Load configuration
	clientID = os.Getenv("SENDSEVEN_CLIENT_ID")
	clientSecret = os.Getenv("SENDSEVEN_CLIENT_SECRET")
	apiURL = strings.TrimRight(os.Getenv("SENDSEVEN_API_URL"), "/")
	if apiURL == "" {
		apiURL = "https://api.sendseven.com"
	}
	redirectURI = os.Getenv("REDIRECT_URI")
	if redirectURI == "" {
		redirectURI = "http://localhost:3000/callback"
	}
	port = os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	// Validate required credentials
	if clientID == "" || clientSecret == "" {
		log.Fatal("ERROR: SENDSEVEN_CLIENT_ID and SENDSEVEN_CLIENT_SECRET must be set!\n" +
			"Get your credentials from the SendSeven dashboard.")
	}

	// Initialize session store
	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		log.Println("WARNING: SESSION_SECRET not set, generating random secret (sessions won't persist across restarts)")
		b := make([]byte, 32)
		rand.Read(b)
		sessionSecret = base64.StdEncoding.EncodeToString(b)
	}
	store = sessions.NewCookieStore([]byte(sessionSecret))
	store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 days
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	}

	// Create router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// Routes
	r.Get("/", homeHandler)
	r.Get("/login", loginHandler)
	r.Get("/callback", callbackHandler)
	r.Get("/refresh", refreshHandler)
	r.Get("/logout", logoutHandler)
	r.Get("/api/user", apiUserHandler)

	// Start server
	log.Printf("Starting Login with SendSeven demo on port %s", port)
	log.Printf("API URL: %s", apiURL)
	log.Printf("Redirect URI: %s", redirectURI)
	log.Printf("Open http://localhost:%s in your browser", port)

	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
