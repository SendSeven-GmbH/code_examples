using System.Text.Json.Serialization;

namespace LoginWithSendSeven.Models;

/// <summary>
/// OIDC Discovery document from /.well-known/openid-configuration
/// </summary>
public class OidcConfiguration
{
    [JsonPropertyName("issuer")]
    public string Issuer { get; set; } = string.Empty;

    [JsonPropertyName("authorization_endpoint")]
    public string AuthorizationEndpoint { get; set; } = string.Empty;

    [JsonPropertyName("token_endpoint")]
    public string TokenEndpoint { get; set; } = string.Empty;

    [JsonPropertyName("userinfo_endpoint")]
    public string UserinfoEndpoint { get; set; } = string.Empty;

    [JsonPropertyName("jwks_uri")]
    public string JwksUri { get; set; } = string.Empty;

    [JsonPropertyName("revocation_endpoint")]
    public string? RevocationEndpoint { get; set; }

    [JsonPropertyName("scopes_supported")]
    public List<string>? ScopesSupported { get; set; }

    [JsonPropertyName("response_types_supported")]
    public List<string>? ResponseTypesSupported { get; set; }

    [JsonPropertyName("grant_types_supported")]
    public List<string>? GrantTypesSupported { get; set; }

    [JsonPropertyName("id_token_signing_alg_values_supported")]
    public List<string>? IdTokenSigningAlgValuesSupported { get; set; }

    [JsonPropertyName("code_challenge_methods_supported")]
    public List<string>? CodeChallengeMethodsSupported { get; set; }
}

/// <summary>
/// JSON Web Key Set from /.well-known/jwks.json
/// </summary>
public class JwksResponse
{
    [JsonPropertyName("keys")]
    public List<JsonWebKeyModel> Keys { get; set; } = new();
}

/// <summary>
/// Individual JSON Web Key for RS256 verification.
/// </summary>
public class JsonWebKeyModel
{
    [JsonPropertyName("kty")]
    public string KeyType { get; set; } = string.Empty;

    [JsonPropertyName("use")]
    public string? Use { get; set; }

    [JsonPropertyName("kid")]
    public string KeyId { get; set; } = string.Empty;

    [JsonPropertyName("alg")]
    public string? Algorithm { get; set; }

    [JsonPropertyName("n")]
    public string Modulus { get; set; } = string.Empty;

    [JsonPropertyName("e")]
    public string Exponent { get; set; } = string.Empty;
}
