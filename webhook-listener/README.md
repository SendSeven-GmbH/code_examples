# Webhook Listener Example

Learn how to receive and securely verify SendSeven webhook events using HMAC-SHA256 signatures.

## Overview

This example demonstrates:
- Setting up an HTTP server to receive webhooks
- HMAC-SHA256 signature verification
- Handling different event types (message.received, conversation.closed, etc.)
- Returning proper HTTP responses to acknowledge receipt

## Prerequisites

1. A SendSeven account with a webhook endpoint configured
2. Your webhook secret key (provided when creating the webhook)
3. A publicly accessible URL (use ngrok for local development)

## Environment Variables

```bash
WEBHOOK_SECRET=your_webhook_secret_key
PORT=3000
```

## Webhook Security

### Signature Verification

SendSeven signs all webhooks with HMAC-SHA256. Always verify signatures to ensure:
- The webhook came from SendSeven
- The payload wasn't tampered with

### Headers Sent

| Header | Description |
|--------|-------------|
| `X-Sendseven-Signature` | `sha256=<hex_digest>` |
| `X-Sendseven-Timestamp` | Unix timestamp |
| `X-Sendseven-Delivery-Id` | Unique delivery ID |
| `X-Sendseven-Event` | Event type |

### Signature Algorithm

```
message = "{timestamp}.{json_payload}"
signature = HMAC-SHA256(message, secret_key)
header = "sha256=" + hex(signature)
```

## Webhook Events

| Event | Description |
|-------|-------------|
| `message.received` | New inbound message |
| `message.sent` | Message sent to contact |
| `message.delivered` | Delivery confirmed |
| `message.read` | Message read by recipient |
| `message.failed` | Delivery failed |
| `conversation.created` | New conversation started |
| `conversation.assigned` | Assigned to agent |
| `conversation.closed` | Conversation closed |
| `contact.created` | New contact added |
| `contact.subscribed` | Contact opted in |

## Payload Format

```json
{
  "id": "evt_abc123",
  "type": "message.received",
  "created_at": "2026-01-13T10:30:00Z",
  "tenant_id": "tenant_xyz",
  "event_id": "msg_456",
  "data": {
    "message": {
      "id": "msg_456",
      "conversation_id": "conv_123",
      "direction": "inbound",
      "message_type": "text",
      "text": "Hello!",
      "status": "received"
    },
    "conversation": {
      "id": "conv_123",
      "channel_id": "ch_789"
    },
    "contact": {
      "id": "contact_abc",
      "name": "John Doe",
      "phone": "+1234567890"
    }
  }
}
```

## Run the Examples

### Python (Flask)

```bash
cd python
pip install -r requirements.txt
python webhook_server.py
```

### JavaScript (Express)

```bash
cd javascript
npm install
node webhook-server.js
```

### TypeScript (Express)

```bash
cd typescript
npm install
npx ts-node webhook-server.ts
```

### PHP (Built-in Server)

```bash
cd php
php -S localhost:3000 webhook_handler.php
```

### Go

```bash
cd go
go run main.go
```

### Java (Spring Boot)

```bash
cd java
mvn spring-boot:run
```

### C# (ASP.NET Core)

```bash
cd csharp
dotnet run
```

### Ruby (Sinatra)

```bash
cd ruby
bundle install
ruby webhook_server.rb
```

## Local Development with ngrok

1. Start your webhook server on port 3000
2. Run ngrok: `ngrok http 3000`
3. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
4. Add this URL as a webhook endpoint in SendSeven dashboard

## Best Practices

1. **Always verify signatures** - Never process unverified webhooks
2. **Return 200 quickly** - Acknowledge receipt before heavy processing
3. **Process asynchronously** - Queue events for background processing
4. **Handle retries** - Webhooks may be sent multiple times
5. **Log delivery IDs** - Use `X-Sendseven-Delivery-Id` for debugging

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid signature | Wrong secret key | Check your webhook secret |
| Timestamp too old | Clock drift | Verify server time is accurate |
| Duplicate event | Webhook retry | Check delivery ID for duplicates |

## Next Steps

- [Echo Bot](../echo-bot) - Combine webhook + API to build a bot
- [Send Message](../send-message) - Send replies to received messages
