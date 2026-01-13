package com.sendseven.oauth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * SendSeven OAuth2/OIDC Login Example
 *
 * This application demonstrates how to implement "Sign in with SendSeven"
 * using the OAuth2 Authorization Code flow with PKCE.
 *
 * Features:
 * - PKCE (Proof Key for Code Exchange) for enhanced security
 * - State parameter for CSRF protection
 * - Nonce parameter for ID token replay protection
 * - ID token verification using JWKS
 * - Token refresh using refresh tokens
 * - Token revocation on logout
 *
 * @see <a href="https://api.sendseven.com/.well-known/openid-configuration">OIDC Discovery</a>
 */
@SpringBootApplication
public class OAuthApplication {

    public static void main(String[] args) {
        SpringApplication.run(OAuthApplication.class, args);
    }
}
