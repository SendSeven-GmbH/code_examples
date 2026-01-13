/**
 * SendSeven API - Contact Management Example (C#)
 *
 * Demonstrates CRUD operations for contacts using the SendSeven API.
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

        Console.WriteLine("SendSeven Contact Management Example");
        Console.WriteLine(new string('=', 40));

        try
        {
            // 1. Create a new contact
            Console.WriteLine("\n1. Creating a new contact...");
            var contact = await CreateContactAsync(new
            {
                phone_number = "+1234567890",
                email = "john.doe@example.com",
                first_name = "John",
                last_name = "Doe",
                company = "Acme Inc"
            });
            var contactId = contact.GetProperty("id").GetString();
            Console.WriteLine($"   Created contact: {contactId}");
            Console.WriteLine($"   Name: {contact.GetProperty("first_name").GetString()} {contact.GetProperty("last_name").GetString()}");
            Console.WriteLine($"   Email: {contact.GetProperty("email").GetString()}");
            Console.WriteLine($"   Phone: {contact.GetProperty("phone_number").GetString()}");

            // 2. List contacts
            Console.WriteLine("\n2. Listing contacts...");
            var contactsResponse = await ListContactsAsync(1, 10);
            var pagination = contactsResponse.GetProperty("pagination");
            Console.WriteLine($"   Total contacts: {pagination.GetProperty("total").GetInt32()}");
            Console.WriteLine($"   Page {pagination.GetProperty("page").GetInt32()} of {pagination.GetProperty("total_pages").GetInt32()}");
            var items = contactsResponse.GetProperty("items");
            for (int i = 0; i < Math.Min(3, items.GetArrayLength()); i++)
            {
                var c = items[i];
                var firstName = c.TryGetProperty("first_name", out var fn) ? fn.GetString() ?? "" : "";
                var lastName = c.TryGetProperty("last_name", out var ln) ? ln.GetString() ?? "" : "";
                var name = $"{firstName} {lastName}".Trim();
                if (string.IsNullOrEmpty(name)) name = "Unnamed";
                Console.WriteLine($"   - {c.GetProperty("id").GetString()}: {name}");
            }

            // 3. Get single contact
            Console.WriteLine($"\n3. Getting contact {contactId}...");
            var fetchedContact = await GetContactAsync(contactId!);
            Console.WriteLine($"   ID: {fetchedContact.GetProperty("id").GetString()}");
            Console.WriteLine($"   Name: {fetchedContact.GetProperty("first_name").GetString()} {fetchedContact.GetProperty("last_name").GetString()}");
            Console.WriteLine($"   Company: {fetchedContact.GetProperty("company").GetString()}");

            // 4. Update contact
            Console.WriteLine($"\n4. Updating contact {contactId}...");
            var updatedContact = await UpdateContactAsync(contactId!, new
            {
                first_name = "Jane",
                company = "New Company Inc"
            });
            Console.WriteLine($"   Updated name: {updatedContact.GetProperty("first_name").GetString()} {updatedContact.GetProperty("last_name").GetString()}");
            Console.WriteLine($"   Updated company: {updatedContact.GetProperty("company").GetString()}");

            // 5. Delete contact
            Console.WriteLine($"\n5. Deleting contact {contactId}...");
            var deleteResult = await DeleteContactAsync(contactId!);
            var deleted = deleteResult.TryGetProperty("success", out var success) ? success.GetBoolean() : true;
            Console.WriteLine($"   Deleted: {deleted}");

            Console.WriteLine("\n" + new string('=', 40));
            Console.WriteLine("All operations completed successfully!");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\nError: {ex.Message}");
            Environment.Exit(1);
        }
    }

    /// <summary>
    /// Create a new contact.
    /// </summary>
    private static async Task<JsonElement> CreateContactAsync(object contactData)
    {
        return await MakeRequestAsync("POST", "/contacts", contactData);
    }

    /// <summary>
    /// List contacts with pagination.
    /// </summary>
    private static async Task<JsonElement> ListContactsAsync(int page = 1, int pageSize = 20)
    {
        return await MakeRequestAsync("GET", $"/contacts?page={page}&page_size={pageSize}", null);
    }

    /// <summary>
    /// Get a single contact by ID.
    /// </summary>
    private static async Task<JsonElement> GetContactAsync(string contactId)
    {
        return await MakeRequestAsync("GET", $"/contacts/{contactId}", null);
    }

    /// <summary>
    /// Update an existing contact.
    /// </summary>
    private static async Task<JsonElement> UpdateContactAsync(string contactId, object contactData)
    {
        return await MakeRequestAsync("PUT", $"/contacts/{contactId}", contactData);
    }

    /// <summary>
    /// Delete a contact.
    /// </summary>
    private static async Task<JsonElement> DeleteContactAsync(string contactId)
    {
        return await MakeRequestAsync("DELETE", $"/contacts/{contactId}", null);
    }

    /// <summary>
    /// Make an HTTP request to the API.
    /// </summary>
    private static async Task<JsonElement> MakeRequestAsync(string method, string endpoint, object? body)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), $"{ApiUrl}{endpoint}");
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
