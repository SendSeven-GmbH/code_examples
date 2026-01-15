/**
 * SendSeven API - Webhook Listener Example (TypeScript/Express)
 *
 * Demonstrates how to receive and verify SendSeven webhook events.
 */

import * as dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import crypto from 'crypto';

dotenv.config();

const app = express();

// Configuration
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PORT = parseInt(process.env.PORT || '3000', 10);
const LOG_PAYLOADS = ['true', '1', 'yes'].includes((process.env.LOG_PAYLOADS || '').toLowerCase());

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
    conversation?: {
      id: string;
      channel_id: string;
    };
    contact?: {
      id: string;
      name?: string;
      phone?: string;
    };
    assigned_to?: {
      id: string;
      name?: string;
    };
    error?: {
      message: string;
    };
    subscription?: {
      list_id: string;
    };
  };
}

// Extend Request to include rawBody
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

  // Reconstruct the message
  const sortedKeys = Object.keys(payload).sort();
  const jsonPayload = JSON.stringify(payload, sortedKeys);
  const message = `${timestamp}.${jsonPayload}`;

  // Compute expected signature
  const expectedSig = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(message)
    .digest('hex');

  // Timing-safe comparison
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
 * Handle incoming SendSeven webhooks.
 */
app.post('/webhooks/sendseven', (req: WebhookRequest, res: Response) => {
  const payload = req.body;

  // Handle verification challenges (no signature verification needed)
  // SendSeven sends this when you create/update a webhook to verify ownership
  if (payload.type === 'sendseven_verification') {
    console.log(`Verification challenge received: ${payload.challenge?.slice(0, 8)}...`);
    return res.status(200).json({ challenge: payload.challenge });
  }

  const signature = req.headers['x-sendseven-signature'] as string || '';
  const timestamp = req.headers['x-sendseven-timestamp'] as string || '';
  const deliveryId = req.headers['x-sendseven-delivery-id'] as string || '';
  const eventType = req.headers['x-sendseven-event'] as string || '';

  if (!signature || !timestamp || !deliveryId || !eventType) {
    console.log('Missing required webhook headers');
    return res.status(400).json({ error: 'Missing required headers' });
  }

  if (WEBHOOK_SECRET && !verifySignature(req.body, signature, timestamp)) {
    console.log(`Invalid signature for delivery ${deliveryId}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const typedPayload = payload as WebhookPayload;
  console.log(`Webhook received: delivery_id=${deliveryId}, event=${typedPayload.type}, tenant=${typedPayload.tenant_id}`);

  // Log full payload if debugging is enabled
  if (LOG_PAYLOADS) {
    console.log('Full payload:\n' + JSON.stringify(typedPayload, null, 2));
  }

  try {
    switch (typedPayload.type) {
      case 'message.received':
        handleMessageReceived(typedPayload);
        break;
      case 'message.sent':
        handleMessageSent(typedPayload);
        break;
      case 'message.delivered':
        handleMessageDelivered(typedPayload);
        break;
      case 'message.failed':
        handleMessageFailed(typedPayload);
        break;
      case 'conversation.created':
        handleConversationCreated(typedPayload);
        break;
      case 'conversation.closed':
        handleConversationClosed(typedPayload);
        break;
      case 'conversation.assigned':
        handleConversationAssigned(typedPayload);
        break;
      case 'contact.created':
        handleContactCreated(typedPayload);
        break;
      case 'contact.updated':
        handleContactUpdated(typedPayload);
        break;
      case 'contact.deleted':
        handleContactDeleted(typedPayload);
        break;
      case 'contact.subscribed':
        handleContactSubscribed(typedPayload);
        break;
      case 'contact.unsubscribed':
        handleContactUnsubscribed(typedPayload);
        break;
      case 'link.clicked':
        handleLinkClicked(typedPayload);
        break;
      default:
        console.log(`  Unknown event type: ${typedPayload.type}`);
    }
  } catch (error) {
    console.error(`Error processing webhook: ${error}`);
  }

  res.status(200).json({ success: true, delivery_id: deliveryId });
});

function handleMessageReceived(payload: WebhookPayload): void {
  const { message, contact } = payload.data;
  console.log(`  Message received from ${contact?.name || 'Unknown'}: ${(message?.text || '').slice(0, 50)}`);
}

function handleMessageSent(payload: WebhookPayload): void {
  console.log(`  Message sent: ${payload.data.message?.id}`);
}

function handleMessageDelivered(payload: WebhookPayload): void {
  console.log(`  Message delivered: ${payload.data.message?.id}`);
}

function handleMessageFailed(payload: WebhookPayload): void {
  console.log(`  Message failed: ${payload.data.message?.id} - ${payload.data.error?.message || 'Unknown error'}`);
}

function handleConversationCreated(payload: WebhookPayload): void {
  console.log(`  Conversation created: ${payload.data.conversation?.id}`);
}

function handleConversationClosed(payload: WebhookPayload): void {
  console.log(`  Conversation closed: ${payload.data.conversation?.id}`);
}

function handleConversationAssigned(payload: WebhookPayload): void {
  const { conversation, assigned_to } = payload.data;
  console.log(`  Conversation ${conversation?.id} assigned to ${assigned_to?.name || 'Unknown'}`);
}

function handleContactCreated(payload: WebhookPayload): void {
  const { contact } = payload.data;
  console.log(`  Contact created: ${contact?.name || 'Unknown'} (${contact?.phone || 'No phone'})`);
}

function handleContactUpdated(payload: WebhookPayload): void {
  const { contact } = payload.data;
  console.log(`  Contact updated: ${contact?.id}`);
}

function handleContactDeleted(payload: WebhookPayload): void {
  const { contact } = payload.data;
  console.log(`  Contact deleted: ${contact?.id} (${contact?.name || 'Unknown'})`);
}

function handleContactSubscribed(payload: WebhookPayload): void {
  const { contact, subscription } = payload.data;
  console.log(`  Contact ${contact?.name || 'Unknown'} subscribed to list ${subscription?.list_id}`);
}

function handleContactUnsubscribed(payload: WebhookPayload): void {
  const { contact, subscription } = payload.data;
  console.log(`  Contact ${contact?.name || 'Unknown'} unsubscribed from list ${subscription?.list_id}`);
}

function handleLinkClicked(payload: WebhookPayload): void {
  const data = payload.data as any;
  const link = data.link || {};
  const contact = data.contact || {};
  console.log(`  Link clicked: ${link.url || 'Unknown URL'} by ${contact.name || 'Unknown'}`);
}

app.listen(PORT, () => {
  if (!WEBHOOK_SECRET) {
    console.log('Warning: WEBHOOK_SECRET not set - signatures will not be verified!');
  }
  console.log(`Webhook server listening on port ${PORT}`);
  console.log(`Payload logging: ${LOG_PAYLOADS ? 'ENABLED' : 'disabled'}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/sendseven`);
});
