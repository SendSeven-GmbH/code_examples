/**
 * SendSeven API - Conversation Management Example (C#)
 *
 * Demonstrates how to list, get, update, and close conversations using the SendSeven API.
 */

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Web;

class Program
{
    private static readonly HttpClient httpClient = new HttpClient();

    // Configuration from environment
    private static string ApiToken => Environment.GetEnvironmentVariable("SENDSEVEN_API_TOKEN") ?? "";
    private static string TenantId => Environment.GetEnvironmentVariable("SENDSEVEN_TENANT_ID") ?? "";
    private static string ApiUrl => Environment.GetEnvironmentVariable("SENDSEVEN_API_URL") ?? "https://api.sendseven.com/api/v1";

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

        try
        {
            // Example 1: List all open conversations that need a reply
            PrintSeparator();
            Console.WriteLine("Listing open conversations that need a reply...");
            PrintSeparator();

            var result = await ListConversationsAsync(new Dictionary<string, string>
            {
                { "status", "open" },
                { "needs_reply", "true" },
                { "page_size", "5" }
            });

            var pagination = result.GetProperty("pagination");
            Console.WriteLine($"Found {pagination.GetProperty("total").GetInt32()} conversations");
            Console.WriteLine($"Page {pagination.GetProperty("page").GetInt32()} of {pagination.GetProperty("total_pages").GetInt32()}");
            Console.WriteLine();

            var items = result.GetProperty("items");
            foreach (var conv in items.EnumerateArray())
            {
                Console.WriteLine($"  ID: {conv.GetProperty("id").GetString()}");
                Console.WriteLine($"  Channel: {conv.GetProperty("channel").GetString()}");
                Console.WriteLine($"  Status: {conv.GetProperty("status").GetString()}");
                var lastMsg = conv.TryGetProperty("last_message_at", out var lm) && lm.ValueKind != JsonValueKind.Null
                    ? lm.GetString() : "N/A";
                Console.WriteLine($"  Last message: {lastMsg}");
                Console.WriteLine();
            }

            // Example 2: Get a single conversation (if we have any)
            if (items.GetArrayLength() > 0)
            {
                var conversationId = items[0].GetProperty("id").GetString()!;

                PrintSeparator();
                Console.WriteLine($"Getting conversation details: {conversationId}");
                PrintSeparator();

                var conversation = await GetConversationAsync(conversationId);
                Console.WriteLine($"  ID: {conversation.GetProperty("id").GetString()}");
                Console.WriteLine($"  Channel: {conversation.GetProperty("channel").GetString()}");
                Console.WriteLine($"  Status: {conversation.GetProperty("status").GetString()}");
                Console.WriteLine($"  Needs reply: {conversation.GetProperty("needs_reply").GetBoolean()}");
                var assignedTo = conversation.TryGetProperty("assigned_to", out var at) && at.ValueKind != JsonValueKind.Null
                    ? at.GetString() : "Unassigned";
                Console.WriteLine($"  Assigned to: {assignedTo}");
                if (conversation.TryGetProperty("contact", out var contact) && contact.ValueKind != JsonValueKind.Null)
                {
                    var name = contact.TryGetProperty("name", out var n) && n.ValueKind != JsonValueKind.Null
                        ? n.GetString() : "Unknown";
                    Console.WriteLine($"  Contact: {name}");
                }
                Console.WriteLine();

                // Example 3: Demonstrate update (commented out to avoid modifying data)
                // Uncomment to actually assign a conversation
                // PrintSeparator();
                // Console.WriteLine("Assigning conversation to user...");
                // PrintSeparator();
                // var userId = "your-user-id-here";
                // var updated = await UpdateConversationAsync(conversationId, userId);
                // Console.WriteLine($"  Assigned to: {updated.GetProperty("assigned_to").GetString()}");
                // Console.WriteLine();

                // Example 4: Demonstrate close (commented out to avoid modifying data)
                // Uncomment to actually close the conversation
                // PrintSeparator();
                // Console.WriteLine("Closing conversation...");
                // PrintSeparator();
                // var closed = await CloseConversationAsync(conversationId);
                // Console.WriteLine($"  Status: {closed.GetProperty("status").GetString()}");
                // Console.WriteLine($"  Closed at: {closed.GetProperty("closed_at").GetString()}");
            }

            PrintSeparator();
            Console.WriteLine("Conversation management examples completed!");
            PrintSeparator();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            Environment.Exit(1);
        }
    }

    /// <summary>
    /// List conversations with optional filtering.
    /// </summary>
    private static async Task<JsonElement> ListConversationsAsync(Dictionary<string, string> options)
    {
        var queryParams = HttpUtility.ParseQueryString(string.Empty);
        queryParams["page"] = options.GetValueOrDefault("page", "1");
        queryParams["page_size"] = options.GetValueOrDefault("page_size", "20");

        if (options.TryGetValue("status", out var status))
            queryParams["status"] = status;
        if (options.TryGetValue("needs_reply", out var needsReply))
            queryParams["needs_reply"] = needsReply;
        if (options.TryGetValue("assigned_to", out var assignedTo))
            queryParams["assigned_to"] = assignedTo;
        if (options.TryGetValue("channel", out var channel))
            queryParams["channel"] = channel;

        SetupHeaders();
        var response = await httpClient.GetAsync($"{ApiUrl}/conversations?{queryParams}");
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        return JsonSerializer.Deserialize<JsonElement>(responseBody);
    }

    /// <summary>
    /// Get a single conversation by ID.
    /// </summary>
    private static async Task<JsonElement> GetConversationAsync(string conversationId)
    {
        SetupHeaders();
        var response = await httpClient.GetAsync($"{ApiUrl}/conversations/{conversationId}");
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        return JsonSerializer.Deserialize<JsonElement>(responseBody);
    }

    /// <summary>
    /// Update a conversation (e.g., assign to a user).
    /// </summary>
    private static async Task<JsonElement> UpdateConversationAsync(string conversationId, string? assignedTo = null)
    {
        var payload = new Dictionary<string, object?>();
        if (assignedTo != null)
        {
            payload["assigned_to"] = assignedTo;
        }

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        SetupHeaders();
        var response = await httpClient.PutAsync($"{ApiUrl}/conversations/{conversationId}", content);
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        return JsonSerializer.Deserialize<JsonElement>(responseBody);
    }

    /// <summary>
    /// Close a conversation.
    /// </summary>
    private static async Task<JsonElement> CloseConversationAsync(string conversationId)
    {
        SetupHeaders();
        var response = await httpClient.PostAsync($"{ApiUrl}/conversations/{conversationId}/close", null);
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        return JsonSerializer.Deserialize<JsonElement>(responseBody);
    }

    /// <summary>
    /// Setup common request headers.
    /// </summary>
    private static void SetupHeaders()
    {
        httpClient.DefaultRequestHeaders.Clear();
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiToken);
        httpClient.DefaultRequestHeaders.Add("X-Tenant-ID", TenantId);
    }

    /// <summary>
    /// Print a separator line.
    /// </summary>
    private static void PrintSeparator()
    {
        Console.WriteLine(new string('=', 60));
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
