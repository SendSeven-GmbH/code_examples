# Contact Management Example

Learn how to manage contacts using the SendSeven API - create, list, update, and delete contacts.

## Overview

This example demonstrates:
- API token authentication
- Required HTTP headers (`Authorization`, `X-Tenant-ID`)
- Full CRUD operations for contacts
- Pagination handling for listing contacts
- Handling API responses and errors

## Prerequisites

1. A SendSeven account with API access
2. An API token with `contacts:read`, `contacts:create`, `contacts:update`, and `contacts:delete` scopes

## Environment Variables

Create a `.env` file or set these environment variables:

```bash
SENDSEVEN_API_TOKEN=s7_api_your_token_here
SENDSEVEN_TENANT_ID=your-tenant-id
SENDSEVEN_API_URL=https://api.sendseven.com/api/v1
```

## API Endpoints

### Create Contact

```http
POST /api/v1/contacts
Content-Type: application/json
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id

{
  "phone": "+1234567890",
  "email": "john@example.com",
  "name": "John Doe"
}
```

**Response:**

```json
{
  "id": "contact_abc123",
  "tenant_id": "tenant-id",
  "phone": "+1234567890",
  "email": "john@example.com",
  "name": "John Doe",
  "created_at": "2026-01-13T10:30:00Z",
  "updated_at": "2026-01-13T10:30:00Z"
}
```

### List Contacts (with Pagination)

```http
GET /api/v1/contacts?page=1&page_size=20
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id
```

**Response:**

```json
{
  "items": [
    {
      "id": "contact_abc123",
      "phone": "+1234567890",
      "email": "john@example.com",
      "name": "John Doe",
      "created_at": "2026-01-13T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

### Get Single Contact

```http
GET /api/v1/contacts/{contact_id}
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id
```

**Response:**

```json
{
  "id": "contact_abc123",
  "tenant_id": "tenant-id",
  "phone": "+1234567890",
  "email": "john@example.com",
  "name": "John Doe",
  "created_at": "2026-01-13T10:30:00Z",
  "updated_at": "2026-01-13T10:30:00Z"
}
```

### Update Contact

```http
PUT /api/v1/contacts/{contact_id}
Content-Type: application/json
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id

{
  "name": "Jane Doe"
}
```

**Response:**

```json
{
  "id": "contact_abc123",
  "tenant_id": "tenant-id",
  "phone": "+1234567890",
  "email": "john@example.com",
  "name": "Jane Doe",
  "created_at": "2026-01-13T10:30:00Z",
  "updated_at": "2026-01-13T10:35:00Z"
}
```

### Delete Contact

```http
DELETE /api/v1/contacts/{contact_id}
Authorization: Bearer s7_api_...
X-Tenant-ID: tenant-id
```

**Response:**

```json
{
  "success": true,
  "id": "contact_abc123"
}
```

## Run the Examples

### Python

```bash
cd python
pip install -r requirements.txt
python contact_management.py
```

### JavaScript (Node.js)

```bash
cd javascript
npm install
node contact-management.js
```

### TypeScript

```bash
cd typescript
npm install
npx ts-node contact-management.ts
```

### PHP

```bash
cd php
php contact_management.php
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
ruby contact_management.rb
```

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid or expired token | Check your API token |
| 403 Forbidden | Missing required scope | Create token with `contacts:*` scopes |
| 404 Not Found | Invalid contact_id | Verify contact exists |
| 400 Bad Request | Invalid data format | Check phone number/email format |
| 409 Conflict | Duplicate contact | Contact with this identifier already exists |

## Contact Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone` | string | No* | E.164 format (+1234567890) |
| `email` | string | No* | Valid email address |
| `name` | string | No | Contact's display name |

*At least one identifier (phone or email) is recommended.

## Next Steps

- [Send Message](../send-message) - Send messages to contacts
- [Conversation Management](../conversation-management) - Manage conversations
- [Webhook Listener](../webhook-listener) - Receive contact updates
