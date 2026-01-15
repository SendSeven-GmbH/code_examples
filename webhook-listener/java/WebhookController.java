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
    private static final boolean LOG_PAYLOADS;

    static {
        String logPayloadsEnv = System.getenv("LOG_PAYLOADS");
        LOG_PAYLOADS = logPayloadsEnv != null &&
                (logPayloadsEnv.equalsIgnoreCase("true") ||
                 logPayloadsEnv.equals("1") ||
                 logPayloadsEnv.equalsIgnoreCase("yes"));
    }

    private final ObjectMapper objectMapper = new ObjectMapper();

    public static void main(String[] args) {
        if (WEBHOOK_SECRET.isEmpty()) {
            System.out.println("Warning: WEBHOOK_SECRET not set - signatures will not be verified!");
        }
        System.out.println("Payload logging: " + (LOG_PAYLOADS ? "ENABLED" : "disabled"));
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
        try {
            JsonNode data = objectMapper.readTree(payload);
            String type = data.path("type").asText("");

            // Handle verification challenges (no signature verification needed)
            // SendSeven sends this when you create/update a webhook to verify ownership
            if ("sendseven_verification".equals(type)) {
                String challenge = data.path("challenge").asText("");
                System.out.println("Verification challenge received: " + challenge.substring(0, 8) + "...");
                return ResponseEntity.ok(Map.of("challenge", challenge));
            }

            // Verify required headers for regular events
            if (signature == null || timestamp == null || deliveryId == null || eventType == null) {
                System.out.println("Missing required webhook headers");
                return ResponseEntity.badRequest().body(Map.of("error", "Missing required headers"));
            }

            // Verify signature
            if (!WEBHOOK_SECRET.isEmpty() && !verifySignature(payload, signature, timestamp)) {
                System.out.println("Invalid signature for delivery " + deliveryId);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid signature"));
            }

            String tenantId = data.path("tenant_id").asText("");

            System.out.printf("Webhook received: delivery_id=%s, event=%s, tenant=%s%n",
                    deliveryId, type, tenantId);

            // Log full payload if debugging is enabled
            if (LOG_PAYLOADS) {
                String prettyJson = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(data);
                System.out.println("Full payload:\n" + prettyJson);
            }

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
                case "conversation.assigned":
                    handleConversationAssigned(data);
                    break;
                case "contact.created":
                    handleContactCreated(data);
                    break;
                case "contact.updated":
                    handleContactUpdated(data);
                    break;
                case "contact.deleted":
                    handleContactDeleted(data);
                    break;
                case "contact.subscribed":
                    handleContactSubscribed(data);
                    break;
                case "contact.unsubscribed":
                    handleContactUnsubscribed(data);
                    break;
                case "link.clicked":
                    handleLinkClicked(data);
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

    private void handleConversationAssigned(JsonNode payload) {
        String convId = payload.path("data").path("conversation").path("id").asText();
        String assignedTo = payload.path("data").path("assigned_to").path("name").asText("Unknown");
        System.out.printf("  Conversation %s assigned to %s%n", convId, assignedTo);
    }

    private void handleContactCreated(JsonNode payload) {
        JsonNode contact = payload.path("data").path("contact");
        String name = contact.path("name").asText("Unknown");
        String phone = contact.path("phone").asText("No phone");
        System.out.printf("  Contact created: %s (%s)%n", name, phone);
    }

    private void handleContactUpdated(JsonNode payload) {
        String contactId = payload.path("data").path("contact").path("id").asText();
        System.out.println("  Contact updated: " + contactId);
    }

    private void handleContactDeleted(JsonNode payload) {
        JsonNode contact = payload.path("data").path("contact");
        String contactId = contact.path("id").asText();
        String name = contact.path("name").asText("Unknown");
        System.out.printf("  Contact deleted: %s (%s)%n", contactId, name);
    }

    private void handleContactSubscribed(JsonNode payload) {
        String name = payload.path("data").path("contact").path("name").asText("Unknown");
        String listId = payload.path("data").path("subscription").path("list_id").asText();
        System.out.printf("  Contact %s subscribed to list %s%n", name, listId);
    }

    private void handleContactUnsubscribed(JsonNode payload) {
        String name = payload.path("data").path("contact").path("name").asText("Unknown");
        String listId = payload.path("data").path("subscription").path("list_id").asText();
        System.out.printf("  Contact %s unsubscribed from list %s%n", name, listId);
    }

    private void handleLinkClicked(JsonNode payload) {
        String url = payload.path("data").path("link").path("url").asText("Unknown URL");
        String name = payload.path("data").path("contact").path("name").asText("Unknown");
        System.out.printf("  Link clicked: %s by %s%n", url, name);
    }
}
