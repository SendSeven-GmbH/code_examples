/**
 * SendSeven API - Contact Management Example
 *
 * Demonstrates CRUD operations for contacts using the SendSeven API.
 */

require('dotenv').config();

// Configuration from environment
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN;
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID;
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';

/**
 * Get common headers for API requests.
 */
function getHeaders() {
  return {
    'Authorization': `Bearer ${API_TOKEN}`,
    'X-Tenant-ID': TENANT_ID,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a new contact.
 *
 * @param {Object} contactData - Contact data
 * @param {string} [contactData.phone_number] - Phone number in E.164 format
 * @param {string} [contactData.email] - Email address
 * @param {string} [contactData.first_name] - Contact's first name
 * @param {string} [contactData.last_name] - Contact's last name
 * @param {string} [contactData.company] - Company name
 * @returns {Promise<Object>} The created contact object
 */
async function createContact(contactData) {
  const response = await fetch(`${API_URL}/contacts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(contactData),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * List contacts with pagination.
 *
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {number} [pageSize=20] - Number of contacts per page
 * @returns {Promise<Object>} Paginated response with items and pagination info
 */
async function listContacts(page = 1, pageSize = 20) {
  const params = new URLSearchParams({ page: page.toString(), page_size: pageSize.toString() });
  const response = await fetch(`${API_URL}/contacts?${params}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Get a single contact by ID.
 *
 * @param {string} contactId - The contact's UUID
 * @returns {Promise<Object>} The contact object
 */
async function getContact(contactId) {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Update an existing contact.
 *
 * @param {string} contactId - The contact's UUID
 * @param {Object} contactData - Contact data to update
 * @returns {Promise<Object>} The updated contact object
 */
async function updateContact(contactId, contactData) {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(contactData),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Delete a contact.
 *
 * @param {string} contactId - The contact's UUID
 * @returns {Promise<Object>} Deletion confirmation
 */
async function deleteContact(contactId) {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

async function main() {
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
      phone_number: '+1234567890',
      email: 'john.doe@example.com',
      first_name: 'John',
      last_name: 'Doe',
      company: 'Acme Inc',
    });
    const contactId = contact.id;
    console.log(`   Created contact: ${contactId}`);
    console.log(`   Name: ${contact.first_name} ${contact.last_name}`);
    console.log(`   Email: ${contact.email}`);
    console.log(`   Phone: ${contact.phone_number}`);

    // 2. List contacts
    console.log('\n2. Listing contacts...');
    const contactsResponse = await listContacts(1, 10);
    console.log(`   Total contacts: ${contactsResponse.pagination.total}`);
    console.log(`   Page ${contactsResponse.pagination.page} of ${contactsResponse.pagination.total_pages}`);
    contactsResponse.items.slice(0, 3).forEach(c => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed';
      console.log(`   - ${c.id}: ${name}`);
    });

    // 3. Get single contact
    console.log(`\n3. Getting contact ${contactId}...`);
    const fetchedContact = await getContact(contactId);
    console.log(`   ID: ${fetchedContact.id}`);
    console.log(`   Name: ${fetchedContact.first_name} ${fetchedContact.last_name}`);
    console.log(`   Company: ${fetchedContact.company}`);

    // 4. Update contact
    console.log(`\n4. Updating contact ${contactId}...`);
    const updatedContact = await updateContact(contactId, {
      first_name: 'Jane',
      company: 'New Company Inc',
    });
    console.log(`   Updated name: ${updatedContact.first_name} ${updatedContact.last_name}`);
    console.log(`   Updated company: ${updatedContact.company}`);

    // 5. Delete contact
    console.log(`\n5. Deleting contact ${contactId}...`);
    const deleteResult = await deleteContact(contactId);
    console.log(`   Deleted: ${deleteResult.success || true}`);

    console.log('\n' + '='.repeat(40));
    console.log('All operations completed successfully!');
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();
