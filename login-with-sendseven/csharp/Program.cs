/*
 * SendSeven API - Login with SendSeven Example (C#/ASP.NET Core)
 *
 * Demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven".
 *
 * This example implements:
 * 1. PKCE (Proof Key for Code Exchange) - SHA-256 code challenge
 * 2. State parameter - CSRF protection
 * 3. Nonce parameter - ID token replay protection
 * 4. ID Token verification - RS256 JWT signature validation using JWKS
 * 5. Token refresh - Using refresh tokens
 * 6. Token revocation - Logout / token invalidation
 */

using System.Text.Json;
using DotNetEnv;
using LoginWithSendSeven.Models;
using LoginWithSendSeven.Services;

// Load .env file if present
if (File.Exists(".env"))
{
    Env.Load();
}

var builder = WebApplication.CreateBuilder(args);

// Get port from environment or default to 3000
var port = int.Parse(Environment.GetEnvironmentVariable("PORT") ?? "3000");

// Configure to listen on the specified port
builder.WebHost.UseUrls($"http://localhost:{port}");

// Add services
builder.Services.AddRazorPages();

// Configure session
var sessionSecret = Environment.GetEnvironmentVariable("SESSION_SECRET")
    ?? Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");

builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
});

// Register HttpClient and OAuthService
builder.Services.AddHttpClient<OAuthService>();
builder.Services.AddSingleton<OAuthService>();

var app = builder.Build();

// Middleware
app.UseStaticFiles();
app.UseSession();
app.UseRouting();

// Map Razor Pages (for Index, Error)
app.MapRazorPages();

// =============================================================================
// OAuth Routes
// =============================================================================

/// <summary>
/// Initiate OAuth2 authorization flow.
/// Generates PKCE codes, state, and nonce, stores them in session,
/// then redirects to SendSeven's authorization endpoint.
/// </summary>
app.MapGet("/login", async (HttpContext context, OAuthService oauthService) =>
{
    try
    {
        // Generate OAuth state (PKCE, state, nonce)
        var oauthState = oauthService.GenerateOAuthState();

        // Store in session for callback verification
        context.Session.SetString("OAuthState", JsonSerializer.Serialize(oauthState));

        // Build authorization URL and redirect
        var authUrl = oauthService.BuildAuthorizationUrl(oauthState);

        Console.WriteLine($"[Login] Redirecting to: {authUrl}");

        return Results.Redirect(authUrl);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Login] Error: {ex.Message}");
        return Results.Redirect($"/Error?error=configuration_error&error_description={Uri.EscapeDataString(ex.Message)}");
    }
});

