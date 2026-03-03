# Send Message Example

Learn how to authenticate with the SendSeven API and send a text message.

## Overview

This example demonstrates:
- API token authentication
- Required HTTP headers (`Authorization`, `X-Tenant-ID`)
- Sending a text message to an existing conversation (recipient auto-resolved)
- Sending a message via `contact_method_id` (resolves recipient, channel, and contact)
- Handling API responses and errors

## Prerequisites

1. A SendSeven account with API access
2. An API token with `messages:create` scope
3. An existing conversation ID or contact method ID

## Environment Variables

Create a `.env` file or set these environment variables:

```bash
SENDSEVEN_API_TOKEN=s7_api_your_token_here
SENDSEVEN_TENANT_ID=your-tenant-id
SENDSEVEN_API_URL=https://api.sendseven.com/api/v1
CONVERSATION_ID=your-conversation-id
```

## Sending Modes

The Messages API supports three ways to resolve the recipient:

### Mode 1: Reply to a Conversation (recommended for replies)

When you provide `conversation_id`, the recipient is auto-resolved from the conversation's contact method. No need to specify `to`.

```http
POST /api/v1/messages
Content-Type: application/json
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id

{
  "conversation_id": "uuid",
  "text": "Hello from the API!",
  "message_type": "text"
}
```

### Mode 2: Send via Contact Method (recommended for new messages)

When you provide `contact_method_id`, the recipient, channel, and contact are all resolved automatically. This is the cleanest way to initiate a new message.

```http
POST /api/v1/messages
Content-Type: application/json
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id

{
  "contact_method_id": "uuid",
  "text": "Hello from the API!",
  "message_type": "text"
}
```

### Mode 3: Explicit Recipient (legacy)

You can still provide `to` explicitly along with `conversation_id` for backward compatibility, but this is no longer required.

```http
POST /api/v1/messages
Content-Type: application/json
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id

{
  "conversation_id": "uuid",
  "to": "+4917012345678",
  "text": "Hello from the API!",
  "message_type": "text"
}
```

## Response

```json
{
  "id": "msg_abc123",
  "conversation_id": "conv_xyz789",
  "contact_method_id": "cm_def456",
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
| 404 Not Found | Invalid conversation_id or contact_method_id | Verify the ID exists |
| 400 Bad Request | Missing required fields | Include `conversation_id` or `contact_method_id`, plus `text` and `message_type` |

## Next Steps

- [Webhook Listener](../webhook-listener) - Receive incoming messages
- [Echo Bot](../echo-bot) - Combine sending and receiving
- [Interactive Messages](../interactive-messages) - Send buttons and lists
