/**
 * SendSeven API - Echo Bot Example (JavaScript/Express)
 *
 * A simple bot that automatically replies to incoming messages.
 */

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Configuration
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN || '';
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID || '';
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PORT = process.env.PORT || 3000;

// Track processed deliveries (use Redis in production)
const processedDeliveries = new Set();

// Middleware
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

/**
 * Verify webhook signature
 */
function verifySignature(payload, signature, timestamp) {
  if (!signature.startsWith('sha256=')) return false;

  const providedSig = signature.slice(7);
  const jsonPayload = JSON.stringify(payload, Object.keys(payload).sort());
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
 * Send a reply message
 */
async function sendReply(conversationId, text) {
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

  return response.json();
}

/**
 * Handle incoming webhooks
 */
app.post('/webhooks/sendseven', async (req, res) => {
  const signature = req.headers['x-sendseven-signature'] || '';
  const timestamp = req.headers['x-sendseven-timestamp'] || '';
  const deliveryId = req.headers['x-sendseven-delivery-id'] || '';

  // Verify headers
  if (!signature || !timestamp || !deliveryId) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  // Check for duplicate
  if (processedDeliveries.has(deliveryId)) {
    console.log(`Duplicate delivery ${deliveryId}, skipping`);
    return res.status(200).json({ success: true, duplicate: true });
  }

  // Verify signature
  if (WEBHOOK_SECRET && !verifySignature(req.body, signature, timestamp)) {
    console.log(`Invalid signature for delivery ${deliveryId}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body;

  // Only process message.received
  if (payload.type !== 'message.received') {
    return res.status(200).json({ success: true, skipped: true });
  }

  const { message = {}, contact = {} } = payload.data || {};

  // Only respond to inbound messages
  if (message.direction !== 'inbound') {
    return res.status(200).json({ success: true, skipped: 'outbound' });
  }

  const conversationId = message.conversation_id;
  const messageType = message.message_type || 'text';
  const messageText = message.text || '';
  const contactName = contact.name || 'there';

  console.log(`Received message from ${contactName}: ${messageText.slice(0, 50) || '[media]'}`);

  // Generate reply
  let replyText;
  switch (messageType) {
    case 'text':
      replyText = messageText ? `You said: "${messageText}"` : 'I received your message!';
      break;
    case 'image':
      replyText = 'I received your image! 📷';
      break;
    case 'audio':
      replyText = 'I received your audio message! 🎵';
      break;
    case 'video':
      replyText = 'I received your video! 🎬';
      break;
    case 'document':
      replyText = 'I received your document! 📄';
      break;
    default:
      replyText = 'I received your message!';
  }

  // Send reply
  try {
    const result = await sendReply(conversationId, replyText);
    console.log(`Reply sent: ${result.id}`);
    processedDeliveries.add(deliveryId);
  } catch (error) {
    console.error(`Failed to send reply: ${error.message}`);
  }

  res.status(200).json({ success: true });
});

// Start server
app.listen(PORT, () => {
  if (!API_TOKEN || !TENANT_ID) {
    console.error('Error: SENDSEVEN_API_TOKEN and SENDSEVEN_TENANT_ID are required');
    process.exit(1);
  }

  if (!WEBHOOK_SECRET) {
    console.log('Warning: WEBHOOK_SECRET not set');
  }

  console.log(`Echo Bot listening on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/sendseven`);
});
