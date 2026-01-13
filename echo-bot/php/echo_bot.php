<?php
/**
 * SendSeven API - Echo Bot Example (PHP)
 *
 * A simple bot that automatically replies to incoming messages.
 * Run with: php -S localhost:3000 echo_bot.php
 */

// Load environment variables
function loadEnv(string $path): void {
    if (!file_exists($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            putenv(trim($name) . '=' . trim($value));
        }
    }
}

loadEnv(__DIR__ . '/.env');

// Configuration
$API_TOKEN = getenv('SENDSEVEN_API_TOKEN') ?: '';
$TENANT_ID = getenv('SENDSEVEN_TENANT_ID') ?: '';
$API_URL = getenv('SENDSEVEN_API_URL') ?: 'https://api.sendseven.com/api/v1';
$WEBHOOK_SECRET = getenv('WEBHOOK_SECRET') ?: '';

// Track processed deliveries (use Redis/database in production)
$processedDeliveries = [];

/**
 * Verify the webhook signature using HMAC-SHA256.
 */
function verifySignature(string $payload, string $signature, string $timestamp, string $secret): bool {
    if (strpos($signature, 'sha256=') !== 0) {
        return false;
    }

    $providedSig = substr($signature, 7); // Remove 'sha256=' prefix

    // Reconstruct the message
    $payloadData = json_decode($payload, true);
    ksort($payloadData);
    $jsonPayload = json_encode($payloadData, JSON_UNESCAPED_SLASHES);
    $message = $timestamp . '.' . $jsonPayload;

    // Compute expected signature
    $expectedSig = hash_hmac('sha256', $message, $secret);

    // Timing-safe comparison
    return hash_equals($expectedSig, $providedSig);
}

/**
 * Send a reply message to a conversation.
 */
function sendReply(string $conversationId, string $text): array {
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

/**
 * Generate a reply based on message type.
 */
function generateReply(string $messageType, string $messageText): string {
    switch ($messageType) {
        case 'text':
            return $messageText ? "You said: \"$messageText\"" : 'I received your message!';
        case 'image':
            return 'I received your image! 📷';
        case 'audio':
            return 'I received your audio message! 🎵';
        case 'video':
            return 'I received your video! 🎬';
        case 'document':
            return 'I received your document! 📄';
        default:
            return 'I received your message!';
    }
}

/**
 * Handle the webhook request.
 */
function handleWebhook(): void {
    global $API_TOKEN, $TENANT_ID, $WEBHOOK_SECRET, $processedDeliveries;

    // Only handle POST requests
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    // Get headers
    $signature = $_SERVER['HTTP_X_SENDSEVEN_SIGNATURE'] ?? '';
    $timestamp = $_SERVER['HTTP_X_SENDSEVEN_TIMESTAMP'] ?? '';
    $deliveryId = $_SERVER['HTTP_X_SENDSEVEN_DELIVERY_ID'] ?? '';

    // Verify required headers
    if (!$signature || !$timestamp || !$deliveryId) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required headers']);
        error_log('Missing required webhook headers');
        return;
    }

    // Check for duplicate (idempotency)
    if (in_array($deliveryId, $processedDeliveries)) {
        error_log("Duplicate delivery $deliveryId, skipping");
        http_response_code(200);
        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'duplicate' => true]);
        return;
    }

    // Get raw payload
    $payload = file_get_contents('php://input');

    // Verify signature
    if ($WEBHOOK_SECRET && !verifySignature($payload, $signature, $timestamp, $WEBHOOK_SECRET)) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid signature']);
        error_log("Invalid signature for delivery $deliveryId");
        return;
    }

    // Parse payload
    $data = json_decode($payload, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        return;
    }

    $eventType = $data['type'] ?? '';

    // Only process message.received events
    if ($eventType !== 'message.received') {
        http_response_code(200);
        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'skipped' => true]);
        return;
    }

    // Extract message details
    $message = $data['data']['message'] ?? [];
    $contact = $data['data']['contact'] ?? [];

    // Only respond to inbound messages (avoid loops)
    if (($message['direction'] ?? '') !== 'inbound') {
        http_response_code(200);
        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'skipped' => 'outbound']);
        return;
    }

    $conversationId = $message['conversation_id'] ?? '';
    $messageType = $message['message_type'] ?? 'text';
    $messageText = $message['text'] ?? '';
    $contactName = $contact['name'] ?? 'there';

    $preview = $messageText ? substr($messageText, 0, 50) : '[media]';
    error_log("Received message from $contactName: $preview");

    // Generate and send reply
    $replyText = generateReply($messageType, $messageText);

    try {
        $result = sendReply($conversationId, $replyText);
        error_log("Reply sent: " . ($result['id'] ?? 'unknown'));
        $processedDeliveries[] = $deliveryId;
    } catch (Exception $e) {
        error_log("Failed to send reply: " . $e->getMessage());
    }

    // Always return 200 quickly
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode(['success' => true]);
}

// Validate configuration on startup
if (!$API_TOKEN) {
    error_log("Error: SENDSEVEN_API_TOKEN is required");
}
if (!$TENANT_ID) {
    error_log("Error: SENDSEVEN_TENANT_ID is required");
}
if (!$WEBHOOK_SECRET) {
    error_log("Warning: WEBHOOK_SECRET not set - signatures will not be verified!");
}

// Run the handler
handleWebhook();
