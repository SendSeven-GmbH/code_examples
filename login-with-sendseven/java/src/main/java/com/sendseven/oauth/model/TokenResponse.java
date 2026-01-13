package com.sendseven.oauth.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * OAuth2 Token Response from the token endpoint.
 *
 * Contains access_token, refresh_token, id_token (if OIDC), and metadata.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TokenResponse {

    @JsonProperty("access_token")
    private String accessToken;

    @JsonProperty("token_type")
    private String tokenType;

    @JsonProperty("expires_in")
    private Integer expiresIn;

    @JsonProperty("refresh_token")
    private String refreshToken;

    @JsonProperty("scope")
    private String scope;

    @JsonProperty("id_token")
    private String idToken;

    // Constructors
    public TokenResponse() {}

    // Getters and Setters
    public String getAccessToken() {
        return accessToken;
    }

    public void setAccessToken(String accessToken) {
        this.accessToken = accessToken;
    }

    public String getTokenType() {
        return tokenType;
    }

    public void setTokenType(String tokenType) {
        this.tokenType = tokenType;
    }

    public Integer getExpiresIn() {
        return expiresIn;
    }

    public void setExpiresIn(Integer expiresIn) {
        this.expiresIn = expiresIn;
    }

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }

    public String getScope() {
        return scope;
    }

    public void setScope(String scope) {
        this.scope = scope;
    }

    public String getIdToken() {
        return idToken;
    }

    public void setIdToken(String idToken) {
        this.idToken = idToken;
    }

    public boolean hasRefreshToken() {
        return refreshToken != null && !refreshToken.isEmpty();
    }

    public boolean hasIdToken() {
        return idToken != null && !idToken.isEmpty();
    }

    /**
     * Returns a summary for display (hiding sensitive data).
     */
    public TokenSummary toSummary() {
        TokenSummary summary = new TokenSummary();
        if (accessToken != null && accessToken.length() > 20) {
            summary.setAccessTokenPreview(accessToken.substring(0, 20) + "...");
        }
        summary.setTokenType(tokenType);
        summary.setExpiresIn(expiresIn);
        summary.setScope(scope);
        summary.setHasRefreshToken(hasRefreshToken());
        summary.setHasIdToken(hasIdToken());
        return summary;
    }

    @Override
    public String toString() {
        return "TokenResponse{" +
                "accessToken='" + (accessToken != null ? accessToken.substring(0, Math.min(20, accessToken.length())) + "..." : "null") + '\'' +
                ", tokenType='" + tokenType + '\'' +
                ", expiresIn=" + expiresIn +
                ", scope='" + scope + '\'' +
                ", hasRefreshToken=" + hasRefreshToken() +
                ", hasIdToken=" + hasIdToken() +
                '}';
    }
}
