package com.sendseven.oauth.model;

/**
 * Token summary for safe display in UI (hides sensitive data).
 */
public class TokenSummary {

    private String accessTokenPreview;
    private String tokenType;
    private Integer expiresIn;
    private String scope;
    private boolean hasRefreshToken;
    private boolean hasIdToken;

    // Constructors
    public TokenSummary() {}

    // Getters and Setters
    public String getAccessTokenPreview() {
        return accessTokenPreview;
    }

    public void setAccessTokenPreview(String accessTokenPreview) {
        this.accessTokenPreview = accessTokenPreview;
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

    public String getScope() {
        return scope;
    }

    public void setScope(String scope) {
        this.scope = scope;
    }

    public boolean isHasRefreshToken() {
        return hasRefreshToken;
    }

    public void setHasRefreshToken(boolean hasRefreshToken) {
        this.hasRefreshToken = hasRefreshToken;
    }

    public boolean isHasIdToken() {
        return hasIdToken;
    }

    public void setHasIdToken(boolean hasIdToken) {
        this.hasIdToken = hasIdToken;
    }
}
