/**
 * SendSeven API - Conversation Management Example (Java)
 *
 * Demonstrates how to list, get, update, and close conversations using the SendSeven API.
 */

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

public class ConversationManagement {

    private final String apiToken;
    private final String tenantId;
    private final String apiUrl;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public ConversationManagement() {
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
     * List conversations with optional filtering.
     */
    public JsonNode listConversations(Map<String, String> options) throws Exception {
        Map<String, String> params = new HashMap<>();
        params.put("page", options.getOrDefault("page", "1"));
        params.put("page_size", options.getOrDefault("page_size", "20"));

        if (options.containsKey("status")) {
            params.put("status", options.get("status"));
        }
        if (options.containsKey("needs_reply")) {
            params.put("needs_reply", options.get("needs_reply"));
        }
        if (options.containsKey("assigned_to")) {
            params.put("assigned_to", options.get("assigned_to"));
        }
        if (options.containsKey("channel")) {
            params.put("channel", options.get("channel"));
        }

        String queryString = params.entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "=" +
                         URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/conversations?" + queryString))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }

    /**
     * Get a single conversation by ID.
     */
    public JsonNode getConversation(String conversationId) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/conversations/" + conversationId))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }

    /**
     * Update a conversation (e.g., assign to a user).
     */
    public JsonNode updateConversation(String conversationId, String assignedTo) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        if (assignedTo != null) {
            payload.put("assigned_to", assignedTo);
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/conversations/" + conversationId))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }

    /**
     * Close a conversation.
     */
    public JsonNode closeConversation(String conversationId) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/conversations/" + conversationId + "/close"))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }

    private void printSeparator() {
        System.out.println("============================================================");
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

        try {
            // Example 1: List all open conversations that need a reply
            printSeparator();
            System.out.println("Listing open conversations that need a reply...");
            printSeparator();

            Map<String, String> options = new HashMap<>();
            options.put("status", "open");
            options.put("needs_reply", "true");
            options.put("page_size", "5");

            JsonNode result = listConversations(options);
            JsonNode pagination = result.get("pagination");

            System.out.println("Found " + pagination.get("total").asInt() + " conversations");
            System.out.println("Page " + pagination.get("page").asInt() + " of " + pagination.get("total_pages").asInt());
            System.out.println();

            JsonNode items = result.get("items");
            for (JsonNode conv : items) {
                System.out.println("  ID: " + conv.get("id").asText());
                System.out.println("  Channel: " + conv.get("channel").asText());
                System.out.println("  Status: " + conv.get("status").asText());
                String lastMsg = conv.has("last_message_at") && !conv.get("last_message_at").isNull()
                        ? conv.get("last_message_at").asText() : "N/A";
                System.out.println("  Last message: " + lastMsg);
                System.out.println();
            }

            // Example 2: Get a single conversation (if we have any)
            if (items.size() > 0) {
                String conversationId = items.get(0).get("id").asText();

                printSeparator();
                System.out.println("Getting conversation details: " + conversationId);
                printSeparator();

                JsonNode conversation = getConversation(conversationId);
                System.out.println("  ID: " + conversation.get("id").asText());
                System.out.println("  Channel: " + conversation.get("channel").asText());
                System.out.println("  Status: " + conversation.get("status").asText());
                System.out.println("  Needs reply: " + conversation.get("needs_reply").asBoolean());
                String assignedTo = conversation.has("assigned_to") && !conversation.get("assigned_to").isNull()
                        ? conversation.get("assigned_to").asText() : "Unassigned";
                System.out.println("  Assigned to: " + assignedTo);
                if (conversation.has("contact") && !conversation.get("contact").isNull()) {
                    JsonNode contact = conversation.get("contact");
                    String name = contact.has("name") && !contact.get("name").isNull()
                            ? contact.get("name").asText() : "Unknown";
                    System.out.println("  Contact: " + name);
                }
                System.out.println();

                // Example 3: Demonstrate update (commented out to avoid modifying data)
                // Uncomment to actually assign a conversation
                // printSeparator();
                // System.out.println("Assigning conversation to user...");
                // printSeparator();
                // String userId = "your-user-id-here";
                // JsonNode updated = updateConversation(conversationId, userId);
                // System.out.println("  Assigned to: " + updated.get("assigned_to").asText());
                // System.out.println();

                // Example 4: Demonstrate close (commented out to avoid modifying data)
                // Uncomment to actually close the conversation
                // printSeparator();
                // System.out.println("Closing conversation...");
                // printSeparator();
                // JsonNode closed = closeConversation(conversationId);
                // System.out.println("  Status: " + closed.get("status").asText());
                // System.out.println("  Closed at: " + closed.get("closed_at").asText());
            }

            printSeparator();
            System.out.println("Conversation management examples completed!");
            printSeparator();

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            System.exit(1);
        }
    }

    public static void main(String[] args) {
        new ConversationManagement().run();
    }
}
