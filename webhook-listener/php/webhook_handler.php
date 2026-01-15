<?php
/**
 * SendSeven API - Webhook Listener Example (PHP)
 *
 * Demonstrates how to receive and verify SendSeven webhook events.
 * Run with: php -S localhost:3000 webhook_handler.php
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

$WEBHOOK_SECRET = getenv('WEBHOOK_SECRET') ?: '';
$LOG_PAYLOADS = in_array(strtolower(getenv('LOG_PAYLOADS') ?: ''), ['true', '1', 'yes']);

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
 * Handle the webhook request.
 */
function handleWebhook(): void {
    global $WEBHOOK_SECRET, $LOG_PAYLOADS;

    // Only handle POST requests to webhook endpoint
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    // Get raw payload first
    $payload = file_get_contents('php://input');

    // Parse payload
    $data = json_decode($payload, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        return;
    }

    // Handle verification challenges (no signature verification needed)
    // SendSeven sends this when you create/update a webhook to verify ownership
    if (($data['type'] ?? '') === 'sendseven_verification') {
        $challenge = $data['challenge'] ?? '';
        error_log("Verification challenge received: " . substr($challenge, 0, 8) . "...");
        http_response_code(200);
        header('Content-Type: application/json');
        echo json_encode(['challenge' => $challenge]);
        return;
    }

    // Get headers for regular events
    $signature = $_SERVER['HTTP_X_SENDSEVEN_SIGNATURE'] ?? '';
    $timestamp = $_SERVER['HTTP_X_SENDSEVEN_TIMESTAMP'] ?? '';
    $deliveryId = $_SERVER['HTTP_X_SENDSEVEN_DELIVERY_ID'] ?? '';
    $eventType = $_SERVER['HTTP_X_SENDSEVEN_EVENT'] ?? '';

    // Verify required headers
    if (!$signature || !$timestamp || !$deliveryId || !$eventType) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required headers']);
        error_log('Missing required webhook headers');
        return;
    }

    // Verify signature
    if ($WEBHOOK_SECRET && !verifySignature($payload, $signature, $timestamp, $WEBHOOK_SECRET)) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid signature']);
        error_log("Invalid signature for delivery $deliveryId");
        return;
    }

    $eventTypeKey = $data['type'] ?? '';
    $tenantId = $data['tenant_id'] ?? '';

    error_log("Webhook received: delivery_id=$deliveryId, event=$eventTypeKey, tenant=$tenantId");

    // Log full payload if debugging is enabled
    if ($LOG_PAYLOADS) {
        error_log("Full payload:\n" . json_encode($data, JSON_PRETTY_PRINT));
    }

    // Handle different event types
    try {
        switch ($eventTypeKey) {
            case 'message.received':
                handleMessageReceived($data);
                break;
            case 'message.sent':
                handleMessageSent($data);
                break;
            case 'message.delivered':
                handleMessageDelivered($data);
                break;
            case 'message.failed':
                handleMessageFailed($data);
                break;
            case 'conversation.created':
                handleConversationCreated($data);
                break;
            case 'conversation.closed':
                handleConversationClosed($data);
                break;
            case 'conversation.assigned':
                handleConversationAssigned($data);
                break;
            case 'contact.created':
                handleContactCreated($data);
                break;
            case 'contact.updated':
                handleContactUpdated($data);
                break;
            case 'contact.deleted':
                handleContactDeleted($data);
                break;
            case 'contact.subscribed':
                handleContactSubscribed($data);
                break;
            case 'contact.unsubscribed':
                handleContactUnsubscribed($data);
                break;
            case 'link.clicked':
                handleLinkClicked($data);
                break;
            default:
                error_log("  Unknown event type: $eventTypeKey");
        }
    } catch (Exception $e) {
        error_log("Error processing webhook: " . $e->getMessage());
    }

    // Always return 200 quickly
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'delivery_id' => $deliveryId]);
}

function handleMessageReceived(array $payload): void {
    $message = $payload['data']['message'] ?? [];
    $contact = $payload['data']['contact'] ?? [];
    $name = $contact['name'] ?? 'Unknown';
    $text = substr($message['text'] ?? '', 0, 50);
    error_log("  Message received from $name: $text");
}

function handleMessageSent(array $payload): void {
    $messageId = $payload['data']['message']['id'] ?? '';
    error_log("  Message sent: $messageId");
}

function handleMessageDelivered(array $payload): void {
    $messageId = $payload['data']['message']['id'] ?? '';
    error_log("  Message delivered: $messageId");
}

function handleMessageFailed(array $payload): void {
    $messageId = $payload['data']['message']['id'] ?? '';
    $error = $payload['data']['error']['message'] ?? 'Unknown error';
    error_log("  Message failed: $messageId - $error");
}

function handleConversationCreated(array $payload): void {
    $convId = $payload['data']['conversation']['id'] ?? '';
    error_log("  Conversation created: $convId");
}

function handleConversationClosed(array $payload): void {
    $convId = $payload['data']['conversation']['id'] ?? '';
    error_log("  Conversation closed: $convId");
}

function handleContactCreated(array $payload): void {
    $contact = $payload['data']['contact'] ?? [];
    $name = $contact['name'] ?? 'Unknown';
    $phone = $contact['phone'] ?? 'No phone';
    error_log("  Contact created: $name ($phone)");
}

function handleConversationAssigned(array $payload): void {
    $convId = $payload['data']['conversation']['id'] ?? '';
    $assignedTo = $payload['data']['assigned_to']['name'] ?? 'Unknown';
    error_log("  Conversation $convId assigned to $assignedTo");
}

function handleContactUpdated(array $payload): void {
    $contactId = $payload['data']['contact']['id'] ?? '';
    error_log("  Contact updated: $contactId");
}

function handleContactDeleted(array $payload): void {
    $contact = $payload['data']['contact'] ?? [];
    $contactId = $contact['id'] ?? '';
    $name = $contact['name'] ?? 'Unknown';
    error_log("  Contact deleted: $contactId ($name)");
}

function handleContactSubscribed(array $payload): void {
    $contact = $payload['data']['contact'] ?? [];
    $listId = $payload['data']['subscription']['list_id'] ?? '';
    $name = $contact['name'] ?? 'Unknown';
    error_log("  Contact $name subscribed to list $listId");
}

function handleContactUnsubscribed(array $payload): void {
    $contact = $payload['data']['contact'] ?? [];
    $listId = $payload['data']['subscription']['list_id'] ?? '';
    $name = $contact['name'] ?? 'Unknown';
    error_log("  Contact $name unsubscribed from list $listId");
}

function handleLinkClicked(array $payload): void {
    $link = $payload['data']['link'] ?? [];
    $contact = $payload['data']['contact'] ?? [];
    $url = $link['url'] ?? 'Unknown URL';
    $name = $contact['name'] ?? 'Unknown';
    error_log("  Link clicked: $url by $name");
}

// Run the handler
handleWebhook();
