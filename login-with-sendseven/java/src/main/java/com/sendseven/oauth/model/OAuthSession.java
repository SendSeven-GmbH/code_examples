package com.sendseven.oauth.model;

import java.io.Serializable;

/**
 * OAuth session data stored during authorization flow.
 *
 * Stores PKCE verifier, state, and nonce for callback validation.
 */
public class OAuthSession implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * PKCE code verifier (random 43-128 char string)
     */
    private String codeVerifier;

    /**
     * State parameter for CSRF protection
     */
    private String state;

    /**
     * Nonce for ID token replay protection
     */
    private String nonce;

    /**
     * Timestamp when this session was created
     */
    private long createdAt;

    // Constructors
    public OAuthSession() {
        this.createdAt = System.currentTimeMillis();
    }

    public OAuthSession(String codeVerifier, String state, String nonce) {
        this();
        this.codeVerifier = codeVerifier;
        this.state = state;
        this.nonce = nonce;
    }

    // Getters and Setters
    public String getCodeVerifier() {
        return codeVerifier;
    }

    public void setCodeVerifier(String codeVerifier) {
        this.codeVerifier = codeVerifier;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getNonce() {
        return nonce;
    }

    public void setNonce(String nonce) {
        this.nonce = nonce;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    /**
     * Check if this OAuth session is still valid (10 minute timeout).
     */
    public boolean isValid() {
        long tenMinutesMs = 10 * 60 * 1000;
        return (System.currentTimeMillis() - createdAt) < tenMinutesMs;
    }
}
