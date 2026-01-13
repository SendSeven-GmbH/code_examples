/**
 * SendSeven API - WhatsApp Templates Example (C#)
 *
 * Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
 * Features:
 * - List available templates
 * - Send template with text parameters
 * - Send template with header (image/document)
 * - Handle template categories (marketing, utility, authentication)
 * - Error handling for template not found, unapproved templates
 */

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Web;

class Program
{
    private static readonly HttpClient httpClient = new HttpClient();

    // Configuration from environment
    private static string ApiToken => Environment.GetEnvironmentVariable("SENDSEVEN_API_TOKEN") ?? "";
    private static string TenantId => Environment.GetEnvironmentVariable("SENDSEVEN_TENANT_ID") ?? "";
    private static string ApiUrl => Environment.GetEnvironmentVariable("SENDSEVEN_API_URL") ?? "https://api.sendseven.com/api/v1";
    private static string ChannelId => Environment.GetEnvironmentVariable("CHANNEL_ID") ?? "";
    private static string ContactId => Environment.GetEnvironmentVariable("CONTACT_ID") ?? "";

    static async Task Main(string[] args)
    {
        // Load .env file if it exists
        LoadEnvFile();

        // Validate configuration
        var missing = new List<string>();
        if (string.IsNullOrEmpty(ApiToken)) missing.Add("SENDSEVEN_API_TOKEN");
        if (string.IsNullOrEmpty(TenantId)) missing.Add("SENDSEVEN_TENANT_ID");
        if (string.IsNullOrEmpty(ChannelId)) missing.Add("CHANNEL_ID");
        if (string.IsNullOrEmpty(ContactId)) missing.Add("CONTACT_ID");

        if (missing.Count > 0)
        {
            Console.WriteLine("Error: Missing required environment variables:");
            foreach (var v in missing)
            {
                Console.WriteLine($"  - {v}");
            }
            Environment.Exit(1);
        }

        // Example 1: List all approved templates
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("Listing approved WhatsApp templates...");
        Console.WriteLine(new string('=', 60));

        List<JsonElement> templates;
        try
        {
            templates = await ListTemplatesAsync(null, "APPROVED");
            if (templates.Count == 0)
            {
                Console.WriteLine("No approved templates found.");
                Console.WriteLine("Create templates in the WhatsApp Business Manager first.");
                return;
            }

            Console.WriteLine($"Found {templates.Count} template(s):\n");
            foreach (var template in templates.Take(5))
            {
                Console.WriteLine($"  Name: {template.GetProperty("name").GetString()}");
                Console.WriteLine($"  Category: {template.GetProperty("category").GetString()}");
                Console.WriteLine($"  Language: {template.GetProperty("language").GetString()}");
                Console.WriteLine($"  Status: {template.GetProperty("status").GetString()}");
                Console.WriteLine();
            }
        }
        catch (Exception ex)
        {
            HandleTemplateError(ex);
            return;
        }

        // Example 2: List templates by category
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("Listing MARKETING templates...");
        Console.WriteLine(new string('=', 60));

        try
        {
            var marketingTemplates = await ListTemplatesAsync("MARKETING", "APPROVED");
            Console.WriteLine($"Found {marketingTemplates.Count} marketing template(s)");
        }
        catch (Exception ex)
        {
            HandleTemplateError(ex);
        }

        // Example 3: Send a template with text parameters
        Console.WriteLine($"\n{new string('=', 60)}");
        Console.WriteLine("Sending template with text parameters...");
        Console.WriteLine(new string('=', 60));

        try
        {
            var message = await SendTemplateWithTextParamsAsync(
                ChannelId,
                ContactId,
                "order_confirmation",
                new[] { "John Doe", "ORD-12345" },
                "en"
            );

            Console.WriteLine("Template message sent successfully!");
            Console.WriteLine($"  Message ID: {message.GetProperty("id").GetString()}");
            Console.WriteLine($"  Status: {message.GetProperty("status").GetString()}");
        }
        catch (Exception ex)
        {
            HandleTemplateError(ex);
            Console.WriteLine("\nNote: Update template_name to match your approved template");
        }

        // Example 4: Send template with image header
        Console.WriteLine($"\n{new string('=', 60)}");
        Console.WriteLine("Sending template with image header...");
        Console.WriteLine(new string('=', 60));

        try
        {
            var message = await SendTemplateWithHeaderImageAsync(
                ChannelId,
                ContactId,
                "promotion_with_image",
                "https://example.com/promo-image.jpg",
                new[] { "Summer Sale", "50%" },
                "en"
            );

            Console.WriteLine("Template with image sent successfully!");
            Console.WriteLine($"  Message ID: {message.GetProperty("id").GetString()}");
        }
        catch (Exception ex)
        {
            HandleTemplateError(ex);
            Console.WriteLine("\nNote: Update template_name to match your approved template");
        }

        // Example 5: Send template with document header
        Console.WriteLine($"\n{new string('=', 60)}");
        Console.WriteLine("Sending template with document header...");
        Console.WriteLine(new string('=', 60));

        try
        {
            var message = await SendTemplateWithHeaderDocumentAsync(
                ChannelId,
                ContactId,
                "invoice_template",
                "https://example.com/invoice.pdf",
                "Invoice-2026-001.pdf",
                new[] { "$199.99" },
                "en"
            );

            Console.WriteLine("Template with document sent successfully!");
            Console.WriteLine($"  Message ID: {message.GetProperty("id").GetString()}");
        }
        catch (Exception ex)
        {
            HandleTemplateError(ex);
            Console.WriteLine("\nNote: Update template_name to match your approved template");
        }
    }

