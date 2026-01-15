// SendSeven API - Webhook Listener Example (Go)
//
// Demonstrates how to receive and verify SendSeven webhook events.
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/joho/godotenv"
)

var webhookSecret string
var logPayloads bool

// WebhookPayload represents the incoming webhook structure
type WebhookPayload struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	CreatedAt string                 `json:"created_at"`
	TenantID  string                 `json:"tenant_id"`
	EventID   string                 `json:"event_id"`
	Data      map[string]interface{} `json:"data"`
}

func init() {
	godotenv.Load()
	webhookSecret = os.Getenv("WEBHOOK_SECRET")
	logPayloadsEnv := strings.ToLower(os.Getenv("LOG_PAYLOADS"))
	logPayloads = logPayloadsEnv == "true" || logPayloadsEnv == "1" || logPayloadsEnv == "yes"
}

// verifySignature verifies the webhook HMAC-SHA256 signature
func verifySignature(payload []byte, signature, timestamp string) bool {
	if len(signature) < 8 || signature[:7] != "sha256=" {
		return false
	}
	providedSig := signature[7:]

	// Parse and re-serialize with sorted keys
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return false
	}

	jsonPayload, err := marshalSorted(data)
	if err != nil {
		return false
	}

	// Reconstruct message
	message := timestamp + "." + string(jsonPayload)

	// Compute expected signature
	h := hmac.New(sha256.New, []byte(webhookSecret))
	h.Write([]byte(message))
	expectedSig := hex.EncodeToString(h.Sum(nil))

	return hmac.Equal([]byte(expectedSig), []byte(providedSig))
}

