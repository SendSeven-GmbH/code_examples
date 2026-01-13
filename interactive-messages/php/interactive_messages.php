<?php
/**
 * SendSeven API - Interactive Messages Example
 *
 * Demonstrates how to send interactive messages (buttons, lists, quick replies)
 * using the SendSeven API.
 */

// Load environment variables from .env file
function loadEnv(string $path): void {
    if (!file_exists($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }

        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $value = trim($parts[1]);
            // Remove quotes if present
            $value = trim($value, '"\'');
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

loadEnv(__DIR__ . '/.env');

// Configuration from environment
$API_TOKEN = getenv('SENDSEVEN_API_TOKEN');
$TENANT_ID = getenv('SENDSEVEN_TENANT_ID');
$API_URL = getenv('SENDSEVEN_API_URL') ?: 'https://api.sendseven.com/api/v1';
$CHANNEL_ID = getenv('CHANNEL_ID');
$CONTACT_ID = getenv('CONTACT_ID');

/**
 * Get common headers for API requests.
 */
function getHeaders(): array {
    global $API_TOKEN, $TENANT_ID;

    return [
        'Authorization: Bearer ' . $API_TOKEN,
        'X-Tenant-ID: ' . $TENANT_ID,
        'Content-Type: application/json',
    ];
}

/**
 * Make an HTTP request.
 */
function makeRequest(string $method, string $url, ?array $data = null): array {
    $ch = curl_init();

    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, getHeaders());

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new Exception("cURL error: $error");
    }

    if ($httpCode >= 400) {
        throw new Exception("HTTP $httpCode: $response");
    }

    return json_decode($response, true);
}

/**
 * Check what interactive message types a channel supports.
 */
function checkChannelCapabilities(string $channelId): array {
    global $API_URL;

    $url = "$API_URL/channels/$channelId/capabilities";
    return makeRequest('GET', $url);
}

/**
 * Send a button message to a contact.
 */
function sendButtonMessage(
    string $channelId,
    string $contactId,
    string $body,
    array $buttons
): array {
    global $API_URL;

    $url = "$API_URL/messages/send/interactive";

    $payload = [
        'channel_id' => $channelId,
        'contact_id' => $contactId,
        'type' => 'buttons',
        'body' => $body,
        'buttons' => $buttons,
    ];

    return makeRequest('POST', $url, $payload);
}

/**
 * Send a list message with sections to a contact.
 */
function sendListMessage(
    string $channelId,
    string $contactId,
    string $body,
    string $buttonText,
    array $sections
): array {
    global $API_URL;

    $url = "$API_URL/messages/send/interactive";

    $payload = [
        'channel_id' => $channelId,
        'contact_id' => $contactId,
        'type' => 'list',
        'body' => $body,
        'button_text' => $buttonText,
        'sections' => $sections,
    ];

    return makeRequest('POST', $url, $payload);
}

/**
 * Send a quick reply message to a contact.
 */
function sendQuickReplyMessage(
    string $channelId,
    string $contactId,
    string $body,
    array $buttons
): array {
    global $API_URL;

    $url = "$API_URL/messages/send/interactive";

    $payload = [
        'channel_id' => $channelId,
        'contact_id' => $contactId,
        'type' => 'quick_reply',
        'body' => $body,
        'buttons' => $buttons,
    ];

    return makeRequest('POST', $url, $payload);
}

function main(): void {
    global $API_TOKEN, $TENANT_ID, $CHANNEL_ID, $CONTACT_ID;

    // Validate configuration
    if (!$API_TOKEN) {
        echo "Error: SENDSEVEN_API_TOKEN environment variable is required\n";
        exit(1);
    }

    if (!$TENANT_ID) {
        echo "Error: SENDSEVEN_TENANT_ID environment variable is required\n";
        exit(1);
    }

    if (!$CHANNEL_ID) {
        echo "Error: CHANNEL_ID environment variable is required\n";
        exit(1);
    }

    if (!$CONTACT_ID) {
        echo "Error: CONTACT_ID environment variable is required\n";
        exit(1);
    }

    // 1. Check channel capabilities first
    echo "Checking capabilities for channel: $CHANNEL_ID\n";
    try {
        $capabilities = checkChannelCapabilities($CHANNEL_ID);
        echo "Channel type: " . ($capabilities['channel_type'] ?? 'unknown') . "\n";
        $caps = $capabilities['capabilities'] ?? [];
        echo "  Buttons: " . ($caps['interactive_buttons'] ?? false ? 'true' : 'false') . "\n";
        echo "  Lists: " . ($caps['interactive_lists'] ?? false ? 'true' : 'false') . "\n";
        echo "  Quick Replies: " . ($caps['quick_replies'] ?? false ? 'true' : 'false') . "\n";
        echo "\n";
    } catch (Exception $e) {
        echo "Warning: Could not check capabilities: " . $e->getMessage() . "\n";
        echo "Proceeding anyway...\n\n";
    }

    // 2. Send a button message
    echo "Sending button message...\n";
    try {
        $buttons = [
            ['id' => 'yes', 'title' => 'Yes'],
            ['id' => 'no', 'title' => 'No'],
            ['id' => 'maybe', 'title' => 'Maybe Later'],
        ];

        $message = sendButtonMessage(
            $CHANNEL_ID,
            $CONTACT_ID,
            'Would you like to proceed with your order?',
            $buttons
        );

        echo "Button message sent successfully!\n";
        echo "  ID: " . $message['id'] . "\n";
        echo "  Status: " . $message['status'] . "\n\n";
    } catch (Exception $e) {
        echo "Button message failed: " . $e->getMessage() . "\n\n";
    }

    // 3. Send a list message
    echo "Sending list message...\n";
    try {
        $sections = [
            [
                'title' => 'Electronics',
                'rows' => [
                    ['id' => 'phones', 'title' => 'Phones', 'description' => 'Latest smartphones'],
                    ['id' => 'laptops', 'title' => 'Laptops', 'description' => 'Portable computers'],
                ],
            ],
            [
                'title' => 'Accessories',
                'rows' => [
                    ['id' => 'cases', 'title' => 'Cases', 'description' => 'Protective cases'],
                    ['id' => 'chargers', 'title' => 'Chargers', 'description' => 'Fast chargers'],
                ],
            ],
        ];

        $message = sendListMessage(
            $CHANNEL_ID,
            $CONTACT_ID,
            'Browse our product catalog:',
            'View Products',
            $sections
        );

        echo "List message sent successfully!\n";
        echo "  ID: " . $message['id'] . "\n";
        echo "  Status: " . $message['status'] . "\n\n";
    } catch (Exception $e) {
        echo "List message failed: " . $e->getMessage() . "\n\n";
    }

    // 4. Send a quick reply message
    echo "Sending quick reply message...\n";
    try {
        $quickReplies = [
            ['id' => 'excellent', 'title' => 'Excellent'],
            ['id' => 'good', 'title' => 'Good'],
            ['id' => 'poor', 'title' => 'Poor'],
        ];

        $message = sendQuickReplyMessage(
            $CHANNEL_ID,
            $CONTACT_ID,
            'How would you rate our service today?',
            $quickReplies
        );

        echo "Quick reply message sent successfully!\n";
        echo "  ID: " . $message['id'] . "\n";
        echo "  Status: " . $message['status'] . "\n";
    } catch (Exception $e) {
        echo "Quick reply message failed: " . $e->getMessage() . "\n";
    }
}

main();
