/**
 * SendSeven API - Echo Bot Example (Java/Spring Boot)
 *
 * A simple bot that automatically replies to incoming messages.
 */

package com.sendseven.examples;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

@SpringBootApplication
@RestController
public class EchoBotController {

    private static final String API_TOKEN = System.getenv("SENDSEVEN_API_TOKEN") != null
            ? System.getenv("SENDSEVEN_API_TOKEN") : "";
    private static final String TENANT_ID = System.getenv("SENDSEVEN_TENANT_ID") != null
            ? System.getenv("SENDSEVEN_TENANT_ID") : "";
    private static final String API_URL = System.getenv("SENDSEVEN_API_URL") != null
            ? System.getenv("SENDSEVEN_API_URL") : "https://api.sendseven.com/api/v1";
    private static final String WEBHOOK_SECRET = System.getenv("WEBHOOK_SECRET") != null
            ? System.getenv("WEBHOOK_SECRET") : "";

    // Track processed deliveries (use Redis/database in production)
    private final Set<String> processedDeliveries = new HashSet<>();

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public static void main(String[] args) {
        // Validate configuration
        if (API_TOKEN.isEmpty()) {
            System.err.println("Error: SENDSEVEN_API_TOKEN environment variable is required");
            System.exit(1);
        }
        if (TENANT_ID.isEmpty()) {
            System.err.println("Error: SENDSEVEN_TENANT_ID environment variable is required");
            System.exit(1);
        }
        if (WEBHOOK_SECRET.isEmpty()) {
            System.out.println("Warning: WEBHOOK_SECRET not set - signatures will not be verified!");
        }

        System.out.println("Starting Echo Bot...");
        SpringApplication.run(EchoBotController.class, args);
    }

    @PostMapping("/webhooks/sendseven")
    public ResponseEntity<Map<String, Object>> handleWebhook(
            @RequestHeader(value = "X-Sendseven-Signature", required = false) String signature,
            @RequestHeader(value = "X-Sendseven-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "X-Sendseven-Delivery-Id", required = false) String deliveryId,
            @RequestBody String payload
    ) {
        // Verify required headers
        if (signature == null || timestamp == null || deliveryId == null) {
            System.out.println("Missing required webhook headers");
            return ResponseEntity.badRequest().body(Map.of("error", "Missing required headers"));
        }

        // Check for duplicate (idempotency)
        if (processedDeliveries.contains(deliveryId)) {
            System.out.println("Duplicate delivery " + deliveryId + ", skipping");
            return ResponseEntity.ok(Map.of("success", true, "duplicate", true));
        }

        // Verify signature
        if (!WEBHOOK_SECRET.isEmpty() && !verifySignature(payload, signature, timestamp)) {
            System.out.println("Invalid signature for delivery " + deliveryId);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid signature"));
        }

        try {
            JsonNode data = objectMapper.readTree(payload);
            String type = data.path("type").asText("");

            // Only process message.received events
            if (!"message.received".equals(type)) {
                return ResponseEntity.ok(Map.of("success", true, "skipped", true));
            }

            // Extract message details
            JsonNode message = data.path("data").path("message");
            JsonNode contact = data.path("data").path("contact");

            // Only respond to inbound messages (avoid loops)
            String direction = message.path("direction").asText("");
            if (!"inbound".equals(direction)) {
                return ResponseEntity.ok(Map.of("success", true, "skipped", "outbound"));
            }

            String conversationId = message.path("conversation_id").asText("");
            String messageType = message.path("message_type").asText("text");
            String messageText = message.path("text").asText("");
            String contactName = contact.path("name").asText("there");

            String preview = messageText.length() > 50 ? messageText.substring(0, 50) : messageText;
            if (preview.isEmpty()) preview = "[media]";
            System.out.printf("Received message from %s: %s%n", contactName, preview);

            // Generate and send reply
            String replyText = generateReply(messageType, messageText);

            try {
                JsonNode result = sendReply(conversationId, replyText);
                System.out.println("Reply sent: " + result.path("id").asText());
                processedDeliveries.add(deliveryId);
            } catch (Exception e) {
                System.err.println("Failed to send reply: " + e.getMessage());
            }

        } catch (Exception e) {
            System.err.println("Error processing webhook: " + e.getMessage());
        }

        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    private boolean verifySignature(String payload, String signature, String timestamp) {
        if (!signature.startsWith("sha256=")) {
            return false;
        }
        String providedSig = signature.substring(7);

        try {
            // Parse and re-serialize with sorted keys
            JsonNode node = objectMapper.readTree(payload);
            String jsonPayload = objectMapper.writeValueAsString(sortJsonNode(node));

            // Reconstruct message
            String message = timestamp + "." + jsonPayload;

            // Compute HMAC-SHA256
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(
                    WEBHOOK_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKeySpec);
            byte[] hash = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));

            // Convert to hex
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            String expectedSig = hexString.toString();

            // Timing-safe comparison
            return MessageDigest.isEqual(
                    expectedSig.getBytes(StandardCharsets.UTF_8),
                    providedSig.getBytes(StandardCharsets.UTF_8)
            );
        } catch (Exception e) {
            System.err.println("Signature verification error: " + e.getMessage());
            return false;
        }
    }

    private Object sortJsonNode(JsonNode node) {
        if (node.isObject()) {
            TreeMap<String, Object> sortedMap = new TreeMap<>();
            node.fields().forEachRemaining(entry ->
                    sortedMap.put(entry.getKey(), sortJsonNode(entry.getValue())));
            return sortedMap;
        } else if (node.isArray()) {
            return node;
        }
        return node;
    }

    private String generateReply(String messageType, String messageText) {
        switch (messageType) {
            case "text":
                return messageText.isEmpty() ? "I received your message!" : "You said: \"" + messageText + "\"";
            case "image":
                return "I received your image! \uD83D\uDCF7";
            case "audio":
                return "I received your audio message! \uD83C\uDFB5";
            case "video":
                return "I received your video! \uD83C\uDFAC";
            case "document":
                return "I received your document! \uD83D\uDCC4";
            default:
                return "I received your message!";
        }
    }

    private JsonNode sendReply(String conversationId, String text) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("conversation_id", conversationId);
        payload.put("text", text);
        payload.put("message_type", "text");

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(API_URL + "/messages"))
                .header("Authorization", "Bearer " + API_TOKEN)
                .header("X-Tenant-ID", TENANT_ID)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }
}
