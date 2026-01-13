package com.sendseven.oauth.controller;

import com.sendseven.oauth.model.*;
import com.sendseven.oauth.service.OAuthService;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * OAuth Controller for handling the OAuth2/OIDC flow.
 *
 * Endpoints:
 * - GET /           - Home page (shows login button or user info)
 * - GET /login      - Initiate OAuth flow
 * - GET /callback   - OAuth callback handler
 * - GET /refresh    - Refresh tokens
 * - GET /logout     - Logout and revoke tokens
 * - GET /api/user   - API endpoint for user info (JSON)
 */
@Controller
public class OAuthController {

    private static final Logger logger = LoggerFactory.getLogger(OAuthController.class);

    private static final String SESSION_OAUTH = "oauth_session";
    private static final String SESSION_USER = "user";
    private static final String SESSION_TOKENS = "tokens";

    private final OAuthService oAuthService;

    public OAuthController(OAuthService oAuthService) {
        this.oAuthService = oAuthService;
    }

    // =========================================================================
    // Home Page
    // =========================================================================

    /**
     * Home page - shows login button if not authenticated, user info if authenticated.
     */
    @GetMapping("/")
    public String home(HttpSession session, Model model) {
        UserInfo user = (UserInfo) session.getAttribute(SESSION_USER);
        TokenResponse tokens = (TokenResponse) session.getAttribute(SESSION_TOKENS);

        if (user != null) {
            model.addAttribute("user", user);
            if (tokens != null) {
                model.addAttribute("tokens", tokens.toSummary());
            }
        }

        return "home";
    }

    // =========================================================================
    // Login (Start OAuth Flow)
    // =========================================================================

    /**
     * Initiate the OAuth2 authorization flow.
     *
     * 1. Generate PKCE codes (code_verifier, code_challenge)
     * 2. Generate state (CSRF protection)
     * 3. Generate nonce (ID token replay protection)
     * 4. Store in session
     * 5. Redirect to SendSeven authorization endpoint
     */
    @GetMapping("/login")
    public String login(HttpSession session) {
        // Create OAuth session with PKCE, state, and nonce
        OAuthSession oauthSession = oAuthService.createOAuthSession();

        // Store in HTTP session for callback validation
        session.setAttribute(SESSION_OAUTH, oauthSession);

        // Build authorization URL and redirect
        String authUrl = oAuthService.buildAuthorizationUrl(oauthSession);
        logger.info("Redirecting to authorization URL: {}", authUrl);

        return "redirect:" + authUrl;
    }

    // =========================================================================
    // OAuth Callback
    // =========================================================================

