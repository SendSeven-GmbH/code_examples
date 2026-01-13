/**
 * SendSeven API - Conversation Management Example
 *
 * Demonstrates how to list, get, update, and close conversations using the SendSeven API.
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
 * List conversations with optional filtering.
 *
 * @param {Object} options - Filter options
 * @param {string} [options.status] - Filter by status ('open', 'closed', 'pending')
 * @param {boolean} [options.needsReply] - Filter to conversations awaiting reply
 * @param {string} [options.assignedTo] - Filter by assigned user ID
 * @param {string} [options.channel] - Filter by channel
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.pageSize=20] - Items per page
 * @returns {Promise<Object>} Paginated list of conversations
 */
async function listConversations(options = {}) {
  const params = new URLSearchParams();
  params.append('page', options.page || 1);
  params.append('page_size', options.pageSize || 20);

  if (options.status) params.append('status', options.status);
  if (options.needsReply !== undefined) params.append('needs_reply', options.needsReply);
  if (options.assignedTo) params.append('assigned_to', options.assignedTo);
  if (options.channel) params.append('channel', options.channel);

  const response = await fetch(`${API_URL}/conversations?${params}`, {
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
 * Get a single conversation by ID.
 *
 * @param {string} conversationId - The UUID of the conversation
 * @returns {Promise<Object>} The conversation object
 */
async function getConversation(conversationId) {
  const response = await fetch(`${API_URL}/conversations/${conversationId}`, {
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
 * Update a conversation (e.g., assign to a user).
 *
 * @param {string} conversationId - The UUID of the conversation
 * @param {Object} updates - Fields to update
 * @param {string} [updates.assignedTo] - User ID to assign to
 * @returns {Promise<Object>} The updated conversation object
 */
async function updateConversation(conversationId, updates = {}) {
  const payload = {};
  if (updates.assignedTo !== undefined) {
    payload.assigned_to = updates.assignedTo;
  }

  const response = await fetch(`${API_URL}/conversations/${conversationId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Close a conversation.
 *
 * @param {string} conversationId - The UUID of the conversation
 * @returns {Promise<Object>} The closed conversation object
 */
async function closeConversation(conversationId) {
  const response = await fetch(`${API_URL}/conversations/${conversationId}/close`, {
    method: 'POST',
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

  try {
    // Example 1: List all open conversations that need a reply
    console.log('='.repeat(60));
    console.log('Listing open conversations that need a reply...');
    console.log('='.repeat(60));

    const result = await listConversations({
      status: 'open',
      needsReply: true,
      pageSize: 5,
    });

    console.log(`Found ${result.pagination.total} conversations`);
    console.log(`Page ${result.pagination.page} of ${result.pagination.total_pages}`);
    console.log();

    for (const conv of result.items) {
      console.log(`  ID: ${conv.id}`);
      console.log(`  Channel: ${conv.channel}`);
      console.log(`  Status: ${conv.status}`);
      console.log(`  Last message: ${conv.last_message_at || 'N/A'}`);
      console.log();
    }

    // Example 2: Get a single conversation (if we have any)
    if (result.items.length > 0) {
      const conversationId = result.items[0].id;

      console.log('='.repeat(60));
      console.log(`Getting conversation details: ${conversationId}`);
      console.log('='.repeat(60));

      const conversation = await getConversation(conversationId);
      console.log(`  ID: ${conversation.id}`);
      console.log(`  Channel: ${conversation.channel}`);
      console.log(`  Status: ${conversation.status}`);
      console.log(`  Needs reply: ${conversation.needs_reply || false}`);
      console.log(`  Assigned to: ${conversation.assigned_to || 'Unassigned'}`);
      if (conversation.contact) {
        console.log(`  Contact: ${conversation.contact.name || 'Unknown'}`);
      }
      console.log();

      // Example 3: Demonstrate update (commented out to avoid modifying data)
      // Uncomment to actually assign a conversation
      // console.log('='.repeat(60));
      // console.log('Assigning conversation to user...');
      // console.log('='.repeat(60));
      // const userId = 'your-user-id-here';
      // const updated = await updateConversation(conversationId, { assignedTo: userId });
      // console.log(`  Assigned to: ${updated.assigned_to}`);
      // console.log();

      // Example 4: Demonstrate close (commented out to avoid modifying data)
      // Uncomment to actually close the conversation
      // console.log('='.repeat(60));
      // console.log('Closing conversation...');
      // console.log('='.repeat(60));
      // const closed = await closeConversation(conversationId);
      // console.log(`  Status: ${closed.status}`);
      // console.log(`  Closed at: ${closed.closed_at}`);
    }

    console.log('='.repeat(60));
    console.log('Conversation management examples completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
