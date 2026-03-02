// SendSeven API - Contact Management Example (Go)
//
// Demonstrates CRUD operations for contacts using the SendSeven API.
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

// Contact represents a contact object
type Contact struct {
	ID        string `json:"id"`
	TenantID  string `json:"tenant_id,omitempty"`
	Phone     string `json:"phone,omitempty"`
	Email     string `json:"email,omitempty"`
	Name      string `json:"name,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

// ContactCreateRequest represents the request payload for creating a contact
type ContactCreateRequest struct {
	Phone string `json:"phone,omitempty"`
	Email string `json:"email,omitempty"`
	Name  string `json:"name,omitempty"`
}

// ContactUpdateRequest represents the request payload for updating a contact
type ContactUpdateRequest struct {
	Phone *string `json:"phone,omitempty"`
	Email *string `json:"email,omitempty"`
	Name  *string `json:"name,omitempty"`
}

// PaginationInfo represents pagination metadata
type PaginationInfo struct {
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

// ContactListResponse represents the paginated list response
type ContactListResponse struct {
	Items      []Contact      `json:"items"`
	Pagination PaginationInfo `json:"pagination"`
}

// DeleteResponse represents the delete response
type DeleteResponse struct {
	Success bool   `json:"success"`
	ID      string `json:"id"`
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

// makeRequest makes an HTTP request to the API
func makeRequest(config *Config, method, endpoint string, body interface{}) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequest(method, config.APIURL+endpoint, reqBody)
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

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// CreateContact creates a new contact
func CreateContact(config *Config, contactData ContactCreateRequest) (*Contact, error) {
	body, err := makeRequest(config, "POST", "/contacts", contactData)
	if err != nil {
		return nil, err
	}

	var contact Contact
	if err := json.Unmarshal(body, &contact); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &contact, nil
}

// ListContacts lists contacts with pagination
func ListContacts(config *Config, page, pageSize int) (*ContactListResponse, error) {
	endpoint := fmt.Sprintf("/contacts?page=%d&page_size=%d", page, pageSize)
	body, err := makeRequest(config, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var response ContactListResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &response, nil
}

// GetContact gets a single contact by ID
func GetContact(config *Config, contactID string) (*Contact, error) {
	body, err := makeRequest(config, "GET", "/contacts/"+contactID, nil)
	if err != nil {
		return nil, err
	}

	var contact Contact
	if err := json.Unmarshal(body, &contact); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &contact, nil
}

// UpdateContact updates an existing contact
func UpdateContact(config *Config, contactID string, contactData ContactUpdateRequest) (*Contact, error) {
	body, err := makeRequest(config, "PUT", "/contacts/"+contactID, contactData)
	if err != nil {
		return nil, err
	}

	var contact Contact
	if err := json.Unmarshal(body, &contact); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &contact, nil
}

// DeleteContact deletes a contact
func DeleteContact(config *Config, contactID string) (*DeleteResponse, error) {
	body, err := makeRequest(config, "DELETE", "/contacts/"+contactID, nil)
	if err != nil {
		return nil, err
	}

	var response DeleteResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &response, nil
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

	fmt.Println("SendSeven Contact Management Example")
	fmt.Println("========================================")

	// 1. Create a new contact
	fmt.Println("\n1. Creating a new contact...")
	contact, err := CreateContact(config, ContactCreateRequest{
		Phone: "+1234567890",
		Email: "john.doe@example.com",
		Name:  "John Doe",
	})
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	contactID := contact.ID
	fmt.Printf("   Created contact: %s\n", contactID)
	fmt.Printf("   Name: %s\n", contact.Name)
	fmt.Printf("   Email: %s\n", contact.Email)
	fmt.Printf("   Phone: %s\n", contact.Phone)

	// 2. List contacts
	fmt.Println("\n2. Listing contacts...")
	contactsResponse, err := ListContacts(config, 1, 10)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("   Total contacts: %d\n", contactsResponse.Pagination.Total)
	fmt.Printf("   Page %d of %d\n", contactsResponse.Pagination.Page, contactsResponse.Pagination.TotalPages)
	for i, c := range contactsResponse.Items {
		if i >= 3 {
			break
		}
		name := c.Name
		if name == "" {
			name = c.Phone
		}
		if name == "" {
			name = c.Email
		}
		if name == "" {
			name = "Unknown"
		}
		fmt.Printf("   - %s: %s\n", c.ID, name)
	}

	// 3. Get single contact
	fmt.Printf("\n3. Getting contact %s...\n", contactID)
	fetchedContact, err := GetContact(config, contactID)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("   ID: %s\n", fetchedContact.ID)
	fmt.Printf("   Name: %s\n", fetchedContact.Name)

	// 4. Update contact
	fmt.Printf("\n4. Updating contact %s...\n", contactID)
	newName := "Jane Doe"
	updatedContact, err := UpdateContact(config, contactID, ContactUpdateRequest{
		Name: &newName,
	})
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("   Updated name: %s\n", updatedContact.Name)

	// 5. Delete contact
	fmt.Printf("\n5. Deleting contact %s...\n", contactID)
	deleteResult, err := DeleteContact(config, contactID)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("   Deleted: %v\n", deleteResult.Success)

	fmt.Println("\n========================================")
	fmt.Println("All operations completed successfully!")
}