    /**
     * Handle the OAuth2 callback.
     *
     * 1. Check for error response
     * 2. Validate state (CSRF protection)
     * 3. Exchange code for tokens
     * 4. Verify ID token (if present)
     * 5. Fetch user info
     * 6. Store in session
     */
    @GetMapping("/callback")
    public String callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            @RequestParam(name = "error_description", required = false) String errorDescription,
            HttpSession session,
            Model model,
            RedirectAttributes redirectAttributes
    ) {
        // Check for error response from authorization server
        if (error != null) {
            logger.error("OAuth error: {} - {}", error, errorDescription);
            model.addAttribute("error", error);
            model.addAttribute("errorDescription", errorDescription != null ? errorDescription : "Unknown error");
            return "error";
        }

        // Validate required parameters
        if (code == null || state == null) {
            model.addAttribute("error", "invalid_request");
            model.addAttribute("errorDescription", "Missing code or state parameter");
            return "error";
        }

        // Get stored OAuth session
        OAuthSession oauthSession = (OAuthSession) session.getAttribute(SESSION_OAUTH);

        if (oauthSession == null) {
            model.addAttribute("error", "session_expired");
            model.addAttribute("errorDescription", "OAuth session not found. Please try logging in again.");
            return "error";
        }

        // Validate state (CSRF protection)
        if (!state.equals(oauthSession.getState())) {
            logger.error("State mismatch! Expected: {}, Got: {}", oauthSession.getState(), state);
            model.addAttribute("error", "invalid_state");
            model.addAttribute("errorDescription", "State mismatch - possible CSRF attack");
            return "error";
        }

        // Check if OAuth session is still valid (10 minute timeout)
        if (!oauthSession.isValid()) {
            model.addAttribute("error", "session_expired");
            model.addAttribute("errorDescription", "Authorization request has expired. Please try again.");
            return "error";
        }

        try {
            // Exchange authorization code for tokens
            TokenResponse tokens = oAuthService.exchangeCodeForTokens(code, oauthSession.getCodeVerifier());

            // Verify ID token if present
            if (tokens.hasIdToken()) {
                try {
                    IdTokenClaims claims = oAuthService.verifyIdToken(
                            tokens.getIdToken(),
                            oauthSession.getNonce()
                    );
                    logger.info("ID token verified for user: {}", claims.getSubject());
                } catch (Exception e) {
                    logger.error("ID token verification failed", e);
                    model.addAttribute("error", "id_token_verification_failed");
                    model.addAttribute("errorDescription", "Failed to verify ID token: " + e.getMessage());
                    return "error";
                }
            }

            // Fetch user info
            UserInfo userInfo = oAuthService.getUserInfo(tokens.getAccessToken());

            // Store in session
            session.setAttribute(SESSION_USER, userInfo);
            session.setAttribute(SESSION_TOKENS, tokens);

            // Clean up OAuth session
            session.removeAttribute(SESSION_OAUTH);

            logger.info("User authenticated successfully: {}", userInfo.getEmail());

            return "redirect:/";

        } catch (Exception e) {
            logger.error("Token exchange failed", e);
            model.addAttribute("error", "token_exchange_failed");
            model.addAttribute("errorDescription", "Failed to exchange code for tokens: " + e.getMessage());
            return "error";
        }
    }

    // =========================================================================
    // Token Refresh
    // =========================================================================

    /**
     * Refresh the access token using the refresh token.
     */
    @GetMapping("/refresh")
    public String refresh(HttpSession session, Model model) {
        TokenResponse tokens = (TokenResponse) session.getAttribute(SESSION_TOKENS);

        if (tokens == null || !tokens.hasRefreshToken()) {
            model.addAttribute("error", "no_refresh_token");
            model.addAttribute("errorDescription",
                    "No refresh token available. Login again with 'offline_access' scope.");
            return "error";
        }

        try {
            // Refresh tokens
            TokenResponse newTokens = oAuthService.refreshTokens(tokens.getRefreshToken());

            // Update stored tokens
            session.setAttribute(SESSION_TOKENS, newTokens);

            logger.info("Tokens refreshed successfully");

            return "redirect:/";

        } catch (Exception e) {
            logger.error("Token refresh failed", e);
            // Clear session on refresh failure
            session.invalidate();
            model.addAttribute("error", "refresh_failed");
            model.addAttribute("errorDescription",
                    "Failed to refresh tokens: " + e.getMessage() + ". Please login again.");
            return "error";
        }
    }

    // =========================================================================
    // Logout
    // =========================================================================

    /**
     * Logout - revoke tokens and clear session.
     */
    @GetMapping("/logout")
    public String logout(HttpSession session) {
        TokenResponse tokens = (TokenResponse) session.getAttribute(SESSION_TOKENS);

        // Revoke refresh token (which also invalidates access token)
        if (tokens != null && tokens.hasRefreshToken()) {
            try {
                oAuthService.revokeToken(tokens.getRefreshToken(), "refresh_token");
                logger.info("Token revoked successfully");
            } catch (Exception e) {
                // Non-fatal, continue with logout
                logger.warn("Token revocation failed (continuing): {}", e.getMessage());
            }
        }

        // Clear session
        session.invalidate();
        logger.info("User logged out");

        return "redirect:/";
    }

    // =========================================================================
    // API Endpoint
    // =========================================================================

    /**
     * API endpoint to get current user info as JSON.
     */
    @GetMapping("/api/user")
    @ResponseBody
    public UserInfo apiUser(HttpSession session) {
        UserInfo user = (UserInfo) session.getAttribute(SESSION_USER);
        if (user == null) {
            throw new UnauthorizedException("Not authenticated");
        }
        return user;
    }

    /**
     * Exception for unauthorized access.
     */
    @ResponseStatus(org.springframework.http.HttpStatus.UNAUTHORIZED)
    public static class UnauthorizedException extends RuntimeException {
        public UnauthorizedException(String message) {
            super(message);
        }
    }
}
