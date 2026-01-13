// SendSeven API - Conversation Management Example (Go)
//
// Demonstrates how to list, get, update, and close conversations using the SendSeven API.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Conversation represents a conversation object
type Conversation struct {
	ID            string   `json:"id"`
	ContactID     string   `json:"contact_id"`
	Channel       string   `json:"channel"`
	Status        string   `json:"status"`
	NeedsReply    bool     `json:"needs_reply"`
	AssignedTo    *string  `json:"assigned_to"`
	LastMessageAt *string  `json:"last_message_at"`
	CreatedAt     string   `json:"created_at"`
	ClosedAt      *string  `json:"closed_at"`
	Contact       *Contact `json:"contact,omitempty"`
}

// Contact represents a contact object
type Contact struct {
	ID    string  `json:"id"`
	Name  *string `json:"name"`
	Phone *string `json:"phone"`
	Email *string `json:"email"`
}

// Pagination represents pagination info
type Pagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

// ConversationListResponse represents the list response
type ConversationListResponse struct {
	Items      []Conversation `json:"items"`
	Pagination Pagination     `json:"pagination"`
}

// ListConversationsOptions represents filter options
type ListConversationsOptions struct {
	Status     string
	NeedsReply *bool
	AssignedTo string
	Channel    string
	Page       int
	PageSize   int
}

// Config holds the API configuration
type Config struct {
	APIToken string
	TenantID string
	APIURL   string
}

func loadConfig() (*Config, error) {
	// Load .env file if it exists
	godotenv.Load()

	config := &Config{
		APIToken: os.Getenv("SENDSEVEN_API_TOKEN"),
		TenantID: os.Getenv("SENDSEVEN_TENANT_ID"),
		APIURL:   os.Getenv("SENDSEVEN_API_URL"),
	}

	if config.APIURL == "" {
		config.APIURL = "https://api.sendseven.com/api/v1"
	}

	return config, nil
}

// ListConversations lists conversations with optional filtering
func ListConversations(config *Config, opts ListConversationsOptions) (*ConversationListResponse, error) {
	params := url.Values{}

	if opts.Page > 0 {
		params.Set("page", strconv.Itoa(opts.Page))
	} else {
		params.Set("page", "1")
	}

	if opts.PageSize > 0 {
		params.Set("page_size", strconv.Itoa(opts.PageSize))
	} else {
		params.Set("page_size", "20")
	}

	if opts.Status != "" {
		params.Set("status", opts.Status)
	}
	if opts.NeedsReply != nil {
		params.Set("needs_reply", strconv.FormatBool(*opts.NeedsReply))
	}
	if opts.AssignedTo != "" {
		params.Set("assigned_to", opts.AssignedTo)
	}
	if opts.Channel != "" {
		params.Set("channel", opts.Channel)
	}

	req, err := http.NewRequest("GET", config.APIURL+"/conversations?"+params.Encode(), nil)
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

	var result ConversationListResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &result, nil
}

// GetConversation gets a single conversation by ID
func GetConversation(config *Config, conversationID string) (*Conversation, error) {
	req, err := http.NewRequest("GET", config.APIURL+"/conversations/"+conversationID, nil)
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

	var conversation Conversation
	if err := json.Unmarshal(body, &conversation); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &conversation, nil
}

// UpdateConversation updates a conversation (e.g., assign to a user)
func UpdateConversation(config *Config, conversationID string, assignedTo *string) (*Conversation, error) {
	payload := map[string]interface{}{}
	if assignedTo != nil {
		payload["assigned_to"] = *assignedTo
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("PUT", config.APIURL+"/conversations/"+conversationID, bytes.NewBuffer(jsonPayload))
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

	var conversation Conversation
	if err := json.Unmarshal(body, &conversation); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &conversation, nil
}

// CloseConversation closes a conversation
func CloseConversation(config *Config, conversationID string) (*Conversation, error) {
	req, err := http.NewRequest("POST", config.APIURL+"/conversations/"+conversationID+"/close", nil)
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

	var conversation Conversation
	if err := json.Unmarshal(body, &conversation); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &conversation, nil
}

func printSeparator() {
	fmt.Println(string(make([]byte, 60)))
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

	// Example 1: List all open conversations that need a reply
	fmt.Println("============================================================")
	fmt.Println("Listing open conversations that need a reply...")
	fmt.Println("============================================================")

	needsReply := true
	result, err := ListConversations(config, ListConversationsOptions{
		Status:     "open",
		NeedsReply: &needsReply,
		PageSize:   5,
	})
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Found %d conversations\n", result.Pagination.Total)
	fmt.Printf("Page %d of %d\n\n", result.Pagination.Page, result.Pagination.TotalPages)

	for _, conv := range result.Items {
		fmt.Printf("  ID: %s\n", conv.ID)
		fmt.Printf("  Channel: %s\n", conv.Channel)
		fmt.Printf("  Status: %s\n", conv.Status)
		lastMsg := "N/A"
		if conv.LastMessageAt != nil {
			lastMsg = *conv.LastMessageAt
		}
		fmt.Printf("  Last message: %s\n\n", lastMsg)
	}

	// Example 2: Get a single conversation (if we have any)
	if len(result.Items) > 0 {
		conversationID := result.Items[0].ID

		fmt.Println("============================================================")
		fmt.Printf("Getting conversation details: %s\n", conversationID)
		fmt.Println("============================================================")

		conversation, err := GetConversation(config, conversationID)
		if err != nil {
			fmt.Printf("Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("  ID: %s\n", conversation.ID)
		fmt.Printf("  Channel: %s\n", conversation.Channel)
		fmt.Printf("  Status: %s\n", conversation.Status)
		fmt.Printf("  Needs reply: %t\n", conversation.NeedsReply)
		assignedTo := "Unassigned"
		if conversation.AssignedTo != nil {
			assignedTo = *conversation.AssignedTo
		}
		fmt.Printf("  Assigned to: %s\n", assignedTo)
		if conversation.Contact != nil && conversation.Contact.Name != nil {
			fmt.Printf("  Contact: %s\n", *conversation.Contact.Name)
		}
		fmt.Println()

		// Example 3: Demonstrate update (commented out to avoid modifying data)
		// Uncomment to actually assign a conversation
		// fmt.Println("============================================================")
		// fmt.Println("Assigning conversation to user...")
		// fmt.Println("============================================================")
		// userID := "your-user-id-here"
		// updated, err := UpdateConversation(config, conversationID, &userID)
		// if err != nil {
		//     fmt.Printf("Error: %v\n", err)
		//     os.Exit(1)
		// }
		// fmt.Printf("  Assigned to: %s\n\n", *updated.AssignedTo)

		// Example 4: Demonstrate close (commented out to avoid modifying data)
		// Uncomment to actually close the conversation
		// fmt.Println("============================================================")
		// fmt.Println("Closing conversation...")
		// fmt.Println("============================================================")
		// closed, err := CloseConversation(config, conversationID)
		// if err != nil {
		//     fmt.Printf("Error: %v\n", err)
		//     os.Exit(1)
		// }
		// fmt.Printf("  Status: %s\n", closed.Status)
		// if closed.ClosedAt != nil {
		//     fmt.Printf("  Closed at: %s\n", *closed.ClosedAt)
		// }
	}

	fmt.Println("============================================================")
	fmt.Println("Conversation management examples completed!")
	fmt.Println("============================================================")
}
