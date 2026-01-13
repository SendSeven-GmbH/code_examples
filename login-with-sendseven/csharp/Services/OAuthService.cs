using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LoginWithSendSeven.Models;
using Microsoft.IdentityModel.Tokens;

namespace LoginWithSendSeven.Services;

/// <summary>
/// Service for OAuth2/OIDC operations with SendSeven.
/// Implements the complete Authorization Code flow with PKCE.
/// </summary>
public class OAuthService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OAuthService> _logger;

    // OIDC configuration cache
    private OidcConfiguration? _oidcConfig;
    private DateTime _oidcConfigFetchedAt;
    private readonly TimeSpan _oidcConfigCacheDuration = TimeSpan.FromHours(1);

    // JWKS cache
    private JwksResponse? _jwks;
    private DateTime _jwksFetchedAt;
    private readonly TimeSpan _jwksCacheDuration = TimeSpan.FromHours(1);

    public OAuthService(HttpClient httpClient, IConfiguration configuration, ILogger<OAuthService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    #region Configuration

    /// <summary>
    /// Get the SendSeven API base URL.
    /// </summary>
    public string ApiUrl => Environment.GetEnvironmentVariable("SENDSEVEN_API_URL")
        ?? _configuration["SendSeven:ApiUrl"]
        ?? "https://api.sendseven.com";

    /// <summary>
    /// Get the OAuth client ID.
    /// </summary>
    public string ClientId => Environment.GetEnvironmentVariable("SENDSEVEN_CLIENT_ID")
        ?? _configuration["SendSeven:ClientId"]
        ?? throw new InvalidOperationException("SENDSEVEN_CLIENT_ID is not configured");

    /// <summary>
    /// Get the OAuth client secret.
    /// </summary>
    public string ClientSecret => Environment.GetEnvironmentVariable("SENDSEVEN_CLIENT_SECRET")
        ?? _configuration["SendSeven:ClientSecret"]
        ?? throw new InvalidOperationException("SENDSEVEN_CLIENT_SECRET is not configured");

    /// <summary>
    /// Get the redirect URI.
    /// </summary>
    public string RedirectUri => Environment.GetEnvironmentVariable("REDIRECT_URI")
        ?? _configuration["SendSeven:RedirectUri"]
        ?? "http://localhost:3000/callback";

    /// <summary>
    /// Get the requested scopes.
    /// </summary>
    public string Scopes => _configuration["SendSeven:Scopes"]
        ?? "openid profile email offline_access";

    #endregion

    #region PKCE Generation

    /// <summary>
    /// Generate a cryptographically random code verifier for PKCE.
    /// Length should be between 43 and 128 characters.
    /// </summary>
    public string GenerateCodeVerifier(int length = 64)
    {
        // Ensure length is within spec (43-128)
        length = Math.Max(43, Math.Min(128, length));

        // Generate random bytes
        var bytes = new byte[length];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);

        // Convert to URL-safe base64
        return Base64UrlEncode(bytes).Substring(0, length);
    }

    /// <summary>
    /// Generate S256 code challenge from the verifier.
    /// SHA256 hash, base64url encoded, no padding.
    /// </summary>
    public string GenerateCodeChallenge(string verifier)
    {
        using var sha256 = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes(verifier);
        var hash = sha256.ComputeHash(bytes);
        return Base64UrlEncode(hash);
    }

    /// <summary>
    /// Generate a random state parameter for CSRF protection.
    /// </summary>
    public string GenerateState()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Base64UrlEncode(bytes);
    }

    /// <summary>
    /// Generate a random nonce for ID token replay protection.
    /// </summary>
    public string GenerateNonce()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Base64UrlEncode(bytes);
    }

    /// <summary>
    /// Generate complete OAuth state for the authorization flow.
    /// </summary>
    public OAuthState GenerateOAuthState()
    {
        var codeVerifier = GenerateCodeVerifier();
        return new OAuthState
        {
            State = GenerateState(),
            Nonce = GenerateNonce(),
            CodeVerifier = codeVerifier,
            CreatedAt = DateTime.UtcNow
        };
    }

    #endregion

    #region OIDC Discovery

    /// <summary>
    /// Fetch the OIDC discovery document.
    /// </summary>
    public async Task<OidcConfiguration> GetOidcConfigurationAsync()
    {
        // Return cached if still valid
        if (_oidcConfig != null && DateTime.UtcNow - _oidcConfigFetchedAt < _oidcConfigCacheDuration)
        {
            return _oidcConfig;
        }

        var discoveryUrl = $"{ApiUrl.TrimEnd('/')}/.well-known/openid-configuration";
        _logger.LogInformation("Fetching OIDC discovery document from {Url}", discoveryUrl);

        var response = await _httpClient.GetAsync(discoveryUrl);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        _oidcConfig = JsonSerializer.Deserialize<OidcConfiguration>(content)
            ?? throw new InvalidOperationException("Failed to parse OIDC configuration");
        _oidcConfigFetchedAt = DateTime.UtcNow;

        return _oidcConfig;
    }

    /// <summary>
    /// Fetch the JSON Web Key Set for ID token verification.
    /// </summary>
    public async Task<JwksResponse> GetJwksAsync()
    {
        // Return cached if still valid
        if (_jwks != null && DateTime.UtcNow - _jwksFetchedAt < _jwksCacheDuration)
        {
            return _jwks;
        }

        var oidcConfig = await GetOidcConfigurationAsync();
        _logger.LogInformation("Fetching JWKS from {Url}", oidcConfig.JwksUri);

        var response = await _httpClient.GetAsync(oidcConfig.JwksUri);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        _jwks = JsonSerializer.Deserialize<JwksResponse>(content)
            ?? throw new InvalidOperationException("Failed to parse JWKS");
        _jwksFetchedAt = DateTime.UtcNow;

        return _jwks;
    }

    #endregion

    #region Authorization

    /// <summary>
    /// Build the authorization URL for the OAuth2 flow.
    /// </summary>
    public string BuildAuthorizationUrl(OAuthState state)
    {
        var codeChallenge = GenerateCodeChallenge(state.CodeVerifier);

        var parameters = new Dictionary<string, string>
        {
            ["client_id"] = ClientId,
            ["redirect_uri"] = RedirectUri,
            ["response_type"] = "code",
            ["scope"] = Scopes,
            ["state"] = state.State,
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256",
            ["nonce"] = state.Nonce
        };

        var queryString = string.Join("&",
            parameters.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"));

        var authUrl = $"{ApiUrl.TrimEnd('/')}/api/v1/oauth-apps/authorize?{queryString}";
        _logger.LogInformation("Built authorization URL: {Url}", authUrl);

        return authUrl;
    }

    #endregion

    #region Token Exchange

    /// <summary>
    /// Exchange authorization code for tokens.
    /// </summary>
    public async Task<TokenResponse> ExchangeCodeForTokensAsync(string code, string codeVerifier)
    {
        var tokenUrl = $"{ApiUrl.TrimEnd('/')}/api/v1/oauth-apps/token";
        _logger.LogInformation("Exchanging code for tokens at {Url}", tokenUrl);

        var requestData = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["client_id"] = ClientId,
            ["client_secret"] = ClientSecret,
            ["redirect_uri"] = RedirectUri,
            ["code_verifier"] = codeVerifier
        };

        var content = new FormUrlEncodedContent(requestData);
        var response = await _httpClient.PostAsync(tokenUrl, content);

        var responseContent = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            var error = JsonSerializer.Deserialize<OAuthErrorResponse>(responseContent);
            throw new OAuthException(
                error?.Error ?? "token_exchange_failed",
                error?.ErrorDescription ?? $"HTTP {response.StatusCode}: {responseContent}");
        }

        return JsonSerializer.Deserialize<TokenResponse>(responseContent)
            ?? throw new InvalidOperationException("Failed to parse token response");
    }

    /// <summary>
    /// Refresh an expired access token using a refresh token.
    /// </summary>
    public async Task<TokenResponse> RefreshTokenAsync(string refreshToken)
    {
        var tokenUrl = $"{ApiUrl.TrimEnd('/')}/api/v1/oauth-apps/token";
        _logger.LogInformation("Refreshing token at {Url}", tokenUrl);

        var requestData = new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
            ["client_id"] = ClientId,
            ["client_secret"] = ClientSecret
        };

        var content = new FormUrlEncodedContent(requestData);
        var response = await _httpClient.PostAsync(tokenUrl, content);

        var responseContent = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            var error = JsonSerializer.Deserialize<OAuthErrorResponse>(responseContent);
            throw new OAuthException(
                error?.Error ?? "refresh_failed",
                error?.ErrorDescription ?? $"HTTP {response.StatusCode}: {responseContent}");
        }

        return JsonSerializer.Deserialize<TokenResponse>(responseContent)
            ?? throw new InvalidOperationException("Failed to parse token response");
    }

    #endregion

    #region ID Token Verification

    /// <summary>
    /// Verify the ID token signature and claims.
    /// </summary>
    public async Task<JwtSecurityToken> VerifyIdTokenAsync(string idToken, string expectedNonce)
    {
        _logger.LogInformation("Verifying ID token");

        // Get OIDC configuration for issuer
        var oidcConfig = await GetOidcConfigurationAsync();

        // Get JWKS for public keys
        var jwks = await GetJwksAsync();

        // Parse the token to get the key ID
        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(idToken);
        var kid = jwtToken.Header.Kid;

        _logger.LogDebug("Looking for key with kid: {Kid}", kid);

        // Find the matching key
        var matchingKey = jwks.Keys.FirstOrDefault(k => k.KeyId == kid);
        if (matchingKey == null)
        {
            throw new SecurityTokenValidationException($"No matching key found for kid: {kid}");
        }

        // Build the RSA security key from JWK
        var rsaKey = BuildRsaSecurityKey(matchingKey);

        // Validation parameters
        var validationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = oidcConfig.Issuer,
            ValidateAudience = true,
            ValidAudience = ClientId,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = rsaKey,
            ClockSkew = TimeSpan.FromMinutes(5)
        };

        // Validate the token
        handler.ValidateToken(idToken, validationParameters, out var validatedToken);

        // Verify nonce
        var nonceClaim = jwtToken.Claims.FirstOrDefault(c => c.Type == "nonce")?.Value;
        if (nonceClaim != expectedNonce)
        {
            throw new SecurityTokenValidationException(
                $"Invalid nonce. Expected: {expectedNonce}, Got: {nonceClaim}");
        }

        _logger.LogInformation("ID token verified successfully for subject: {Sub}",
            jwtToken.Subject);

        return jwtToken;
    }

    /// <summary>
    /// Build an RSA security key from a JWK.
    /// </summary>
    private RsaSecurityKey BuildRsaSecurityKey(JsonWebKeyModel jwk)
    {
        // Decode the modulus and exponent from base64url
        var modulus = Base64UrlDecode(jwk.Modulus);
        var exponent = Base64UrlDecode(jwk.Exponent);

        // Create RSA parameters
        var rsaParams = new RSAParameters
        {
            Modulus = modulus,
            Exponent = exponent
        };

        // Create RSA key
        var rsa = RSA.Create();
        rsa.ImportParameters(rsaParams);

        return new RsaSecurityKey(rsa) { KeyId = jwk.KeyId };
    }

    #endregion

    #region User Info

    /// <summary>
    /// Get user information from the userinfo endpoint.
    /// </summary>
    public async Task<UserInfo> GetUserInfoAsync(string accessToken)
    {
        var userinfoUrl = $"{ApiUrl.TrimEnd('/')}/api/v1/oauth-apps/userinfo";
        _logger.LogInformation("Fetching user info from {Url}", userinfoUrl);

        using var request = new HttpRequestMessage(HttpMethod.Get, userinfoUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _httpClient.SendAsync(request);
        var responseContent = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new OAuthException(
                "userinfo_failed",
                $"Failed to fetch user info: HTTP {response.StatusCode}: {responseContent}");
        }

        return JsonSerializer.Deserialize<UserInfo>(responseContent)
            ?? throw new InvalidOperationException("Failed to parse user info response");
    }

    #endregion

    #region Token Revocation

    /// <summary>
    /// Revoke a token (logout).
    /// </summary>
    public async Task RevokeTokenAsync(string token, string tokenTypeHint = "refresh_token")
    {
        var revokeUrl = $"{ApiUrl.TrimEnd('/')}/api/v1/oauth-apps/revoke";
        _logger.LogInformation("Revoking token at {Url}", revokeUrl);

        var requestData = new Dictionary<string, string>
        {
            ["token"] = token,
            ["token_type_hint"] = tokenTypeHint,
            ["client_id"] = ClientId,
            ["client_secret"] = ClientSecret
        };

        var content = new FormUrlEncodedContent(requestData);

        try
        {
            var response = await _httpClient.PostAsync(revokeUrl, content);
            // Per RFC 7009, revocation endpoint should return 200 even for invalid tokens
            _logger.LogInformation("Token revoked successfully");
        }
        catch (Exception ex)
        {
            // Don't fail logout if revocation fails
            _logger.LogWarning(ex, "Token revocation failed (continuing with logout)");
        }
    }

    #endregion

    #region Helpers

    /// <summary>
    /// Base64url encode without padding.
    /// </summary>
    private static string Base64UrlEncode(byte[] data)
    {
        return Convert.ToBase64String(data)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    /// <summary>
    /// Base64url decode (handles missing padding).
    /// </summary>
    private static byte[] Base64UrlDecode(string input)
    {
        // Add padding if necessary
        var padded = input
            .Replace('-', '+')
            .Replace('_', '/');

        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
        }

        return Convert.FromBase64String(padded);
    }

    #endregion
}

/// <summary>
/// Exception for OAuth-specific errors.
/// </summary>
public class OAuthException : Exception
{
    public string Error { get; }
    public string? ErrorDescription { get; }

    public OAuthException(string error, string? errorDescription = null)
        : base(errorDescription ?? error)
    {
        Error = error;
        ErrorDescription = errorDescription;
    }
}
