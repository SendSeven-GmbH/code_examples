# Login with SendSeven - Java/Spring Boot

This example demonstrates OAuth2 Authorization Code flow with PKCE for "Sign in with SendSeven" using Java and Spring Boot.

## Features

- **PKCE** (Proof Key for Code Exchange) for enhanced security
- **State Parameter** for CSRF protection
- **Nonce Parameter** for ID token replay protection
- **ID Token Verification** using JWKS and nimbus-jose-jwt
- **Token Refresh** using refresh tokens
- **Token Revocation** on logout
- **Thymeleaf Templates** for a nice login UI

## Requirements

- Java 17 or higher
- Maven 3.8+
- SendSeven OAuth App credentials

## Quick Start

### 1. Configure Environment

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your SendSeven OAuth App credentials:

```properties
SENDSEVEN_CLIENT_ID=s7_app_your_client_id
SENDSEVEN_CLIENT_SECRET=s7_secret_your_secret
SENDSEVEN_API_URL=https://api.sendseven.com
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

### 2. Run the Application

Using Maven:

```bash
mvn spring-boot:run
```

Or build and run the JAR:

```bash
mvn clean package
java -jar target/login-with-sendseven-1.0.0.jar
```

### 3. Open in Browser

Navigate to [http://localhost:3000](http://localhost:3000) and click "Sign in with SendSeven".

## Project Structure

```
java/
├── pom.xml                                    # Maven configuration
├── .env.example                               # Environment template
├── src/main/java/com/sendseven/oauth/
│   ├── OAuthApplication.java                  # Spring Boot entry point
│   ├── config/
│   │   └── WebConfig.java                     # WebClient configuration
│   ├── controller/
│   │   └── OAuthController.java               # OAuth flow endpoints
│   ├── model/
│   │   ├── IdTokenClaims.java                 # Verified ID token claims
│   │   ├── OAuthSession.java                  # OAuth session (PKCE, state, nonce)
│   │   ├── OIDCConfig.java                    # OIDC discovery document
│   │   ├── TokenResponse.java                 # Token endpoint response
│   │   ├── TokenSummary.java                  # Safe token display
│   │   └── UserInfo.java                      # UserInfo endpoint response
│   └── service/
│       └── OAuthService.java                  # OAuth logic (PKCE, JWKS, tokens)
└── src/main/resources/
    ├── application.properties                 # Application config
    └── templates/
        ├── home.html                          # Home page (login/user info)
        └── error.html                         # Error page
```

## OAuth2 Flow

### 1. Login (`GET /login`)

1. Generate PKCE code verifier (random 43-128 char string)
2. Generate code challenge (SHA-256 hash of verifier)
3. Generate state (CSRF protection)
4. Generate nonce (ID token replay protection)
5. Store in HTTP session
6. Redirect to SendSeven authorization endpoint

### 2. Callback (`GET /callback`)

1. Validate state matches stored value
2. Exchange authorization code for tokens
3. Verify ID token signature using JWKS
4. Validate ID token claims (issuer, audience, expiration, nonce)
5. Fetch user info
6. Store tokens and user info in session

### 3. Refresh (`GET /refresh`)

1. Use stored refresh token
2. Exchange for new access token
3. Update stored tokens

### 4. Logout (`GET /logout`)

1. Revoke refresh token
2. Clear HTTP session

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Home page |
| `GET /login` | Start OAuth flow |
| `GET /callback` | OAuth callback handler |
| `GET /refresh` | Refresh access token |
| `GET /logout` | Logout and revoke tokens |
| `GET /api/user` | Get current user (JSON) |

## ID Token Verification

The example uses [nimbus-jose-jwt](https://connect2id.com/products/nimbus-jose-jwt) for JWT verification:

```java
// Fetch JWKS from SendSeven
JWKSet jwkSet = JWKSet.load(new URL(oidcConfig.getJwksUri()));

// Find key by kid
JWK jwk = jwkSet.getKeyByKeyId(kid);
RSAKey rsaKey = (RSAKey) jwk;

// Verify signature
RSASSAVerifier verifier = new RSASSAVerifier(rsaKey);
signedJWT.verify(verifier);

// Validate claims
JWTClaimsSet claims = signedJWT.getJWTClaimsSet();
// - issuer matches expected
// - audience contains client_id
// - exp is in the future
// - nonce matches sent value
```

## Configuration

### application.properties

```properties
# Server port
server.port=${PORT:3000}

# SendSeven credentials
sendseven.client-id=${SENDSEVEN_CLIENT_ID:}
sendseven.client-secret=${SENDSEVEN_CLIENT_SECRET:}
sendseven.api-url=${SENDSEVEN_API_URL:https://api.sendseven.com}
sendseven.redirect-uri=${REDIRECT_URI:http://localhost:3000/callback}

# Session timeout
server.servlet.session.timeout=30m
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SENDSEVEN_CLIENT_ID` | OAuth App client ID | (required) |
| `SENDSEVEN_CLIENT_SECRET` | OAuth App client secret | (required) |
| `SENDSEVEN_API_URL` | SendSeven API URL | `https://api.sendseven.com` |
| `REDIRECT_URI` | OAuth callback URL | `http://localhost:3000/callback` |
| `PORT` | Server port | `3000` |
| `SESSION_SECURE` | Secure session cookie | `false` |

## Security Best Practices

1. **Always use HTTPS in production** - OAuth2 requires secure connections
2. **Store secrets securely** - Never commit credentials to version control
3. **Use PKCE** - Required for public clients, recommended for all
4. **Validate state** - Prevents CSRF attacks
5. **Validate nonce** - Prevents ID token replay attacks
6. **Verify ID token** - Check signature and all claims
7. **Use short-lived sessions** - Don't rely solely on token expiration
8. **Revoke tokens on logout** - Properly invalidate sessions

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_client` | Wrong credentials | Verify client_id and client_secret |
| `invalid_grant` | Code expired/reused | Authorization codes expire in 10 minutes |
| `invalid_state` | Session issue | Clear cookies and try again |
| `id_token_verification_failed` | Signature mismatch | Check if JWKS is cached with old keys |

## Resources

- [SendSeven OAuth Documentation](https://docs.sendseven.com/oauth)
- [OIDC Discovery](https://api.sendseven.com/.well-known/openid-configuration)
- [nimbus-jose-jwt Documentation](https://connect2id.com/products/nimbus-jose-jwt)
- [Spring Boot Documentation](https://spring.io/projects/spring-boot)
