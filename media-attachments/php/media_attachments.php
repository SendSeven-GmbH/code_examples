<?php
/**
 * SendSeven API - Media Attachments Example (PHP)
 *
 * Demonstrates how to upload files and send media messages using the SendSeven API.
 */

// Load environment variables from .env file (simple implementation)
function loadEnv(string $path): void {
    if (!file_exists($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            putenv(trim($name) . '=' . trim($value));
        }
    }
}

loadEnv(__DIR__ . '/.env');

// Configuration from environment
$API_TOKEN = getenv('SENDSEVEN_API_TOKEN');
$TENANT_ID = getenv('SENDSEVEN_TENANT_ID');
$API_URL = getenv('SENDSEVEN_API_URL') ?: 'https://api.sendseven.com/api/v1';
$CONVERSATION_ID = getenv('CONVERSATION_ID');

// File size limits (in bytes)
define('IMAGE_MAX_SIZE', 16 * 1024 * 1024);      // 16 MB
define('DOCUMENT_MAX_SIZE', 100 * 1024 * 1024);  // 100 MB
define('VIDEO_MAX_SIZE', 16 * 1024 * 1024);      // 16 MB
define('AUDIO_MAX_SIZE', 16 * 1024 * 1024);      // 16 MB

// Supported content types by message type
$SUPPORTED_TYPES = [
    'image' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'document' => [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
    ],
    'video' => ['video/mp4', 'video/3gpp'],
    'audio' => ['audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/amr', 'audio/opus'],
];

// Extension to content type mapping
$CONTENT_TYPES = [
    // Images
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    // Documents
    'pdf' => 'application/pdf',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt' => 'text/plain',
    // Video
    'mp4' => 'video/mp4',
    '3gp' => 'video/3gpp',
    // Audio
    'aac' => 'audio/aac',
    'mp3' => 'audio/mpeg',
    'ogg' => 'audio/ogg',
    'amr' => 'audio/amr',
    'opus' => 'audio/opus',
];

/**
 * Get content type from file extension.
 *
 * @param string $filePath Path to the file
 * @return string The content type
 */
function getContentType(string $filePath): string {
    global $CONTENT_TYPES;
    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    return $CONTENT_TYPES[$ext] ?? 'application/octet-stream';
}

/**
 * Get message type from content type.
 *
 * @param string $contentType The content type
 * @return string The message type (image, document, video, audio)
 * @throws Exception If content type is unsupported
 */
function getMessageType(string $contentType): string {
    global $SUPPORTED_TYPES;
    foreach ($SUPPORTED_TYPES as $msgType => $types) {
        if (in_array($contentType, $types)) {
            return $msgType;
        }
    }
    throw new Exception("Unsupported content type: $contentType");
}

/**
 * Get maximum file size for a message type.
 *
 * @param string $messageType The message type
 * @return int Maximum size in bytes
 */
function getMaxSize(string $messageType): int {
    $limits = [
        'image' => IMAGE_MAX_SIZE,
        'document' => DOCUMENT_MAX_SIZE,
        'video' => VIDEO_MAX_SIZE,
        'audio' => AUDIO_MAX_SIZE,
    ];
    return $limits[$messageType] ?? DOCUMENT_MAX_SIZE;
}

/**
 * Upload a file as an attachment.
 *
 * @param string $filePath Path to the file to upload
 * @return array The created attachment object
 * @throws Exception If the API request fails
 */
