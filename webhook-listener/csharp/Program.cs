/**
 * SendSeven API - Webhook Listener Example (C#/ASP.NET Core)
 *
 * Demonstrates how to receive and verify SendSeven webhook events.
 */

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET") ?? "";

if (string.IsNullOrEmpty(webhookSecret))
{
    Console.WriteLine("Warning: WEBHOOK_SECRET not set - signatures will not be verified!");
}

app.MapPost("/webhooks/sendseven", async (HttpContext context) =>
{
    // Get headers
    var signature = context.Request.Headers["X-Sendseven-Signature"].FirstOrDefault() ?? "";
    var timestamp = context.Request.Headers["X-Sendseven-Timestamp"].FirstOrDefault() ?? "";
    var deliveryId = context.Request.Headers["X-Sendseven-Delivery-Id"].FirstOrDefault() ?? "";
    var eventType = context.Request.Headers["X-Sendseven-Event"].FirstOrDefault() ?? "";

    // Verify required headers
    if (string.IsNullOrEmpty(signature) || string.IsNullOrEmpty(timestamp) ||
        string.IsNullOrEmpty(deliveryId) || string.IsNullOrEmpty(eventType))
    {
        Console.WriteLine("Missing required webhook headers");
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new { error = "Missing required headers" });
        return;
    }

    // Read body
    using var reader = new StreamReader(context.Request.Body);
    var payload = await reader.ReadToEndAsync();

    // Verify signature
    if (!string.IsNullOrEmpty(webhookSecret) && !VerifySignature(payload, signature, timestamp, webhookSecret))
    {
        Console.WriteLine($"Invalid signature for delivery {deliveryId}");
        context.Response.StatusCode = 401;
        await context.Response.WriteAsJsonAsync(new { error = "Invalid signature" });
        return;
    }

    try
    {
        var data = JsonSerializer.Deserialize<JsonElement>(payload);
        var type = data.GetProperty("type").GetString() ?? "";
        var tenantId = data.GetProperty("tenant_id").GetString() ?? "";

        Console.WriteLine($"Webhook received: delivery_id={deliveryId}, event={type}, tenant={tenantId}");

        // Handle different event types
        switch (type)
        {
            case "message.received":
                HandleMessageReceived(data);
                break;
            case "message.sent":
                HandleMessageSent(data);
                break;
            case "message.delivered":
                HandleMessageDelivered(data);
                break;
            case "message.failed":
                HandleMessageFailed(data);
                break;
            case "conversation.created":
                HandleConversationCreated(data);
                break;
            case "conversation.closed":
                HandleConversationClosed(data);
                break;
            case "contact.created":
                HandleContactCreated(data);
                break;
            default:
                Console.WriteLine($"  Unknown event type: {type}");
                break;
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error processing webhook: {ex.Message}");
    }

    await context.Response.WriteAsJsonAsync(new { success = true, delivery_id = deliveryId });
});

bool VerifySignature(string payload, string signature, string timestamp, string secret)
{
    if (!signature.StartsWith("sha256="))
        return false;

    var providedSig = signature[7..];

    // Reconstruct message
    var message = $"{timestamp}.{payload}";

    // Compute HMAC-SHA256
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
    var expectedSig = Convert.ToHexString(hash).ToLower();

    // Timing-safe comparison
    return CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(expectedSig),
        Encoding.UTF8.GetBytes(providedSig)
    );
}

void HandleMessageReceived(JsonElement payload)
{
    var message = payload.GetProperty("data").GetProperty("message");
    var contact = payload.GetProperty("data").GetProperty("contact");
    var name = contact.TryGetProperty("name", out var n) ? n.GetString() ?? "Unknown" : "Unknown";
    var text = message.TryGetProperty("text", out var t) ? t.GetString() ?? "" : "";
    if (text.Length > 50) text = text[..50];
    Console.WriteLine($"  Message received from {name}: {text}");
}

void HandleMessageSent(JsonElement payload)
{
    var messageId = payload.GetProperty("data").GetProperty("message").GetProperty("id").GetString();
    Console.WriteLine($"  Message sent: {messageId}");
}

void HandleMessageDelivered(JsonElement payload)
{
    var messageId = payload.GetProperty("data").GetProperty("message").GetProperty("id").GetString();
    Console.WriteLine($"  Message delivered: {messageId}");
}

void HandleMessageFailed(JsonElement payload)
{
    var messageId = payload.GetProperty("data").GetProperty("message").GetProperty("id").GetString();
    var data = payload.GetProperty("data");
    var error = data.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var m)
        ? m.GetString() ?? "Unknown error"
        : "Unknown error";
    Console.WriteLine($"  Message failed: {messageId} - {error}");
}

void HandleConversationCreated(JsonElement payload)
{
    var convId = payload.GetProperty("data").GetProperty("conversation").GetProperty("id").GetString();
    Console.WriteLine($"  Conversation created: {convId}");
}

void HandleConversationClosed(JsonElement payload)
{
    var convId = payload.GetProperty("data").GetProperty("conversation").GetProperty("id").GetString();
    Console.WriteLine($"  Conversation closed: {convId}");
}

void HandleContactCreated(JsonElement payload)
{
    var contact = payload.GetProperty("data").GetProperty("contact");
    var name = contact.TryGetProperty("name", out var n) ? n.GetString() ?? "Unknown" : "Unknown";
    var phone = contact.TryGetProperty("phone", out var p) ? p.GetString() ?? "No phone" : "No phone";
    Console.WriteLine($"  Contact created: {name} ({phone})");
}

var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";
Console.WriteLine($"Webhook server listening on port {port}");
Console.WriteLine($"Webhook endpoint: http://localhost:{port}/webhooks/sendseven");

app.Run($"http://0.0.0.0:{port}");
