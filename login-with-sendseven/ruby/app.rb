#!/usr/bin/env ruby
# frozen_string_literal: true

#
# SendSeven API - Login with SendSeven Example (Ruby/Sinatra)
#
# Demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".
#

require 'sinatra'
require 'sinatra/reloader' if development?
require 'dotenv/load'
require 'securerandom'
require 'digest'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'jwt'
require 'openssl'

# =============================================================================
# Configuration
# =============================================================================

CLIENT_ID = ENV.fetch('SENDSEVEN_CLIENT_ID', '')
CLIENT_SECRET = ENV.fetch('SENDSEVEN_CLIENT_SECRET', '')
API_URL = ENV.fetch('SENDSEVEN_API_URL', 'https://api.sendseven.com').chomp('/')
REDIRECT_URI = ENV.fetch('REDIRECT_URI', 'http://localhost:3000/callback')
PORT = ENV.fetch('PORT', 3000).to_i

# Sinatra configuration
set :port, PORT
set :bind, '0.0.0.0'
set :session_secret, ENV.fetch('SESSION_SECRET') { SecureRandom.hex(32) }
enable :sessions
set :sessions, expire_after: 3600

# OIDC endpoints
DISCOVERY_URL = "#{API_URL}/.well-known/openid-configuration"

# JWKS cache (thread-safe with mutex)
$jwks_mutex = Mutex.new
$jwks_cache = { keys: [], fetched_at: 0 }

# =============================================================================
# PKCE Helpers
# =============================================================================

# Generate a cryptographically random code verifier for PKCE.
# Length should be between 43 and 128 characters.
def generate_code_verifier(length = 64)
  # Use URL-safe base64 characters: A-Z, a-z, 0-9, -, _
  SecureRandom.urlsafe_base64(length)[0, 128]
end

# Generate S256 code challenge from verifier.
# code_challenge = BASE64URL(SHA256(code_verifier))
def generate_code_challenge(verifier)
  digest = Digest::SHA256.digest(verifier)
  Base64.urlsafe_encode64(digest, padding: false)
end

# Generate a random state parameter for CSRF protection.
def generate_state
  SecureRandom.urlsafe_base64(32)
end

# Generate a random nonce for ID token replay protection.
def generate_nonce
  SecureRandom.urlsafe_base64(32)
end

# =============================================================================
# HTTP Client Helpers
# =============================================================================