/// <summary>
/// OAuth2 callback handler.
/// Validates state, exchanges code for tokens, verifies ID token,
/// and fetches user info.
/// </summary>
app.MapGet("/callback", async (HttpContext context, OAuthService oauthService) =>
{
    // Check for error response from authorization server
    var error = context.Request.Query["error"].FirstOrDefault();
    if (!string.IsNullOrEmpty(error))
    {
        var errorDescription = context.Request.Query["error_description"].FirstOrDefault() ?? "Unknown error";
        Console.WriteLine($"[Callback] OAuth error: {error} - {errorDescription}");

        context.Items["Error"] = error;
        context.Items["ErrorDescription"] = errorDescription;
        return Results.Redirect($"/Error?error={Uri.EscapeDataString(error)}&error_description={Uri.EscapeDataString(errorDescription)}");
    }

    // Get authorization code and state from query
    var code = context.Request.Query["code"].FirstOrDefault();
    var state = context.Request.Query["state"].FirstOrDefault();

    if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
    {
        return Results.Redirect("/Error?error=invalid_request&error_description=Missing+code+or+state+parameter");
    }

    // Retrieve stored OAuth state from session
    var storedStateJson = context.Session.GetString("OAuthState");
    if (string.IsNullOrEmpty(storedStateJson))
    {
        return Results.Redirect("/Error?error=invalid_state&error_description=No+OAuth+state+found+in+session");
    }

    var storedState = JsonSerializer.Deserialize<OAuthState>(storedStateJson);
    if (storedState == null)
    {
        return Results.Redirect("/Error?error=invalid_state&error_description=Failed+to+parse+stored+state");
    }

    // Validate state (CSRF protection)
    if (state != storedState.State)
    {
        Console.WriteLine($"[Callback] State mismatch! Expected: {storedState.State}, Got: {state}");
        return Results.Redirect("/Error?error=invalid_state&error_description=State+mismatch+-+possible+CSRF+attack");
    }

    // Check if state is expired (10 minute max)
    if (DateTime.UtcNow - storedState.CreatedAt > TimeSpan.FromMinutes(10))
    {
        return Results.Redirect("/Error?error=expired_state&error_description=Authorization+request+expired");
    }

    try
    {
        // Exchange authorization code for tokens
        Console.WriteLine("[Callback] Exchanging code for tokens...");
        var tokens = await oauthService.ExchangeCodeForTokensAsync(code, storedState.CodeVerifier);
        Console.WriteLine("[Callback] Token exchange successful");

        // Verify ID token if present
        if (!string.IsNullOrEmpty(tokens.IdToken))
        {
            Console.WriteLine("[Callback] Verifying ID token...");
            var idTokenClaims = await oauthService.VerifyIdTokenAsync(tokens.IdToken, storedState.Nonce);
            Console.WriteLine($"[Callback] ID token verified for subject: {idTokenClaims.Subject}");
        }

        // Fetch user info
        Console.WriteLine("[Callback] Fetching user info...");
        var userInfo = await oauthService.GetUserInfoAsync(tokens.AccessToken);
        Console.WriteLine($"[Callback] User authenticated: {userInfo.Email}");

        // Store in session
        context.Session.SetString("User", JsonSerializer.Serialize(userInfo));
        context.Session.SetString("Tokens", JsonSerializer.Serialize(tokens));
        context.Session.SetString("TokenExpiresAt",
            DateTime.UtcNow.AddSeconds(tokens.ExpiresIn).ToString("O"));

        // Clear OAuth state
        context.Session.Remove("OAuthState");

        return Results.Redirect("/");
    }
    catch (OAuthException ex)
    {
        Console.WriteLine($"[Callback] OAuth error: {ex.Error} - {ex.ErrorDescription}");
        return Results.Redirect($"/Error?error={Uri.EscapeDataString(ex.Error)}&error_description={Uri.EscapeDataString(ex.ErrorDescription ?? ex.Message)}");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Callback] Error: {ex.Message}");
        return Results.Redirect($"/Error?error=server_error&error_description={Uri.EscapeDataString(ex.Message)}");
    }
});

/// <summary>
/// Refresh the access token using the refresh token.
/// </summary>
app.MapGet("/refresh", async (HttpContext context, OAuthService oauthService) =>
{
    var tokensJson = context.Session.GetString("Tokens");
    if (string.IsNullOrEmpty(tokensJson))
    {
        return Results.Redirect("/login");
    }

    var tokens = JsonSerializer.Deserialize<TokenResponse>(tokensJson);
    if (tokens == null || string.IsNullOrEmpty(tokens.RefreshToken))
    {
        return Results.Redirect("/Error?error=no_refresh_token&error_description=No+refresh+token+available.+Login+again+with+'offline_access'+scope.");
    }

    try
    {
        Console.WriteLine("[Refresh] Refreshing tokens...");
        var newTokens = await oauthService.RefreshTokenAsync(tokens.RefreshToken);
        Console.WriteLine("[Refresh] Tokens refreshed successfully");

        // Update stored tokens
        context.Session.SetString("Tokens", JsonSerializer.Serialize(newTokens));
        context.Session.SetString("TokenExpiresAt",
            DateTime.UtcNow.AddSeconds(newTokens.ExpiresIn).ToString("O"));

        return Results.Redirect("/");
    }
    catch (OAuthException ex)
    {
        Console.WriteLine($"[Refresh] OAuth error: {ex.Error} - {ex.ErrorDescription}");
        // Clear session on refresh failure
        context.Session.Clear();
        return Results.Redirect($"/Error?error={Uri.EscapeDataString(ex.Error)}&error_description={Uri.EscapeDataString(ex.ErrorDescription ?? "Please+login+again")}");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Refresh] Error: {ex.Message}");
        context.Session.Clear();
        return Results.Redirect("/login");
    }
});

/// <summary>
/// Logout - revoke tokens and clear session.
/// </summary>
app.MapGet("/logout", async (HttpContext context, OAuthService oauthService) =>
{
    var tokensJson = context.Session.GetString("Tokens");
    if (!string.IsNullOrEmpty(tokensJson))
    {
        var tokens = JsonSerializer.Deserialize<TokenResponse>(tokensJson);
        if (tokens != null && !string.IsNullOrEmpty(tokens.RefreshToken))
        {
            try
            {
                Console.WriteLine("[Logout] Revoking tokens...");
                await oauthService.RevokeTokenAsync(tokens.RefreshToken, "refresh_token");
                Console.WriteLine("[Logout] Tokens revoked successfully");
            }
            catch (Exception ex)
            {
                // Don't fail logout if revocation fails
                Console.WriteLine($"[Logout] Token revocation failed (continuing): {ex.Message}");
            }
        }
    }

    // Clear session
    context.Session.Clear();
    Console.WriteLine("[Logout] Session cleared");

    return Results.Redirect("/");
});

