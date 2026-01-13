package com.sendseven.oauth.service;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sendseven.oauth.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.text.ParseException;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * OAuth2/OIDC Service for SendSeven authentication.
 *
 * Handles the complete OAuth2 Authorization Code flow with PKCE:
 * - PKCE code generation
 * - State and nonce generation
 * - Authorization URL building
 * - Token exchange
 * - ID token verification using JWKS
 * - Token refresh
 * - Token revocation
 */
@Service
public class OAuthService {

    private static final Logger logger = LoggerFactory.getLogger(OAuthService.class);
    private static final SecureRandom secureRandom = new SecureRandom();

    @Value("${sendseven.client-id}")
    private String clientId;

    @Value("${sendseven.client-secret}")
    private String clientSecret;

    @Value("${sendseven.api-url}")
    private String apiUrl;

    @Value("${sendseven.redirect-uri}")
    private String redirectUri;

    private final WebClient webClient;

    // JWKS cache
    private final Map<String, JWKSet> jwksCache = new ConcurrentHashMap<>();
    private long jwksCacheTime = 0;
    private static final long JWKS_CACHE_DURATION_MS = 3600 * 1000; // 1 hour

    // OIDC config cache
    private OIDCConfig oidcConfigCache;
    private long oidcConfigCacheTime = 0;
    private static final long OIDC_CONFIG_CACHE_DURATION_MS = 3600 * 1000; // 1 hour

    public OAuthService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    // =========================================================================
    // PKCE Generation
    // =========================================================================

    /**
     * Generate a cryptographically random code verifier for PKCE.
     *
     * The code verifier is a random string between 43 and 128 characters,
     * using URL-safe base64 characters (A-Z, a-z, 0-9, -, _, ~, .).
     *
     * @return A random code verifier string
     */
    public String generateCodeVerifier() {
        byte[] randomBytes = new byte[64];
        secureRandom.nextBytes(randomBytes);
        String verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        // Ensure length is between 43-128 characters
        return verifier.substring(0, Math.min(128, verifier.length()));
    }

