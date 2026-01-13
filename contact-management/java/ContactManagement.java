/**
 * SendSeven API - Contact Management Example (Java)
 *
 * Demonstrates CRUD operations for contacts using the SendSeven API.
 */

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

public class ContactManagement {

    private final String apiToken;
    private final String tenantId;
    private final String apiUrl;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public ContactManagement() {
        // Load configuration from environment or .env file
        loadEnvFile();

        this.apiToken = getEnv("SENDSEVEN_API_TOKEN", null);
        this.tenantId = getEnv("SENDSEVEN_TENANT_ID", null);
        this.apiUrl = getEnv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1");

        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
    }

    private void loadEnvFile() {
        try {
            Properties props = new Properties();
            FileInputStream fis = new FileInputStream(".env");
            props.load(fis);
            fis.close();

            for (String key : props.stringPropertyNames()) {
                if (System.getenv(key) == null) {
                    System.setProperty(key, props.getProperty(key));
                }
            }
        } catch (IOException e) {
            // .env file not found, using environment variables only
        }
    }

    private String getEnv(String key, String defaultValue) {
        String value = System.getenv(key);
        if (value == null) {
            value = System.getProperty(key, defaultValue);
        }
        return value;
    }

    /**
     * Make an HTTP request to the API.
     */
    private JsonNode makeRequest(String method, String endpoint, ObjectNode body) throws Exception {
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + endpoint))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json");

        switch (method) {
            case "POST":
                requestBuilder.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
                break;
            case "PUT":
                requestBuilder.PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
                break;
            case "DELETE":
                requestBuilder.DELETE();
                break;
            default:
                requestBuilder.GET();
        }

        HttpResponse<String> response = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }

    /**
     * Create a new contact.
     */
    public JsonNode createContact(String phoneNumber, String email, String firstName, String lastName, String company) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        if (phoneNumber != null) payload.put("phone_number", phoneNumber);
        if (email != null) payload.put("email", email);
        if (firstName != null) payload.put("first_name", firstName);
        if (lastName != null) payload.put("last_name", lastName);
        if (company != null) payload.put("company", company);

        return makeRequest("POST", "/contacts", payload);
    }

    /**
     * List contacts with pagination.
     */
    public JsonNode listContacts(int page, int pageSize) throws Exception {
        String endpoint = String.format("/contacts?page=%d&page_size=%d", page, pageSize);
        return makeRequest("GET", endpoint, null);
    }

    /**
     * Get a single contact by ID.
     */
    public JsonNode getContact(String contactId) throws Exception {
        return makeRequest("GET", "/contacts/" + contactId, null);
    }

    /**
     * Update an existing contact.
     */
    public JsonNode updateContact(String contactId, String firstName, String company) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        if (firstName != null) payload.put("first_name", firstName);
        if (company != null) payload.put("company", company);

        return makeRequest("PUT", "/contacts/" + contactId, payload);
    }

    /**
     * Delete a contact.
     */
    public JsonNode deleteContact(String contactId) throws Exception {
        return makeRequest("DELETE", "/contacts/" + contactId, null);
    }

    public void run() {
        // Validate configuration
        if (apiToken == null || apiToken.isEmpty()) {
            System.err.println("Error: SENDSEVEN_API_TOKEN environment variable is required");
            System.exit(1);
        }

        if (tenantId == null || tenantId.isEmpty()) {
            System.err.println("Error: SENDSEVEN_TENANT_ID environment variable is required");
            System.exit(1);
        }

        System.out.println("SendSeven Contact Management Example");
        System.out.println("========================================");

        try {
            // 1. Create a new contact
            System.out.println("\n1. Creating a new contact...");
            JsonNode contact = createContact(
                "+1234567890",
                "john.doe@example.com",
                "John",
                "Doe",
                "Acme Inc"
            );
            String contactId = contact.get("id").asText();
            System.out.println("   Created contact: " + contactId);
            System.out.println("   Name: " + contact.get("first_name").asText() + " " + contact.get("last_name").asText());
            System.out.println("   Email: " + contact.get("email").asText());
            System.out.println("   Phone: " + contact.get("phone_number").asText());

            // 2. List contacts
            System.out.println("\n2. Listing contacts...");
            JsonNode contactsResponse = listContacts(1, 10);
            JsonNode pagination = contactsResponse.get("pagination");
            System.out.println("   Total contacts: " + pagination.get("total").asInt());
            System.out.println("   Page " + pagination.get("page").asInt() + " of " + pagination.get("total_pages").asInt());
            JsonNode items = contactsResponse.get("items");
            for (int i = 0; i < Math.min(3, items.size()); i++) {
                JsonNode c = items.get(i);
                String firstName = c.has("first_name") ? c.get("first_name").asText() : "";
                String lastName = c.has("last_name") ? c.get("last_name").asText() : "";
                String name = (firstName + " " + lastName).trim();
                if (name.isEmpty()) name = "Unnamed";
                System.out.println("   - " + c.get("id").asText() + ": " + name);
            }

            // 3. Get single contact
            System.out.println("\n3. Getting contact " + contactId + "...");
            JsonNode fetchedContact = getContact(contactId);
            System.out.println("   ID: " + fetchedContact.get("id").asText());
            System.out.println("   Name: " + fetchedContact.get("first_name").asText() + " " + fetchedContact.get("last_name").asText());
            System.out.println("   Company: " + fetchedContact.get("company").asText());

            // 4. Update contact
            System.out.println("\n4. Updating contact " + contactId + "...");
            JsonNode updatedContact = updateContact(contactId, "Jane", "New Company Inc");
            System.out.println("   Updated name: " + updatedContact.get("first_name").asText() + " " + updatedContact.get("last_name").asText());
            System.out.println("   Updated company: " + updatedContact.get("company").asText());

            // 5. Delete contact
            System.out.println("\n5. Deleting contact " + contactId + "...");
            JsonNode deleteResult = deleteContact(contactId);
            boolean deleted = deleteResult.has("success") ? deleteResult.get("success").asBoolean() : true;
            System.out.println("   Deleted: " + deleted);

            System.out.println("\n========================================");
            System.out.println("All operations completed successfully!");
        } catch (Exception e) {
            System.err.println("\nError: " + e.getMessage());
            System.exit(1);
        }
    }

    public static void main(String[] args) {
        new ContactManagement().run();
    }
}