/// <summary>
/// API endpoint to get current user info (JSON).
/// </summary>
app.MapGet("/api/user", (HttpContext context) =>
{
    var userJson = context.Session.GetString("User");
    if (string.IsNullOrEmpty(userJson))
    {
        return Results.Unauthorized();
    }

    var user = JsonSerializer.Deserialize<UserInfo>(userJson);
    return Results.Json(user);
});

/// <summary>
/// API endpoint to get current tokens info (JSON, redacted).
/// </summary>
app.MapGet("/api/tokens", (HttpContext context) =>
{
    var tokensJson = context.Session.GetString("Tokens");
    if (string.IsNullOrEmpty(tokensJson))
    {
        return Results.Unauthorized();
    }

    var tokens = JsonSerializer.Deserialize<TokenResponse>(tokensJson);
    if (tokens == null)
    {
        return Results.Unauthorized();
    }

    // Return redacted token info
    return Results.Json(new
    {
        access_token = tokens.AccessToken.Substring(0, Math.Min(20, tokens.AccessToken.Length)) + "...",
        token_type = tokens.TokenType,
        expires_in = tokens.ExpiresIn,
        scope = tokens.Scope,
        has_refresh_token = !string.IsNullOrEmpty(tokens.RefreshToken),
        has_id_token = !string.IsNullOrEmpty(tokens.IdToken)
    });
});

// Error page handler
app.MapGet("/Error", (HttpContext context) =>
{
    var error = context.Request.Query["error"].FirstOrDefault() ?? "Unknown Error";
    var errorDescription = context.Request.Query["error_description"].FirstOrDefault() ?? "An unexpected error occurred.";

    context.Response.Headers["Content-Type"] = "text/html; charset=utf-8";

    return Results.Content($@"
<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Error - Login with SendSeven</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }}
        .error-card {{
            background: white;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        .error-icon {{ color: #dc2626; margin-bottom: 20px; }}
        h2 {{ color: #dc2626; margin-bottom: 8px; }}
        p {{ color: #64748b; margin-bottom: 24px; }}
        .btn {{
            display: inline-block;
            padding: 12px 24px;
            background: #f1f5f9;
            color: #475569;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 600;
        }}
        .btn:hover {{ background: #e2e8f0; }}
    </style>
</head>
<body>
    <div class=""error-card"">
        <div class=""error-icon"">
            <svg xmlns=""http://www.w3.org/2000/svg"" width=""48"" height=""48"" viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                <circle cx=""12"" cy=""12"" r=""10""/><line x1=""12"" y1=""8"" x2=""12"" y2=""12""/><line x1=""12"" y1=""16"" x2=""12.01"" y2=""16""/>
            </svg>
        </div>
        <h2>{System.Web.HttpUtility.HtmlEncode(error)}</h2>
        <p>{System.Web.HttpUtility.HtmlEncode(errorDescription)}</p>
        <a href=""/"" class=""btn"">Back to Home</a>
    </div>
</body>
</html>", "text/html");
});

// =============================================================================
// Startup
// =============================================================================

var oauthService = app.Services.GetRequiredService<OAuthService>();

// Validate configuration on startup
try
{
    var clientId = oauthService.ClientId;
    var clientSecret = oauthService.ClientSecret;

    if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
    {
        throw new InvalidOperationException("SENDSEVEN_CLIENT_ID and SENDSEVEN_CLIENT_SECRET must be set!");
    }
}
catch (InvalidOperationException ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"\nERROR: {ex.Message}");
    Console.WriteLine("Get your credentials from the SendSeven dashboard at https://app.sendseven.com/settings/developer");
    Console.ResetColor();
    Environment.Exit(1);
}

Console.WriteLine();
Console.WriteLine("=================================================================");
Console.WriteLine("   Login with SendSeven - OAuth2/OIDC Demo (ASP.NET Core)");
Console.WriteLine("=================================================================");
Console.WriteLine();
Console.WriteLine($"  API URL:      {oauthService.ApiUrl}");
Console.WriteLine($"  Redirect URI: {oauthService.RedirectUri}");
Console.WriteLine($"  Scopes:       {oauthService.Scopes}");
Console.WriteLine();
Console.WriteLine($"  Open http://localhost:{port} in your browser");
Console.WriteLine();
Console.WriteLine("=================================================================");
Console.WriteLine();

app.Run();