    /// <summary>
    /// List available WhatsApp templates.
    /// </summary>
    private static async Task<List<JsonElement>> ListTemplatesAsync(string? category, string status = "APPROVED")
    {
        var query = HttpUtility.ParseQueryString(string.Empty);
        query["status"] = status;
        if (!string.IsNullOrEmpty(category))
        {
            query["category"] = category;
        }

        httpClient.DefaultRequestHeaders.Clear();
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiToken);
        httpClient.DefaultRequestHeaders.Add("X-Tenant-ID", TenantId);

        var response = await httpClient.GetAsync($"{ApiUrl}/whatsapp/templates?{query}");
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        var root = JsonSerializer.Deserialize<JsonElement>(responseBody);
        var templates = new List<JsonElement>();

        // Check if response has "items" field (paginated response)
        if (root.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var template in items.EnumerateArray())
            {
                templates.Add(template);
            }
        }
        else if (root.ValueKind == JsonValueKind.Array)
        {
            // Response is a direct array
            foreach (var template in root.EnumerateArray())
            {
                templates.Add(template);
            }
        }

        return templates;
    }

    /// <summary>
    /// Send a WhatsApp template message.
    /// </summary>
    private static async Task<JsonElement> SendTemplateMessageAsync(
        string channelId,
        string contactId,
        string templateName,
        string languageCode,
        object[]? components = null)
    {
        var payload = new Dictionary<string, object>
        {
            { "channel_id", channelId },
            { "contact_id", contactId },
            { "template_name", templateName },
            { "language_code", languageCode }
        };

        if (components != null && components.Length > 0)
        {
            payload["components"] = components;
        }

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        httpClient.DefaultRequestHeaders.Clear();
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiToken);
        httpClient.DefaultRequestHeaders.Add("X-Tenant-ID", TenantId);

        var response = await httpClient.PostAsync($"{ApiUrl}/messages/send/template", content);
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        return JsonSerializer.Deserialize<JsonElement>(responseBody);
    }

    /// <summary>
    /// Send a template message with text parameters in the body.
    /// </summary>
    private static async Task<JsonElement> SendTemplateWithTextParamsAsync(
        string channelId,
        string contactId,
        string templateName,
        string[] bodyParams,
        string languageCode = "en")
    {
        var components = new object[]
        {
            new
            {
                type = "body",
                parameters = bodyParams.Select(p => new { type = "text", text = p }).ToArray()
            }
        };

        return await SendTemplateMessageAsync(channelId, contactId, templateName, languageCode, components);
    }

    /// <summary>
    /// Send a template message with an image header.
    /// </summary>
    private static async Task<JsonElement> SendTemplateWithHeaderImageAsync(
        string channelId,
        string contactId,
        string templateName,
        string imageUrl,
        string[]? bodyParams = null,
        string languageCode = "en")
    {
        var componentsList = new List<object>
        {
            new
            {
                type = "header",
                parameters = new object[]
                {
                    new { type = "image", image = new { link = imageUrl } }
                }
            }
        };

        if (bodyParams != null && bodyParams.Length > 0)
        {
            componentsList.Add(new
            {
                type = "body",
                parameters = bodyParams.Select(p => new { type = "text", text = p }).ToArray()
            });
        }

        return await SendTemplateMessageAsync(channelId, contactId, templateName, languageCode, componentsList.ToArray());
    }

    /// <summary>
    /// Send a template message with a document header.
    /// </summary>
    private static async Task<JsonElement> SendTemplateWithHeaderDocumentAsync(
        string channelId,
        string contactId,
        string templateName,
        string documentUrl,
        string filename,
        string[]? bodyParams = null,
        string languageCode = "en")
    {
        var componentsList = new List<object>
        {
            new
            {
                type = "header",
                parameters = new object[]
                {
                    new { type = "document", document = new { link = documentUrl, filename = filename } }
                }
            }
        };

        if (bodyParams != null && bodyParams.Length > 0)
        {
            componentsList.Add(new
            {
                type = "body",
                parameters = bodyParams.Select(p => new { type = "text", text = p }).ToArray()
            });
        }

        return await SendTemplateMessageAsync(channelId, contactId, templateName, languageCode, componentsList.ToArray());
    }

    /// <summary>
    /// Handle and display template-specific errors.
    /// </summary>
    private static void HandleTemplateError(Exception error)
    {
        var message = error.Message;
        var match = Regex.Match(message, @"API Error (\d+)");
        int statusCode = match.Success ? int.Parse(match.Groups[1].Value) : 0;

        if (statusCode == 404)
        {
            Console.WriteLine($"Template not found: {message}");
            Console.WriteLine("Tip: Verify the template name exists and is approved");
        }
        else if (statusCode == 400)
        {
            if (message.ToLower().Contains("not approved"))
            {
                Console.WriteLine($"Template not approved: {message}");
                Console.WriteLine("Tip: Only APPROVED templates can be sent");
            }
            else if (message.ToLower().Contains("parameter"))
            {
                Console.WriteLine($"Parameter mismatch: {message}");
                Console.WriteLine("Tip: Ensure the number of parameters matches the template");
            }
            else
            {
                Console.WriteLine($"Bad request: {message}");
            }
        }
        else if (statusCode == 401)
        {
            Console.WriteLine("Authentication failed: Check your API token");
        }
        else if (statusCode == 403)
        {
            Console.WriteLine("Permission denied: Token may lack required scopes");
        }
        else
        {
            Console.WriteLine($"Error: {message}");
        }
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
