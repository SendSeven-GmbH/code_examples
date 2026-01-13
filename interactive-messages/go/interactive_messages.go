// SendSeven API - Interactive Messages Example
//
// Demonstrates how to send interactive messages (buttons, lists, quick replies)
// using the SendSeven API.
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

// Configuration from environment
var (
	apiToken  string
	tenantID  string
	apiURL    string
	channelID string
	contactID string
)

// Button represents an interactive button
type Button struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// ListRow represents a row in a list section
type ListRow struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}

// ListSection represents a section in a list message
type ListSection struct {
	Title string    `json:"title"`
	Rows  []ListRow `json:"rows"`
}

// ChannelCapabilities represents the capabilities of a channel
type ChannelCapabilities struct {
	ChannelID    string                 `json:"channel_id"`
	ChannelType  string                 `json:"channel_type"`
	Capabilities map[string]interface{} `json:"capabilities"`
}

// Message represents a message response
type Message struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// InteractiveRequest represents an interactive message request
type InteractiveRequest struct {
	ChannelID  string        `json:"channel_id"`
	ContactID  string        `json:"contact_id"`
	Type       string        `json:"type"`
	Body       string        `json:"body"`
	ButtonText string        `json:"button_text,omitempty"`
	Buttons    []Button      `json:"buttons,omitempty"`
	Sections   []ListSection `json:"sections,omitempty"`
}

func init() {
	// Load environment variables from .env file
	godotenv.Load()

	apiToken = os.Getenv("SENDSEVEN_API_TOKEN")
	tenantID = os.Getenv("SENDSEVEN_TENANT_ID")
	apiURL = os.Getenv("SENDSEVEN_API_URL")
	if apiURL == "" {
		apiURL = "https://api.sendseven.com/api/v1"
	}
	channelID = os.Getenv("CHANNEL_ID")
	contactID = os.Getenv("CONTACT_ID")
}

// makeRequest makes an HTTP request to the API
func makeRequest(method, url string, body interface{}) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonData)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// checkChannelCapabilities checks what interactive message types a channel supports
func checkChannelCapabilities(channelID string) (*ChannelCapabilities, error) {
	url := fmt.Sprintf("%s/channels/%s/capabilities", apiURL, channelID)

	respBody, err := makeRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	var capabilities ChannelCapabilities
	if err := json.Unmarshal(respBody, &capabilities); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &capabilities, nil
}

// sendButtonMessage sends a button message to a contact
func sendButtonMessage(channelID, contactID, body string, buttons []Button) (*Message, error) {
	url := fmt.Sprintf("%s/messages/send/interactive", apiURL)

	payload := InteractiveRequest{
		ChannelID: channelID,
		ContactID: contactID,
		Type:      "buttons",
		Body:      body,
		Buttons:   buttons,
	}

	respBody, err := makeRequest("POST", url, payload)
	if err != nil {
		return nil, err
	}

	var message Message
	if err := json.Unmarshal(respBody, &message); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &message, nil
}

// sendListMessage sends a list message with sections to a contact
func sendListMessage(channelID, contactID, body, buttonText string, sections []ListSection) (*Message, error) {
	url := fmt.Sprintf("%s/messages/send/interactive", apiURL)

	payload := InteractiveRequest{
		ChannelID:  channelID,
		ContactID:  contactID,
		Type:       "list",
		Body:       body,
		ButtonText: buttonText,
		Sections:   sections,
	}

	respBody, err := makeRequest("POST", url, payload)
	if err != nil {
		return nil, err
	}

	var message Message
	if err := json.Unmarshal(respBody, &message); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &message, nil
}

// sendQuickReplyMessage sends a quick reply message to a contact
func sendQuickReplyMessage(channelID, contactID, body string, buttons []Button) (*Message, error) {
	url := fmt.Sprintf("%s/messages/send/interactive", apiURL)

	payload := InteractiveRequest{
		ChannelID: channelID,
		ContactID: contactID,
		Type:      "quick_reply",
		Body:      body,
		Buttons:   buttons,
	}

	respBody, err := makeRequest("POST", url, payload)
	if err != nil {
		return nil, err
	}

	var message Message
	if err := json.Unmarshal(respBody, &message); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &message, nil
}

