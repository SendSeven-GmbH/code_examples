<?php
/**
 * SendSeven API - WhatsApp Templates Example (PHP)
 *
 * Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
 * Features:
 * - List available templates
 * - Send template with text parameters
 * - Send template with header (image/document)
 * - Handle template categories (marketing, utility, authentication)
 * - Error handling for template not found, unapproved templates
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
$CHANNEL_ID = getenv('CHANNEL_ID');
$CONTACT_ID = getenv('CONTACT_ID');

/**
 * Get common headers for API requests.
 *
 * @return array Headers array for cURL
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
 * Make a GET request to the API.
 *
 * @param string $endpoint API endpoint
 * @param array $params Query parameters
 * @return array Response data
 * @throws Exception If the API request fails
 */
function apiGet(string $endpoint, array $params = []): array {
    global $API_URL;

    $url = $API_URL . $endpoint;
    if (!empty($params)) {
        $url .= '?' . http_build_query($params);
    }

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
 * Make a POST request to the API.
 *
 * @param string $endpoint API endpoint
 * @param array $payload Request body
 * @return array Response data
 * @throws Exception If the API request fails
 */
function apiPost(string $endpoint, array $payload): array {
    global $API_URL;

    $url = $API_URL . $endpoint;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
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
 * List available WhatsApp templates.
 *
 * @param string|null $category Filter by category (MARKETING, UTILITY, AUTHENTICATION)
 * @param string $status Filter by status (default: APPROVED)
 * @return array List of template objects
 * @throws Exception If the API request fails
 */
function listTemplates(?string $category = null, string $status = 'APPROVED'): array {
    $params = ['status' => $status];
    if ($category !== null) {
        $params['category'] = $category;
    }

    $data = apiGet('/whatsapp/templates', $params);
    return isset($data['items']) ? $data['items'] : $data;
}

/**
 * Send a WhatsApp template message.
 *
 * @param string $channelId The UUID of the WhatsApp channel
 * @param string $contactId The UUID of the contact to send to
 * @param string $templateName Name of the approved template
 * @param string $languageCode Language code (default: en)
 * @param array $components Template components with parameters
 * @return array The created message object
 * @throws Exception If the API request fails
 */
function sendTemplateMessage(
    string $channelId,
    string $contactId,
    string $templateName,
    string $languageCode = 'en',
    array $components = []
): array {
    $payload = [
        'channel_id' => $channelId,
        'contact_id' => $contactId,
        'template_name' => $templateName,
        'language_code' => $languageCode,
    ];

    if (!empty($components)) {
        $payload['components'] = $components;
    }

    return apiPost('/messages/send/template', $payload);
}

/**
 * Send a template message with text parameters in the body.
 *
 * @param string $channelId The UUID of the WhatsApp channel
 * @param string $contactId The UUID of the contact
 * @param string $templateName Name of the approved template
 * @param array $bodyParams List of text values for body placeholders
 * @param string $languageCode Language code (default: en)
 * @return array The created message object
 * @throws Exception If the API request fails
 */
function sendTemplateWithTextParams(
    string $channelId,
    string $contactId,
    string $templateName,
    array $bodyParams,
    string $languageCode = 'en'
): array {
    $components = [
        [
            'type' => 'body',
            'parameters' => array_map(function ($param) {
                return ['type' => 'text', 'text' => $param];
            }, $bodyParams),
        ],
    ];

    return sendTemplateMessage($channelId, $contactId, $templateName, $languageCode, $components);
}

/**
 * Send a template message with an image header.
 *
 * @param string $channelId The UUID of the WhatsApp channel
 * @param string $contactId The UUID of the contact
 * @param string $templateName Name of the approved template
 * @param string $imageUrl URL of the header image
 * @param array $bodyParams Optional list of text values for body placeholders
 * @param string $languageCode Language code (default: en)
 * @return array The created message object
 * @throws Exception If the API request fails
 */
function sendTemplateWithHeaderImage(
    string $channelId,
    string $contactId,
    string $templateName,
    string $imageUrl,
    array $bodyParams = [],
    string $languageCode = 'en'
): array {
    $components = [
        [
            'type' => 'header',
            'parameters' => [
                ['type' => 'image', 'image' => ['link' => $imageUrl]],
            ],
        ],
    ];

    if (!empty($bodyParams)) {
        $components[] = [
            'type' => 'body',
            'parameters' => array_map(function ($param) {
                return ['type' => 'text', 'text' => $param];
            }, $bodyParams),
        ];
    }

    return sendTemplateMessage($channelId, $contactId, $templateName, $languageCode, $components);
}

/**
 * Send a template message with a document header.
 *
 * @param string $channelId The UUID of the WhatsApp channel
 * @param string $contactId The UUID of the contact
 * @param string $templateName Name of the approved template
 * @param string $documentUrl URL of the document
 * @param string $filename Display filename for the document
 * @param array $bodyParams Optional list of text values for body placeholders
 * @param string $languageCode Language code (default: en)
 * @return array The created message object
 * @throws Exception If the API request fails
 */
function sendTemplateWithHeaderDocument(
    string $channelId,
    string $contactId,
    string $templateName,
    string $documentUrl,
    string $filename,
    array $bodyParams = [],
    string $languageCode = 'en'
): array {
    $components = [
        [
            'type' => 'header',
            'parameters' => [
                ['type' => 'document', 'document' => ['link' => $documentUrl, 'filename' => $filename]],
            ],
        ],
    ];

    if (!empty($bodyParams)) {
        $components[] = [
            'type' => 'body',
            'parameters' => array_map(function ($param) {
                return ['type' => 'text', 'text' => $param];
            }, $bodyParams),
        ];
    }

    return sendTemplateMessage($channelId, $contactId, $templateName, $languageCode, $components);
}

/**
 * Handle and display template-specific errors.
 *
 * @param Exception $error The exception object
 */
function handleTemplateError(Exception $error): void {
    $message = $error->getMessage();
    preg_match('/API Error (\d+)/', $message, $matches);
    $statusCode = isset($matches[1]) ? (int)$matches[1] : 0;

    if ($statusCode === 404) {
        echo "Template not found: $message\n";
        echo "Tip: Verify the template name exists and is approved\n";
    } elseif ($statusCode === 400) {
        if (stripos($message, 'not approved') !== false) {
            echo "Template not approved: $message\n";
            echo "Tip: Only APPROVED templates can be sent\n";
        } elseif (stripos($message, 'parameter') !== false) {
            echo "Parameter mismatch: $message\n";
            echo "Tip: Ensure the number of parameters matches the template\n";
        } else {
            echo "Bad request: $message\n";
        }
    } elseif ($statusCode === 401) {
        echo "Authentication failed: Check your API token\n";
    } elseif ($statusCode === 403) {
        echo "Permission denied: Token may lack required scopes\n";
    } else {
        echo "Error: $message\n";
    }
}

/**
 * Validate required configuration.
 *
 * @return bool True if all required variables are set
 */
function validateConfig(): bool {
    global $API_TOKEN, $TENANT_ID, $CHANNEL_ID, $CONTACT_ID;

    $missing = [];
    if (!$API_TOKEN) $missing[] = 'SENDSEVEN_API_TOKEN';
    if (!$TENANT_ID) $missing[] = 'SENDSEVEN_TENANT_ID';
    if (!$CHANNEL_ID) $missing[] = 'CHANNEL_ID';
    if (!$CONTACT_ID) $missing[] = 'CONTACT_ID';

    if (!empty($missing)) {
        echo "Error: Missing required environment variables:\n";
        foreach ($missing as $var) {
            echo "  - $var\n";
        }
        return false;
    }
    return true;
}

// Main execution
function main(): void {
    global $CHANNEL_ID, $CONTACT_ID;

    if (!validateConfig()) {
        exit(1);
    }

    // Example 1: List all approved templates
    echo str_repeat('=', 60) . "\n";
    echo "Listing approved WhatsApp templates...\n";
    echo str_repeat('=', 60) . "\n";

    try {
        $templates = listTemplates();
        if (empty($templates)) {
            echo "No approved templates found.\n";
            echo "Create templates in the WhatsApp Business Manager first.\n";
            return;
        }

        echo "Found " . count($templates) . " template(s):\n\n";
        foreach (array_slice($templates, 0, 5) as $template) {
            echo "  Name: {$template['name']}\n";
            echo "  Category: {$template['category']}\n";
            echo "  Language: {$template['language']}\n";
            echo "  Status: {$template['status']}\n";
            echo "\n";
        }
    } catch (Exception $e) {
        handleTemplateError($e);
        return;
    }

    // Example 2: List templates by category
    echo str_repeat('=', 60) . "\n";
    echo "Listing MARKETING templates...\n";
    echo str_repeat('=', 60) . "\n";

    try {
        $marketingTemplates = listTemplates('MARKETING');
        echo "Found " . count($marketingTemplates) . " marketing template(s)\n";
    } catch (Exception $e) {
        handleTemplateError($e);
    }

    // Example 3: Send a template with text parameters
    echo "\n" . str_repeat('=', 60) . "\n";
    echo "Sending template with text parameters...\n";
    echo str_repeat('=', 60) . "\n";

    try {
        $message = sendTemplateWithTextParams(
            $CHANNEL_ID,
            $CONTACT_ID,
            'order_confirmation',
            ['John Doe', 'ORD-12345'],
            'en'
        );

        echo "Template message sent successfully!\n";
        echo "  Message ID: {$message['id']}\n";
        echo "  Status: {$message['status']}\n";
    } catch (Exception $e) {
        handleTemplateError($e);
        echo "\nNote: Update template_name to match your approved template\n";
    }

    // Example 4: Send template with image header
    echo "\n" . str_repeat('=', 60) . "\n";
    echo "Sending template with image header...\n";
    echo str_repeat('=', 60) . "\n";

    try {
        $message = sendTemplateWithHeaderImage(
            $CHANNEL_ID,
            $CONTACT_ID,
            'promotion_with_image',
            'https://example.com/promo-image.jpg',
            ['Summer Sale', '50%'],
            'en'
        );

        echo "Template with image sent successfully!\n";
        echo "  Message ID: {$message['id']}\n";
    } catch (Exception $e) {
        handleTemplateError($e);
        echo "\nNote: Update template_name to match your approved template\n";
    }

    // Example 5: Send template with document header
    echo "\n" . str_repeat('=', 60) . "\n";
    echo "Sending template with document header...\n";
    echo str_repeat('=', 60) . "\n";

    try {
        $message = sendTemplateWithHeaderDocument(
            $CHANNEL_ID,
            $CONTACT_ID,
            'invoice_template',
            'https://example.com/invoice.pdf',
            'Invoice-2026-001.pdf',
            ['$199.99'],
            'en'
        );

        echo "Template with document sent successfully!\n";
        echo "  Message ID: {$message['id']}\n";
    } catch (Exception $e) {
        handleTemplateError($e);
        echo "\nNote: Update template_name to match your approved template\n";
    }
}

main();
