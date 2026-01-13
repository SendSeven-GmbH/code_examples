using System.Text.Json.Serialization;

namespace LoginWithSendSeven.Models;

/// <summary>
/// User information from the userinfo endpoint.
/// </summary>
public class UserInfo
{
    /// <summary>
    /// Subject identifier - unique user ID.
    /// </summary>
    [JsonPropertyName("sub")]
    public string Sub { get; set; } = string.Empty;

    /// <summary>
    /// User's email address.
    /// </summary>
    [JsonPropertyName("email")]
    public string? Email { get; set; }

    /// <summary>
    /// Whether the email has been verified.
    /// </summary>
    [JsonPropertyName("email_verified")]
    public bool? EmailVerified { get; set; }

    /// <summary>
    /// User's display name.
    /// </summary>
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// URL to user's profile picture.
    /// </summary>
    [JsonPropertyName("picture")]
    public string? Picture { get; set; }

    /// <summary>
    /// The tenant ID the user is associated with.
    /// </summary>
    [JsonPropertyName("tenant_id")]
    public string? TenantId { get; set; }
}
