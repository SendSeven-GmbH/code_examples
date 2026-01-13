/**
 * SendSeven API - Webhook Listener Example (Java/Spring Boot)
 *
 * Demonstrates how to receive and verify SendSeven webhook events.
 */

package com.sendseven.examples;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.TreeMap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootApplication
@RestController
public class WebhookController {

    private static final String WEBHOOK_SECRET = System.getenv("WEBHOOK_SECRET") != null
            ? System.getenv("WEBHOOK_SECRET") : "";

    private final ObjectMapper objectMapper = new ObjectMapper();

    public static void main(String[] args) {
        if (WEBHOOK_SECRET.isEmpty()) {
            System.out.println("Warning: WEBHOOK_SECRET not set - signatures will not be verified!");
        }
        SpringApplication.run(WebhookController.class, args);
    }

    @PostMapping("/webhooks/sendseven")
    public ResponseEntity<Map<String, Object>> handleWebhook(
            @RequestHeader(value = "X-Sendseven-Signature", required = false) String signature,
            @RequestHeader(value = "X-Sendseven-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "X-Sendseven-Delivery-Id", required = false) String deliveryId,
            @RequestHeader(value = "X-Sendseven-Event", required = false) String eventType,
            @RequestBody String payload
    ) {
        // Verify required headers
        if (signature == null || timestamp == null || deliveryId == null || eventType == null) {
            System.out.println("Missing required webhook headers");
            return ResponseEntity.badRequest().body(Map.of("error", "Missing required headers"));
        }

        // Verify signature
        if (!WEBHOOK_SECRET.isEmpty() && !verifySignature(payload, signature, timestamp)) {
            System.out.println("Invalid signature for delivery " + deliveryId);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid signature"));
        }

        try {
            JsonNode data = objectMapper.readTree(payload);
            String type = data.path("type").asText("");
            String tenantId = data.path("tenant_id").asText("");

            System.out.printf("Webhook received: delivery_id=%s, event=%s, tenant=%s%n",
                    deliveryId, type, tenantId);

            // Handle different event types
            switch (type) {
                case "message.received":
                    handleMessageReceived(data);
                    break;
                case "message.sent":
                    handleMessageSent(data);
                    break;
                case "message.delivered":
                    handleMessageDelivered(data);
                    break;
                case "message.failed":
                    handleMessageFailed(data);
                    break;
                case "conversation.created":
                    handleConversationCreated(data);
                    break;
                case "conversation.closed":
                    handleConversationClosed(data);
                    break;
                case "contact.created":
                    handleContactCreated(data);
                    break;
                default:
                    System.out.println("  Unknown event type: " + type);
            }
        } catch (Exception e) {
            System.err.println("Error processing webhook: " + e.getMessage());
        }

        return ResponseEntity.ok(Map.of("success", true, "delivery_id", deliveryId));
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

    private void handleMessageReceived(JsonNode payload) {
        JsonNode message = payload.path("data").path("message");
        JsonNode contact = payload.path("data").path("contact");
        String name = contact.path("name").asText("Unknown");
        String text = message.path("text").asText("");
        if (text.length() > 50) text = text.substring(0, 50);
        System.out.printf("  Message received from %s: %s%n", name, text);
    }

    private void handleMessageSent(JsonNode payload) {
        String messageId = payload.path("data").path("message").path("id").asText();
        System.out.println("  Message sent: " + messageId);
    }

    private void handleMessageDelivered(JsonNode payload) {
        String messageId = payload.path("data").path("message").path("id").asText();
        System.out.println("  Message delivered: " + messageId);
    }

    private void handleMessageFailed(JsonNode payload) {
        String messageId = payload.path("data").path("message").path("id").asText();
        String error = payload.path("data").path("error").path("message").asText("Unknown error");
        System.out.printf("  Message failed: %s - %s%n", messageId, error);
    }

    private void handleConversationCreated(JsonNode payload) {
        String convId = payload.path("data").path("conversation").path("id").asText();
        System.out.println("  Conversation created: " + convId);
    }

    private void handleConversationClosed(JsonNode payload) {
        String convId = payload.path("data").path("conversation").path("id").asText();
        System.out.println("  Conversation closed: " + convId);
    }

    private void handleContactCreated(JsonNode payload) {
        JsonNode contact = payload.path("data").path("contact");
        String name = contact.path("name").asText("Unknown");
        String phone = contact.path("phone").asText("No phone");
        System.out.printf("  Contact created: %s (%s)%n", name, phone);
    }
}
