/**
 * SendSeven API - Webhook Listener Example (JavaScript/Express)
 *
 * Demonstrates how to receive and verify SendSeven webhook events.
 */

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Configuration
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PORT = process.env.PORT || 3000;
const LOG_PAYLOADS = ['true', '1', 'yes'].includes((process.env.LOG_PAYLOADS || '').toLowerCase());

// Middleware to capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

/**
 * Verify the webhook signature using HMAC-SHA256.
 */
function verifySignature(payload, signature, timestamp) {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const providedSig = signature.slice(7); // Remove 'sha256=' prefix

  // Reconstruct the message: timestamp.json_payload
  const jsonPayload = JSON.stringify(payload, Object.keys(payload).sort());
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
app.post('/webhooks/sendseven', (req, res) => {
  const payload = req.body;

  // Handle verification challenges (no signature verification needed)
  // SendSeven sends this when you create/update a webhook to verify ownership
  if (payload.type === 'sendseven_verification') {
    console.log(`Verification challenge received: ${payload.challenge.slice(0, 8)}...`);
    return res.status(200).json({ challenge: payload.challenge });
  }

  // Get headers for regular events
  const signature = req.headers['x-sendseven-signature'] || '';
  const timestamp = req.headers['x-sendseven-timestamp'] || '';
  const deliveryId = req.headers['x-sendseven-delivery-id'] || '';
  const eventType = req.headers['x-sendseven-event'] || '';

  // Verify required headers
  if (!signature || !timestamp || !deliveryId || !eventType) {
    console.log('Missing required webhook headers');
    return res.status(400).json({ error: 'Missing required headers' });
  }

  // Verify signature
  if (WEBHOOK_SECRET && !verifySignature(req.body, signature, timestamp)) {
    console.log(`Invalid signature for delivery ${deliveryId}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const eventTypeKey = payload.type || '';
  const tenantId = payload.tenant_id || '';

  console.log(`Webhook received: delivery_id=${deliveryId}, event=${eventTypeKey}, tenant=${tenantId}`);

  // Log full payload if debugging is enabled
  if (LOG_PAYLOADS) {
    console.log('Full payload:\n' + JSON.stringify(payload, null, 2));
  }

  // Handle different event types
  try {
    switch (eventTypeKey) {
      case 'message.received':
        handleMessageReceived(payload);
        break;
      case 'message.sent':
        handleMessageSent(payload);
        break;
      case 'message.delivered':
        handleMessageDelivered(payload);
        break;
      case 'message.failed':
        handleMessageFailed(payload);
        break;
      case 'conversation.created':
        handleConversationCreated(payload);
        break;
      case 'conversation.closed':
        handleConversationClosed(payload);
        break;
      case 'conversation.assigned':
        handleConversationAssigned(payload);
        break;
      case 'contact.created':
        handleContactCreated(payload);
        break;
      case 'contact.updated':
        handleContactUpdated(payload);
        break;
      case 'contact.deleted':
        handleContactDeleted(payload);
        break;
      case 'contact.subscribed':
        handleContactSubscribed(payload);
        break;
      case 'contact.unsubscribed':
        handleContactUnsubscribed(payload);
        break;
      case 'link.clicked':
        handleLinkClicked(payload);
        break;
      default:
        console.log(`  Unknown event type: ${eventTypeKey}`);
    }
  } catch (error) {
    console.error(`Error processing webhook: ${error.message}`);
    // Still return 200 - webhook was received
  }

  // Always return 200 quickly
  res.status(200).json({ success: true, delivery_id: deliveryId });
});

function handleMessageReceived(payload) {
  const { message = {}, contact = {} } = payload.data || {};
  console.log(`  Message received from ${contact.name || 'Unknown'}: ${(message.text || '').slice(0, 50)}`);
}

function handleMessageSent(payload) {
  const { message = {} } = payload.data || {};
  console.log(`  Message sent: ${message.id}`);
}

function handleMessageDelivered(payload) {
  const { message = {} } = payload.data || {};
  console.log(`  Message delivered: ${message.id}`);
}

function handleMessageFailed(payload) {
  const { message = {}, error = {} } = payload.data || {};
  console.log(`  Message failed: ${message.id} - ${error.message || 'Unknown error'}`);
}

function handleConversationCreated(payload) {
  const { conversation = {} } = payload.data || {};
  console.log(`  Conversation created: ${conversation.id}`);
}

function handleConversationClosed(payload) {
  const { conversation = {} } = payload.data || {};
  console.log(`  Conversation closed: ${conversation.id}`);
}

function handleConversationAssigned(payload) {
  const { conversation = {}, assigned_to = {} } = payload.data || {};
  console.log(`  Conversation ${conversation.id} assigned to ${assigned_to.name || 'Unknown'}`);
}

function handleContactCreated(payload) {
  const { contact = {} } = payload.data || {};
  console.log(`  Contact created: ${contact.name || 'Unknown'} (${contact.phone || 'No phone'})`);
}

function handleContactUpdated(payload) {
  const { contact = {}, changes = {} } = payload.data || {};
  console.log(`  Contact updated: ${contact.id} - changes: ${Object.keys(changes).join(', ')}`);
}

function handleContactDeleted(payload) {
  const { contact = {} } = payload.data || {};
  console.log(`  Contact deleted: ${contact.id} (${contact.name || 'Unknown'})`);
}

function handleContactSubscribed(payload) {
  const { contact = {}, subscription = {} } = payload.data || {};
  console.log(`  Contact ${contact.name || 'Unknown'} subscribed to list ${subscription.list_id}`);
}

function handleContactUnsubscribed(payload) {
  const { contact = {}, subscription = {} } = payload.data || {};
  console.log(`  Contact ${contact.name || 'Unknown'} unsubscribed from list ${subscription.list_id}`);
}

function handleLinkClicked(payload) {
  const { link = {}, contact = {} } = payload.data || {};
  console.log(`  Link clicked: ${link.url || 'Unknown URL'} by ${contact.name || 'Unknown'}`);
}

// Start server
app.listen(PORT, () => {
  if (!WEBHOOK_SECRET) {
    console.log('Warning: WEBHOOK_SECRET not set - signatures will not be verified!');
  }
  console.log(`Webhook server listening on port ${PORT}`);
  console.log(`Payload logging: ${LOG_PAYLOADS ? 'ENABLED' : 'disabled'}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/sendseven`);
});