func main() {
	// Validate configuration
	if apiToken == "" {
		fmt.Println("Error: SENDSEVEN_API_TOKEN environment variable is required")
		os.Exit(1)
	}

	if tenantID == "" {
		fmt.Println("Error: SENDSEVEN_TENANT_ID environment variable is required")
		os.Exit(1)
	}

	if channelID == "" {
		fmt.Println("Error: CHANNEL_ID environment variable is required")
		os.Exit(1)
	}

	if contactID == "" {
		fmt.Println("Error: CONTACT_ID environment variable is required")
		os.Exit(1)
	}

	// 1. Check channel capabilities first
	fmt.Printf("Checking capabilities for channel: %s\n", channelID)
	capabilities, err := checkChannelCapabilities(channelID)
	if err != nil {
		fmt.Printf("Warning: Could not check capabilities: %v\n", err)
		fmt.Println("Proceeding anyway...")
		fmt.Println()
	} else {
		fmt.Printf("Channel type: %s\n", capabilities.ChannelType)
		caps := capabilities.Capabilities
		fmt.Printf("  Buttons: %v\n", caps["interactive_buttons"])
		fmt.Printf("  Lists: %v\n", caps["interactive_lists"])
		fmt.Printf("  Quick Replies: %v\n", caps["quick_replies"])
		fmt.Println()
	}

	// 2. Send a button message
	fmt.Println("Sending button message...")
	buttons := []Button{
		{ID: "yes", Title: "Yes"},
		{ID: "no", Title: "No"},
		{ID: "maybe", Title: "Maybe Later"},
	}

	message, err := sendButtonMessage(
		channelID,
		contactID,
		"Would you like to proceed with your order?",
		buttons,
	)
	if err != nil {
		fmt.Printf("Button message failed: %v\n\n", err)
	} else {
		fmt.Println("Button message sent successfully!")
		fmt.Printf("  ID: %s\n", message.ID)
		fmt.Printf("  Status: %s\n\n", message.Status)
	}

	// 3. Send a list message
	fmt.Println("Sending list message...")
	sections := []ListSection{
		{
			Title: "Electronics",
			Rows: []ListRow{
				{ID: "phones", Title: "Phones", Description: "Latest smartphones"},
				{ID: "laptops", Title: "Laptops", Description: "Portable computers"},
			},
		},
		{
			Title: "Accessories",
			Rows: []ListRow{
				{ID: "cases", Title: "Cases", Description: "Protective cases"},
				{ID: "chargers", Title: "Chargers", Description: "Fast chargers"},
			},
		},
	}

	message, err = sendListMessage(
		channelID,
		contactID,
		"Browse our product catalog:",
		"View Products",
		sections,
	)
	if err != nil {
		fmt.Printf("List message failed: %v\n\n", err)
	} else {
		fmt.Println("List message sent successfully!")
		fmt.Printf("  ID: %s\n", message.ID)
		fmt.Printf("  Status: %s\n\n", message.Status)
	}

	// 4. Send a quick reply message
	fmt.Println("Sending quick reply message...")
	quickReplies := []Button{
		{ID: "excellent", Title: "Excellent"},
		{ID: "good", Title: "Good"},
		{ID: "poor", Title: "Poor"},
	}

	message, err = sendQuickReplyMessage(
		channelID,
		contactID,
		"How would you rate our service today?",
		quickReplies,
	)
	if err != nil {
		fmt.Printf("Quick reply message failed: %v\n", err)
	} else {
		fmt.Println("Quick reply message sent successfully!")
		fmt.Printf("  ID: %s\n", message.ID)
		fmt.Printf("  Status: %s\n", message.Status)
	}
}
