# SendSeven API Examples

Official code examples for integrating with the [SendSeven](https://sendseven.com) unified messaging API. These examples demonstrate how to send messages across WhatsApp, Telegram, SMS, Email, Messenger, and Instagram using a single API.

## Quick Start

### 1. Get Your API Credentials

Sign up at [app.sendseven.com](https://app.sendseven.com) and create an API token:

1. Go to **Settings > API Tokens**
2. Click **Create Token**
3. Select required scopes (e.g., `messages:create`, `contacts:read`)
4. Copy your token (shown only once!)

### 2. Set Environment Variables

```bash
export SENDSEVEN_API_TOKEN="msgapi_your_token_here"
export SENDSEVEN_TENANT_ID="your-tenant-id"
export SENDSEVEN_API_URL="https://api.sendseven.com/api/v1"
```

### 3. Choose an Example

Pick an example below and follow its README for language-specific instructions.

## Examples

| Example | Description | Difficulty |
|---------|-------------|------------|
| [Send Message](./send-message) | Basic API authentication and sending text messages | Beginner |
| [Webhook Listener](./webhook-listener) | Receive and verify webhook events with HMAC-SHA256 | Beginner |
| [Echo Bot](./echo-bot) | Auto-reply bot combining webhooks + API calls | Intermediate |
| [Contact Management](./contact-management) | Create, list, update, and delete contacts | Beginner |
| [Conversation Management](./conversation-management) | List, assign, and close support conversations | Intermediate |
| [Login with SendSeven](./login-with-sendseven) | OAuth2/OIDC Single Sign-On implementation | Advanced |
| [WhatsApp Templates](./whatsapp-templates) | Send approved WhatsApp template messages | Intermediate |
| [Interactive Messages](./interactive-messages) | Send buttons, lists, and carousels | Intermediate |
| [Media Attachments](./media-attachments) | Upload and send images, videos, documents | Intermediate |

## Languages

Each example is available in:

| Language | Framework/Library |
|----------|-------------------|
| Python | requests, Flask |
| JavaScript | Node.js, Express |
| TypeScript | Node.js, Express |
| PHP | cURL |
| Go | net/http |
| Java | HttpClient, Spring Boot |
| C# | HttpClient, ASP.NET Core |
| Ruby | net/http, Sinatra |

## API Reference

| Resource | URL |
|----------|-----|
| **Production API** | `https://api.sendseven.com/api/v1` |
| **API Documentation** | [api.sendseven.com/api/v1/docs](https://api.sendseven.com/api/v1/docs) |
| **OIDC Discovery** | [api.sendseven.com/.well-known/openid-configuration](https://api.sendseven.com/.well-known/openid-configuration) |

## Authentication

All API requests require these headers:

```http
Authorization: Bearer msgapi_your_token_here
X-Tenant-ID: your-tenant-id
Content-Type: application/json
```

### API Token Format

Tokens follow the format: `msgapi_<64_hex_characters>`

Example: `msgapi_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`

## Webhook Security

Webhooks are signed with HMAC-SHA256. Always verify signatures:

```
X-Sendseven-Signature: sha256=<hex_digest>
X-Sendseven-Timestamp: <unix_timestamp>
```

Message format for signature: `{timestamp}.{json_payload}`

See [webhook-listener](./webhook-listener) for implementation examples.

## Error Handling

Standard HTTP status codes are used:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid token) |
| 403 | Forbidden (insufficient scopes) |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Server Error |

Error response format:
```json
{
  "detail": "Error message here",
  "status_code": 400
}
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Support

- **Documentation**: [https://api.sendseven.com/api/v1/docs](https://docs.sendseven.com)
- **Issues**: [github.com/SendSeven-GmbH/examples/issues](https://github.com/SendSeven-GmbH/examples/issues)
- **Email**: dev@sendseven.com

## License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) for details.

---

Built with love by [SendSeven GmbH](https://sendseven.com)
