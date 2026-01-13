/**
 * SendSeven API - Echo Bot Example (C#/ASP.NET Core)
 *
 * A simple bot that automatically replies to incoming messages.
 */

using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Configuration
var apiToken = Environment.GetEnvironmentVariable("SENDSEVEN_API_TOKEN") ?? "";
var tenantId = Environment.GetEnvironmentVariable("SENDSEVEN_TENANT_ID") ?? "";
var apiUrl = Environment.GetEnvironmentVariable("SENDSEVEN_API_URL") ?? "https://api.sendseven.com/api/v1";
var webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET") ?? "";

// Track processed deliveries (use Redis/database in production)
var processedDeliveries = new ConcurrentDictionary<string, bool>();

// HTTP client for sending replies
var httpClient = new HttpClient();

// Validate configuration
if (string.IsNullOrEmpty(apiToken))
{
    Console.WriteLine("Error: SENDSEVEN_API_TOKEN environment variable is required");
    Environment.Exit(1);
}

if (string.IsNullOrEmpty(tenantId))
{
    Console.WriteLine("Error: SENDSEVEN_TENANT_ID environment variable is required");
    Environment.Exit(1);
}

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

    // Verify required headers
    if (string.IsNullOrEmpty(signature) || string.IsNullOrEmpty(timestamp) ||
        string.IsNullOrEmpty(deliveryId))
    {
        Console.WriteLine("Missing required webhook headers");
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new { error = "Missing required headers" });
        return;
    }

    // Check for duplicate (idempotency)
    if (processedDeliveries.ContainsKey(deliveryId))
    {
        Console.WriteLine($"Duplicate delivery {deliveryId}, skipping");
        await context.Response.WriteAsJsonAsync(new { success = true, duplicate = true });
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

        // Only process message.received events
        if (type != "message.received")
        {
            await context.Response.WriteAsJsonAsync(new { success = true, skipped = true });
            return;
        }

        // Extract message details
        var messageData = data.GetProperty("data").GetProperty("message");
        var contactData = data.GetProperty("data");

        // Only respond to inbound messages (avoid loops)
        var direction = messageData.TryGetProperty("direction", out var d) ? d.GetString() : "";
        if (direction != "inbound")
        {
            await context.Response.WriteAsJsonAsync(new { success = true, skipped = "outbound" });
            return;
        }

        var conversationId = messageData.GetProperty("conversation_id").GetString() ?? "";
        var messageType = messageData.TryGetProperty("message_type", out var mt) ? mt.GetString() ?? "text" : "text";
        var messageText = messageData.TryGetProperty("text", out var t) ? t.GetString() ?? "" : "";

        var contactName = "there";
        if (contactData.TryGetProperty("contact", out var contact) &&
            contact.TryGetProperty("name", out var n))
        {
            contactName = n.GetString() ?? "there";
        }

        var preview = messageText.Length > 50 ? messageText[..50] : messageText;
        if (string.IsNullOrEmpty(preview)) preview = "[media]";
        Console.WriteLine($"Received message from {contactName}: {preview}");

        // Generate and send reply
        var replyText = GenerateReply(messageType, messageText);

        try
        {
            var result = await SendReply(conversationId, replyText, apiToken, tenantId, apiUrl, httpClient);
            var resultId = result.TryGetProperty("id", out var id) ? id.GetString() : "unknown";
            Console.WriteLine($"Reply sent: {resultId}");
            processedDeliveries.TryAdd(deliveryId, true);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to send reply: {ex.Message}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error processing webhook: {ex.Message}");
    }

    await context.Response.WriteAsJsonAsync(new { success = true });
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

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

string GenerateReply(string messageType, string messageText)
{
    return messageType switch
    {
        "text" => string.IsNullOrEmpty(messageText) ? "I received your message!" : $"You said: \"{messageText}\"",
        "image" => "I received your image! \ud83d\udcf7",
        "audio" => "I received your audio message! \ud83c\udfb5",
        "video" => "I received your video! \ud83c\udfac",
        "document" => "I received your document! \ud83d\udcc4",
        _ => "I received your message!"
    };
}

async Task<JsonElement> SendReply(string conversationId, string text, string token, string tenant, string url, HttpClient client)
{
    var requestBody = new
    {
        conversation_id = conversationId,
        text = text,
        message_type = "text"
    };

    var request = new HttpRequestMessage(HttpMethod.Post, $"{url}/messages")
    {
        Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
    };
    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    request.Headers.Add("X-Tenant-ID", tenant);

    var response = await client.SendAsync(request);
    var responseBody = await response.Content.ReadAsStringAsync();

    if (!response.IsSuccessStatusCode)
    {
        throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
    }

    return JsonSerializer.Deserialize<JsonElement>(responseBody);
}

var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";
Console.WriteLine($"Echo Bot listening on port {port}");
Console.WriteLine($"Webhook endpoint: http://localhost:{port}/webhooks/sendseven");

app.Run($"http://0.0.0.0:{port}");
