/**
 * SendSeven API - WhatsApp Templates Example
 *
 * Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
 * Features:
 * - List available templates
 * - Send template with text parameters
 * - Send template with header (image/document)
 * - Handle template categories (marketing, utility, authentication)
 * - Error handling for template not found, unapproved templates
 */

require('dotenv').config();

// Configuration from environment
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN;
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID;
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';
const CHANNEL_ID = process.env.CHANNEL_ID;
const CONTACT_ID = process.env.CONTACT_ID;

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
 * List available WhatsApp templates.
 *
 * @param {string} [category] - Filter by category (MARKETING, UTILITY, AUTHENTICATION)
 * @param {string} [status='APPROVED'] - Filter by status
 * @returns {Promise<Array>} List of template objects
 */
async function listTemplates(category = null, status = 'APPROVED') {
  const params = new URLSearchParams({ status });
  if (category) {
    params.append('category', category);
  }

  const response = await fetch(`${API_URL}/whatsapp/templates?${params}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return data.items || data;
}

/**
 * Send a WhatsApp template message.
 *
 * @param {string} channelId - The UUID of the WhatsApp channel
 * @param {string} contactId - The UUID of the contact to send to
 * @param {string} templateName - Name of the approved template
 * @param {string} [languageCode='en'] - Language code
 * @param {Array} [components=[]] - Template components with parameters
 * @returns {Promise<Object>} The created message object
 */
async function sendTemplateMessage(channelId, contactId, templateName, languageCode = 'en', components = []) {
  const payload = {
    channel_id: channelId,
    contact_id: contactId,
    template_name: templateName,
    language_code: languageCode,
  };

  if (components.length > 0) {
    payload.components = components;
  }

  const response = await fetch(`${API_URL}/messages/send/template`, {
    method: 'POST',
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
 * Send a template message with text parameters in the body.
 *
 * @param {string} channelId - The UUID of the WhatsApp channel
 * @param {string} contactId - The UUID of the contact
 * @param {string} templateName - Name of the approved template
 * @param {Array<string>} bodyParams - List of text values for body placeholders
 * @param {string} [languageCode='en'] - Language code
 * @returns {Promise<Object>} The created message object
 */
async function sendTemplateWithTextParams(channelId, contactId, templateName, bodyParams, languageCode = 'en') {
  const components = [
    {
      type: 'body',
      parameters: bodyParams.map(param => ({ type: 'text', text: param })),
    },
  ];

  return sendTemplateMessage(channelId, contactId, templateName, languageCode, components);
}

/**
 * Send a template message with an image header.
 *
 * @param {string} channelId - The UUID of the WhatsApp channel
 * @param {string} contactId - The UUID of the contact
 * @param {string} templateName - Name of the approved template
 * @param {string} imageUrl - URL of the header image
 * @param {Array<string>} [bodyParams=[]] - Optional text values for body placeholders
 * @param {string} [languageCode='en'] - Language code
 * @returns {Promise<Object>} The created message object
 */
async function sendTemplateWithHeaderImage(channelId, contactId, templateName, imageUrl, bodyParams = [], languageCode = 'en') {
  const components = [
    {
      type: 'header',
      parameters: [{ type: 'image', image: { link: imageUrl } }],
    },
  ];

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map(param => ({ type: 'text', text: param })),
    });
  }

  return sendTemplateMessage(channelId, contactId, templateName, languageCode, components);
}

/**
 * Send a template message with a document header.
 *
 * @param {string} channelId - The UUID of the WhatsApp channel
 * @param {string} contactId - The UUID of the contact
 * @param {string} templateName - Name of the approved template
 * @param {string} documentUrl - URL of the document
 * @param {string} filename - Display filename for the document
 * @param {Array<string>} [bodyParams=[]] - Optional text values for body placeholders
 * @param {string} [languageCode='en'] - Language code
 * @returns {Promise<Object>} The created message object
 */
async function sendTemplateWithHeaderDocument(channelId, contactId, templateName, documentUrl, filename, bodyParams = [], languageCode = 'en') {
  const components = [
    {
      type: 'header',
      parameters: [{ type: 'document', document: { link: documentUrl, filename: filename } }],
    },
  ];

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map(param => ({ type: 'text', text: param })),
    });
  }

  return sendTemplateMessage(channelId, contactId, templateName, languageCode, components);
}

/**
 * Handle and display template-specific errors.
 *
 * @param {Error} error - The error object
 */
function handleTemplateError(error) {
  const message = error.message;
  const statusMatch = message.match(/API Error (\d+)/);
  const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;

  if (statusCode === 404) {
    console.log(`Template not found: ${message}`);
    console.log('Tip: Verify the template name exists and is approved');
  } else if (statusCode === 400) {
    if (message.toLowerCase().includes('not approved')) {
      console.log(`Template not approved: ${message}`);
      console.log('Tip: Only APPROVED templates can be sent');
    } else if (message.toLowerCase().includes('parameter')) {
      console.log(`Parameter mismatch: ${message}`);
      console.log('Tip: Ensure the number of parameters matches the template');
    } else {
      console.log(`Bad request: ${message}`);
    }
  } else if (statusCode === 401) {
    console.log('Authentication failed: Check your API token');
  } else if (statusCode === 403) {
    console.log('Permission denied: Token may lack required scopes');
  } else {
    console.log(`Error: ${message}`);
  }
}

/**
 * Validate required configuration.
 */
function validateConfig() {
  const missing = [];
  if (!API_TOKEN) missing.push('SENDSEVEN_API_TOKEN');
  if (!TENANT_ID) missing.push('SENDSEVEN_TENANT_ID');
  if (!CHANNEL_ID) missing.push('CHANNEL_ID');
  if (!CONTACT_ID) missing.push('CONTACT_ID');

  if (missing.length > 0) {
    console.error('Error: Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    return false;
  }
  return true;
}

async function main() {
  if (!validateConfig()) {
    process.exit(1);
  }

  // Example 1: List all approved templates
  console.log('='.repeat(60));
  console.log('Listing approved WhatsApp templates...');
  console.log('='.repeat(60));

  try {
    const templates = await listTemplates();
    if (templates.length === 0) {
      console.log('No approved templates found.');
      console.log('Create templates in the WhatsApp Business Manager first.');
      return;
    }

    console.log(`Found ${templates.length} template(s):\n`);
    templates.slice(0, 5).forEach(template => {
      console.log(`  Name: ${template.name}`);
      console.log(`  Category: ${template.category}`);
      console.log(`  Language: ${template.language}`);
      console.log(`  Status: ${template.status}`);
      console.log();
    });
  } catch (error) {
    handleTemplateError(error);
    return;
  }

  // Example 2: List templates by category
  console.log('='.repeat(60));
  console.log('Listing MARKETING templates...');
  console.log('='.repeat(60));

  try {
    const marketingTemplates = await listTemplates('MARKETING');
    console.log(`Found ${marketingTemplates.length} marketing template(s)`);
  } catch (error) {
    handleTemplateError(error);
  }

  // Example 3: Send a template with text parameters
  console.log('\n' + '='.repeat(60));
  console.log('Sending template with text parameters...');
  console.log('='.repeat(60));

  try {
    const message = await sendTemplateWithTextParams(
      CHANNEL_ID,
      CONTACT_ID,
      'order_confirmation',
      ['John Doe', 'ORD-12345'],
      'en'
    );

    console.log('Template message sent successfully!');
    console.log(`  Message ID: ${message.id}`);
    console.log(`  Status: ${message.status}`);
  } catch (error) {
    handleTemplateError(error);
    console.log('\nNote: Update template_name to match your approved template');
  }

  // Example 4: Send template with image header
  console.log('\n' + '='.repeat(60));
  console.log('Sending template with image header...');
  console.log('='.repeat(60));

  try {
    const message = await sendTemplateWithHeaderImage(
      CHANNEL_ID,
      CONTACT_ID,
      'promotion_with_image',
      'https://example.com/promo-image.jpg',
      ['Summer Sale', '50%'],
      'en'
    );

    console.log('Template with image sent successfully!');
    console.log(`  Message ID: ${message.id}`);
  } catch (error) {
    handleTemplateError(error);
    console.log('\nNote: Update template_name to match your approved template');
  }

  // Example 5: Send template with document header
  console.log('\n' + '='.repeat(60));
  console.log('Sending template with document header...');
  console.log('='.repeat(60));

  try {
    const message = await sendTemplateWithHeaderDocument(
      CHANNEL_ID,
      CONTACT_ID,
      'invoice_template',
      'https://example.com/invoice.pdf',
      'Invoice-2026-001.pdf',
      ['$199.99'],
      'en'
    );

    console.log('Template with document sent successfully!');
    console.log(`  Message ID: ${message.id}`);
  } catch (error) {
    handleTemplateError(error);
    console.log('\nNote: Update template_name to match your approved template');
  }
}

main();
