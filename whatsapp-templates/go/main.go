// SendSeven API - WhatsApp Templates Example (Go)
//
// Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
// Features:
// - List available templates
// - Send template with text parameters
// - Send template with header (image/document)
// - Handle template categories (marketing, utility, authentication)
// - Error handling for template not found, unapproved templates
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Template represents a WhatsApp message template
type Template struct {
	ID         string              `json:"id"`
	Name       string              `json:"name"`
	Namespace  string              `json:"namespace"`
	Category   string              `json:"category"`
	Language   string              `json:"language"`
	Status     string              `json:"status"`
	Components []TemplateComponent `json:"components"`
}

// TemplateComponent represents a component of a template
type TemplateComponent struct {
	Type    string           `json:"type"`
	Format  string           `json:"format,omitempty"`
	Text    string           `json:"text,omitempty"`
	Buttons []TemplateButton `json:"buttons,omitempty"`
}

// TemplateButton represents a button in a template
type TemplateButton struct {
	Type        string `json:"type"`
	Text        string `json:"text"`
	URL         string `json:"url,omitempty"`
	PhoneNumber string `json:"phone_number,omitempty"`
}

// TemplatesResponse represents the API response for listing templates
type TemplatesResponse struct {
	Items      []Template `json:"items"`
	Pagination *struct {
		Page     int `json:"page"`
		PageSize int `json:"page_size"`
		Total    int `json:"total"`
	} `json:"pagination,omitempty"`
}

// ComponentParameter represents a parameter in a template component
type ComponentParameter struct {
	Type     string                 `json:"type"`
	Text     string                 `json:"text,omitempty"`
	Image    *MediaParameter        `json:"image,omitempty"`
	Document *DocumentParameter     `json:"document,omitempty"`
	Video    *MediaParameter        `json:"video,omitempty"`
}

// MediaParameter represents media parameter data
type MediaParameter struct {
	Link string `json:"link"`
}

// DocumentParameter represents document parameter data
type DocumentParameter struct {
	Link     string `json:"link"`
	Filename string `json:"filename"`
}

// SendComponent represents a component to send with a template message
type SendComponent struct {
	Type       string               `json:"type"`
	Parameters []ComponentParameter `json:"parameters"`
	SubType    string               `json:"sub_type,omitempty"`
	Index      int                  `json:"index,omitempty"`
}

// Message represents the API response for a sent message
type Message struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	ContactID      string `json:"contact_id"`
	ChannelID      string `json:"channel_id"`
	Direction      string `json:"direction"`
	MessageType    string `json:"message_type"`
	Text           string `json:"text"`
	Status         string `json:"status"`
	CreatedAt      string `json:"created_at"`
}

// SendTemplateRequest represents the request payload for sending a template
type SendTemplateRequest struct {
	ChannelID    string          `json:"channel_id"`
	ContactID    string          `json:"contact_id"`
	TemplateName string          `json:"template_name"`
	LanguageCode string          `json:"language_code"`
	Components   []SendComponent `json:"components,omitempty"`
}

// Config holds the API configuration
type Config struct {
	APIToken  string
	TenantID  string
	APIURL    string
	ChannelID string
	ContactID string
}

func loadConfig() (*Config, error) {
	// Load .env file if it exists
	godotenv.Load()

	config := &Config{
		APIToken:  os.Getenv("SENDSEVEN_API_TOKEN"),
		TenantID:  os.Getenv("SENDSEVEN_TENANT_ID"),
		APIURL:    os.Getenv("SENDSEVEN_API_URL"),
		ChannelID: os.Getenv("CHANNEL_ID"),
		ContactID: os.Getenv("CONTACT_ID"),
	}

	if config.APIURL == "" {
		config.APIURL = "https://api.sendseven.com/api/v1"
	}

	return config, nil
}

// ListTemplates lists available WhatsApp templates
func ListTemplates(config *Config, category string, status string) ([]Template, error) {
	if status == "" {
		status = "APPROVED"
	}

	params := url.Values{}
	params.Set("status", status)
	if category != "" {
		params.Set("category", category)
	}

	req, err := http.NewRequest("GET", config.APIURL+"/whatsapp/templates?"+params.Encode(), nil)
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

	// Try to parse as TemplatesResponse first
	var templatesResp TemplatesResponse
	if err := json.Unmarshal(body, &templatesResp); err == nil && templatesResp.Items != nil {
		return templatesResp.Items, nil
	}

	// Fall back to parsing as array
	var templates []Template
	if err := json.Unmarshal(body, &templates); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return templates, nil
}