function uploadAttachment(string $filePath): array {
    global $API_TOKEN, $TENANT_ID, $API_URL;

    // Validate file exists
    if (!file_exists($filePath)) {
        throw new Exception("File not found: $filePath");
    }

    $fileSize = filesize($filePath);
    $filename = basename($filePath);
    $contentType = getContentType($filePath);
    $messageType = getMessageType($contentType);

    // Check file size
    $maxSize = getMaxSize($messageType);
    if ($fileSize > $maxSize) {
        throw new Exception("File too large: $fileSize bytes (max $maxSize bytes for $messageType)");
    }

    $url = $API_URL . '/attachments';

    // Create cURL file for upload
    $cfile = new CURLFile($filePath, $contentType, $filename);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['file' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $API_TOKEN,
            'X-Tenant-ID: ' . $TENANT_ID,
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new Exception("cURL Error: $error");
    }

    if ($httpCode === 413) {
        throw new Exception("File too large (server rejected)");
    } elseif ($httpCode === 415) {
        throw new Exception("Unsupported media type (server rejected)");
    } elseif ($httpCode >= 400) {
        throw new Exception("API Error $httpCode: $response");
    }

    return json_decode($response, true);
}

/**
 * Send a message with an attachment.
 *
 * @param string $conversationId The UUID of the conversation
 * @param string $attachmentId The UUID of the uploaded attachment
 * @param string $messageType Type of message (image, document, video, audio)
 * @param string|null $caption Optional text caption for the message
 * @return array The created message object
 * @throws Exception If the API request fails
 */
function sendMediaMessage(string $conversationId, string $attachmentId, string $messageType, ?string $caption = null): array {
    global $API_TOKEN, $TENANT_ID, $API_URL;

    $url = $API_URL . '/messages';

    $payload = [
        'conversation_id' => $conversationId,
        'message_type' => $messageType,
        'attachments' => [$attachmentId],
    ];

    if ($caption) {
        $payload['text'] = $caption;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $API_TOKEN,
            'X-Tenant-ID: ' . $TENANT_ID,
            'Content-Type: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new Exception("cURL Error: $error");
    }

    if ($httpCode >= 400) {
        throw new Exception("API Error $httpCode: $response");
    }

    return json_decode($response, true);
}

/**
 * Download an attachment by ID.
 *
 * @param string $attachmentId The UUID of the attachment
 * @param string $outputPath Path to save the downloaded file
 * @throws Exception If the API request fails
 */
function downloadAttachment(string $attachmentId, string $outputPath): void {
    global $API_TOKEN, $TENANT_ID, $API_URL;

    $url = $API_URL . '/attachments/' . $attachmentId . '/download';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $API_TOKEN,
            'X-Tenant-ID: ' . $TENANT_ID,
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new Exception("cURL Error: $error");
    }

    if ($httpCode >= 400) {
        throw new Exception("API Error $httpCode: $response");
    }

    file_put_contents($outputPath, $response);
    echo "Downloaded to: $outputPath\n";
}

/**
 * Upload and send an image message.
 *
 * @param string $conversationId The UUID of the conversation
 * @param string $filePath Path to the image file
 * @param string|null $caption Optional caption for the image
 * @return array The created message object
 */
function sendImage(string $conversationId, string $filePath, ?string $caption = null): array {
    echo "Uploading image: $filePath\n";
    $attachment = uploadAttachment($filePath);
    echo "  Uploaded: {$attachment['id']}\n";

    echo "Sending image message...\n";
    return sendMediaMessage($conversationId, $attachment['id'], 'image', $caption);
}

/**
 * Upload and send a document message.
 *
 * @param string $conversationId The UUID of the conversation
 * @param string $filePath Path to the document file
 * @param string|null $caption Optional caption for the document
 * @return array The created message object
 */
function sendDocument(string $conversationId, string $filePath, ?string $caption = null): array {
    echo "Uploading document: $filePath\n";
    $attachment = uploadAttachment($filePath);
    echo "  Uploaded: {$attachment['id']}\n";

    echo "Sending document message...\n";
    return sendMediaMessage($conversationId, $attachment['id'], 'document', $caption);
}

/**
 * Upload and send a video message.
 *
 * @param string $conversationId The UUID of the conversation
 * @param string $filePath Path to the video file
 * @param string|null $caption Optional caption for the video
 * @return array The created message object
 */
