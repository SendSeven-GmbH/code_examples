/**
 * SendSeven API - Send Message Example (Java)
 *
 * Demonstrates how to send a text message using the SendSeven API.
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

public class SendMessage {

    private final String apiToken;
    private final String tenantId;
    private final String apiUrl;
    private final String conversationId;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public SendMessage() {
        // Load configuration from environment or .env file
        loadEnvFile();

        this.apiToken = getEnv("SENDSEVEN_API_TOKEN", null);
        this.tenantId = getEnv("SENDSEVEN_TENANT_ID", null);
        this.apiUrl = getEnv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1");
        this.conversationId = getEnv("CONVERSATION_ID", null);

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
     * Send a text message to a conversation.
     *
     * @param conversationId The UUID of the conversation
     * @param text The message text to send
     * @return The created message as a JsonNode
     * @throws Exception If the API request fails
     */
    public JsonNode sendMessage(String conversationId, String text) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("conversation_id", conversationId);
        payload.put("text", text);
        payload.put("message_type", "text");

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/messages"))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
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

        if (conversationId == null || conversationId.isEmpty()) {
            System.err.println("Error: CONVERSATION_ID environment variable is required");
            System.exit(1);
        }

        System.out.println("Sending message to conversation: " + conversationId);

        try {
            JsonNode message = sendMessage(conversationId, "Hello from the SendSeven Java SDK! ☕");

            System.out.println("Message sent successfully!");
            System.out.println("  ID: " + message.get("id").asText());
            System.out.println("  Status: " + message.get("status").asText());
            System.out.println("  Created at: " + message.get("created_at").asText());
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            System.exit(1);
        }
    }

    public static void main(String[] args) {
        new SendMessage().run();
    }
}
