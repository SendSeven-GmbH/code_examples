// SendSeven API - Media Attachments Example (Go)
//
// Demonstrates how to upload files and send media messages using the SendSeven API.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
)

// Attachment represents the API response for an uploaded attachment
type Attachment struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	FileSize    int64  `json:"file_size"`
	URL         string `json:"url"`
}

// Message represents the API response for a sent message
type Message struct {
	ID             string       `json:"id"`
	ConversationID string       `json:"conversation_id"`
	Direction      string       `json:"direction"`
	MessageType    string       `json:"message_type"`
	Text           string       `json:"text"`
	Attachments    []Attachment `json:"attachments"`
	Status         string       `json:"status"`
	CreatedAt      string       `json:"created_at"`
}

// SendMediaMessageRequest represents the request payload for sending a media message
type SendMediaMessageRequest struct {
	ConversationID string   `json:"conversation_id"`
	MessageType    string   `json:"message_type"`
	Attachments    []string `json:"attachments"`
	Text           string   `json:"text,omitempty"`
}

// Config holds the API configuration
type Config struct {
	APIToken       string
	TenantID       string
	APIURL         string
	ConversationID string
}

// File size limits (in bytes)
const (
	ImageMaxSize    = 16 * 1024 * 1024  // 16 MB
	DocumentMaxSize = 100 * 1024 * 1024 // 100 MB
	VideoMaxSize    = 16 * 1024 * 1024  // 16 MB
	AudioMaxSize    = 16 * 1024 * 1024  // 16 MB
)

// Supported content types by message type
var supportedTypes = map[string][]string{
	"image":    {"image/jpeg", "image/png", "image/gif", "image/webp"},
	"document": {"application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain"},
	"video":    {"video/mp4", "video/3gpp"},
	"audio":    {"audio/aac", "audio/mpeg", "audio/ogg", "audio/amr", "audio/opus"},
}

// Extension to content type mapping
var contentTypes = map[string]string{
	// Images
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	// Documents
	".pdf":  "application/pdf",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls":  "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt":  "application/vnd.ms-powerpoint",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".txt":  "text/plain",
	// Video
	".mp4": "video/mp4",
	".3gp": "video/3gpp",
	// Audio
	".aac":  "audio/aac",
	".mp3":  "audio/mpeg",
	".ogg":  "audio/ogg",
	".amr":  "audio/amr",
	".opus": "audio/opus",
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

// GetContentType returns the content type for a file based on its extension
func GetContentType(filePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))
	if ct, ok := contentTypes[ext]; ok {
		return ct
	}
	return "application/octet-stream"
}

// GetMessageType returns the message type for a content type
func GetMessageType(contentType string) (string, error) {
	for msgType, types := range supportedTypes {
		for _, t := range types {
			if t == contentType {
				return msgType, nil
			}
		}
	}
	return "", fmt.Errorf("unsupported content type: %s", contentType)
}

// GetMaxSize returns the maximum file size for a message type
func GetMaxSize(messageType string) int64 {
	switch messageType {
	case "image":
		return ImageMaxSize
	case "document":
		return DocumentMaxSize
	case "video":
		return VideoMaxSize
	case "audio":
		return AudioMaxSize
	default:
		return DocumentMaxSize
	}
}

// UploadAttachment uploads a file as an attachment
func UploadAttachment(config *Config, filePath string) (*Attachment, error) {
	// Check if file exists
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %s", filePath)
	}

	contentType := GetContentType(filePath)
	messageType, err := GetMessageType(contentType)
	if err != nil {
		return nil, err
	}

	// Check file size
	maxSize := GetMaxSize(messageType)
	if fileInfo.Size() > maxSize {
		return nil, fmt.Errorf("file too large: %d bytes (max %d bytes for %s)", fileInfo.Size(), maxSize, messageType)
	}

	// Open file
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}

	_, err = io.Copy(part, file)
	if err != nil {
		return nil, fmt.Errorf("failed to copy file content: %w", err)
	}

	err = writer.Close()
	if err != nil {
		return nil, fmt.Errorf("failed to close writer: %w", err)
	}

	// Create request
	req, err := http.NewRequest("POST", config.APIURL+"/attachments", body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+config.APIToken)
	req.Header.Set("X-Tenant-ID", config.TenantID)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Send request
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

	if resp.StatusCode == 413 {
		return nil, fmt.Errorf("file too large (server rejected)")
	} else if resp.StatusCode == 415 {
		return nil, fmt.Errorf("unsupported media type (server rejected)")
	} else if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var attachment Attachment
	if err := json.Unmarshal(respBody, &attachment); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &attachment, nil
}

