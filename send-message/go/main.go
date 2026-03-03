// SendSeven API - Send Message Example (Go)
//
// Demonstrates how to send a text message using the SendSeven API.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

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

// SendMessageRequest represents the request payload for conversation-based sending.
// The recipient is auto-resolved from the conversation's contact method.
type SendMessageRequest struct {
	ConversationID string `json:"conversation_id"`
	Text           string `json:"text"`
	MessageType    string `json:"message_type"`
}

// Config holds the API configuration
type Config struct {
	APIToken       string
	TenantID       string
	APIURL         string
	ConversationID string
}

func loadConfig() (*Config, error) {
	// Load .env file if it exists
	godotenv.Load()

	config := &Config{
		APIToken:       os.Getenv("SENDSEVEN_API_TOKEN"),
		TenantID:       os.Getenv("SENDSEVEN_TENANT_ID"),
		APIURL:         os.Getenv("SENDSEVEN_API_URL"),
		ConversationID: os.Getenv("CONVERSATION_ID"),
	}

	if config.APIURL == "" {
		config.APIURL = "https://api.sendseven.com/api/v1"
	}

	return config, nil
}

// SendMessageViaContactMethodRequest represents the request payload for contact method mode
type SendMessageViaContactMethodRequest struct {
	ContactMethodID string `json:"contact_method_id"`
	Text            string `json:"text"`
	MessageType     string `json:"message_type"`
}

// SendMessage sends a text message to a conversation.
// The recipient is auto-resolved from the conversation's contact method.
// No need to specify 'to' when replying to an existing conversation.
func SendMessage(config *Config, conversationID, text string) (*Message, error) {
	payload := SendMessageRequest{
		ConversationID: conversationID,
		Text:           text,
		MessageType:    "text",
	}

	return sendMessagePayload(config, payload)
}

// SendMessageViaContactMethod sends a message using a contact method ID.
// The contact_method_id resolves the recipient, channel, and contact
// automatically. This is the cleanest way to initiate a new message
// without needing a conversation_id.
func SendMessageViaContactMethod(config *Config, contactMethodID, text string) (*Message, error) {
	payload := SendMessageViaContactMethodRequest{
		ContactMethodID: contactMethodID,
		Text:            text,
		MessageType:     "text",
	}

	return sendMessagePayload(config, payload)
}

// sendMessagePayload is a helper that sends any payload to the messages endpoint
func sendMessagePayload(config *Config, payload interface{}) (*Message, error) {
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", config.APIURL+"/messages", bytes.NewBuffer(jsonPayload))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+config.APIToken)
	req.Header.Set("X-Tenant-ID", config.TenantID)
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

func main() {
	config, err := loadConfig()
	if err != nil {
		fmt.Printf("Error loading config: %v\n", err)
		os.Exit(1)
	}

	// Validate configuration
	if config.APIToken == "" {
		fmt.Println("Error: SENDSEVEN_API_TOKEN environment variable is required")
		os.Exit(1)
	}

	if config.TenantID == "" {
		fmt.Println("Error: SENDSEVEN_TENANT_ID environment variable is required")
		os.Exit(1)
	}

	if config.ConversationID == "" {
		fmt.Println("Error: CONVERSATION_ID environment variable is required")
		os.Exit(1)
	}

	fmt.Printf("Sending message to conversation: %s\n", config.ConversationID)

	message, err := SendMessage(config, config.ConversationID, "Hello from the SendSeven Go SDK! 🐹")
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Message sent successfully!")
	fmt.Printf("  ID: %s\n", message.ID)
	fmt.Printf("  Status: %s\n", message.Status)
	fmt.Printf("  Created at: %s\n", message.CreatedAt)
}
