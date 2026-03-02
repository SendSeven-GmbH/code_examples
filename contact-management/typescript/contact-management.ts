/**
 * SendSeven API - Contact Management Example (TypeScript)
 *
 * Demonstrates CRUD operations for contacts using the SendSeven API.
 */

import * as dotenv from 'dotenv';

dotenv.config();

// Configuration from environment
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN;
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID;
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';

// Type definitions
interface Contact {
  id: string;
  tenant_id: string;
  phone?: string;
  email?: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

interface ContactCreateRequest {
  phone?: string;
  email?: string;
  name?: string;
}

interface ContactUpdateRequest {
  phone?: string;
  email?: string;
  name?: string;
}

interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface ContactListResponse {
  items: Contact[];
  pagination: PaginationInfo;
}

interface DeleteResponse {
  success: boolean;
  id: string;
}

/**
 * Get common headers for API requests.
 */
function getHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${API_TOKEN}`,  // Bearer token authentication
    'X-Tenant-ID': TENANT_ID!,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a new contact.
 */
async function createContact(contactData: ContactCreateRequest): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(contactData),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<Contact>;
}

/**
 * List contacts with pagination.
 */
async function listContacts(page: number = 1, pageSize: number = 20): Promise<ContactListResponse> {
  const params = new URLSearchParams({ page: page.toString(), page_size: pageSize.toString() });
  const response = await fetch(`${API_URL}/contacts?${params}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<ContactListResponse>;
}

/**
 * Get a single contact by ID.
 */
async function getContact(contactId: string): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<Contact>;
}

/**
 * Update an existing contact.
 */
async function updateContact(contactId: string, contactData: ContactUpdateRequest): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(contactData),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<Contact>;
}

/**
 * Delete a contact.
 */
async function deleteContact(contactId: string): Promise<DeleteResponse> {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<DeleteResponse>;
}

async function main(): Promise<void> {
  // Validate configuration
  if (!API_TOKEN) {
    console.error('Error: SENDSEVEN_API_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!TENANT_ID) {
    console.error('Error: SENDSEVEN_TENANT_ID environment variable is required');
    process.exit(1);
  }

  console.log('SendSeven Contact Management Example');
  console.log('='.repeat(40));

  try {
    // 1. Create a new contact
    console.log('\n1. Creating a new contact...');
    const contact = await createContact({
      phone: '+1234567890',
      email: 'john.doe@example.com',
      name: 'John Doe',
    });
    const contactId = contact.id;
    console.log(`   Created contact: ${contactId}`);
    console.log(`   Name: ${contact.name}`);
    console.log(`   Email: ${contact.email}`);
    console.log(`   Phone: ${contact.phone}`);

    // 2. List contacts
    console.log('\n2. Listing contacts...');
    const contactsResponse = await listContacts(1, 10);
    console.log(`   Total contacts: ${contactsResponse.pagination.total}`);
    console.log(`   Page ${contactsResponse.pagination.page} of ${contactsResponse.pagination.total_pages}`);
    contactsResponse.items.slice(0, 3).forEach(c => {
      // Use name or fall back to identifiers
      const name = c.name || c.phone || c.email || `Contact ${c.id.substring(0, 8)}...`;
      console.log(`   - ${c.id}: ${name}`);
    });

    // 3. Get single contact
    console.log(`\n3. Getting contact ${contactId}...`);
    const fetchedContact = await getContact(contactId);
    console.log(`   ID: ${fetchedContact.id}`);
    console.log(`   Name: ${fetchedContact.name}`);

    // 4. Update contact
    console.log(`\n4. Updating contact ${contactId}...`);
    const updatedContact = await updateContact(contactId, {
      name: 'Jane Doe',
    });
    console.log(`   Updated name: ${updatedContact.name}`);

    // 5. Delete contact
    console.log(`\n5. Deleting contact ${contactId}...`);
    const deleteResult = await deleteContact(contactId);
    console.log(`   Deleted: ${deleteResult.success}`);

    console.log('\n' + '='.repeat(40));
    console.log('All operations completed successfully!');
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
