namespace LoginWithSendSeven.Models;

/// <summary>
/// OAuth state stored in session during authorization flow.
/// </summary>
public class OAuthState
{
    /// <summary>
    /// Random state parameter for CSRF protection.
    /// </summary>
    public string State { get; set; } = string.Empty;

    /// <summary>
    /// Random nonce for ID token replay protection.
    /// </summary>
    public string Nonce { get; set; } = string.Empty;

    /// <summary>
    /// PKCE code verifier (43-128 characters).
    /// </summary>
    public string CodeVerifier { get; set; } = string.Empty;

    /// <summary>
    /// When this state was created (for expiration checking).
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Authenticated user session data.
/// </summary>
public class AuthenticatedSession
{
    /// <summary>
    /// User information from the userinfo endpoint.
    /// </summary>
    public UserInfo User { get; set; } = new();

    /// <summary>
    /// OAuth tokens (access, refresh, id).
    /// </summary>
    public TokenResponse Tokens { get; set; } = new();

    /// <summary>
    /// When the session was created.
    /// </summary>
    public DateTime AuthenticatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When the access token expires.
    /// </summary>
    public DateTime TokenExpiresAt { get; set; }
}