# Make a GET request and return parsed JSON response.
def http_get(url, headers = {})
  uri = URI.parse(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'
  http.read_timeout = 30
  http.open_timeout = 10

  request = Net::HTTP::Get.new(uri.request_uri)
  headers.each { |k, v| request[k] = v }

  response = http.request(request)

  if response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  else
    raise "HTTP GET failed: #{response.code} - #{response.body}"
  end
end

# Make a POST request with form data and return parsed JSON response.
def http_post(url, data, headers = {})
  uri = URI.parse(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'
  http.read_timeout = 30
  http.open_timeout = 10

  request = Net::HTTP::Post.new(uri.request_uri)
  request['Content-Type'] = 'application/x-www-form-urlencoded'
  headers.each { |k, v| request[k] = v }
  request.body = URI.encode_www_form(data)

  response = http.request(request)

  {
    success: response.is_a?(Net::HTTPSuccess),
    status: response.code.to_i,
    body: begin
      JSON.parse(response.body)
    rescue JSON::ParserError
      { raw: response.body }
    end
  }
end

# =============================================================================
# OIDC Discovery and JWKS
# =============================================================================

# Fetch OIDC discovery document.
def get_oidc_config
  http_get(DISCOVERY_URL)
end

# Fetch JSON Web Key Set for ID token verification.
# Caches JWKS for 1 hour.
def get_jwks(jwks_uri)
  $jwks_mutex.synchronize do
    now = Time.now.to_i
    if now - $jwks_cache[:fetched_at] > 3600
      puts "Fetching JWKS from #{jwks_uri}"
      response = http_get(jwks_uri)
      $jwks_cache[:keys] = response['keys'] || []
      $jwks_cache[:fetched_at] = now
    end
    { 'keys' => $jwks_cache[:keys] }
  end
end

# Convert a JWK to an OpenSSL public key for RS256 verification.
def jwk_to_public_key(jwk)
  # Decode the modulus (n) and exponent (e) from base64url
  n_bytes = Base64.urlsafe_decode64(jwk['n'])
  e_bytes = Base64.urlsafe_decode64(jwk['e'])

  # Convert to OpenSSL BigNum
  n = OpenSSL::BN.new(n_bytes, 2)
  e = OpenSSL::BN.new(e_bytes, 2)

  # Create RSA key
  rsa_key = OpenSSL::PKey::RSA.new

  # Ruby 3.0+ uses set_key method
  if rsa_key.respond_to?(:set_key)
    rsa_key.set_key(n, e, nil)
  else
    # Older Ruby versions - build key data structure manually
    key_data = OpenSSL::ASN1::Sequence.new([
      OpenSSL::ASN1::Integer.new(n),
      OpenSSL::ASN1::Integer.new(e)
    ])
    rsa_key = OpenSSL::PKey::RSA.new(OpenSSL::ASN1::Sequence.new([
      OpenSSL::ASN1::Sequence.new([
        OpenSSL::ASN1::ObjectId.new('rsaEncryption'),
        OpenSSL::ASN1::Null.new(nil)
      ]),
      OpenSSL::ASN1::BitString.new(key_data.to_der)
    ]).to_der)
  end

  rsa_key
end

# Verify ID token signature and claims.
def verify_id_token(id_token, nonce)
  # Get OIDC config for issuer and jwks_uri
  oidc_config = get_oidc_config
  jwks = get_jwks(oidc_config['jwks_uri'])

  # Decode header to get kid (without verification)
  header_segment = id_token.split('.').first
  header = JSON.parse(Base64.urlsafe_decode64(header_segment))
  kid = header['kid']
  alg = header['alg']

  puts "ID Token header - alg: #{alg}, kid: #{kid}"

  if alg != 'RS256'
    raise JWT::DecodeError, "Unsupported algorithm: #{alg}. Expected RS256."
  end

  # Find matching key
  jwk = jwks['keys'].find { |k| k['kid'] == kid }
  raise JWT::DecodeError, "No matching key found for kid: #{kid}" unless jwk

  # Convert JWK to public key
  public_key = jwk_to_public_key(jwk)

  # Verify and decode token
  decoded = JWT.decode(
    id_token,
    public_key,
    true, # verify signature
    {
      algorithm: 'RS256',
      iss: oidc_config['issuer'],
      verify_iss: true,
      aud: CLIENT_ID,
      verify_aud: true,
      verify_expiration: true,
      verify_iat: true
    }
  )

  claims = decoded.first

  # Verify nonce
  if claims['nonce'] != nonce
    raise JWT::DecodeError, "Invalid nonce. Expected: #{nonce}, Got: #{claims['nonce']}"
  end

  puts "ID token verified successfully for sub: #{claims['sub']}"
  claims
rescue JWT::DecodeError => e
  puts "ID token verification failed: #{e.message}"
  raise
end

# =============================================================================
# HTML Templates (ERB)
# =============================================================================

HOME_TEMPLATE = <<~HTML
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login with SendSeven - Ruby Demo</title>
      <style>
          * { box-sizing: border-box; }
          body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px 20px;
              background: #f8fafc;
              color: #1e293b;
          }
          h1 { color: #0f172a; margin-bottom: 8px; }
          .subtitle { color: #64748b; margin-bottom: 32px; }
          .card {
              background: white;
              border-radius: 12px;
              padding: 24px;
              margin: 20px 0;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          .btn {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 12px 24px;
              background: #6366f1;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 500;
              font-size: 16px;
              border: none;
              cursor: pointer;
              transition: background 0.2s;
          }
          .btn:hover { background: #4f46e5; }
          .btn-secondary {
              background: #e2e8f0;
              color: #475569;
          }
          .btn-secondary:hover { background: #cbd5e1; }
          .btn-danger {
              background: #fee2e2;
              color: #dc2626;
          }
          .btn-danger:hover { background: #fecaca; }
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
              font-weight: 600;
          }
          .avatar img {
              width: 100%;
              height: 100%;
              border-radius: 50%;
              object-fit: cover;
          }
          .user-name { font-size: 20px; font-weight: 600; margin: 0; }
          .user-email { color: #64748b; margin: 4px 0 0 0; }
          pre {
              background: #1e293b;
              color: #e2e8f0;
              padding: 16px;
              border-radius: 8px;
              overflow-x: auto;
              font-size: 13px;
              line-height: 1.5;
          }
          .section-title {
              font-size: 14px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #64748b;
              margin: 24px 0 8px 0;
          }
          .actions {
              display: flex;
              gap: 12px;
              margin-top: 24px;
              flex-wrap: wrap;
          }
          .badge {
              display: inline-flex;
              align-items: center;
              padding: 4px 8px;
              background: #dbeafe;
              color: #1d4ed8;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 500;
          }
          .badge.green { background: #dcfce7; color: #16a34a; }
          .info-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 16px;
              margin-top: 16px;
          }
          .info-item {
              padding: 12px;
              background: #f8fafc;
              border-radius: 8px;
          }
          .info-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
          .info-value { font-weight: 500; word-break: break-all; }
          .logo-icon {
              width: 24px;
              height: 24px;
          }
      </style>
  </head>
  <body>
      <h1>Login with SendSeven</h1>
      <p class="subtitle">Ruby/Sinatra OAuth2/OIDC Example</p>

      <% if user %>
          <div class="card">
              <div class="user-info">
                  <div class="avatar">
                      <% if user['picture'] && !user['picture'].empty? %>
                          <img src="<%= user['picture'] %>" alt="Avatar"
                               onerror="this.parentElement.innerHTML='<%= (user['name'] || user['email'] || 'U')[0].upcase %>'">
                      <% else %>
                          <%= (user['name'] || user['email'] || 'U')[0].upcase %>
                      <% end %>
                  </div>
                  <div>
                      <p class="user-name"><%= user['name'] || 'Unknown User' %></p>
                      <p class="user-email"><%= user['email'] %></p>
                      <% if user['email_verified'] %>
                          <span class="badge green">Email Verified</span>
                      <% end %>
                  </div>
              </div>
          </div>

          <div class="section-title">User Info</div>
          <pre><%= JSON.pretty_generate(user) %></pre>

          <% if tokens %>
              <div class="section-title">Tokens</div>
              <div class="card">
                  <div class="info-grid">
                      <div class="info-item">
                          <div class="info-label">Access Token</div>
                          <div class="info-value"><%= tokens['access_token'][0, 25] %>...</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Token Type</div>
                          <div class="info-value"><%= tokens['token_type'] %></div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Expires In</div>
                          <div class="info-value"><%= tokens['expires_in'] %> seconds</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Scopes</div>
                          <div class="info-value"><%= tokens['scope'] %></div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Has Refresh Token</div>
                          <div class="info-value"><%= tokens['refresh_token'] ? 'Yes' : 'No' %></div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Has ID Token</div>
                          <div class="info-value"><%= tokens['id_token'] ? 'Yes' : 'No' %></div>
                      </div>
                  </div>
              </div>
          <% end %>

          <div class="actions">
              <a href="/refresh" class="btn btn-secondary">Refresh Token</a>
              <a href="/logout" class="btn btn-danger">Logout</a>
          </div>
      <% else %>
          <div class="card">
              <p>This demo shows how to implement <strong>"Sign in with SendSeven"</strong> using the OAuth2 Authorization Code flow with PKCE.</p>
              <p>Features demonstrated:</p>
              <ul>
                  <li>PKCE (Proof Key for Code Exchange) for enhanced security</li>
                  <li>State parameter for CSRF protection</li>
                  <li>Nonce parameter for ID token replay protection</li>
                  <li>ID token verification using JWKS</li>
                  <li>Token refresh and revocation</li>
              </ul>
              <div class="actions">
                  <a href="/login" class="btn">
                      <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                          <polyline points="10 17 15 12 10 7"/>
                          <line x1="15" y1="12" x2="3" y2="12"/>
                      </svg>
                      Sign in with SendSeven
                  </a>
              </div>
          </div>
      <% end %>
  </body>
  </html>
HTML

ERROR_TEMPLATE = <<~HTML
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
              margin: 0 auto;
              padding: 40px 20px;
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
              margin: 0 0 12px 0;
              font-size: 18px;
          }
          .error p {
              margin: 0;
              color: #7f1d1d;
          }
          a {
              color: #6366f1;
              text-decoration: none;
          }
          a:hover { text-decoration: underline; }
          .back-link { margin-top: 24px; }
      </style>
  </head>
  <body>
      <div class="error">
          <h2><%= error %></h2>
          <p><%= error_description %></p>
      </div>
      <p class="back-link"><a href="/">Back to Home</a></p>
  </body>
  </html>
HTML

# =============================================================================
# Routes
# =============================================================================

# Home page - show login button or user info.
get '/' do
  user = session[:user]
  tokens = session[:tokens]
  erb HOME_TEMPLATE, locals: { user: user, tokens: tokens }
end

# Initiate OAuth2 authorization flow.
#
# Generates PKCE codes, state, and nonce, stores them in session,
# then redirects to SendSeven's authorization endpoint.
get '/login' do
  # Generate PKCE codes
  code_verifier = generate_code_verifier
  code_challenge = generate_code_challenge(code_verifier)

  # Generate state and nonce
  state = generate_state
  nonce = generate_nonce

  # Store in session for callback verification
  session[:oauth_state] = state
  session[:oauth_nonce] = nonce
  session[:oauth_code_verifier] = code_verifier

  # Build authorization URL
  params = {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    state: state,
    code_challenge: code_challenge,
    code_challenge_method: 'S256',
    nonce: nonce
  }

  auth_url = "#{API_URL}/api/v1/oauth-apps/authorize?#{URI.encode_www_form(params)}"
  puts "Redirecting to: #{auth_url}"

  redirect auth_url
end

# OAuth2 callback handler.
#
# Validates state, exchanges code for tokens, verifies ID token,
# and fetches user info.
get '/callback' do
  # Check for error response
  if params[:error]
    error_description = params[:error_description] || 'Unknown error'
    return erb ERROR_TEMPLATE, locals: { error: params[:error], error_description: error_description }
  end

  # Get authorization code
  code = params[:code]
  state = params[:state]

  unless code && state
    return erb ERROR_TEMPLATE, locals: {
      error: 'invalid_request',
      error_description: 'Missing code or state parameter'
    }
  end

  # Validate state (CSRF protection)
  stored_state = session[:oauth_state]
  if stored_state.nil? || state != stored_state
    return erb ERROR_TEMPLATE, locals: {
      error: 'invalid_state',
      error_description: 'State mismatch - possible CSRF attack'
    }
  end

  # Get stored PKCE verifier and nonce
  code_verifier = session[:oauth_code_verifier]
  nonce = session[:oauth_nonce]

  # Exchange code for tokens
  token_url = "#{API_URL}/api/v1/oauth-apps/token"
  token_data = {
    grant_type: 'authorization_code',
    code: code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code_verifier: code_verifier
  }

  puts "Exchanging code for tokens at: #{token_url}"

  result = http_post(token_url, token_data)

  unless result[:success]
    return erb ERROR_TEMPLATE, locals: {
      error: 'token_exchange_failed',
      error_description: "Failed to exchange code for tokens: #{result[:body]}"
    }
  end

  tokens = result[:body]

  # Verify ID token if present
  if tokens['id_token']
    begin
      id_token_claims = verify_id_token(tokens['id_token'], nonce)
      puts "ID token verified. Claims: #{id_token_claims}"
    rescue StandardError => e
      return erb ERROR_TEMPLATE, locals: {
        error: 'id_token_verification_failed',
        error_description: "Failed to verify ID token: #{e.message}"
      }
    end
  end

  # Fetch user info
  userinfo_url = "#{API_URL}/api/v1/oauth-apps/userinfo"
  begin
    user_info = http_get(userinfo_url, { 'Authorization' => "Bearer #{tokens['access_token']}" })
  rescue StandardError => e
    return erb ERROR_TEMPLATE, locals: {
      error: 'userinfo_failed',
      error_description: "Failed to fetch user info: #{e.message}"
    }
  end

  # Store in session
  session[:user] = user_info
  session[:tokens] = tokens

  # Clean up OAuth state
  session.delete(:oauth_state)
  session.delete(:oauth_nonce)
  session.delete(:oauth_code_verifier)

  puts "User authenticated: #{user_info['email']}"

  redirect '/'
end

# Refresh the access token using the refresh token.
get '/refresh' do
  unless session[:user]
    redirect '/login'
    return
  end

  tokens = session[:tokens] || {}
  refresh_token = tokens['refresh_token']

  unless refresh_token
    return erb ERROR_TEMPLATE, locals: {
      error: 'no_refresh_token',
      error_description: "No refresh token available. Login again with 'offline_access' scope."
    }
  end

  # Refresh tokens
  token_url = "#{API_URL}/api/v1/oauth-apps/token"
  token_data = {
    grant_type: 'refresh_token',
    refresh_token: refresh_token,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  }

  puts 'Refreshing access token...'
  result = http_post(token_url, token_data)

  unless result[:success]
    session.clear
    return erb ERROR_TEMPLATE, locals: {
      error: 'refresh_failed',
      error_description: "Failed to refresh token: #{result[:body]}. Please login again."
    }
  end

  # Update stored tokens
  session[:tokens] = result[:body]
  puts 'Tokens refreshed successfully'

  redirect '/'
end

# Logout - revoke tokens and clear session.
get '/logout' do
  tokens = session[:tokens] || {}

  # Revoke refresh token (which also invalidates access token)
  refresh_token = tokens['refresh_token']
  if refresh_token
    revoke_url = "#{API_URL}/api/v1/oauth-apps/revoke"
    revoke_data = {
      token: refresh_token,
      token_type_hint: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }

    begin
      http_post(revoke_url, revoke_data)
      puts 'Token revoked successfully'
    rescue StandardError => e
      puts "Failed to revoke token (continuing with logout): #{e.message}"
    end
  end

  # Clear session
  session.clear

  redirect '/'
end

# API endpoint to get current user info.
get '/api/user' do
  unless session[:user]
    halt 401, { 'Content-Type' => 'application/json' }, { error: 'unauthorized' }.to_json
  end

  content_type :json
  session[:user].to_json
end

# Health check endpoint
get '/health' do
  content_type :json
  { status: 'ok', service: 'sendseven-login-demo' }.to_json
end

# =============================================================================
# Main
# =============================================================================

if __FILE__ == $PROGRAM_NAME
  if CLIENT_ID.empty? || CLIENT_SECRET.empty?
    puts 'ERROR: SENDSEVEN_CLIENT_ID and SENDSEVEN_CLIENT_SECRET must be set!'
    puts 'Get your credentials from the SendSeven dashboard.'
    exit 1
  end

  puts "Starting Login with SendSeven demo on port #{PORT}"
  puts "API URL: #{API_URL}"
  puts "Redirect URI: #{REDIRECT_URI}"
  puts "Open http://localhost:#{PORT} in your browser"
end