// SendMediaMessage sends a message with an attachment
func SendMediaMessage(config *Config, conversationID, attachmentID, messageType, caption string) (*Message, error) {
	payload := SendMediaMessageRequest{
		ConversationID: conversationID,
		MessageType:    messageType,
		Attachments:    []string{attachmentID},
	}

	if caption != "" {
		payload.Text = caption
	}

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

// DownloadAttachment downloads an attachment by ID
func DownloadAttachment(config *Config, attachmentID, outputPath string) error {
	req, err := http.NewRequest("GET", config.APIURL+"/attachments/"+attachmentID+"/download", nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+config.APIToken)
	req.Header.Set("X-Tenant-ID", config.TenantID)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	outFile, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	fmt.Printf("Downloaded to: %s\n", outputPath)
	return nil
}

// SendImage uploads and sends an image message
func SendImage(config *Config, conversationID, filePath, caption string) (*Message, error) {
	fmt.Printf("Uploading image: %s\n", filePath)
	attachment, err := UploadAttachment(config, filePath)
	if err != nil {
		return nil, err
	}
	fmt.Printf("  Uploaded: %s\n", attachment.ID)

	fmt.Println("Sending image message...")
	return SendMediaMessage(config, conversationID, attachment.ID, "image", caption)
}

// SendDocument uploads and sends a document message
func SendDocument(config *Config, conversationID, filePath, caption string) (*Message, error) {
	fmt.Printf("Uploading document: %s\n", filePath)
	attachment, err := UploadAttachment(config, filePath)
	if err != nil {
		return nil, err
	}
	fmt.Printf("  Uploaded: %s\n", attachment.ID)

	fmt.Println("Sending document message...")
	return SendMediaMessage(config, conversationID, attachment.ID, "document", caption)
}

// SendVideo uploads and sends a video message
func SendVideo(config *Config, conversationID, filePath, caption string) (*Message, error) {
	fmt.Printf("Uploading video: %s\n", filePath)
	attachment, err := UploadAttachment(config, filePath)
	if err != nil {
		return nil, err
	}
	fmt.Printf("  Uploaded: %s\n", attachment.ID)

	fmt.Println("Sending video message...")
	return SendMediaMessage(config, conversationID, attachment.ID, "video", caption)
}

// SendAudio uploads and sends an audio message
func SendAudio(config *Config, conversationID, filePath, caption string) (*Message, error) {
	fmt.Printf("Uploading audio: %s\n", filePath)
	attachment, err := UploadAttachment(config, filePath)
	if err != nil {
		return nil, err
	}
	fmt.Printf("  Uploaded: %s\n", attachment.ID)

	fmt.Println("Sending audio message...")
	return SendMediaMessage(config, conversationID, attachment.ID, "audio", caption)
}

// demoUploadAndSend demonstrates uploading a file and sending it as a message
func demoUploadAndSend(config *Config, filePath string) error {
	contentType := GetContentType(filePath)
	messageType, err := GetMessageType(contentType)
	if err != nil {
		return err
	}

	fmt.Printf("\n--- Sending %s ---\n", messageType)
	fmt.Printf("File: %s\n", filePath)
	fmt.Printf("Content-Type: %s\n", contentType)

	attachment, err := UploadAttachment(config, filePath)
	if err != nil {
		return err
	}

	fmt.Println("Attachment uploaded:")
	fmt.Printf("  ID: %s\n", attachment.ID)
	fmt.Printf("  Filename: %s\n", attachment.Filename)
	fmt.Printf("  Size: %d bytes\n", attachment.FileSize)

	message, err := SendMediaMessage(
		config,
		config.ConversationID,
		attachment.ID,
		messageType,
		fmt.Sprintf("Here's a %s file!", messageType),
	)
	if err != nil {
		return err
	}

	fmt.Println("Message sent:")
	fmt.Printf("  ID: %s\n", message.ID)
	fmt.Printf("  Status: %s\n", message.Status)
	fmt.Printf("  Created at: %s\n", message.CreatedAt)

	return nil
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

	fmt.Println("SendSeven Media Attachments Example")
	fmt.Println(strings.Repeat("=", 40))
	fmt.Printf("API URL: %s\n", config.APIURL)
	fmt.Printf("Conversation: %s\n", config.ConversationID)

	// Check for command line argument (file to upload)
	if len(os.Args) > 1 {
		filePath := os.Args[1]
		if err := demoUploadAndSend(config, filePath); err != nil {
			fmt.Printf("Error: %v\n", err)
			os.Exit(1)
		}
	} else {
		fmt.Println("\nUsage: go run main.go <file_path>")
		fmt.Println("\nSupported file types:")
		fmt.Println("  Images:    .jpg, .jpeg, .png, .gif, .webp (max 16 MB)")
		fmt.Println("  Documents: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt (max 100 MB)")
		fmt.Println("  Video:     .mp4, .3gp (max 16 MB)")
		fmt.Println("  Audio:     .aac, .mp3, .ogg, .amr, .opus (max 16 MB)")
		fmt.Println("\nExample:")
		fmt.Println("  go run main.go /path/to/image.jpg")

		// Demo with a sample file if it exists
		sampleFiles := []string{"sample.jpg", "sample.png", "sample.pdf"}
		for _, sample := range sampleFiles {
			if _, err := os.Stat(sample); err == nil {
				fmt.Printf("\nFound sample file: %s\n", sample)
				if err := demoUploadAndSend(config, sample); err != nil {
					fmt.Printf("Error: %v\n", err)
				}
				break
			}
		}
	}
}
