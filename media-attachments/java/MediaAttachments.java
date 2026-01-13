/**
 * SendSeven API - Media Attachments Example (Java)
 *
 * Demonstrates how to upload files and send media messages using the SendSeven API.
 */

import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

public class MediaAttachments {

    private final String apiToken;
    private final String tenantId;
    private final String apiUrl;
    private final String conversationId;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    // File size limits (in bytes)
    private static final long IMAGE_MAX_SIZE = 16L * 1024 * 1024;      // 16 MB
    private static final long DOCUMENT_MAX_SIZE = 100L * 1024 * 1024;  // 100 MB
    private static final long VIDEO_MAX_SIZE = 16L * 1024 * 1024;      // 16 MB
    private static final long AUDIO_MAX_SIZE = 16L * 1024 * 1024;      // 16 MB

    // Supported content types by message type
    private static final Map<String, List<String>> SUPPORTED_TYPES = new HashMap<>();
    static {
        SUPPORTED_TYPES.put("image", Arrays.asList("image/jpeg", "image/png", "image/gif", "image/webp"));
        SUPPORTED_TYPES.put("document", Arrays.asList(
            "application/pdf", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain"
        ));
        SUPPORTED_TYPES.put("video", Arrays.asList("video/mp4", "video/3gpp"));
        SUPPORTED_TYPES.put("audio", Arrays.asList("audio/aac", "audio/mpeg", "audio/ogg", "audio/amr", "audio/opus"));
    }

