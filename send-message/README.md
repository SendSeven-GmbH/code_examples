# Send Message Example

Learn how to authenticate with the SendSeven API and send a text message to a conversation.

## Overview

This example demonstrates:
- API token authentication
- Required HTTP headers (`Authorization`, `X-Tenant-ID`)
- Sending a text message to an existing conversation
- Handling API responses and errors

## Prerequisites

1. A SendSeven account with API access
2. An API token with `messages:create` scope
3. An existing conversation ID (create one via the dashboard or API)

## Environment Variables

Create a `.env` file or set these environment variables:

```bash
SENDSEVEN_API_TOKEN=msgapi_your_token_here
SENDSEVEN_TENANT_ID=your-tenant-id
SENDSEVEN_API_URL=https://api.sendseven.com/api/v1
CONVERSATION_ID=your-conversation-id
```

## API Endpoint

```http
POST /api/v1/messages
Content-Type: application/json
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id

{
  "conversation_id": "uuid",
  "text": "Hello from the API!",
  "message_type": "text"
}
```

## Response

```json
{
  "id": "msg_abc123",
  "conversation_id": "conv_xyz789",
  "direction": "outbound",
  "message_type": "text",
  "text": "Hello from the API!",
  "status": "pending",
  "created_at": "2026-01-13T10:30:00Z"
}
```

## Run the Examples

### Python

```bash
cd python
pip install -r requirements.txt
python send_message.py
```

### JavaScript (Node.js)

```bash
cd javascript
npm install
node send-message.js
```

### TypeScript

```bash
cd typescript
npm install
npx ts-node send-message.ts
```

### PHP

```bash
cd php
php send_message.php
```

### Go

```bash
cd go
go run main.go
```

### Java

```bash
cd java
mvn compile exec:java
```

### C# (.NET)

```bash
cd csharp
dotnet run
```

### Ruby

```bash
cd ruby
ruby send_message.rb
```

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid or expired token | Check your API token |
| 403 Forbidden | Missing `messages:create` scope | Create token with correct scopes |
| 404 Not Found | Invalid conversation_id | Verify conversation exists |
| 400 Bad Request | Missing required fields | Include `conversation_id`, `text`, `message_type` |

## Next Steps

- [Webhook Listener](../webhook-listener) - Receive incoming messages
- [Echo Bot](../echo-bot) - Combine sending and receiving
- [Interactive Messages](../interactive-messages) - Send buttons and lists
