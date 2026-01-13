<?php
/**
 * SendSeven API - Conversation Management Example (PHP)
 *
 * Demonstrates how to list, get, update, and close conversations using the SendSeven API.
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
 * List conversations with optional filtering.
 *
 * @param array $options Filter options
 * @return array Paginated list of conversations
 * @throws Exception If the API request fails
 */
function listConversations(array $options = []): array {
    global $API_URL;

    $params = [
        'page' => $options['page'] ?? 1,
        'page_size' => $options['page_size'] ?? 20,
    ];

    if (isset($options['status'])) {
        $params['status'] = $options['status'];
    }
    if (isset($options['needs_reply'])) {
        $params['needs_reply'] = $options['needs_reply'] ? 'true' : 'false';
    }
    if (isset($options['assigned_to'])) {
        $params['assigned_to'] = $options['assigned_to'];
    }
    if (isset($options['channel'])) {
        $params['channel'] = $options['channel'];
    }

    $url = $API_URL . '/conversations?' . http_build_query($params);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => getHeaders(),
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
 * Get a single conversation by ID.
 *
 * @param string $conversationId The UUID of the conversation
 * @return array The conversation object
 * @throws Exception If the API request fails
 */
function getConversation(string $conversationId): array {
    global $API_URL;

    $url = $API_URL . '/conversations/' . $conversationId;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => getHeaders(),
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
 * Update a conversation (e.g., assign to a user).
 *
 * @param string $conversationId The UUID of the conversation
 * @param array $updates Fields to update
 * @return array The updated conversation object
 * @throws Exception If the API request fails
 */
function updateConversation(string $conversationId, array $updates = []): array {
    global $API_URL;

    $url = $API_URL . '/conversations/' . $conversationId;

    $payload = [];
    if (isset($updates['assigned_to'])) {
        $payload['assigned_to'] = $updates['assigned_to'];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => getHeaders(),
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
 * Close a conversation.
 *
 * @param string $conversationId The UUID of the conversation
 * @return array The closed conversation object
 * @throws Exception If the API request fails
 */
function closeConversation(string $conversationId): array {
    global $API_URL;

    $url = $API_URL . '/conversations/' . $conversationId . '/close';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => getHeaders(),
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
    global $API_TOKEN, $TENANT_ID;

    // Validate configuration
    if (!$API_TOKEN) {
        echo "Error: SENDSEVEN_API_TOKEN environment variable is required\n";
        exit(1);
    }

    if (!$TENANT_ID) {
        echo "Error: SENDSEVEN_TENANT_ID environment variable is required\n";
        exit(1);
    }

    try {
        // Example 1: List all open conversations that need a reply
        echo str_repeat('=', 60) . "\n";
        echo "Listing open conversations that need a reply...\n";
        echo str_repeat('=', 60) . "\n";

        $result = listConversations([
            'status' => 'open',
            'needs_reply' => true,
            'page_size' => 5,
        ]);

        echo "Found {$result['pagination']['total']} conversations\n";
        echo "Page {$result['pagination']['page']} of {$result['pagination']['total_pages']}\n\n";

        foreach ($result['items'] as $conv) {
            echo "  ID: {$conv['id']}\n";
            echo "  Channel: {$conv['channel']}\n";
            echo "  Status: {$conv['status']}\n";
            echo "  Last message: " . ($conv['last_message_at'] ?? 'N/A') . "\n\n";
        }

        // Example 2: Get a single conversation (if we have any)
        if (!empty($result['items'])) {
            $conversationId = $result['items'][0]['id'];

            echo str_repeat('=', 60) . "\n";
            echo "Getting conversation details: $conversationId\n";
            echo str_repeat('=', 60) . "\n";

            $conversation = getConversation($conversationId);
            echo "  ID: {$conversation['id']}\n";
            echo "  Channel: {$conversation['channel']}\n";
            echo "  Status: {$conversation['status']}\n";
            echo "  Needs reply: " . ($conversation['needs_reply'] ? 'true' : 'false') . "\n";
            echo "  Assigned to: " . ($conversation['assigned_to'] ?? 'Unassigned') . "\n";
            if (isset($conversation['contact'])) {
                echo "  Contact: " . ($conversation['contact']['name'] ?? 'Unknown') . "\n";
            }
            echo "\n";

            // Example 3: Demonstrate update (commented out to avoid modifying data)
            // Uncomment to actually assign a conversation
            // echo str_repeat('=', 60) . "\n";
            // echo "Assigning conversation to user...\n";
            // echo str_repeat('=', 60) . "\n";
            // $userId = 'your-user-id-here';
            // $updated = updateConversation($conversationId, ['assigned_to' => $userId]);
            // echo "  Assigned to: {$updated['assigned_to']}\n\n";

            // Example 4: Demonstrate close (commented out to avoid modifying data)
            // Uncomment to actually close the conversation
            // echo str_repeat('=', 60) . "\n";
            // echo "Closing conversation...\n";
            // echo str_repeat('=', 60) . "\n";
            // $closed = closeConversation($conversationId);
            // echo "  Status: {$closed['status']}\n";
            // echo "  Closed at: {$closed['closed_at']}\n";
        }

        echo str_repeat('=', 60) . "\n";
        echo "Conversation management examples completed!\n";
        echo str_repeat('=', 60) . "\n";

    } catch (Exception $e) {
        echo "Error: " . $e->getMessage() . "\n";
        exit(1);
    }
}

main();
