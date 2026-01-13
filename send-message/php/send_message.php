<?php
/**
 * SendSeven API - Send Message Example (PHP)
 *
 * Demonstrates how to send a text message using the SendSeven API.
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

/**
 * Send a text message to a conversation.
 *
 * @param string $conversationId The UUID of the conversation
 * @param string $text The message text to send
 * @return array The created message object
 * @throws Exception If the API request fails
 */
function sendMessage(string $conversationId, string $text): array {
    global $API_TOKEN, $TENANT_ID, $API_URL;

    $url = $API_URL . '/messages';

    $payload = json_encode([
        'conversation_id' => $conversationId,
        'text' => $text,
        'message_type' => 'text',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
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

// Main execution
function main(): void {
    global $API_TOKEN, $TENANT_ID, $CONVERSATION_ID;

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

    echo "Sending message to conversation: $CONVERSATION_ID\n";

    try {
        $message = sendMessage(
            $CONVERSATION_ID,
            'Hello from the SendSeven PHP SDK! 🐘'
        );

        echo "Message sent successfully!\n";
        echo "  ID: {$message['id']}\n";
        echo "  Status: {$message['status']}\n";
        echo "  Created at: {$message['created_at']}\n";
    } catch (Exception $e) {
        echo "Error: " . $e->getMessage() . "\n";
        exit(1);
    }
}

main();
