/**
 * SendSeven API - WhatsApp Templates Example (Java)
 *
 * Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
 * Features:
 * - List available templates
 * - Send template with text parameters
 * - Send template with header (image/document)
 * - Handle template categories (marketing, utility, authentication)
 * - Error handling for template not found, unapproved templates
 */

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

public class WhatsAppTemplates {

    private final String apiToken;
    private final String tenantId;
    private final String apiUrl;
    private final String channelId;
    private final String contactId;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public WhatsAppTemplates() {
        // Load configuration from environment or .env file
        loadEnvFile();

        this.apiToken = getEnv("SENDSEVEN_API_TOKEN", null);
        this.tenantId = getEnv("SENDSEVEN_TENANT_ID", null);
        this.apiUrl = getEnv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1");
        this.channelId = getEnv("CHANNEL_ID", null);
        this.contactId = getEnv("CONTACT_ID", null);

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
     * List available WhatsApp templates.
     *
     * @param category Filter by category (MARKETING, UTILITY, AUTHENTICATION) - can be null
     * @param status Filter by status (default: APPROVED)
     * @return List of template objects as JsonNode
     * @throws Exception If the API request fails
     */
    public List<JsonNode> listTemplates(String category, String status) throws Exception {
        if (status == null || status.isEmpty()) {
            status = "APPROVED";
        }

        StringBuilder queryString = new StringBuilder();
        queryString.append("status=").append(URLEncoder.encode(status, StandardCharsets.UTF_8));
        if (category != null && !category.isEmpty()) {
            queryString.append("&category=").append(URLEncoder.encode(category, StandardCharsets.UTF_8));
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/whatsapp/templates?" + queryString))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        JsonNode root = objectMapper.readTree(response.body());
        List<JsonNode> templates = new ArrayList<>();

        // Check if response has "items" field (paginated response)
        if (root.has("items") && root.get("items").isArray()) {
            for (JsonNode template : root.get("items")) {
                templates.add(template);
            }
        } else if (root.isArray()) {
            // Response is a direct array
            for (JsonNode template : root) {
                templates.add(template);
            }
        }

        return templates;
    }

    /**
     * Send a WhatsApp template message.
     *
     * @param channelId The UUID of the WhatsApp channel
     * @param contactId The UUID of the contact to send to
     * @param templateName Name of the approved template
     * @param languageCode Language code (default: en)
     * @param components Template components with parameters (can be null)
     * @return The created message as a JsonNode
     * @throws Exception If the API request fails
     */
    public JsonNode sendTemplateMessage(String channelId, String contactId, String templateName,
                                        String languageCode, ArrayNode components) throws Exception {
        if (languageCode == null || languageCode.isEmpty()) {
            languageCode = "en";
        }

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("channel_id", channelId);
        payload.put("contact_id", contactId);
        payload.put("template_name", templateName);
        payload.put("language_code", languageCode);

        if (components != null && components.size() > 0) {
            payload.set("components", components);
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/messages/send/template"))
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

    /**
     * Send a template message with text parameters in the body.
     *
     * @param channelId The UUID of the WhatsApp channel
     * @param contactId The UUID of the contact
     * @param templateName Name of the approved template
     * @param bodyParams List of text values for body placeholders
     * @param languageCode Language code (default: en)
     * @return The created message as a JsonNode
     * @throws Exception If the API request fails
     */
    public JsonNode sendTemplateWithTextParams(String channelId, String contactId, String templateName,
                                               List<String> bodyParams, String languageCode) throws Exception {
        ArrayNode components = objectMapper.createArrayNode();
        ObjectNode bodyComponent = objectMapper.createObjectNode();
        bodyComponent.put("type", "body");

        ArrayNode parameters = objectMapper.createArrayNode();
        for (String param : bodyParams) {
            ObjectNode textParam = objectMapper.createObjectNode();
            textParam.put("type", "text");
            textParam.put("text", param);
            parameters.add(textParam);
        }
        bodyComponent.set("parameters", parameters);
        components.add(bodyComponent);

        return sendTemplateMessage(channelId, contactId, templateName, languageCode, components);
    }

    /**
     * Send a template message with an image header.
     *
     * @param channelId The UUID of the WhatsApp channel
     * @param contactId The UUID of the contact
     * @param templateName Name of the approved template
     * @param imageUrl URL of the header image
     * @param bodyParams Optional list of text values for body placeholders (can be null)
     * @param languageCode Language code (default: en)
     * @return The created message as a JsonNode
     * @throws Exception If the API request fails
     */
    public JsonNode sendTemplateWithHeaderImage(String channelId, String contactId, String templateName,
                                                String imageUrl, List<String> bodyParams, String languageCode) throws Exception {
        ArrayNode components = objectMapper.createArrayNode();

        // Header component with image
        ObjectNode headerComponent = objectMapper.createObjectNode();
        headerComponent.put("type", "header");
        ArrayNode headerParams = objectMapper.createArrayNode();
        ObjectNode imageParam = objectMapper.createObjectNode();
        imageParam.put("type", "image");
        ObjectNode imageObj = objectMapper.createObjectNode();
        imageObj.put("link", imageUrl);
        imageParam.set("image", imageObj);
        headerParams.add(imageParam);
        headerComponent.set("parameters", headerParams);
        components.add(headerComponent);

        // Body component with text params
        if (bodyParams != null && !bodyParams.isEmpty()) {
            ObjectNode bodyComponent = objectMapper.createObjectNode();
            bodyComponent.put("type", "body");
            ArrayNode bodyParamsArray = objectMapper.createArrayNode();
            for (String param : bodyParams) {
                ObjectNode textParam = objectMapper.createObjectNode();
                textParam.put("type", "text");
                textParam.put("text", param);
                bodyParamsArray.add(textParam);
            }
            bodyComponent.set("parameters", bodyParamsArray);
            components.add(bodyComponent);
        }

        return sendTemplateMessage(channelId, contactId, templateName, languageCode, components);
    }

    /**
     * Send a template message with a document header.
     *
     * @param channelId The UUID of the WhatsApp channel
     * @param contactId The UUID of the contact
     * @param templateName Name of the approved template
     * @param documentUrl URL of the document
     * @param filename Display filename for the document
     * @param bodyParams Optional list of text values for body placeholders (can be null)
     * @param languageCode Language code (default: en)
     * @return The created message as a JsonNode
     * @throws Exception If the API request fails
     */
    public JsonNode sendTemplateWithHeaderDocument(String channelId, String contactId, String templateName,
                                                   String documentUrl, String filename, List<String> bodyParams,
                                                   String languageCode) throws Exception {
        ArrayNode components = objectMapper.createArrayNode();

        // Header component with document
        ObjectNode headerComponent = objectMapper.createObjectNode();
        headerComponent.put("type", "header");
        ArrayNode headerParams = objectMapper.createArrayNode();
        ObjectNode docParam = objectMapper.createObjectNode();
        docParam.put("type", "document");
        ObjectNode docObj = objectMapper.createObjectNode();
        docObj.put("link", documentUrl);
        docObj.put("filename", filename);
        docParam.set("document", docObj);
        headerParams.add(docParam);
        headerComponent.set("parameters", headerParams);
        components.add(headerComponent);

        // Body component with text params
        if (bodyParams != null && !bodyParams.isEmpty()) {
            ObjectNode bodyComponent = objectMapper.createObjectNode();
            bodyComponent.put("type", "body");
            ArrayNode bodyParamsArray = objectMapper.createArrayNode();
            for (String param : bodyParams) {
                ObjectNode textParam = objectMapper.createObjectNode();
                textParam.put("type", "text");
                textParam.put("text", param);
                bodyParamsArray.add(textParam);
            }
            bodyComponent.set("parameters", bodyParamsArray);
            components.add(bodyComponent);
        }

        return sendTemplateMessage(channelId, contactId, templateName, languageCode, components);
    }

    /**
     * Handle and display template-specific errors.
     *
     * @param error The exception object
     */
    private void handleTemplateError(Exception error) {
        String message = error.getMessage();
        Pattern pattern = Pattern.compile("API Error (\\d+)");
        Matcher matcher = pattern.matcher(message);
        int statusCode = 0;
        if (matcher.find()) {
            statusCode = Integer.parseInt(matcher.group(1));
        }

        if (statusCode == 404) {
            System.out.println("Template not found: " + message);
            System.out.println("Tip: Verify the template name exists and is approved");
        } else if (statusCode == 400) {
            if (message.toLowerCase().contains("not approved")) {
                System.out.println("Template not approved: " + message);
                System.out.println("Tip: Only APPROVED templates can be sent");
            } else if (message.toLowerCase().contains("parameter")) {
                System.out.println("Parameter mismatch: " + message);
                System.out.println("Tip: Ensure the number of parameters matches the template");
            } else {
                System.out.println("Bad request: " + message);
            }
        } else if (statusCode == 401) {
            System.out.println("Authentication failed: Check your API token");
        } else if (statusCode == 403) {
            System.out.println("Permission denied: Token may lack required scopes");
        } else {
            System.out.println("Error: " + message);
        }
    }

    /**
     * Validate required configuration.
     *
     * @return true if all required variables are set
     */
    private boolean validateConfig() {
        List<String> missing = new ArrayList<>();
        if (apiToken == null || apiToken.isEmpty()) missing.add("SENDSEVEN_API_TOKEN");
        if (tenantId == null || tenantId.isEmpty()) missing.add("SENDSEVEN_TENANT_ID");
        if (channelId == null || channelId.isEmpty()) missing.add("CHANNEL_ID");
        if (contactId == null || contactId.isEmpty()) missing.add("CONTACT_ID");

        if (!missing.isEmpty()) {
            System.err.println("Error: Missing required environment variables:");
            for (String var : missing) {
                System.err.println("  - " + var);
            }
            return false;
        }
        return true;
    }

    public void run() {
        if (!validateConfig()) {
            System.exit(1);
        }

        // Example 1: List all approved templates
        System.out.println("=".repeat(60));
        System.out.println("Listing approved WhatsApp templates...");
        System.out.println("=".repeat(60));

        List<JsonNode> templates;
        try {
            templates = listTemplates(null, "APPROVED");
            if (templates.isEmpty()) {
                System.out.println("No approved templates found.");
                System.out.println("Create templates in the WhatsApp Business Manager first.");
                return;
            }

            System.out.println("Found " + templates.size() + " template(s):\n");
            int count = Math.min(templates.size(), 5);
            for (int i = 0; i < count; i++) {
                JsonNode t = templates.get(i);
                System.out.println("  Name: " + t.get("name").asText());
                System.out.println("  Category: " + t.get("category").asText());
                System.out.println("  Language: " + t.get("language").asText());
                System.out.println("  Status: " + t.get("status").asText());
                System.out.println();
            }
        } catch (Exception e) {
            handleTemplateError(e);
            return;
        }

        // Example 2: List templates by category
        System.out.println("=".repeat(60));
        System.out.println("Listing MARKETING templates...");
        System.out.println("=".repeat(60));

        try {
            List<JsonNode> marketingTemplates = listTemplates("MARKETING", "APPROVED");
            System.out.println("Found " + marketingTemplates.size() + " marketing template(s)");
        } catch (Exception e) {
            handleTemplateError(e);
        }

        // Example 3: Send a template with text parameters
        System.out.println("\n" + "=".repeat(60));
        System.out.println("Sending template with text parameters...");
        System.out.println("=".repeat(60));

        try {
            List<String> bodyParams = List.of("John Doe", "ORD-12345");
            JsonNode message = sendTemplateWithTextParams(
                    channelId,
                    contactId,
                    "order_confirmation",
                    bodyParams,
                    "en"
            );

            System.out.println("Template message sent successfully!");
            System.out.println("  Message ID: " + message.get("id").asText());
            System.out.println("  Status: " + message.get("status").asText());
        } catch (Exception e) {
            handleTemplateError(e);
            System.out.println("\nNote: Update template_name to match your approved template");
        }

        // Example 4: Send template with image header
        System.out.println("\n" + "=".repeat(60));
        System.out.println("Sending template with image header...");
        System.out.println("=".repeat(60));

        try {
            List<String> bodyParams = List.of("Summer Sale", "50%");
            JsonNode message = sendTemplateWithHeaderImage(
                    channelId,
                    contactId,
                    "promotion_with_image",
                    "https://example.com/promo-image.jpg",
                    bodyParams,
                    "en"
            );

            System.out.println("Template with image sent successfully!");
            System.out.println("  Message ID: " + message.get("id").asText());
        } catch (Exception e) {
            handleTemplateError(e);
            System.out.println("\nNote: Update template_name to match your approved template");
        }

        // Example 5: Send template with document header
        System.out.println("\n" + "=".repeat(60));
        System.out.println("Sending template with document header...");
        System.out.println("=".repeat(60));

        try {
            List<String> bodyParams = List.of("$199.99");
            JsonNode message = sendTemplateWithHeaderDocument(
                    channelId,
                    contactId,
                    "invoice_template",
                    "https://example.com/invoice.pdf",
                    "Invoice-2026-001.pdf",
                    bodyParams,
                    "en"
            );

            System.out.println("Template with document sent successfully!");
            System.out.println("  Message ID: " + message.get("id").asText());
        } catch (Exception e) {
            handleTemplateError(e);
            System.out.println("\nNote: Update template_name to match your approved template");
        }
    }

    public static void main(String[] args) {
        new WhatsAppTemplates().run();
    }
}
