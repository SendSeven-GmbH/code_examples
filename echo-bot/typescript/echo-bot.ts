/**
 * SendSeven API - Echo Bot Example (TypeScript/Express)
 *
 * A simple bot that automatically replies to incoming messages.
 */

import * as dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import crypto from 'crypto';

dotenv.config();

const app = express();

// Configuration
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN || '';
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID || '';
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PORT = parseInt(process.env.PORT || '3000', 10);

// Track processed deliveries (use Redis in production)
const processedDeliveries = new Set<string>();

// Types
interface WebhookPayload {
  id: string;
  type: string;
  created_at: string;
  tenant_id: string;
  event_id: string;
  data: {
    message?: {
      id: string;
      conversation_id: string;
      direction: string;
      message_type: string;
      text?: string;
      status: string;
    };
    contact?: {
      id: string;
      name?: string;
      phone?: string;
    };
  };
}

interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  message_type: string;
  text: string;
  status: string;
  created_at: string;
}

interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

// Middleware to capture raw body for signature verification
app.use(express.json({
  verify: (req: WebhookRequest, _res, buf) => {
    req.rawBody = buf;
  }
}));

/**
 * Verify the webhook signature using HMAC-SHA256.
 */
function verifySignature(payload: object, signature: string, timestamp: string): boolean {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const providedSig = signature.slice(7);
  const sortedKeys = Object.keys(payload).sort();
  const jsonPayload = JSON.stringify(payload, sortedKeys);
  const message = `${timestamp}.${jsonPayload}`;

  const expectedSig = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(providedSig)
    );
  } catch {
    return false;
  }
}

/**
 * Send a reply message to a conversation.
 */
async function sendReply(conversationId: string, text: string): Promise<Message> {
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
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }

  return response.json() as Promise<Message>;
}

/**
 * Generate a reply based on message type.
 */
function generateReply(messageType: string, messageText: string): string {
  switch (messageType) {
    case 'text':
      return messageText ? `You said: "${messageText}"` : 'I received your message!';
    case 'image':
      return 'I received your image! 📷';
    case 'audio':
      return 'I received your audio message! 🎵';
    case 'video':
      return 'I received your video! 🎬';
    case 'document':
      return 'I received your document! 📄';
    default:
      return 'I received your message!';
  }
}

/**
 * Handle incoming webhooks.
 */
app.post('/webhooks/sendseven', async (req: WebhookRequest, res: Response) => {
  const signature = req.headers['x-sendseven-signature'] as string || '';
  const timestamp = req.headers['x-sendseven-timestamp'] as string || '';
  const deliveryId = req.headers['x-sendseven-delivery-id'] as string || '';

  // Verify required headers
  if (!signature || !timestamp || !deliveryId) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  // Check for duplicate (idempotency)
  if (processedDeliveries.has(deliveryId)) {
    console.log(`Duplicate delivery ${deliveryId}, skipping`);
    return res.status(200).json({ success: true, duplicate: true });
  }

  // Verify signature
  if (WEBHOOK_SECRET && !verifySignature(req.body, signature, timestamp)) {
    console.log(`Invalid signature for delivery ${deliveryId}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body as WebhookPayload;

  // Only process message.received events
  if (payload.type !== 'message.received') {
    return res.status(200).json({ success: true, skipped: true });
  }

  const { message, contact } = payload.data || {};

  // Only respond to inbound messages (avoid loops)
  if (!message || message.direction !== 'inbound') {
    return res.status(200).json({ success: true, skipped: 'outbound' });
  }

  const conversationId = message.conversation_id;
  const messageType = message.message_type || 'text';
  const messageText = message.text || '';
  const contactName = contact?.name || 'there';

  console.log(`Received message from ${contactName}: ${messageText.slice(0, 50) || '[media]'}`);

  // Generate and send reply
  const replyText = generateReply(messageType, messageText);

  try {
    const result = await sendReply(conversationId, replyText);
    console.log(`Reply sent: ${result.id}`);
    processedDeliveries.add(deliveryId);
  } catch (error) {
    console.error(`Failed to send reply: ${error instanceof Error ? error.message : error}`);
  }

  res.status(200).json({ success: true });
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  if (!API_TOKEN || !TENANT_ID) {
    console.error('Error: SENDSEVEN_API_TOKEN and SENDSEVEN_TENANT_ID are required');
    process.exit(1);
  }

  if (!WEBHOOK_SECRET) {
    console.log('Warning: WEBHOOK_SECRET not set - signatures will not be verified!');
  }

  console.log(`Echo Bot listening on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/sendseven`);
});
