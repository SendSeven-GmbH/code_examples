/**
 * SendSeven API - Interactive Messages Example
 *
 * Demonstrates how to send interactive messages (buttons, lists, quick replies)
 * using the SendSeven API.
 */

using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace SendSeven.Examples
{
    class InteractiveMessages
    {
        // Configuration from environment
        private static string? ApiToken;
        private static string? TenantId;
        private static string? ApiUrl;
        private static string? ChannelId;
        private static string? ContactId;

        private static readonly HttpClient httpClient = new HttpClient();
        private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            WriteIndented = false
        };

        static async Task Main(string[] args)
        {
            LoadEnv();

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

            if (string.IsNullOrEmpty(ChannelId))
            {
                Console.WriteLine("Error: CHANNEL_ID environment variable is required");
                Environment.Exit(1);
            }

            if (string.IsNullOrEmpty(ContactId))
            {
                Console.WriteLine("Error: CONTACT_ID environment variable is required");
                Environment.Exit(1);
            }

            // 1. Check channel capabilities first
            Console.WriteLine($"Checking capabilities for channel: {ChannelId}");
            try
            {
                var capabilities = await CheckChannelCapabilities(ChannelId);
                Console.WriteLine($"Channel type: {GetJsonValue(capabilities, "channel_type", "unknown")}");

                if (capabilities.TryGetProperty("capabilities", out var caps))
                {
                    Console.WriteLine($"  Buttons: {GetJsonValue(caps, "interactive_buttons", "false")}");
                    Console.WriteLine($"  Lists: {GetJsonValue(caps, "interactive_lists", "false")}");
                    Console.WriteLine($"  Quick Replies: {GetJsonValue(caps, "quick_replies", "false")}");
                }
                Console.WriteLine();
            }
            catch (Exception e)
            {
                Console.WriteLine($"Warning: Could not check capabilities: {e.Message}");
                Console.WriteLine("Proceeding anyway...");
                Console.WriteLine();
            }

            // 2. Send a button message
            Console.WriteLine("Sending button message...");
            try
            {
                var buttons = new List<Dictionary<string, string>>
                {
                    new() { { "id", "yes" }, { "title", "Yes" } },
                    new() { { "id", "no" }, { "title", "No" } },
                    new() { { "id", "maybe" }, { "title", "Maybe Later" } }
                };

                var message = await SendButtonMessage(
                    ChannelId,
                    ContactId,
                    "Would you like to proceed with your order?",
                    buttons
                );

                Console.WriteLine("Button message sent successfully!");
                Console.WriteLine($"  ID: {GetJsonValue(message, "id")}");
                Console.WriteLine($"  Status: {GetJsonValue(message, "status")}");
                Console.WriteLine();
            }
            catch (Exception e)
            {
                Console.WriteLine($"Button message failed: {e.Message}");
                Console.WriteLine();
            }

            // 3. Send a list message
            Console.WriteLine("Sending list message...");
            try
            {
                var sections = new List<Dictionary<string, object>>
                {
                    new()
                    {
                        { "title", "Electronics" },
                        { "rows", new List<Dictionary<string, string>>
                            {
                                new() { { "id", "phones" }, { "title", "Phones" }, { "description", "Latest smartphones" } },
                                new() { { "id", "laptops" }, { "title", "Laptops" }, { "description", "Portable computers" } }
                            }
                        }
                    },
                    new()
                    {
                        { "title", "Accessories" },
                        { "rows", new List<Dictionary<string, string>>
                            {
                                new() { { "id", "cases" }, { "title", "Cases" }, { "description", "Protective cases" } },
                                new() { { "id", "chargers" }, { "title", "Chargers" }, { "description", "Fast chargers" } }
                            }
                        }
                    }
                };

                var message = await SendListMessage(
                    ChannelId,
                    ContactId,
                    "Browse our product catalog:",
                    "View Products",
                    sections
                );

                Console.WriteLine("List message sent successfully!");
                Console.WriteLine($"  ID: {GetJsonValue(message, "id")}");
                Console.WriteLine($"  Status: {GetJsonValue(message, "status")}");
                Console.WriteLine();
            }
            catch (Exception e)
            {
                Console.WriteLine($"List message failed: {e.Message}");
                Console.WriteLine();
            }

            // 4. Send a quick reply message
            Console.WriteLine("Sending quick reply message...");
            try
            {
                var quickReplies = new List<Dictionary<string, string>>
                {
                    new() { { "id", "excellent" }, { "title", "Excellent" } },
                    new() { { "id", "good" }, { "title", "Good" } },
                    new() { { "id", "poor" }, { "title", "Poor" } }
                };

                var message = await SendQuickReplyMessage(
                    ChannelId,
                    ContactId,
                    "How would you rate our service today?",
                    quickReplies
                );

                Console.WriteLine("Quick reply message sent successfully!");
                Console.WriteLine($"  ID: {GetJsonValue(message, "id")}");
                Console.WriteLine($"  Status: {GetJsonValue(message, "status")}");
            }
            catch (Exception e)
            {
                Console.WriteLine($"Quick reply message failed: {e.Message}");
            }
        }

        /// <summary>
        /// Load environment variables from .env file
        /// </summary>
        private static void LoadEnv()
        {
            // Try to load from .env file
            var envPath = Path.Combine(Directory.GetCurrentDirectory(), ".env");
            if (File.Exists(envPath))
            {
                foreach (var line in File.ReadAllLines(envPath))
                {
                    var trimmedLine = line.Trim();
                    if (string.IsNullOrEmpty(trimmedLine) || trimmedLine.StartsWith("#"))
                        continue;

                    var idx = trimmedLine.IndexOf('=');
                    if (idx > 0)
                    {
                        var key = trimmedLine[..idx].Trim();
                        var value = trimmedLine[(idx + 1)..].Trim();

                        // Remove quotes if present
                        if ((value.StartsWith("\"") && value.EndsWith("\"")) ||
                            (value.StartsWith("'") && value.EndsWith("'")))
                        {
                            value = value[1..^1];
                        }

                        Environment.SetEnvironmentVariable(key, value);
                    }
                }
            }

            // Load configuration
            ApiToken = Environment.GetEnvironmentVariable("SENDSEVEN_API_TOKEN");
            TenantId = Environment.GetEnvironmentVariable("SENDSEVEN_TENANT_ID");
            ApiUrl = Environment.GetEnvironmentVariable("SENDSEVEN_API_URL") ?? "https://api.sendseven.com/api/v1";
            ChannelId = Environment.GetEnvironmentVariable("CHANNEL_ID");
            ContactId = Environment.GetEnvironmentVariable("CONTACT_ID");
        }

        /// <summary>
        /// Get a value from a JsonElement
        /// </summary>
        private static string GetJsonValue(JsonElement element, string propertyName, string defaultValue = "")
        {
            if (element.TryGetProperty(propertyName, out var prop))
            {
                return prop.ValueKind switch
                {
                    JsonValueKind.String => prop.GetString() ?? defaultValue,
                    JsonValueKind.True => "true",
                    JsonValueKind.False => "false",
                    JsonValueKind.Number => prop.GetRawText(),
                    _ => prop.GetRawText()
                };
            }
            return defaultValue;
        }

        /// <summary>
        /// Make an HTTP request to the API
        /// </summary>
        private static async Task<JsonElement> MakeRequest(HttpMethod method, string url, object? body = null)
        {
            var request = new HttpRequestMessage(method, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiToken);
            request.Headers.Add("X-Tenant-ID", TenantId);

            if (body != null)
            {
                var json = JsonSerializer.Serialize(body);
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }

            var response = await httpClient.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"HTTP {(int)response.StatusCode}: {responseBody}");
            }

            return JsonDocument.Parse(responseBody).RootElement;
        }

        /// <summary>
        /// Check what interactive message types a channel supports
        /// </summary>
        private static async Task<JsonElement> CheckChannelCapabilities(string channelId)
        {
            var url = $"{ApiUrl}/channels/{channelId}/capabilities";
            return await MakeRequest(HttpMethod.Get, url);
        }

        /// <summary>
        /// Send a button message to a contact
        /// </summary>
        private static async Task<JsonElement> SendButtonMessage(
            string channelId,
            string contactId,
            string body,
            List<Dictionary<string, string>> buttons)
        {
            var url = $"{ApiUrl}/messages/send/interactive";

            var payload = new Dictionary<string, object>
            {
                { "channel_id", channelId },
                { "contact_id", contactId },
                { "type", "buttons" },
                { "body", body },
                { "buttons", buttons }
            };

            return await MakeRequest(HttpMethod.Post, url, payload);
        }

        /// <summary>
        /// Send a list message with sections to a contact
        /// </summary>
        private static async Task<JsonElement> SendListMessage(
            string channelId,
            string contactId,
            string body,
            string buttonText,
            List<Dictionary<string, object>> sections)
        {
            var url = $"{ApiUrl}/messages/send/interactive";

            var payload = new Dictionary<string, object>
            {
                { "channel_id", channelId },
                { "contact_id", contactId },
                { "type", "list" },
                { "body", body },
                { "button_text", buttonText },
                { "sections", sections }
            };

            return await MakeRequest(HttpMethod.Post, url, payload);
        }

        /// <summary>
        /// Send a quick reply message to a contact
        /// </summary>
        private static async Task<JsonElement> SendQuickReplyMessage(
            string channelId,
            string contactId,
            string body,
            List<Dictionary<string, string>> buttons)
        {
            var url = $"{ApiUrl}/messages/send/interactive";

            var payload = new Dictionary<string, object>
            {
                { "channel_id", channelId },
                { "contact_id", contactId },
                { "type", "quick_reply" },
                { "body", body },
                { "buttons", buttons }
            };

            return await MakeRequest(HttpMethod.Post, url, payload);
        }
    }
}
