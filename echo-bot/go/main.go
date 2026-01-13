// SendSeven API - Echo Bot Example (Go)
//
// A simple bot that automatically replies to incoming messages.
package main

import (
	"bytes"
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
	"sync"

	"github.com/joho/godotenv"
)

var (
	apiToken      string
	tenantID      string
	apiURL        string
	webhookSecret string

	// Track processed deliveries (use Redis in production)
	processedDeliveries = make(map[string]bool)
	deliveryMutex       sync.RWMutex
)

// WebhookPayload represents the incoming webhook structure
type WebhookPayload struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	TenantID  string `json:"tenant_id"`
	EventID   string `json:"event_id"`
	Data      struct {
		Message *struct {
			ID             string `json:"id"`
			ConversationID string `json:"conversation_id"`
			Direction      string `json:"direction"`
			MessageType    string `json:"message_type"`
			Text           string `json:"text"`
			Status         string `json:"status"`
		} `json:"message"`
		Contact *struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Phone string `json:"phone"`
		} `json:"contact"`
	} `json:"data"`
}

// Message represents the API response for a sent message
type Message struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	Direction      string `json:"direction"`
	MessageType    string `json:"message_type"`
	Text           string `json:"text"`
	Status         string `json:"status"`
	CreatedAt      string `json:"created_at"`
}

// SendMessageRequest represents the request payload
type SendMessageRequest struct {
	ConversationID string `json:"conversation_id"`
	Text           string `json:"text"`
	MessageType    string `json:"message_type"`
}

func init() {
	godotenv.Load()

	apiToken = os.Getenv("SENDSEVEN_API_TOKEN")
	tenantID = os.Getenv("SENDSEVEN_TENANT_ID")
	apiURL = os.Getenv("SENDSEVEN_API_URL")
	webhookSecret = os.Getenv("WEBHOOK_SECRET")

	if apiURL == "" {
		apiURL = "https://api.sendseven.com/api/v1"
	}
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

// sendReply sends a reply message to a conversation
func sendReply(conversationID, text string) (*Message, error) {
	payload := SendMessageRequest{
		ConversationID: conversationID,
		Text:           text,
		MessageType:    "text",
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", apiURL+"/messages", bytes.NewBuffer(jsonPayload))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var message Message
	if err := json.Unmarshal(body, &message); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &message, nil
}

// generateReply creates a reply based on message type
func generateReply(messageType, messageText string) string {
	switch messageType {
	case "text":
		if messageText != "" {
			return fmt.Sprintf(`You said: "%s"`, messageText)
		}
		return "I received your message!"
	case "image":
		return "I received your image! 📷"
	case "audio":
		return "I received your audio message! 🎵"
	case "video":
		return "I received your video! 🎬"
	case "document":
		return "I received your document! 📄"
	default:
		return "I received your message!"
	}
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Get headers
	signature := r.Header.Get("X-Sendseven-Signature")
	timestamp := r.Header.Get("X-Sendseven-Timestamp")
	deliveryID := r.Header.Get("X-Sendseven-Delivery-Id")

	// Verify required headers
	if signature == "" || timestamp == "" || deliveryID == "" {
		log.Println("Missing required webhook headers")
		http.Error(w, `{"error": "Missing required headers"}`, http.StatusBadRequest)
		return
	}

	// Check for duplicate (idempotency)
	deliveryMutex.RLock()
	isDuplicate := processedDeliveries[deliveryID]
	deliveryMutex.RUnlock()

	if isDuplicate {
		log.Printf("Duplicate delivery %s, skipping", deliveryID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":   true,
			"duplicate": true,
		})
		return
	}

	// Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error": "Failed to read body"}`, http.StatusBadRequest)
		return
	}

	// Verify signature
	if webhookSecret != "" && !verifySignature(body, signature, timestamp) {
		log.Printf("Invalid signature for delivery %s", deliveryID)
		http.Error(w, `{"error": "Invalid signature"}`, http.StatusUnauthorized)
		return
	}

	// Parse payload
	var payload WebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, `{"error": "Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Only process message.received events
	if payload.Type != "message.received" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"skipped": true,
		})
		return
	}

	// Extract message details
	message := payload.Data.Message
	contact := payload.Data.Contact

	// Only respond to inbound messages (avoid loops)
	if message == nil || message.Direction != "inbound" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"skipped": "outbound",
		})
		return
	}

	contactName := "there"
	if contact != nil && contact.Name != "" {
		contactName = contact.Name
	}

	preview := message.Text
	if len(preview) > 50 {
		preview = preview[:50]
	}
	if preview == "" {
		preview = "[media]"
	}

	log.Printf("Received message from %s: %s", contactName, preview)

	// Generate and send reply
	replyText := generateReply(message.MessageType, message.Text)

	result, err := sendReply(message.ConversationID, replyText)
	if err != nil {
		log.Printf("Failed to send reply: %v", err)
	} else {
		log.Printf("Reply sent: %s", result.ID)
		deliveryMutex.Lock()
		processedDeliveries[deliveryID] = true
		deliveryMutex.Unlock()
	}

	// Return 200 OK
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
	// Validate configuration
	if apiToken == "" {
		log.Fatal("Error: SENDSEVEN_API_TOKEN environment variable is required")
	}
	if tenantID == "" {
		log.Fatal("Error: SENDSEVEN_TENANT_ID environment variable is required")
	}
	if webhookSecret == "" {
		log.Println("Warning: WEBHOOK_SECRET not set - signatures will not be verified!")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	http.HandleFunc("/webhooks/sendseven", webhookHandler)
	http.HandleFunc("/health", healthHandler)

	log.Printf("Echo Bot listening on port %s", port)
	log.Printf("Webhook endpoint: http://localhost:%s/webhooks/sendseven", port)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
