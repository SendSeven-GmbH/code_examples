package com.sendseven.oauth.model;

import java.util.Date;

/**
 * Verified ID token claims.
 *
 * Contains standard OIDC claims plus SendSeven-specific claims.
 */
public class IdTokenClaims {

    /**
     * Issuer (iss) - Who issued the token
     */
    private String issuer;

    /**
     * Subject (sub) - Unique user identifier
     */
    private String subject;

    /**
     * Audience (aud) - Client ID the token is intended for
     */
    private String audience;

    /**
     * Expiration time (exp)
     */
    private Date expirationTime;

    /**
     * Issued at time (iat)
     */
    private Date issuedAt;

    /**
     * Nonce - For replay protection
     */
    private String nonce;

    /**
     * User's email
     */
    private String email;

    /**
     * Whether email is verified
     */
    private Boolean emailVerified;

    /**
     * User's name
     */
    private String name;

    /**
     * URL to user's profile picture
     */
    private String picture;

    /**
     * SendSeven tenant ID
     */
    private String tenantId;

    // Constructors
    public IdTokenClaims() {}

    // Getters and Setters
    public String getIssuer() {
        return issuer;
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        this.subject = subject;
    }

    public String getAudience() {
        return audience;
    }

    public void setAudience(String audience) {
        this.audience = audience;
    }

    public Date getExpirationTime() {
        return expirationTime;
    }

    public void setExpirationTime(Date expirationTime) {
        this.expirationTime = expirationTime;
    }

    public Date getIssuedAt() {
        return issuedAt;
    }

    public void setIssuedAt(Date issuedAt) {
        this.issuedAt = issuedAt;
    }

    public String getNonce() {
        return nonce;
    }

    public void setNonce(String nonce) {
        this.nonce = nonce;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Boolean getEmailVerified() {
        return emailVerified;
    }

    public void setEmailVerified(Boolean emailVerified) {
        this.emailVerified = emailVerified;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPicture() {
        return picture;
    }

    public void setPicture(String picture) {
        this.picture = picture;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    /**
     * Check if the token is expired.
     */
    public boolean isExpired() {
        if (expirationTime == null) {
            return true;
        }
        return new Date().after(expirationTime);
    }

    @Override
    public String toString() {
        return "IdTokenClaims{" +
                "issuer='" + issuer + '\'' +
                ", subject='" + subject + '\'' +
                ", audience='" + audience + '\'' +
                ", email='" + email + '\'' +
                ", name='" + name + '\'' +
                ", tenantId='" + tenantId + '\'' +
                ", expired=" + isExpired() +
                '}';
    }
}