// marshalSorted marshals a map with sorted keys
func marshalSorted(data map[string]interface{}) ([]byte, error) {
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	return json.Marshal(data)
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read body first
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error": "Failed to read body"}`, http.StatusBadRequest)
		return
	}

	// Parse payload to check for verification challenge
	var payload WebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, `{"error": "Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Handle verification challenges (no signature verification needed)
	// SendSeven sends this when you create/update a webhook to verify ownership
	if payload.Type == "sendseven_verification" {
		challenge := payload.Data["challenge"].(string)
		log.Printf("Verification challenge received: %s...", challenge[:8])
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"challenge": challenge})
		return
	}

	// Get headers for regular events
	signature := r.Header.Get("X-Sendseven-Signature")
	timestamp := r.Header.Get("X-Sendseven-Timestamp")
	deliveryID := r.Header.Get("X-Sendseven-Delivery-Id")
	eventType := r.Header.Get("X-Sendseven-Event")

	// Verify required headers
	if signature == "" || timestamp == "" || deliveryID == "" || eventType == "" {
		log.Println("Missing required webhook headers")
		http.Error(w, `{"error": "Missing required headers"}`, http.StatusBadRequest)
		return
	}

	// Verify signature
	if webhookSecret != "" && !verifySignature(body, signature, timestamp) {
		log.Printf("Invalid signature for delivery %s", deliveryID)
		http.Error(w, `{"error": "Invalid signature"}`, http.StatusUnauthorized)
		return
	}

	log.Printf("Webhook received: delivery_id=%s, event=%s, tenant=%s",
		deliveryID, payload.Type, payload.TenantID)

	// Log full payload if debugging is enabled
	if logPayloads {
		prettyJSON, _ := json.MarshalIndent(payload, "", "  ")
		log.Printf("Full payload:\n%s", string(prettyJSON))
	}

	// Handle different event types
	switch payload.Type {
	case "message.received":
		handleMessageReceived(payload)
	case "message.sent":
		handleMessageSent(payload)
	case "message.delivered":
		handleMessageDelivered(payload)
	case "message.failed":
		handleMessageFailed(payload)
	case "conversation.created":
		handleConversationCreated(payload)
	case "conversation.closed":
		handleConversationClosed(payload)
	case "conversation.assigned":
		handleConversationAssigned(payload)
	case "contact.created":
		handleContactCreated(payload)
	case "contact.updated":
		handleContactUpdated(payload)
	case "contact.deleted":
		handleContactDeleted(payload)
	case "contact.subscribed":
		handleContactSubscribed(payload)
	case "contact.unsubscribed":
		handleContactUnsubscribed(payload)
	case "link.clicked":
		handleLinkClicked(payload)
	default:
		log.Printf("  Unknown event type: %s", payload.Type)
	}

	// Return 200 OK
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"delivery_id": deliveryID,
	})
}

func handleMessageReceived(payload WebhookPayload) {
	data := payload.Data
	if message, ok := data["message"].(map[string]interface{}); ok {
		contact := data["contact"].(map[string]interface{})
		name := "Unknown"
		if n, ok := contact["name"].(string); ok {
			name = n
		}
		text := ""
		if t, ok := message["text"].(string); ok && len(t) > 50 {
			text = t[:50]
		} else if t, ok := message["text"].(string); ok {
			text = t
		}
		log.Printf("  Message received from %s: %s", name, text)
	}
}

func handleMessageSent(payload WebhookPayload) {
	if message, ok := payload.Data["message"].(map[string]interface{}); ok {
		log.Printf("  Message sent: %v", message["id"])
	}
}

func handleMessageDelivered(payload WebhookPayload) {
	if message, ok := payload.Data["message"].(map[string]interface{}); ok {
		log.Printf("  Message delivered: %v", message["id"])
	}
}

func handleMessageFailed(payload WebhookPayload) {
	if message, ok := payload.Data["message"].(map[string]interface{}); ok {
		errMsg := "Unknown error"
		if e, ok := payload.Data["error"].(map[string]interface{}); ok {
			if m, ok := e["message"].(string); ok {
				errMsg = m
			}
		}
		log.Printf("  Message failed: %v - %s", message["id"], errMsg)
	}
}

func handleConversationCreated(payload WebhookPayload) {
	if conv, ok := payload.Data["conversation"].(map[string]interface{}); ok {
		log.Printf("  Conversation created: %v", conv["id"])
	}
}

func handleConversationClosed(payload WebhookPayload) {
	if conv, ok := payload.Data["conversation"].(map[string]interface{}); ok {
		log.Printf("  Conversation closed: %v", conv["id"])
	}
}

func handleConversationAssigned(payload WebhookPayload) {
	if conv, ok := payload.Data["conversation"].(map[string]interface{}); ok {
		assignedTo := payload.Data["assigned_to"].(map[string]interface{})
		name := "Unknown"
		if n, ok := assignedTo["name"].(string); ok {
			name = n
		}
		log.Printf("  Conversation %v assigned to %s", conv["id"], name)
	}
}

func handleContactCreated(payload WebhookPayload) {
	if contact, ok := payload.Data["contact"].(map[string]interface{}); ok {
		name := "Unknown"
		if n, ok := contact["name"].(string); ok {
			name = n
		}
		phone := "No phone"
		if p, ok := contact["phone"].(string); ok {
			phone = p
		}
		log.Printf("  Contact created: %s (%s)", name, phone)
	}
}

func handleContactUpdated(payload WebhookPayload) {
	if contact, ok := payload.Data["contact"].(map[string]interface{}); ok {
		log.Printf("  Contact updated: %v", contact["id"])
	}
}

func handleContactDeleted(payload WebhookPayload) {
	if contact, ok := payload.Data["contact"].(map[string]interface{}); ok {
		name := "Unknown"
		if n, ok := contact["name"].(string); ok {
			name = n
		}
		log.Printf("  Contact deleted: %v (%s)", contact["id"], name)
	}
}

func handleContactSubscribed(payload WebhookPayload) {
	if contact, ok := payload.Data["contact"].(map[string]interface{}); ok {
		name := "Unknown"
		if n, ok := contact["name"].(string); ok {
			name = n
		}
		subscription := payload.Data["subscription"].(map[string]interface{})
		log.Printf("  Contact %s subscribed to list %v", name, subscription["list_id"])
	}
}

func handleContactUnsubscribed(payload WebhookPayload) {
	if contact, ok := payload.Data["contact"].(map[string]interface{}); ok {
		name := "Unknown"
		if n, ok := contact["name"].(string); ok {
			name = n
		}
		subscription := payload.Data["subscription"].(map[string]interface{})
		log.Printf("  Contact %s unsubscribed from list %v", name, subscription["list_id"])
	}
}

func handleLinkClicked(payload WebhookPayload) {
	link := payload.Data["link"].(map[string]interface{})
	contact := payload.Data["contact"].(map[string]interface{})
	url := "Unknown URL"
	if u, ok := link["url"].(string); ok {
		url = u
	}
	name := "Unknown"
	if n, ok := contact["name"].(string); ok {
		name = n
	}
	log.Printf("  Link clicked: %s by %s", url, name)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	if webhookSecret == "" {
		log.Println("Warning: WEBHOOK_SECRET not set - signatures will not be verified!")
	}

	http.HandleFunc("/webhooks/sendseven", webhookHandler)

	log.Printf("Webhook server listening on port %s", port)
	if logPayloads {
		log.Println("Payload logging: ENABLED")
	} else {
		log.Println("Payload logging: disabled")
	}
	log.Printf("Webhook endpoint: http://localhost:%s/webhooks/sendseven", port)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
