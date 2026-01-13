# Echo Bot Example

Build a simple bot that automatically replies to incoming messages by combining webhook handling with the Messages API.

## Overview

This example demonstrates:
- Receiving webhooks for incoming messages
- Verifying webhook signatures
- Extracting conversation and contact information
- Sending a reply using the Messages API
- Handling errors and edge cases

## Prerequisites

1. A SendSeven account with API access
2. An API token with `messages:create` scope
3. A webhook endpoint configured with your bot's URL
4. Your webhook secret key

## Environment Variables

```bash
SENDSEVEN_API_TOKEN=msgapi_your_token_here
SENDSEVEN_TENANT_ID=your-tenant-id
SENDSEVEN_API_URL=https://api.sendseven.com/api/v1
WEBHOOK_SECRET=your_webhook_secret_key
PORT=3000
```

## How It Works

```
                         ┌──────────────────┐
                         │    SendSeven     │
                         │      Cloud       │
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   │                   ▼
    ┌─────────────────┐          │         ┌─────────────────┐
    │ 1. Customer     │          │         │ 4. Reply sent   │
    │    sends        │          │         │    to customer  │
    │    "Hello"      │          │         └─────────────────┘
    └─────────────────┘          │                   ▲
                                  │                   │
              ┌───────────────────┼───────────────────┘
              │                   │
              ▼                   │
    ┌─────────────────────────────┴───────────────────────────┐
    │                      Your Echo Bot                       │
    │                                                          │
    │  2. Webhook received (message.received)                  │
    │     → Verify signature                                   │
    │     → Extract conversation_id                            │
    │                                                          │
    │  3. POST /api/v1/messages                                │
    │     → Send reply to same conversation                    │
    └──────────────────────────────────────────────────────────┘
```

## Bot Behavior

| User Message | Bot Reply |
|--------------|-----------|
| Hello | You said: "Hello" |
| How are you? | You said: "How are you?" |
| [image] | I received your image! |

## Run the Examples

### Python (Flask)

```bash
cd python
pip install -r requirements.txt
python echo_bot.py
```

### JavaScript (Express)

```bash
cd javascript
npm install
node echo-bot.js
```

### TypeScript (Express)

```bash
cd typescript
npm install
npx ts-node echo-bot.ts
```

### PHP

```bash
cd php
php -S localhost:3000 echo_bot.php
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
ruby echo_bot.rb
```

## Testing Locally

1. Start the echo bot on port 3000
2. Use ngrok to expose your local server:
   ```bash
   ngrok http 3000
   ```
3. Configure the ngrok URL as a webhook endpoint in SendSeven
4. Send a message to your SendSeven number/channel
5. The bot should reply automatically

## Customizing the Bot

You can modify the response logic to:
- Respond differently based on keywords
- Add AI-powered responses
- Route to different departments
- Create FAQ bots

Example keyword handling:
```python
if "help" in message_text.lower():
    reply = "How can I help you? Type 'support' for human assistance."
elif "support" in message_text.lower():
    reply = "Connecting you to a support agent..."
    # Assign conversation to agent
else:
    reply = f"You said: {message_text}"
```

## Important Notes

1. **Avoid loops**: Don't respond to outbound messages (check `direction == "inbound"`)
2. **Rate limiting**: Add delays between responses to avoid rate limits
3. **Error handling**: Always return 200 to acknowledge the webhook
4. **Idempotency**: Handle duplicate webhooks using `delivery_id`

## Next Steps

- [Contact Management](../contact-management) - Manage customer contacts
- [Interactive Messages](../interactive-messages) - Add buttons and menus
- [WhatsApp Templates](../whatsapp-templates) - Send template messages
