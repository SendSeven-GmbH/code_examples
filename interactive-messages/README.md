# Interactive Messages Example

Learn how to send rich interactive messages (buttons, lists, quick replies) using the SendSeven API.

## Overview

This example demonstrates:
- Sending button messages (up to 3 buttons)
- Sending list messages with sections
- Sending quick reply buttons
- Checking channel capabilities before sending
- Handling API responses and errors

## Prerequisites

1. A SendSeven account with API access
2. An API token with `messages:create` scope
3. A channel ID (WhatsApp, Messenger, or other interactive-capable channel)
4. A contact ID to send messages to

## Environment Variables

Create a `.env` file or set these environment variables:

```bash
SENDSEVEN_API_TOKEN=msgapi_your_token_here
SENDSEVEN_TENANT_ID=your-tenant-id
SENDSEVEN_API_URL=https://api.sendseven.com/api/v1
CHANNEL_ID=your-channel-id
CONTACT_ID=your-contact-id
```

## Interactive Message Types

### Button Messages

Button messages allow users to choose from up to 3 options with a single tap.

```http
POST /api/v1/messages/send/interactive
Content-Type: application/json
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id

{
  "channel_id": "uuid",
  "contact_id": "uuid",
  "type": "buttons",
  "body": "Would you like to proceed?",
  "buttons": [
    {"id": "yes", "title": "Yes"},
    {"id": "no", "title": "No"},
    {"id": "maybe", "title": "Maybe Later"}
  ]
}
```

### List Messages

List messages present a menu of options organized in sections.

```http
POST /api/v1/messages/send/interactive
Content-Type: application/json
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id

{
  "channel_id": "uuid",
  "contact_id": "uuid",
  "type": "list",
  "body": "Browse our catalog:",
  "button_text": "View Options",
  "sections": [
    {
      "title": "Electronics",
      "rows": [
        {"id": "phones", "title": "Phones", "description": "Latest smartphones"},
        {"id": "laptops", "title": "Laptops", "description": "Portable computers"}
      ]
    },
    {
      "title": "Accessories",
      "rows": [
        {"id": "cases", "title": "Cases", "description": "Protective cases"},
        {"id": "chargers", "title": "Chargers", "description": "Fast chargers"}
      ]
    }
  ]
}
```

### Quick Reply Buttons

Quick replies are horizontal buttons that disappear after selection.

```http
POST /api/v1/messages/send/interactive
Content-Type: application/json
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id

{
  "channel_id": "uuid",
  "contact_id": "uuid",
  "type": "quick_reply",
  "body": "How would you rate our service?",
  "buttons": [
    {"id": "great", "title": "Great!"},
    {"id": "good", "title": "Good"},
    {"id": "poor", "title": "Poor"}
  ]
}
```

## Channel Capabilities

Not all channels support all interactive message types. Check capabilities before sending:

```http
GET /api/v1/channels/{channel_id}/capabilities
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id
```

Response:
```json
{
  "channel_id": "uuid",
  "channel_type": "whatsapp",
  "capabilities": {
    "interactive_buttons": true,
    "interactive_lists": true,
    "quick_replies": true,
    "carousels": true,
    "reactions": true,
    "max_buttons": 3,
    "max_list_sections": 10,
    "max_list_rows_per_section": 10
  }
}
```

## Channel Limitations

| Feature | WhatsApp | Messenger | Instagram | Telegram | SMS |
|---------|----------|-----------|-----------|----------|-----|
| Buttons | 3 max | 3 max | 3 max | Inline keyboards | No |
| Lists | 10 sections, 10 rows each | No | No | No | No |
| Quick Replies | 3 max | 13 max | No | No | No |
| Carousels | Via templates | 10 cards | No | No | No |

## Response

Successful response:
```json
{
  "id": "msg_abc123",
  "channel_id": "chan_xyz789",
  "contact_id": "cont_123456",
  "direction": "outbound",
  "message_type": "interactive",
  "interactive_type": "buttons",
  "status": "pending",
  "created_at": "2026-01-13T10:30:00Z"
}
```

## Run the Examples

### Python

```bash
cd python
pip install -r requirements.txt
python interactive_messages.py
```

### JavaScript (Node.js)

```bash
cd javascript
npm install
node interactive_messages.js
```

### TypeScript

```bash
cd typescript
npm install
npm run dev
# Or build and run:
npm run build && npm start
```

### PHP

```bash
cd php
php interactive_messages.php
```

### Go

```bash
cd go
go mod tidy
go run interactive_messages.go
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
bundle install
ruby interactive_messages.rb
```

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid or expired token | Check your API token |
| 403 Forbidden | Missing `messages:create` scope | Create token with correct scopes |
| 400 Bad Request | Invalid interactive message format | Verify button/list structure |
| 400 Too Many Buttons | Exceeded button limit | Use max 3 buttons for most channels |
| 400 Unsupported Type | Channel doesn't support this type | Check channel capabilities first |

## Next Steps

- [Send Message](../send-message) - Basic text messages
- [Webhook Listener](../webhook-listener) - Handle button/list responses
- [WhatsApp Templates](../whatsapp-templates) - Pre-approved message templates
