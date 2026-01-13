package com.sendseven.oauth.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * User information from the userinfo endpoint.
 *
 * Contains OIDC standard claims plus SendSeven-specific claims.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class UserInfo {

    /**
     * Subject identifier (unique user ID)
     */
    @JsonProperty("sub")
    private String sub;

    /**
     * User's email address
     */
    @JsonProperty("email")
    private String email;

    /**
     * Whether the email has been verified
     */
    @JsonProperty("email_verified")
    private Boolean emailVerified;

    /**
     * User's full name
     */
    @JsonProperty("name")
    private String name;

    /**
     * URL to user's profile picture
     */
    @JsonProperty("picture")
    private String picture;

    /**
     * SendSeven tenant ID the user belongs to
     */
    @JsonProperty("tenant_id")
    private String tenantId;

    // Constructors
    public UserInfo() {}

    // Getters and Setters
    public String getSub() {
        return sub;
    }

    public void setSub(String sub) {
        this.sub = sub;
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
     * Get display name, falling back to email if name is not set.
     */
    public String getDisplayName() {
        if (name != null && !name.isEmpty()) {
            return name;
        }
        if (email != null && !email.isEmpty()) {
            return email;
        }
        return "Unknown User";
    }

    @Override
    public String toString() {
        return "UserInfo{" +
                "sub='" + sub + '\'' +
                ", email='" + email + '\'' +
                ", name='" + name + '\'' +
                ", tenantId='" + tenantId + '\'' +
                '}';
    }
}
