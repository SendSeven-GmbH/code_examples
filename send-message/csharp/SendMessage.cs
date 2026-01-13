/**
 * SendSeven API - Send Message Example (C#)
 *
 * Demonstrates how to send a text message using the SendSeven API.
 */

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

class Program
{
    private static readonly HttpClient httpClient = new HttpClient();

    // Configuration from environment
    private static string ApiToken => Environment.GetEnvironmentVariable("SENDSEVEN_API_TOKEN") ?? "";
    private static string TenantId => Environment.GetEnvironmentVariable("SENDSEVEN_TENANT_ID") ?? "";
    private static string ApiUrl => Environment.GetEnvironmentVariable("SENDSEVEN_API_URL") ?? "https://api.sendseven.com/api/v1";
    private static string ConversationId => Environment.GetEnvironmentVariable("CONVERSATION_ID") ?? "";

    static async Task Main(string[] args)
    {
        // Load .env file if it exists
        LoadEnvFile();

        // Validate configuration
        if (string.IsNullOrEmpty(ApiToken))
        {
            Console.WriteLine("Error: SENDSEVEN_API_TOKEN environment variable is required");
            Environment.Exit(1);
        }

        if (string.IsNullOrEmpty(TenantId))
        {
            Console.WriteLine("Error: SENDSEVEN_TENANT_ID environment variable is required");
            Environment.Exit(1);
        }

        if (string.IsNullOrEmpty(ConversationId))
        {
            Console.WriteLine("Error: CONVERSATION_ID environment variable is required");
            Environment.Exit(1);
        }

        Console.WriteLine($"Sending message to conversation: {ConversationId}");

        try
        {
            var message = await SendMessageAsync(ConversationId, "Hello from the SendSeven C# SDK! 💜");

            Console.WriteLine("Message sent successfully!");
            Console.WriteLine($"  ID: {message.GetProperty("id").GetString()}");
            Console.WriteLine($"  Status: {message.GetProperty("status").GetString()}");
            Console.WriteLine($"  Created at: {message.GetProperty("created_at").GetString()}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            Environment.Exit(1);
        }
    }

    /// <summary>
    /// Send a text message to a conversation.
    /// </summary>
    private static async Task<JsonElement> SendMessageAsync(string conversationId, string text)
    {
        var payload = new
        {
            conversation_id = conversationId,
            text = text,
            message_type = "text"
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        httpClient.DefaultRequestHeaders.Clear();
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiToken);
        httpClient.DefaultRequestHeaders.Add("X-Tenant-ID", TenantId);

        var response = await httpClient.PostAsync($"{ApiUrl}/messages", content);
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        return JsonSerializer.Deserialize<JsonElement>(responseBody);
    }

    /// <summary>
    /// Load environment variables from .env file if it exists.
    /// </summary>
    private static void LoadEnvFile()
    {
        var envPath = Path.Combine(Directory.GetCurrentDirectory(), ".env");
        if (!File.Exists(envPath)) return;

        foreach (var line in File.ReadAllLines(envPath))
        {
            var trimmedLine = line.Trim();
            if (string.IsNullOrEmpty(trimmedLine) || trimmedLine.StartsWith("#")) continue;

            var separatorIndex = trimmedLine.IndexOf('=');
            if (separatorIndex <= 0) continue;

            var key = trimmedLine.Substring(0, separatorIndex).Trim();
            var value = trimmedLine.Substring(separatorIndex + 1).Trim();

            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }
}
