package com.sendseven.examples;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * SendSeven API - Interactive Messages Example
 *
 * Demonstrates how to send interactive messages (buttons, lists, quick replies)
 * using the SendSeven API.
 */
public class InteractiveMessages {

    // Configuration from environment
    private static String API_TOKEN;
    private static String TENANT_ID;
    private static String API_URL;
    private static String CHANNEL_ID;
    private static String CONTACT_ID;

    private static final HttpClient httpClient = HttpClient.newHttpClient();
    private static final ObjectMapper objectMapper = new ObjectMapper();

    public static void main(String[] args) {
        loadEnv();

        // Validate configuration
        if (API_TOKEN == null || API_TOKEN.isEmpty()) {
            System.out.println("Error: SENDSEVEN_API_TOKEN environment variable is required");
            System.exit(1);
        }

        if (TENANT_ID == null || TENANT_ID.isEmpty()) {
            System.out.println("Error: SENDSEVEN_TENANT_ID environment variable is required");
            System.exit(1);
        }

        if (CHANNEL_ID == null || CHANNEL_ID.isEmpty()) {
            System.out.println("Error: CHANNEL_ID environment variable is required");
            System.exit(1);
        }

        if (CONTACT_ID == null || CONTACT_ID.isEmpty()) {
            System.out.println("Error: CONTACT_ID environment variable is required");
            System.exit(1);
        }

        try {
            // 1. Check channel capabilities first
            System.out.println("Checking capabilities for channel: " + CHANNEL_ID);
            try {
                Map<String, Object> capabilities = checkChannelCapabilities(CHANNEL_ID);
                System.out.println("Channel type: " + capabilities.getOrDefault("channel_type", "unknown"));
                @SuppressWarnings("unchecked")
                Map<String, Object> caps = (Map<String, Object>) capabilities.getOrDefault("capabilities", new HashMap<>());
                System.out.println("  Buttons: " + caps.getOrDefault("interactive_buttons", false));
                System.out.println("  Lists: " + caps.getOrDefault("interactive_lists", false));
                System.out.println("  Quick Replies: " + caps.getOrDefault("quick_replies", false));
                System.out.println();
            } catch (Exception e) {
                System.out.println("Warning: Could not check capabilities: " + e.getMessage());
                System.out.println("Proceeding anyway...");
                System.out.println();
            }

            // 2. Send a button message
            System.out.println("Sending button message...");
            try {
                List<Map<String, String>> buttons = List.of(
                    Map.of("id", "yes", "title", "Yes"),
                    Map.of("id", "no", "title", "No"),
                    Map.of("id", "maybe", "title", "Maybe Later")
                );

                Map<String, Object> message = sendButtonMessage(
                    CHANNEL_ID,
                    CONTACT_ID,
                    "Would you like to proceed with your order?",
                    buttons
                );

                System.out.println("Button message sent successfully!");
                System.out.println("  ID: " + message.get("id"));
                System.out.println("  Status: " + message.get("status"));
                System.out.println();
            } catch (Exception e) {
                System.out.println("Button message failed: " + e.getMessage());
                System.out.println();
            }

            // 3. Send a list message
            System.out.println("Sending list message...");
            try {
                List<Map<String, Object>> sections = List.of(
                    Map.of(
                        "title", "Electronics",
                        "rows", List.of(
                            Map.of("id", "phones", "title", "Phones", "description", "Latest smartphones"),
                            Map.of("id", "laptops", "title", "Laptops", "description", "Portable computers")
                        )
                    ),
                    Map.of(
                        "title", "Accessories",
                        "rows", List.of(
                            Map.of("id", "cases", "title", "Cases", "description", "Protective cases"),
                            Map.of("id", "chargers", "title", "Chargers", "description", "Fast chargers")
                        )
                    )
                );

                Map<String, Object> message = sendListMessage(
                    CHANNEL_ID,
                    CONTACT_ID,
                    "Browse our product catalog:",
                    "View Products",
                    sections
                );

                System.out.println("List message sent successfully!");
                System.out.println("  ID: " + message.get("id"));
                System.out.println("  Status: " + message.get("status"));
                System.out.println();
            } catch (Exception e) {
                System.out.println("List message failed: " + e.getMessage());
                System.out.println();
            }

            // 4. Send a quick reply message
            System.out.println("Sending quick reply message...");
            try {
                List<Map<String, String>> quickReplies = List.of(
                    Map.of("id", "excellent", "title", "Excellent"),
                    Map.of("id", "good", "title", "Good"),
                    Map.of("id", "poor", "title", "Poor")
                );

                Map<String, Object> message = sendQuickReplyMessage(
                    CHANNEL_ID,
                    CONTACT_ID,
                    "How would you rate our service today?",
                    quickReplies
                );

                System.out.println("Quick reply message sent successfully!");
                System.out.println("  ID: " + message.get("id"));
                System.out.println("  Status: " + message.get("status"));
            } catch (Exception e) {
                System.out.println("Quick reply message failed: " + e.getMessage());
            }

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Load environment variables from .env file
     */
    private static void loadEnv() {
        // Try to load from .env file
        try {
            Path envPath = Path.of(".env");
            if (Files.exists(envPath)) {
                Files.readAllLines(envPath).forEach(line -> {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("#")) {
                        return;
                    }
                    int idx = line.indexOf('=');
                    if (idx > 0) {
                        String key = line.substring(0, idx).trim();
                        String value = line.substring(idx + 1).trim();
                        // Remove quotes if present
                        if ((value.startsWith("\"") && value.endsWith("\"")) ||
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.substring(1, value.length() - 1);
                        }
                        System.setProperty(key, value);
                    }
                });
            }
        } catch (IOException e) {
            // Ignore, will use system environment
        }

        // Load configuration
        API_TOKEN = getEnvOrProperty("SENDSEVEN_API_TOKEN");
        TENANT_ID = getEnvOrProperty("SENDSEVEN_TENANT_ID");
        API_URL = getEnvOrProperty("SENDSEVEN_API_URL");
        if (API_URL == null || API_URL.isEmpty()) {
            API_URL = "https://api.sendseven.com/api/v1";
        }
        CHANNEL_ID = getEnvOrProperty("CHANNEL_ID");
        CONTACT_ID = getEnvOrProperty("CONTACT_ID");
    }

    private static String getEnvOrProperty(String name) {
        String value = System.getenv(name);
        if (value == null || value.isEmpty()) {
            value = System.getProperty(name);
        }
        return value;
    }

    /**
     * Make an HTTP request to the API
     */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> makeRequest(String method, String url, Object body) throws IOException, InterruptedException {
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Authorization", "Bearer " + API_TOKEN)
            .header("X-Tenant-ID", TENANT_ID)
            .header("Content-Type", "application/json");

        if ("POST".equals(method) && body != null) {
            String jsonBody = objectMapper.writeValueAsString(body);
            requestBuilder.POST(HttpRequest.BodyPublishers.ofString(jsonBody));
        } else {
            requestBuilder.GET();
        }

        HttpResponse<String> response = httpClient.send(
            requestBuilder.build(),
            HttpResponse.BodyHandlers.ofString()
        );

        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readValue(response.body(), Map.class);
    }

    /**
     * Check what interactive message types a channel supports
     */
    private static Map<String, Object> checkChannelCapabilities(String channelId) throws IOException, InterruptedException {
        String url = API_URL + "/channels/" + channelId + "/capabilities";
        return makeRequest("GET", url, null);
    }

    /**
     * Send a button message to a contact
     */
    private static Map<String, Object> sendButtonMessage(
            String channelId,
            String contactId,
            String body,
            List<Map<String, String>> buttons) throws IOException, InterruptedException {

        String url = API_URL + "/messages/send/interactive";

        Map<String, Object> payload = new HashMap<>();
        payload.put("channel_id", channelId);
        payload.put("contact_id", contactId);
        payload.put("type", "buttons");
        payload.put("body", body);
        payload.put("buttons", buttons);

        return makeRequest("POST", url, payload);
    }

    /**
     * Send a list message with sections to a contact
     */
    private static Map<String, Object> sendListMessage(
            String channelId,
            String contactId,
            String body,
            String buttonText,
            List<Map<String, Object>> sections) throws IOException, InterruptedException {

        String url = API_URL + "/messages/send/interactive";

        Map<String, Object> payload = new HashMap<>();
        payload.put("channel_id", channelId);
        payload.put("contact_id", contactId);
        payload.put("type", "list");
        payload.put("body", body);
        payload.put("button_text", buttonText);
        payload.put("sections", sections);

        return makeRequest("POST", url, payload);
    }

    /**
     * Send a quick reply message to a contact
     */
    private static Map<String, Object> sendQuickReplyMessage(
            String channelId,
            String contactId,
            String body,
            List<Map<String, String>> buttons) throws IOException, InterruptedException {

        String url = API_URL + "/messages/send/interactive";

        Map<String, Object> payload = new HashMap<>();
        payload.put("channel_id", channelId);
        payload.put("contact_id", contactId);
        payload.put("type", "quick_reply");
        payload.put("body", body);
        payload.put("buttons", buttons);

        return makeRequest("POST", url, payload);
    }
}
