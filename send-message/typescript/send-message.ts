/**
 * SendSeven API - Send Message Example (TypeScript)
 *
 * Demonstrates how to send a text message using the SendSeven API.
 */

import * as dotenv from 'dotenv';

dotenv.config();

// Configuration from environment
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN;
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID;
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';
const CONVERSATION_ID = process.env.CONVERSATION_ID;

// Type definitions
interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  text: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
}

interface SendMessageRequest {
  conversation_id: string;
  text: string;
  message_type: 'text';
}

/**
 * Send a text message to a conversation.
 */
async function sendMessage(conversationId: string, text: string): Promise<Message> {
  const payload: SendMessageRequest = {
    conversation_id: conversationId,
    text: text,
    message_type: 'text',
  };

  const response = await fetch(`${API_URL}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'X-Tenant-ID': TENANT_ID!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<Message>;
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

  if (!CONVERSATION_ID) {
    console.error('Error: CONVERSATION_ID environment variable is required');
    process.exit(1);
  }

  console.log(`Sending message to conversation: ${CONVERSATION_ID}`);

  try {
    const message = await sendMessage(
      CONVERSATION_ID,
      'Hello from the SendSeven TypeScript SDK! 📘'
    );

    console.log('Message sent successfully!');
    console.log(`  ID: ${message.id}`);
    console.log(`  Status: ${message.status}`);
    console.log(`  Created at: ${message.created_at}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
