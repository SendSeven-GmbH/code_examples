# Conversation Management Example

Learn how to manage conversations using the SendSeven API, including listing, filtering, updating, and closing conversations.

## Overview

This example demonstrates:
- Listing conversations with filtering and pagination
- Getting a single conversation by ID
- Updating a conversation (e.g., assigning to a user)
- Closing a conversation

## Prerequisites

1. A SendSeven account with API access
2. An API token with `conversations:read` and `conversations:update` scopes
3. At least one existing conversation

## Environment Variables

Create a `.env` file or set these environment variables:

```bash
SENDSEVEN_API_TOKEN=msgapi_your_token_here
SENDSEVEN_TENANT_ID=your-tenant-id
SENDSEVEN_API_URL=https://api.sendseven.com/api/v1
```

## API Endpoints

### List Conversations

```http
GET /api/v1/conversations
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `open`, `closed`, `pending` |
| `needs_reply` | boolean | Filter to only conversations awaiting a reply |
| `assigned_to` | string | Filter by assigned user ID |
| `channel` | string | Filter by channel: `whatsapp`, `telegram`, `sms`, `email`, `messenger`, `instagram` |
| `page` | integer | Page number (default: 1) |
| `page_size` | integer | Items per page (default: 20, max: 100) |

**Response:**

```json
{
  "items": [
    {
      "id": "conv_abc123",
      "contact_id": "contact_xyz789",
      "channel": "whatsapp",
      "status": "open",
      "needs_reply": true,
      "assigned_to": null,
      "last_message_at": "2026-01-13T10:30:00Z",
      "created_at": "2026-01-10T08:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 42,
    "total_pages": 3
  }
}
```

### Get Single Conversation

```http
GET /api/v1/conversations/{conversation_id}
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id
```

**Response:**

```json
{
  "id": "conv_abc123",
  "contact_id": "contact_xyz789",
  "channel": "whatsapp",
  "status": "open",
  "needs_reply": true,
  "assigned_to": null,
  "last_message_at": "2026-01-13T10:30:00Z",
  "created_at": "2026-01-10T08:00:00Z",
  "contact": {
    "id": "contact_xyz789",
    "name": "John Doe",
    "phone": "+1234567890"
  }
}
```

### Update Conversation (Assign to User)

```http
PUT /api/v1/conversations/{conversation_id}
Content-Type: application/json
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id

{
  "assigned_to": "user_id_here"
}
```

**Response:** Returns the updated conversation object.

### Close Conversation

```http
POST /api/v1/conversations/{conversation_id}/close
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id
```

**Response:**

```json
{
  "id": "conv_abc123",
  "status": "closed",
  "closed_at": "2026-01-13T11:00:00Z"
}
```

## Run the Examples

### Python

```bash
cd python
pip install -r requirements.txt
python conversation_management.py
```

### JavaScript (Node.js)

```bash
cd javascript
npm install
node conversation-management.js
```

### TypeScript

```bash
cd typescript
npm install
npx ts-node conversation-management.ts
```

### PHP

```bash
cd php
php conversation_management.php
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
ruby conversation_management.rb
```

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid or expired token | Check your API token |
| 403 Forbidden | Missing required scopes | Create token with `conversations:read` and `conversations:update` |
| 404 Not Found | Invalid conversation_id | Verify conversation exists |
| 400 Bad Request | Invalid filter parameter | Check query parameter values |

## Next Steps

- [Send Message](../send-message) - Send messages to conversations
- [Webhook Listener](../webhook-listener) - Receive real-time updates
- [Contact Management](../contact-management) - Manage conversation contacts
