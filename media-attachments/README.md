# Media Attachments Example

Learn how to upload files and send media messages (images, documents, videos, audio) using the SendSeven API.

## Overview

This example demonstrates:
- Uploading files via multipart/form-data
- Sending image messages
- Sending document messages
- Sending video messages
- Sending audio messages
- Handling upload errors (file size limits, unsupported types)

## Prerequisites

1. A SendSeven account with API access
2. An API token with `messages:create` and `attachments:create` scopes
3. An existing conversation ID (create one via the dashboard or API)
4. Sample media files for testing

## Environment Variables

Create a `.env` file or set these environment variables:

```bash
SENDSEVEN_API_TOKEN=msgapi_your_token_here
SENDSEVEN_TENANT_ID=your-tenant-id
SENDSEVEN_API_URL=https://api.sendseven.com/api/v1
CONVERSATION_ID=your-conversation-id
```

## Supported File Types

### Images
| Type | Extensions | Max Size |
|------|------------|----------|
| JPEG | .jpg, .jpeg | 16 MB |
| PNG | .png | 16 MB |
| GIF | .gif | 16 MB |
| WebP | .webp | 16 MB |

### Documents
| Type | Extensions | Max Size |
|------|------------|----------|
| PDF | .pdf | 100 MB |
| Word | .doc, .docx | 100 MB |
| Excel | .xls, .xlsx | 100 MB |
| PowerPoint | .ppt, .pptx | 100 MB |
| Text | .txt | 100 MB |

### Video
| Type | Extensions | Max Size |
|------|------------|----------|
| MP4 | .mp4 | 16 MB |
| 3GPP | .3gp | 16 MB |

### Audio
| Type | Extensions | Max Size |
|------|------------|----------|
| AAC | .aac | 16 MB |
| MP3 | .mp3 | 16 MB |
| OGG | .ogg | 16 MB |
| AMR | .amr | 16 MB |
| OPUS | .opus | 16 MB |

## API Endpoints

### Upload Attachment

```http
POST /api/v1/attachments
Content-Type: multipart/form-data
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id

file: (binary)
```

**Response:**
```json
{
  "id": "attachment_uuid",
  "filename": "image.jpg",
  "content_type": "image/jpeg",
  "file_size": 12345,
  "url": "signed_url"
}
```

### Send Message with Attachment

```http
POST /api/v1/messages
Content-Type: application/json
Authorization: Bearer msgapi_...
X-Tenant-ID: tenant-id

{
  "conversation_id": "uuid",
  "message_type": "image",
  "attachments": ["attachment_id"],
  "text": "Check out this image!"
}
```

**Message Types:**
- `image` - For photos and images
- `document` - For PDFs, Word docs, spreadsheets, etc.
- `video` - For video files
- `audio` - For audio files and voice notes

**Response:**
```json
{
  "id": "msg_abc123",
  "conversation_id": "conv_xyz789",
  "direction": "outbound",
  "message_type": "image",
  "text": "Check out this image!",
  "attachments": [
    {
      "id": "attachment_uuid",
      "filename": "image.jpg",
      "content_type": "image/jpeg",
      "file_size": 12345,
      "url": "signed_url"
    }
  ],
  "status": "pending",
  "created_at": "2026-01-13T10:30:00Z"
}
```

## Run the Examples

### Python

```bash
cd python
pip install -r requirements.txt
python media_attachments.py
```

### JavaScript (Node.js)

```bash
cd javascript
npm install
node media-attachments.js
```

### TypeScript

```bash
cd typescript
npm install
npx ts-node media-attachments.ts
```

### PHP

```bash
cd php
php media_attachments.php
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
ruby media_attachments.rb
```

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid or expired token | Check your API token |
| 403 Forbidden | Missing required scope | Create token with `attachments:create` and `messages:create` scopes |
| 404 Not Found | Invalid conversation_id | Verify conversation exists |
| 413 Payload Too Large | File exceeds size limit | Reduce file size (see limits above) |
| 415 Unsupported Media Type | File type not allowed | Use a supported file format |
| 400 Bad Request | Missing required fields | Include `conversation_id`, `message_type`, `attachments` |

## Error Handling Examples

The example code demonstrates handling these scenarios:
- File too large (413 error)
- Unsupported file type (415 error)
- Missing file (400 error)
- Network errors

## Next Steps

- [Send Message](../send-message) - Send text messages
- [Interactive Messages](../interactive-messages) - Send buttons and lists
- [Webhook Listener](../webhook-listener) - Receive incoming messages
