<?php
/**
 * SendSeven API - Contact Management Example (PHP)
 *
 * Demonstrates CRUD operations for contacts using the SendSeven API.
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
 * Make an HTTP request to the API.
 */
function makeRequest(string $method, string $endpoint, ?array $data = null): array {
    global $API_URL;

    $url = $API_URL . $endpoint;
    $ch = curl_init($url);

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => getHeaders(),
    ];

    switch (strtoupper($method)) {
        case 'POST':
            $options[CURLOPT_POST] = true;
            if ($data !== null) {
                $options[CURLOPT_POSTFIELDS] = json_encode($data);
            }
            break;
        case 'PUT':
            $options[CURLOPT_CUSTOMREQUEST] = 'PUT';
            if ($data !== null) {
                $options[CURLOPT_POSTFIELDS] = json_encode($data);
            }
            break;
        case 'DELETE':
            $options[CURLOPT_CUSTOMREQUEST] = 'DELETE';
            break;
        case 'GET':
        default:
            break;
    }

    curl_setopt_array($ch, $options);

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
 * Create a new contact.
 */
function createContact(array $contactData): array {
    return makeRequest('POST', '/contacts', $contactData);
}

/**
 * List contacts with pagination.
 */
function listContacts(int $page = 1, int $pageSize = 20): array {
    return makeRequest('GET', "/contacts?page=$page&page_size=$pageSize");
}

/**
 * Get a single contact by ID.
 */
function getContact(string $contactId): array {
    return makeRequest('GET', "/contacts/$contactId");
}

/**
 * Update an existing contact.
 */
function updateContact(string $contactId, array $contactData): array {
    return makeRequest('PUT', "/contacts/$contactId", $contactData);
}

/**
 * Delete a contact.
 */
function deleteContact(string $contactId): array {
    return makeRequest('DELETE', "/contacts/$contactId");
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

    echo "SendSeven Contact Management Example\n";
    echo str_repeat('=', 40) . "\n";

    try {
        // 1. Create a new contact
        echo "\n1. Creating a new contact...\n";
        $contact = createContact([
            'phone_number' => '+1234567890',
            'email' => 'john.doe@example.com',
            'first_name' => 'John',
            'last_name' => 'Doe',
            'company' => 'Acme Inc',
        ]);
        $contactId = $contact['id'];
        echo "   Created contact: {$contactId}\n";
        echo "   Name: {$contact['first_name']} {$contact['last_name']}\n";
        echo "   Email: {$contact['email']}\n";
        echo "   Phone: {$contact['phone_number']}\n";

        // 2. List contacts
        echo "\n2. Listing contacts...\n";
        $contactsResponse = listContacts(1, 10);
        echo "   Total contacts: {$contactsResponse['pagination']['total']}\n";
        echo "   Page {$contactsResponse['pagination']['page']} of {$contactsResponse['pagination']['total_pages']}\n";
        foreach (array_slice($contactsResponse['items'], 0, 3) as $c) {
            $name = trim(($c['first_name'] ?? '') . ' ' . ($c['last_name'] ?? '')) ?: 'Unnamed';
            echo "   - {$c['id']}: $name\n";
        }

        // 3. Get single contact
        echo "\n3. Getting contact {$contactId}...\n";
        $fetchedContact = getContact($contactId);
        echo "   ID: {$fetchedContact['id']}\n";
        echo "   Name: {$fetchedContact['first_name']} {$fetchedContact['last_name']}\n";
        echo "   Company: {$fetchedContact['company']}\n";

        // 4. Update contact
        echo "\n4. Updating contact {$contactId}...\n";
        $updatedContact = updateContact($contactId, [
            'first_name' => 'Jane',
            'company' => 'New Company Inc',
        ]);
        echo "   Updated name: {$updatedContact['first_name']} {$updatedContact['last_name']}\n";
        echo "   Updated company: {$updatedContact['company']}\n";

        // 5. Delete contact
        echo "\n5. Deleting contact {$contactId}...\n";
        $deleteResult = deleteContact($contactId);
        $deleted = isset($deleteResult['success']) ? ($deleteResult['success'] ? 'true' : 'false') : 'true';
        echo "   Deleted: $deleted\n";

        echo "\n" . str_repeat('=', 40) . "\n";
        echo "All operations completed successfully!\n";
    } catch (Exception $e) {
        echo "\nError: " . $e->getMessage() . "\n";
        exit(1);
    }
}

main();
