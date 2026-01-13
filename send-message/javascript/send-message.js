/**
 * SendSeven API - Send Message Example
 *
 * Demonstrates how to send a text message using the SendSeven API.
 */

require('dotenv').config();

// Configuration from environment
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN;
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID;
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';
const CONVERSATION_ID = process.env.CONVERSATION_ID;

/**
 * Send a text message to a conversation.
 *
 * @param {string} conversationId - The UUID of the conversation
 * @param {string} text - The message text to send
 * @returns {Promise<Object>} The created message object
 */
async function sendMessage(conversationId, text) {
  const response = await fetch(`${API_URL}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'X-Tenant-ID': TENANT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      text: text,
      message_type: 'text',
    }),
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

  if (!CONVERSATION_ID) {
    console.error('Error: CONVERSATION_ID environment variable is required');
    process.exit(1);
  }

  console.log(`Sending message to conversation: ${CONVERSATION_ID}`);

  try {
    const message = await sendMessage(
      CONVERSATION_ID,
      'Hello from the SendSeven JavaScript SDK! 🚀'
    );

    console.log('Message sent successfully!');
    console.log(`  ID: ${message.id}`);
    console.log(`  Status: ${message.status}`);
    console.log(`  Created at: ${message.created_at}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