// SendTemplateMessage sends a WhatsApp template message
func SendTemplateMessage(config *Config, channelID, contactID, templateName, languageCode string, components []SendComponent) (*Message, error) {
	if languageCode == "" {
		languageCode = "en"
	}

	payload := SendTemplateRequest{
		ChannelID:    channelID,
		ContactID:    contactID,
		TemplateName: templateName,
		LanguageCode: languageCode,
	}

	if len(components) > 0 {
		payload.Components = components
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", config.APIURL+"/messages/send/template", bytes.NewBuffer(jsonPayload))
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

// SendTemplateWithTextParams sends a template message with text parameters in the body
func SendTemplateWithTextParams(config *Config, channelID, contactID, templateName string, bodyParams []string, languageCode string) (*Message, error) {
	parameters := make([]ComponentParameter, len(bodyParams))
	for i, param := range bodyParams {
		parameters[i] = ComponentParameter{
			Type: "text",
			Text: param,
		}
	}

	components := []SendComponent{
		{
			Type:       "body",
			Parameters: parameters,
		},
	}

	return SendTemplateMessage(config, channelID, contactID, templateName, languageCode, components)
}

// SendTemplateWithHeaderImage sends a template message with an image header
func SendTemplateWithHeaderImage(config *Config, channelID, contactID, templateName, imageURL string, bodyParams []string, languageCode string) (*Message, error) {
	components := []SendComponent{
		{
			Type: "header",
			Parameters: []ComponentParameter{
				{
					Type:  "image",
					Image: &MediaParameter{Link: imageURL},
				},
			},
		},
	}

	if len(bodyParams) > 0 {
		parameters := make([]ComponentParameter, len(bodyParams))
		for i, param := range bodyParams {
			parameters[i] = ComponentParameter{
				Type: "text",
				Text: param,
			}
		}
		components = append(components, SendComponent{
			Type:       "body",
			Parameters: parameters,
		})
	}

	return SendTemplateMessage(config, channelID, contactID, templateName, languageCode, components)
}

// SendTemplateWithHeaderDocument sends a template message with a document header
func SendTemplateWithHeaderDocument(config *Config, channelID, contactID, templateName, documentURL, filename string, bodyParams []string, languageCode string) (*Message, error) {
	components := []SendComponent{
		{
			Type: "header",
			Parameters: []ComponentParameter{
				{
					Type:     "document",
					Document: &DocumentParameter{Link: documentURL, Filename: filename},
				},
			},
		},
	}

	if len(bodyParams) > 0 {
		parameters := make([]ComponentParameter, len(bodyParams))
		for i, param := range bodyParams {
			parameters[i] = ComponentParameter{
				Type: "text",
				Text: param,
			}
		}
		components = append(components, SendComponent{
			Type:       "body",
			Parameters: parameters,
		})
	}

	return SendTemplateMessage(config, channelID, contactID, templateName, languageCode, components)
}

// HandleTemplateError handles and displays template-specific errors
func HandleTemplateError(err error) {
	message := err.Error()
	re := regexp.MustCompile(`API error (\d+)`)
	matches := re.FindStringSubmatch(message)
	statusCode := 0
	if len(matches) > 1 {
		statusCode, _ = strconv.Atoi(matches[1])
	}

	if statusCode == 404 {
		fmt.Printf("Template not found: %s\n", message)
		fmt.Println("Tip: Verify the template name exists and is approved")
	} else if statusCode == 400 {
		if strings.Contains(strings.ToLower(message), "not approved") {
			fmt.Printf("Template not approved: %s\n", message)
			fmt.Println("Tip: Only APPROVED templates can be sent")
		} else if strings.Contains(strings.ToLower(message), "parameter") {
			fmt.Printf("Parameter mismatch: %s\n", message)
			fmt.Println("Tip: Ensure the number of parameters matches the template")
		} else {
			fmt.Printf("Bad request: %s\n", message)
		}
	} else if statusCode == 401 {
		fmt.Println("Authentication failed: Check your API token")
	} else if statusCode == 403 {
		fmt.Println("Permission denied: Token may lack required scopes")
	} else {
		fmt.Printf("Error: %s\n", message)
	}
}

func main() {
	config, err := loadConfig()
	if err != nil {
		fmt.Printf("Error loading config: %v\n", err)
		os.Exit(1)
	}

	// Validate configuration
	missing := []string{}
	if config.APIToken == "" {
		missing = append(missing, "SENDSEVEN_API_TOKEN")
	}
	if config.TenantID == "" {
		missing = append(missing, "SENDSEVEN_TENANT_ID")
	}
	if config.ChannelID == "" {
		missing = append(missing, "CHANNEL_ID")
	}
	if config.ContactID == "" {
		missing = append(missing, "CONTACT_ID")
	}

	if len(missing) > 0 {
		fmt.Println("Error: Missing required environment variables:")
		for _, v := range missing {
			fmt.Printf("  - %s\n", v)
		}
		os.Exit(1)
	}

	// Example 1: List all approved templates
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("Listing approved WhatsApp templates...")
	fmt.Println(strings.Repeat("=", 60))

	templates, err := ListTemplates(config, "", "APPROVED")
	if err != nil {
		HandleTemplateError(err)
		os.Exit(1)
	}

	if len(templates) == 0 {
		fmt.Println("No approved templates found.")
		fmt.Println("Create templates in the WhatsApp Business Manager first.")
		return
	}

	fmt.Printf("Found %d template(s):\n\n", len(templates))
	count := 5
	if len(templates) < count {
		count = len(templates)
	}
	for i := 0; i < count; i++ {
		t := templates[i]
		fmt.Printf("  Name: %s\n", t.Name)
		fmt.Printf("  Category: %s\n", t.Category)
		fmt.Printf("  Language: %s\n", t.Language)
		fmt.Printf("  Status: %s\n", t.Status)
		fmt.Println()
	}

	// Example 2: List templates by category
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("Listing MARKETING templates...")
	fmt.Println(strings.Repeat("=", 60))

	marketingTemplates, err := ListTemplates(config, "MARKETING", "APPROVED")
	if err != nil {
		HandleTemplateError(err)
	} else {
		fmt.Printf("Found %d marketing template(s)\n", len(marketingTemplates))
	}

	// Example 3: Send a template with text parameters
	fmt.Println()
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("Sending template with text parameters...")
	fmt.Println(strings.Repeat("=", 60))

	message, err := SendTemplateWithTextParams(
		config,
		config.ChannelID,
		config.ContactID,
		"order_confirmation",
		[]string{"John Doe", "ORD-12345"},
		"en",
	)
	if err != nil {
		HandleTemplateError(err)
		fmt.Println("\nNote: Update template_name to match your approved template")
	} else {
		fmt.Println("Template message sent successfully!")
		fmt.Printf("  Message ID: %s\n", message.ID)
		fmt.Printf("  Status: %s\n", message.Status)
	}

	// Example 4: Send template with image header
	fmt.Println()
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("Sending template with image header...")
	fmt.Println(strings.Repeat("=", 60))

	message, err = SendTemplateWithHeaderImage(
		config,
		config.ChannelID,
		config.ContactID,
		"promotion_with_image",
		"https://example.com/promo-image.jpg",
		[]string{"Summer Sale", "50%"},
		"en",
	)
	if err != nil {
		HandleTemplateError(err)
		fmt.Println("\nNote: Update template_name to match your approved template")
	} else {
		fmt.Println("Template with image sent successfully!")
		fmt.Printf("  Message ID: %s\n", message.ID)
	}

	// Example 5: Send template with document header
	fmt.Println()
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("Sending template with document header...")
	fmt.Println(strings.Repeat("=", 60))

	message, err = SendTemplateWithHeaderDocument(
		config,
		config.ChannelID,
		config.ContactID,
		"invoice_template",
		"https://example.com/invoice.pdf",
		"Invoice-2026-001.pdf",
		[]string{"$199.99"},
		"en",
	)
	if err != nil {
		HandleTemplateError(err)
		fmt.Println("\nNote: Update template_name to match your approved template")
	} else {
		fmt.Println("Template with document sent successfully!")
		fmt.Printf("  Message ID: %s\n", message.ID)
	}
}
