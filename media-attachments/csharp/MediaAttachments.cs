/**
 * SendSeven API - Media Attachments Example (C#)
 *
 * Demonstrates how to upload files and send media messages using the SendSeven API.
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

    // File size limits (in bytes)
    private const long ImageMaxSize = 16L * 1024 * 1024;      // 16 MB
    private const long DocumentMaxSize = 100L * 1024 * 1024;  // 100 MB
    private const long VideoMaxSize = 16L * 1024 * 1024;      // 16 MB
    private const long AudioMaxSize = 16L * 1024 * 1024;      // 16 MB

    // Supported content types by message type
    private static readonly Dictionary<string, string[]> SupportedTypes = new()
    {
        ["image"] = new[] { "image/jpeg", "image/png", "image/gif", "image/webp" },
        ["document"] = new[] {
            "application/pdf", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain"
        },
        ["video"] = new[] { "video/mp4", "video/3gpp" },
        ["audio"] = new[] { "audio/aac", "audio/mpeg", "audio/ogg", "audio/amr", "audio/opus" }
    };

    // Extension to content type mapping
    private static readonly Dictionary<string, string> ContentTypes = new()
    {
        // Images
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
        // Documents
        [".pdf"] = "application/pdf",
        [".doc"] = "application/msword",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xls"] = "application/vnd.ms-excel",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".ppt"] = "application/vnd.ms-powerpoint",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".txt"] = "text/plain",
        // Video
        [".mp4"] = "video/mp4",
        [".3gp"] = "video/3gpp",
        // Audio
        [".aac"] = "audio/aac",
        [".mp3"] = "audio/mpeg",
        [".ogg"] = "audio/ogg",
        [".amr"] = "audio/amr",
        [".opus"] = "audio/opus"
    };

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

        Console.WriteLine("SendSeven Media Attachments Example");
        Console.WriteLine(new string('=', 40));
        Console.WriteLine($"API URL: {ApiUrl}");
        Console.WriteLine($"Conversation: {ConversationId}");

        // Check for command line argument (file to upload)
        if (args.Length > 0)
        {
            try
            {
                await DemoUploadAndSendAsync(args[0]);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
                Environment.Exit(1);
            }
        }
        else
        {
            Console.WriteLine("\nUsage: dotnet run <file_path>");
            Console.WriteLine("\nSupported file types:");
            Console.WriteLine("  Images:    .jpg, .jpeg, .png, .gif, .webp (max 16 MB)");
            Console.WriteLine("  Documents: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt (max 100 MB)");
            Console.WriteLine("  Video:     .mp4, .3gp (max 16 MB)");
            Console.WriteLine("  Audio:     .aac, .mp3, .ogg, .amr, .opus (max 16 MB)");
            Console.WriteLine("\nExample:");
            Console.WriteLine("  dotnet run /path/to/image.jpg");

            // Demo with a sample file if it exists
            string[] sampleFiles = { "sample.jpg", "sample.png", "sample.pdf" };
            foreach (var sample in sampleFiles)
            {
                if (File.Exists(sample))
                {
                    Console.WriteLine($"\nFound sample file: {sample}");
                    try
                    {
                        await DemoUploadAndSendAsync(sample);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error: {ex.Message}");
                    }
                    break;
                }
            }
        }
    }

    /// <summary>
    /// Get content type from file extension.
    /// </summary>
    private static string GetContentType(string filePath)
    {
        var ext = Path.GetExtension(filePath).ToLower();
        return ContentTypes.TryGetValue(ext, out var contentType) ? contentType : "application/octet-stream";
    }

    /// <summary>
    /// Get message type from content type.
    /// </summary>
    private static string GetMessageType(string contentType)
    {
        foreach (var (msgType, types) in SupportedTypes)
        {
            if (types.Contains(contentType))
            {
                return msgType;
            }
        }
        throw new Exception($"Unsupported content type: {contentType}");
    }

    /// <summary>
    /// Get maximum file size for a message type.
    /// </summary>
    private static long GetMaxSize(string messageType)
    {
        return messageType switch
        {
            "image" => ImageMaxSize,
            "document" => DocumentMaxSize,
            "video" => VideoMaxSize,
            "audio" => AudioMaxSize,
            _ => DocumentMaxSize
        };
    }

    /// <summary>
    /// Upload a file as an attachment.
    /// </summary>
    private static async Task<JsonElement> UploadAttachmentAsync(string filePath)
    {
        // Validate file exists
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"File not found: {filePath}");
        }

        var fileInfo = new FileInfo(filePath);
        var contentType = GetContentType(filePath);
        var messageType = GetMessageType(contentType);

        // Check file size
        var maxSize = GetMaxSize(messageType);
        if (fileInfo.Length > maxSize)
        {
            throw new Exception($"File too large: {fileInfo.Length} bytes (max {maxSize} bytes for {messageType})");
        }

        using var content = new MultipartFormDataContent();
        using var fileStream = File.OpenRead(filePath);
        using var fileContent = new StreamContent(fileStream);

        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(fileContent, "file", Path.GetFileName(filePath));

        httpClient.DefaultRequestHeaders.Clear();
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiToken);
        httpClient.DefaultRequestHeaders.Add("X-Tenant-ID", TenantId);

        var response = await httpClient.PostAsync($"{ApiUrl}/attachments", content);
        var responseBody = await response.Content.ReadAsStringAsync();

        if ((int)response.StatusCode == 413)
        {
            throw new Exception("File too large (server rejected)");
        }
        else if ((int)response.StatusCode == 415)
        {
            throw new Exception("Unsupported media type (server rejected)");
        }
        else if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"API Error {(int)response.StatusCode}: {responseBody}");
        }

        return JsonSerializer.Deserialize<JsonElement>(responseBody);
    }

    /// <summary>
    /// Send a message with an attachment.
    /// </summary>
    private static async Task<JsonElement> SendMediaMessageAsync(string conversationId, string attachmentId, string messageType, string? caption = null)
    {
        var payload = new Dictionary<string, object>
        {
            ["conversation_id"] = conversationId,
            ["message_type"] = messageType,
            ["attachments"] = new[] { attachmentId }
        };

        if (!string.IsNullOrEmpty(caption))
        {
            payload["text"] = caption;
        }

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
    /// Download an attachment by ID.
    /// </summary>
    private static async Task DownloadAttachmentAsync(string attachmentId, string outputPath)
    {
        httpClient.DefaultRequestHeaders.Clear();
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiToken);
        httpClient.DefaultRequestHeaders.Add("X-Tenant-ID", TenantId);

        var response = await httpClient.GetAsync($"{ApiUrl}/attachments/{attachmentId}/download");

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            throw new Exception($"API Error {(int)response.StatusCode}: {errorBody}");
        }

        var fileBytes = await response.Content.ReadAsByteArrayAsync();
        await File.WriteAllBytesAsync(outputPath, fileBytes);
        Console.WriteLine($"Downloaded to: {outputPath}");
    }

    /// <summary>
    /// Upload and send an image message.
    /// </summary>
    private static async Task<JsonElement> SendImageAsync(string conversationId, string filePath, string? caption = null)
    {
        Console.WriteLine($"Uploading image: {filePath}");
        var attachment = await UploadAttachmentAsync(filePath);
        Console.WriteLine($"  Uploaded: {attachment.GetProperty("id").GetString()}");

        Console.WriteLine("Sending image message...");
        return await SendMediaMessageAsync(conversationId, attachment.GetProperty("id").GetString()!, "image", caption);
    }

    /// <summary>
    /// Upload and send a document message.
    /// </summary>
    private static async Task<JsonElement> SendDocumentAsync(string conversationId, string filePath, string? caption = null)
    {
        Console.WriteLine($"Uploading document: {filePath}");
        var attachment = await UploadAttachmentAsync(filePath);
        Console.WriteLine($"  Uploaded: {attachment.GetProperty("id").GetString()}");

        Console.WriteLine("Sending document message...");
        return await SendMediaMessageAsync(conversationId, attachment.GetProperty("id").GetString()!, "document", caption);
    }

    /// <summary>
    /// Upload and send a video message.
    /// </summary>
    private static async Task<JsonElement> SendVideoAsync(string conversationId, string filePath, string? caption = null)
    {
        Console.WriteLine($"Uploading video: {filePath}");
        var attachment = await UploadAttachmentAsync(filePath);
        Console.WriteLine($"  Uploaded: {attachment.GetProperty("id").GetString()}");

        Console.WriteLine("Sending video message...");
        return await SendMediaMessageAsync(conversationId, attachment.GetProperty("id").GetString()!, "video", caption);
    }

    /// <summary>
    /// Upload and send an audio message.
    /// </summary>
    private static async Task<JsonElement> SendAudioAsync(string conversationId, string filePath, string? caption = null)
    {
        Console.WriteLine($"Uploading audio: {filePath}");
        var attachment = await UploadAttachmentAsync(filePath);
        Console.WriteLine($"  Uploaded: {attachment.GetProperty("id").GetString()}");

        Console.WriteLine("Sending audio message...");
        return await SendMediaMessageAsync(conversationId, attachment.GetProperty("id").GetString()!, "audio", caption);
    }

    /// <summary>
    /// Demo: Upload a file and send it as a message.
    /// Automatically detects the appropriate message type.
    /// </summary>
    private static async Task DemoUploadAndSendAsync(string filePath)
    {
        var contentType = GetContentType(filePath);
        var messageType = GetMessageType(contentType);

        Console.WriteLine($"\n--- Sending {messageType} ---");
        Console.WriteLine($"File: {filePath}");
        Console.WriteLine($"Content-Type: {contentType}");

        var attachment = await UploadAttachmentAsync(filePath);
        Console.WriteLine("Attachment uploaded:");
        Console.WriteLine($"  ID: {attachment.GetProperty("id").GetString()}");
        Console.WriteLine($"  Filename: {attachment.GetProperty("filename").GetString()}");
        Console.WriteLine($"  Size: {attachment.GetProperty("file_size").GetInt64()} bytes");

        var message = await SendMediaMessageAsync(
            ConversationId,
            attachment.GetProperty("id").GetString()!,
            messageType,
            $"Here's a {messageType} file!"
        );

        Console.WriteLine("Message sent:");
        Console.WriteLine($"  ID: {message.GetProperty("id").GetString()}");
        Console.WriteLine($"  Status: {message.GetProperty("status").GetString()}");
        Console.WriteLine($"  Created at: {message.GetProperty("created_at").GetString()}");
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