    /**
     * Generate S256 code challenge from the code verifier.
     *
     * The code challenge is the Base64URL-encoded SHA-256 hash of the verifier.
     *
     * @param codeVerifier The PKCE code verifier
     * @return The S256 code challenge
     */
    public String generateCodeChallenge(String codeVerifier) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(codeVerifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    // =========================================================================
    // State and Nonce Generation
    // =========================================================================

    /**
     * Generate a random state parameter for CSRF protection.
     *
     * @return A random state string (32+ bytes, URL-safe)
     */
    public String generateState() {
        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }

    /**
     * Generate a random nonce for ID token replay protection.
     *
     * @return A random nonce string (32+ bytes, URL-safe)
     */
    public String generateNonce() {
        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }

    // =========================================================================
    // OAuth Session Management
    // =========================================================================

    /**
     * Create a new OAuth session with PKCE, state, and nonce.
     *
     * @return A new OAuthSession with all security parameters
     */
    public OAuthSession createOAuthSession() {
        String codeVerifier = generateCodeVerifier();
        String state = generateState();
        String nonce = generateNonce();
        return new OAuthSession(codeVerifier, state, nonce);
    }

    // =========================================================================
    // Authorization URL
    // =========================================================================

    /**
     * Build the authorization URL to redirect the user to SendSeven.
     *
     * @param oauthSession The OAuth session containing PKCE and security params
     * @return The complete authorization URL
     */
    public String buildAuthorizationUrl(OAuthSession oauthSession) {
        String codeChallenge = generateCodeChallenge(oauthSession.getCodeVerifier());

        return UriComponentsBuilder.fromUriString(apiUrl)
                .path("/api/v1/oauth-apps/authorize")
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", "openid profile email offline_access")
                .queryParam("state", oauthSession.getState())
                .queryParam("code_challenge", codeChallenge)
                .queryParam("code_challenge_method", "S256")
                .queryParam("nonce", oauthSession.getNonce())
                .build()
                .toUriString();
    }

    // =========================================================================
    // OIDC Discovery
    // =========================================================================

    /**
     * Fetch the OIDC discovery document.
     *
     * Caches the result for 1 hour.
     *
     * @return The OIDC configuration
     */
    public OIDCConfig getOIDCConfig() {
        long now = System.currentTimeMillis();

        if (oidcConfigCache != null && (now - oidcConfigCacheTime) < OIDC_CONFIG_CACHE_DURATION_MS) {
            return oidcConfigCache;
        }

        String discoveryUrl = apiUrl + "/.well-known/openid-configuration";
        logger.info("Fetching OIDC discovery from: {}", discoveryUrl);

        try {
            OIDCConfig config = webClient.get()
                    .uri(discoveryUrl)
                    .retrieve()
                    .bodyToMono(OIDCConfig.class)
                    .block();

            oidcConfigCache = config;
            oidcConfigCacheTime = now;

            return config;
        } catch (Exception e) {
            logger.error("Failed to fetch OIDC configuration", e);
            throw new RuntimeException("Failed to fetch OIDC configuration: " + e.getMessage(), e);
        }
    }

    /**
     * Fetch the JSON Web Key Set for ID token verification.
     *
     * Caches the result for 1 hour.
     *
     * @param jwksUri The JWKS URI from OIDC discovery
     * @return The JWK Set
     */
    public JWKSet getJWKS(String jwksUri) {
        long now = System.currentTimeMillis();

        JWKSet cached = jwksCache.get(jwksUri);
        if (cached != null && (now - jwksCacheTime) < JWKS_CACHE_DURATION_MS) {
            return cached;
        }

        logger.info("Fetching JWKS from: {}", jwksUri);

        try {
            JWKSet jwkSet = JWKSet.load(new URL(jwksUri));
            jwksCache.put(jwksUri, jwkSet);
            jwksCacheTime = now;
            return jwkSet;
        } catch (Exception e) {
            logger.error("Failed to fetch JWKS", e);
            throw new RuntimeException("Failed to fetch JWKS: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Token Exchange
    // =========================================================================

    /**
     * Exchange an authorization code for tokens.
     *
     * @param code The authorization code from the callback
     * @param codeVerifier The PKCE code verifier
     * @return The token response containing access_token, refresh_token, and id_token
     */
    public TokenResponse exchangeCodeForTokens(String code, String codeVerifier) {
        String tokenUrl = apiUrl + "/api/v1/oauth-apps/token";
        logger.info("Exchanging code for tokens at: {}", tokenUrl);

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("grant_type", "authorization_code");
        formData.add("code", code);
        formData.add("client_id", clientId);
        formData.add("client_secret", clientSecret);
        formData.add("redirect_uri", redirectUri);
        formData.add("code_verifier", codeVerifier);

        try {
            TokenResponse response = webClient.post()
                    .uri(tokenUrl)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(BodyInserters.fromFormData(formData))
                    .retrieve()
                    .bodyToMono(TokenResponse.class)
                    .block();

            logger.info("Token exchange successful");
            return response;
        } catch (Exception e) {
            logger.error("Token exchange failed", e);
            throw new RuntimeException("Failed to exchange code for tokens: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // ID Token Verification
    // =========================================================================

    /**
     * Verify an ID token and extract claims.
     *
     * Performs the following validations:
     * - Signature verification using JWKS
     * - Issuer (iss) matches expected
     * - Audience (aud) matches client_id
     * - Token is not expired (exp)
     * - Nonce matches the one sent in authorization request
     *
     * @param idToken The ID token JWT
     * @param expectedNonce The nonce that was sent in the authorization request
     * @return The verified ID token claims
     * @throws RuntimeException if verification fails
     */
    public IdTokenClaims verifyIdToken(String idToken, String expectedNonce) {
        try {
            // Parse the JWT
            SignedJWT signedJWT = SignedJWT.parse(idToken);

            // Get OIDC config for issuer and JWKS URI
            OIDCConfig oidcConfig = getOIDCConfig();

            // Fetch JWKS
            JWKSet jwkSet = getJWKS(oidcConfig.getJwksUri());

            // Get the key ID from the JWT header
            String kid = signedJWT.getHeader().getKeyID();
            JWSAlgorithm alg = signedJWT.getHeader().getAlgorithm();

            logger.info("Verifying ID token with kid: {}, alg: {}", kid, alg);

            // Find the matching key
            JWK jwk = jwkSet.getKeyByKeyId(kid);
            if (jwk == null) {
                throw new RuntimeException("No matching key found for kid: " + kid);
            }

            // Verify the signature
            if (!(jwk instanceof RSAKey)) {
                throw new RuntimeException("Expected RSA key but got: " + jwk.getKeyType());
            }

            RSAKey rsaKey = (RSAKey) jwk;
            com.nimbusds.jose.crypto.RSASSAVerifier verifier =
                    new com.nimbusds.jose.crypto.RSASSAVerifier(rsaKey);

            if (!signedJWT.verify(verifier)) {
                throw new RuntimeException("ID token signature verification failed");
            }

            logger.info("ID token signature verified successfully");

            // Extract and validate claims
            JWTClaimsSet claims = signedJWT.getJWTClaimsSet();

            // Validate issuer
            String issuer = claims.getIssuer();
            if (!oidcConfig.getIssuer().equals(issuer)) {
                throw new RuntimeException("Invalid issuer. Expected: " + oidcConfig.getIssuer() +
                        ", got: " + issuer);
            }

            // Validate audience
            if (!claims.getAudience().contains(clientId)) {
                throw new RuntimeException("Invalid audience. Expected: " + clientId +
                        ", got: " + claims.getAudience());
            }

            // Validate expiration
            Date exp = claims.getExpirationTime();
            if (exp == null || new Date().after(exp)) {
                throw new RuntimeException("ID token has expired");
            }

            // Validate nonce
            String nonce = claims.getStringClaim("nonce");
            if (expectedNonce != null && !expectedNonce.equals(nonce)) {
                throw new RuntimeException("Invalid nonce. Expected: " + expectedNonce +
                        ", got: " + nonce);
            }

            // Build claims object
            IdTokenClaims idTokenClaims = new IdTokenClaims();
            idTokenClaims.setIssuer(issuer);
            idTokenClaims.setSubject(claims.getSubject());
            idTokenClaims.setAudience(clientId);
            idTokenClaims.setExpirationTime(exp);
            idTokenClaims.setIssuedAt(claims.getIssueTime());
            idTokenClaims.setNonce(nonce);
            idTokenClaims.setEmail(claims.getStringClaim("email"));
            idTokenClaims.setEmailVerified(getBooleanClaim(claims, "email_verified"));
            idTokenClaims.setName(claims.getStringClaim("name"));
            idTokenClaims.setPicture(claims.getStringClaim("picture"));
            idTokenClaims.setTenantId(claims.getStringClaim("tenant_id"));

            logger.info("ID token claims verified: {}", idTokenClaims);

            return idTokenClaims;

        } catch (ParseException e) {
            logger.error("Failed to parse ID token", e);
            throw new RuntimeException("Invalid ID token format: " + e.getMessage(), e);
        } catch (Exception e) {
            logger.error("ID token verification failed", e);
            throw new RuntimeException("ID token verification failed: " + e.getMessage(), e);
        }
    }

    private Boolean getBooleanClaim(JWTClaimsSet claims, String claimName) {
        try {
            return claims.getBooleanClaim(claimName);
        } catch (ParseException e) {
            return null;
        }
    }

    // =========================================================================
    // User Info
    // =========================================================================

    /**
     * Fetch user information using the access token.
     *
     * @param accessToken The OAuth2 access token
     * @return The user info
     */
    public UserInfo getUserInfo(String accessToken) {
        String userinfoUrl = apiUrl + "/api/v1/oauth-apps/userinfo";
        logger.info("Fetching user info from: {}", userinfoUrl);

        try {
            UserInfo userInfo = webClient.get()
                    .uri(userinfoUrl)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .retrieve()
                    .bodyToMono(UserInfo.class)
                    .block();

            logger.info("User info fetched: {}", userInfo);
            return userInfo;
        } catch (Exception e) {
            logger.error("Failed to fetch user info", e);
            throw new RuntimeException("Failed to fetch user info: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Token Refresh
    // =========================================================================

    /**
     * Refresh tokens using a refresh token.
     *
     * @param refreshToken The refresh token
     * @return New token response with fresh access token
     */
    public TokenResponse refreshTokens(String refreshToken) {
        String tokenUrl = apiUrl + "/api/v1/oauth-apps/token";
        logger.info("Refreshing tokens at: {}", tokenUrl);

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("grant_type", "refresh_token");
        formData.add("refresh_token", refreshToken);
        formData.add("client_id", clientId);
        formData.add("client_secret", clientSecret);

        try {
            TokenResponse response = webClient.post()
                    .uri(tokenUrl)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(BodyInserters.fromFormData(formData))
                    .retrieve()
                    .bodyToMono(TokenResponse.class)
                    .block();

            logger.info("Token refresh successful");
            return response;
        } catch (Exception e) {
            logger.error("Token refresh failed", e);
            throw new RuntimeException("Failed to refresh tokens: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Token Revocation
    // =========================================================================

    /**
     * Revoke a token (access token or refresh token).
     *
     * @param token The token to revoke
     * @param tokenTypeHint Optional hint: "access_token" or "refresh_token"
     */
    public void revokeToken(String token, String tokenTypeHint) {
        String revokeUrl = apiUrl + "/api/v1/oauth-apps/revoke";
        logger.info("Revoking token at: {}", revokeUrl);

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("token", token);
        if (tokenTypeHint != null) {
            formData.add("token_type_hint", tokenTypeHint);
        }
        formData.add("client_id", clientId);
        formData.add("client_secret", clientSecret);

        try {
            webClient.post()
                    .uri(revokeUrl)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(BodyInserters.fromFormData(formData))
                    .retrieve()
                    .toBodilessEntity()
                    .block();

            logger.info("Token revoked successfully");
        } catch (Exception e) {
            // Token revocation errors are typically non-fatal
            logger.warn("Token revocation failed (continuing): {}", e.getMessage());
        }
    }
}