    // Extension to content type mapping
    private static final Map<String, String> CONTENT_TYPES = new HashMap<>();
    static {
        // Images
        CONTENT_TYPES.put(".jpg", "image/jpeg");
        CONTENT_TYPES.put(".jpeg", "image/jpeg");
        CONTENT_TYPES.put(".png", "image/png");
        CONTENT_TYPES.put(".gif", "image/gif");
        CONTENT_TYPES.put(".webp", "image/webp");
        // Documents
        CONTENT_TYPES.put(".pdf", "application/pdf");
        CONTENT_TYPES.put(".doc", "application/msword");
        CONTENT_TYPES.put(".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        CONTENT_TYPES.put(".xls", "application/vnd.ms-excel");
        CONTENT_TYPES.put(".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        CONTENT_TYPES.put(".ppt", "application/vnd.ms-powerpoint");
        CONTENT_TYPES.put(".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        CONTENT_TYPES.put(".txt", "text/plain");
        // Video
        CONTENT_TYPES.put(".mp4", "video/mp4");
        CONTENT_TYPES.put(".3gp", "video/3gpp");
        // Audio
        CONTENT_TYPES.put(".aac", "audio/aac");
        CONTENT_TYPES.put(".mp3", "audio/mpeg");
        CONTENT_TYPES.put(".ogg", "audio/ogg");
        CONTENT_TYPES.put(".amr", "audio/amr");
        CONTENT_TYPES.put(".opus", "audio/opus");
    }

    public MediaAttachments() {
        // Load configuration from environment or .env file
        loadEnvFile();

        this.apiToken = getEnv("SENDSEVEN_API_TOKEN", null);
        this.tenantId = getEnv("SENDSEVEN_TENANT_ID", null);
        this.apiUrl = getEnv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1");
        this.conversationId = getEnv("CONVERSATION_ID", null);

        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
    }

    private void loadEnvFile() {
        try {
            Properties props = new Properties();
            FileInputStream fis = new FileInputStream(".env");
            props.load(fis);
            fis.close();

            for (String key : props.stringPropertyNames()) {
                if (System.getenv(key) == null) {
                    System.setProperty(key, props.getProperty(key));
                }
            }
        } catch (IOException e) {
            // .env file not found, using environment variables only
        }
    }

    private String getEnv(String key, String defaultValue) {
        String value = System.getenv(key);
        if (value == null) {
            value = System.getProperty(key, defaultValue);
        }
        return value;
    }

    /**
     * Get content type from file extension.
     */
    public static String getContentType(String filePath) {
        String ext = "";
        int lastDot = filePath.lastIndexOf('.');
        if (lastDot > 0) {
            ext = filePath.substring(lastDot).toLowerCase();
        }
        return CONTENT_TYPES.getOrDefault(ext, "application/octet-stream");
    }

    /**
     * Get message type from content type.
     */
    public static String getMessageType(String contentType) throws Exception {
        for (Map.Entry<String, List<String>> entry : SUPPORTED_TYPES.entrySet()) {
            if (entry.getValue().contains(contentType)) {
                return entry.getKey();
            }
        }
        throw new Exception("Unsupported content type: " + contentType);
    }

    /**
     * Get maximum file size for a message type.
     */
    public static long getMaxSize(String messageType) {
        switch (messageType) {
            case "image": return IMAGE_MAX_SIZE;
            case "document": return DOCUMENT_MAX_SIZE;
            case "video": return VIDEO_MAX_SIZE;
            case "audio": return AUDIO_MAX_SIZE;
            default: return DOCUMENT_MAX_SIZE;
        }
    }

    /**
     * Upload a file as an attachment.
     */
    public JsonNode uploadAttachment(String filePath) throws Exception {
        Path path = Path.of(filePath);

        // Validate file exists
        if (!Files.exists(path)) {
            throw new FileNotFoundException("File not found: " + filePath);
        }

        long fileSize = Files.size(path);
        String filename = path.getFileName().toString();
        String contentType = getContentType(filePath);
        String messageType = getMessageType(contentType);

        // Check file size
        long maxSize = getMaxSize(messageType);
        if (fileSize > maxSize) {
            throw new Exception("File too large: " + fileSize + " bytes (max " + maxSize + " bytes for " + messageType + ")");
        }

        // Read file content
        byte[] fileContent = Files.readAllBytes(path);

        // Create multipart form data
        String boundary = "----FormBoundary" + UUID.randomUUID().toString().replace("-", "");

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        baos.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n").getBytes(StandardCharsets.UTF_8));
        baos.write(("Content-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        baos.write(fileContent);
        baos.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/attachments"))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(baos.toByteArray()))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 413) {
            throw new Exception("File too large (server rejected)");
        } else if (response.statusCode() == 415) {
            throw new Exception("Unsupported media type (server rejected)");
        } else if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }

    /**
     * Send a message with an attachment.
     */
    public JsonNode sendMediaMessage(String conversationId, String attachmentId, String messageType, String caption) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("conversation_id", conversationId);
        payload.put("message_type", messageType);

        ArrayNode attachments = payload.putArray("attachments");
        attachments.add(attachmentId);

        if (caption != null && !caption.isEmpty()) {
            payload.put("text", caption);
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/messages"))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + response.body());
        }

        return objectMapper.readTree(response.body());
    }

    /**
     * Download an attachment by ID.
     */
    public void downloadAttachment(String attachmentId, String outputPath) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/attachments/" + attachmentId + "/download"))
                .header("Authorization", "Bearer " + apiToken)
                .header("X-Tenant-ID", tenantId)
                .GET()
                .build();

        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("API Error " + response.statusCode() + ": " + new String(response.body()));
        }

        Files.write(Path.of(outputPath), response.body());
        System.out.println("Downloaded to: " + outputPath);
    }

    /**
     * Upload and send an image message.
     */
    public JsonNode sendImage(String conversationId, String filePath, String caption) throws Exception {
        System.out.println("Uploading image: " + filePath);
        JsonNode attachment = uploadAttachment(filePath);
        System.out.println("  Uploaded: " + attachment.get("id").asText());

        System.out.println("Sending image message...");
        return sendMediaMessage(conversationId, attachment.get("id").asText(), "image", caption);
    }

    /**
     * Upload and send a document message.
     */
    public JsonNode sendDocument(String conversationId, String filePath, String caption) throws Exception {
        System.out.println("Uploading document: " + filePath);
        JsonNode attachment = uploadAttachment(filePath);
        System.out.println("  Uploaded: " + attachment.get("id").asText());

        System.out.println("Sending document message...");
        return sendMediaMessage(conversationId, attachment.get("id").asText(), "document", caption);
    }

    /**
     * Upload and send a video message.
     */
    public JsonNode sendVideo(String conversationId, String filePath, String caption) throws Exception {
        System.out.println("Uploading video: " + filePath);
        JsonNode attachment = uploadAttachment(filePath);
        System.out.println("  Uploaded: " + attachment.get("id").asText());

        System.out.println("Sending video message...");
        return sendMediaMessage(conversationId, attachment.get("id").asText(), "video", caption);
    }

    /**
     * Upload and send an audio message.
     */
    public JsonNode sendAudio(String conversationId, String filePath, String caption) throws Exception {
        System.out.println("Uploading audio: " + filePath);
        JsonNode attachment = uploadAttachment(filePath);
        System.out.println("  Uploaded: " + attachment.get("id").asText());

        System.out.println("Sending audio message...");
        return sendMediaMessage(conversationId, attachment.get("id").asText(), "audio", caption);
    }

    /**
     * Demo: Upload a file and send it as a message.
     * Automatically detects the appropriate message type.
     */
    public void demoUploadAndSend(String filePath) throws Exception {
        String contentType = getContentType(filePath);
        String messageType = getMessageType(contentType);

        System.out.println("\n--- Sending " + messageType + " ---");
        System.out.println("File: " + filePath);
        System.out.println("Content-Type: " + contentType);

        JsonNode attachment = uploadAttachment(filePath);
        System.out.println("Attachment uploaded:");
        System.out.println("  ID: " + attachment.get("id").asText());
        System.out.println("  Filename: " + attachment.get("filename").asText());
        System.out.println("  Size: " + attachment.get("file_size").asLong() + " bytes");

        JsonNode message = sendMediaMessage(
            conversationId,
            attachment.get("id").asText(),
            messageType,
            "Here's a " + messageType + " file!"
        );

        System.out.println("Message sent:");
        System.out.println("  ID: " + message.get("id").asText());
        System.out.println("  Status: " + message.get("status").asText());
        System.out.println("  Created at: " + message.get("created_at").asText());
    }

    public void run(String[] args) {
        // Validate configuration
        if (apiToken == null || apiToken.isEmpty()) {
            System.err.println("Error: SENDSEVEN_API_TOKEN environment variable is required");
            System.exit(1);
        }

        if (tenantId == null || tenantId.isEmpty()) {
            System.err.println("Error: SENDSEVEN_TENANT_ID environment variable is required");
            System.exit(1);
        }

        if (conversationId == null || conversationId.isEmpty()) {
            System.err.println("Error: CONVERSATION_ID environment variable is required");
            System.exit(1);
        }

        System.out.println("SendSeven Media Attachments Example");
        System.out.println("========================================");
        System.out.println("API URL: " + apiUrl);
        System.out.println("Conversation: " + conversationId);

        // Check for command line argument (file to upload)
        if (args.length > 0) {
            try {
                demoUploadAndSend(args[0]);
            } catch (Exception e) {
                System.err.println("Error: " + e.getMessage());
                System.exit(1);
            }
        } else {
            System.out.println("\nUsage: java MediaAttachments <file_path>");
            System.out.println("\nSupported file types:");
            System.out.println("  Images:    .jpg, .jpeg, .png, .gif, .webp (max 16 MB)");
            System.out.println("  Documents: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt (max 100 MB)");
            System.out.println("  Video:     .mp4, .3gp (max 16 MB)");
            System.out.println("  Audio:     .aac, .mp3, .ogg, .amr, .opus (max 16 MB)");
            System.out.println("\nExample:");
            System.out.println("  java MediaAttachments /path/to/image.jpg");

            // Demo with a sample file if it exists
            String[] sampleFiles = {"sample.jpg", "sample.png", "sample.pdf"};
            for (String sample : sampleFiles) {
                if (new File(sample).exists()) {
                    System.out.println("\nFound sample file: " + sample);
                    try {
                        demoUploadAndSend(sample);
                    } catch (Exception e) {
                        System.err.println("Error: " + e.getMessage());
                    }
                    break;
                }
            }
        }
    }

    public static void main(String[] args) {
        new MediaAttachments().run(args);
    }
}