function sendVideo(string $conversationId, string $filePath, ?string $caption = null): array {
    echo "Uploading video: $filePath\n";
    $attachment = uploadAttachment($filePath);
    echo "  Uploaded: {$attachment['id']}\n";

    echo "Sending video message...\n";
    return sendMediaMessage($conversationId, $attachment['id'], 'video', $caption);
}

/**
 * Upload and send an audio message.
 *
 * @param string $conversationId The UUID of the conversation
 * @param string $filePath Path to the audio file
 * @param string|null $caption Optional caption for the audio
 * @return array The created message object
 */
function sendAudio(string $conversationId, string $filePath, ?string $caption = null): array {
    echo "Uploading audio: $filePath\n";
    $attachment = uploadAttachment($filePath);
    echo "  Uploaded: {$attachment['id']}\n";

    echo "Sending audio message...\n";
    return sendMediaMessage($conversationId, $attachment['id'], 'audio', $caption);
}

/**
 * Demo: Upload a file and send it as a message.
 * Automatically detects the appropriate message type.
 */
function demoUploadAndSend(string $filePath): array {
    global $CONVERSATION_ID;

    $contentType = getContentType($filePath);
    $messageType = getMessageType($contentType);

    echo "\n--- Sending $messageType ---\n";
    echo "File: $filePath\n";
    echo "Content-Type: $contentType\n";

    $attachment = uploadAttachment($filePath);
    echo "Attachment uploaded:\n";
    echo "  ID: {$attachment['id']}\n";
    echo "  Filename: {$attachment['filename']}\n";
    echo "  Size: {$attachment['file_size']} bytes\n";

    $message = sendMediaMessage(
        $CONVERSATION_ID,
        $attachment['id'],
        $messageType,
        "Here's a $messageType file!"
    );

    echo "Message sent:\n";
    echo "  ID: {$message['id']}\n";
    echo "  Status: {$message['status']}\n";
    echo "  Created at: {$message['created_at']}\n";

    return $message;
}

// Main execution
function main(): void {
    global $API_TOKEN, $TENANT_ID, $API_URL, $CONVERSATION_ID, $argv;

    // Validate configuration
    if (!$API_TOKEN) {
        echo "Error: SENDSEVEN_API_TOKEN environment variable is required\n";
        exit(1);
    }

    if (!$TENANT_ID) {
        echo "Error: SENDSEVEN_TENANT_ID environment variable is required\n";
        exit(1);
    }

    if (!$CONVERSATION_ID) {
        echo "Error: CONVERSATION_ID environment variable is required\n";
        exit(1);
    }

    echo "SendSeven Media Attachments Example\n";
    echo str_repeat('=', 40) . "\n";
    echo "API URL: $API_URL\n";
    echo "Conversation: $CONVERSATION_ID\n";

    // Check for command line argument (file to upload)
    $filePath = $argv[1] ?? null;

    if ($filePath) {
        try {
            demoUploadAndSend($filePath);
        } catch (Exception $e) {
            echo "Error: " . $e->getMessage() . "\n";
            exit(1);
        }
    } else {
        echo "\nUsage: php media_attachments.php <file_path>\n";
        echo "\nSupported file types:\n";
        echo "  Images:    .jpg, .jpeg, .png, .gif, .webp (max 16 MB)\n";
        echo "  Documents: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt (max 100 MB)\n";
        echo "  Video:     .mp4, .3gp (max 16 MB)\n";
        echo "  Audio:     .aac, .mp3, .ogg, .amr, .opus (max 16 MB)\n";
        echo "\nExample:\n";
        echo "  php media_attachments.php /path/to/image.jpg\n";

        // Demo with a sample file if it exists
        $sampleFiles = ['sample.jpg', 'sample.png', 'sample.pdf'];
        foreach ($sampleFiles as $sample) {
            if (file_exists($sample)) {
                echo "\nFound sample file: $sample\n";
                try {
                    demoUploadAndSend($sample);
                } catch (Exception $e) {
                    echo "Error: " . $e->getMessage() . "\n";
                }
                break;
            }
        }
    }
}

main();
