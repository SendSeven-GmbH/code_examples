/**
 * SendSeven API - WhatsApp Templates Example (TypeScript)
 *
 * Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
 * Features:
 * - List available templates
 * - Send template with text parameters
 * - Send template with header (image/document)
 * - Handle template categories (marketing, utility, authentication)
 * - Error handling for template not found, unapproved templates
 */

import * as dotenv from 'dotenv';

dotenv.config();

// Configuration from environment
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN;
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID;
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';
const CHANNEL_ID = process.env.CHANNEL_ID;
const CONTACT_ID = process.env.CONTACT_ID;

// Type definitions
interface Template {
  id: string;
  name: string;
  namespace: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  components: TemplateComponent[];
}

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: TemplateButton[];
}

interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

interface ComponentParameter {
  type: 'text' | 'image' | 'document' | 'video';
  text?: string;
  image?: { link: string };
  document?: { link: string; filename: string };
  video?: { link: string };
}

interface SendComponent {
  type: 'header' | 'body' | 'button';
  parameters: ComponentParameter[];
  sub_type?: string;
  index?: number;
}

interface Message {
  id: string;
  conversation_id: string;
  contact_id: string;
  channel_id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  text: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
}

interface TemplatesResponse {
  items: Template[];
  pagination?: {
    page: number;
    page_size: number;
    total: number;
  };
}

/**
 * Get common headers for API requests.
 */
function getHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${API_TOKEN}`,
    'X-Tenant-ID': TENANT_ID!,
    'Content-Type': 'application/json',
  };
}

/**
 * List available WhatsApp templates.
 */
async function listTemplates(
  category: string | null = null,
  status: string = 'APPROVED'
): Promise<Template[]> {
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

  const data: TemplatesResponse | Template[] = await response.json();
  return Array.isArray(data) ? data : data.items || [];
}

/**
 * Send a WhatsApp template message.
 */
async function sendTemplateMessage(
  channelId: string,
  contactId: string,
  templateName: string,
  languageCode: string = 'en',
  components: SendComponent[] = []
): Promise<Message> {
  const payload: Record<string, unknown> = {
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

  return response.json() as Promise<Message>;
}

/**
 * Send a template message with text parameters in the body.
 */
async function sendTemplateWithTextParams(
  channelId: string,
  contactId: string,
  templateName: string,
  bodyParams: string[],
  languageCode: string = 'en'
): Promise<Message> {
  const components: SendComponent[] = [
    {
      type: 'body',
      parameters: bodyParams.map(param => ({ type: 'text', text: param })),
    },
  ];

  return sendTemplateMessage(channelId, contactId, templateName, languageCode, components);
}

/**
 * Send a template message with an image header.
 */
async function sendTemplateWithHeaderImage(
  channelId: string,
  contactId: string,
  templateName: string,
  imageUrl: string,
  bodyParams: string[] = [],
  languageCode: string = 'en'
): Promise<Message> {
  const components: SendComponent[] = [
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
 */
async function sendTemplateWithHeaderDocument(
  channelId: string,
  contactId: string,
  templateName: string,
  documentUrl: string,
  filename: string,
  bodyParams: string[] = [],
  languageCode: string = 'en'
): Promise<Message> {
  const components: SendComponent[] = [
    {
      type: 'header',
      parameters: [{ type: 'document', document: { link: documentUrl, filename } }],
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
 */
function handleTemplateError(error: Error): void {
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
function validateConfig(): boolean {
  const missing: string[] = [];
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

async function main(): Promise<void> {
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
    handleTemplateError(error as Error);
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
    handleTemplateError(error as Error);
  }

  // Example 3: Send a template with text parameters
  console.log('\n' + '='.repeat(60));
  console.log('Sending template with text parameters...');
  console.log('='.repeat(60));

  try {
    const message = await sendTemplateWithTextParams(
      CHANNEL_ID!,
      CONTACT_ID!,
      'order_confirmation',
      ['John Doe', 'ORD-12345'],
      'en'
    );

    console.log('Template message sent successfully!');
    console.log(`  Message ID: ${message.id}`);
    console.log(`  Status: ${message.status}`);
  } catch (error) {
    handleTemplateError(error as Error);
    console.log('\nNote: Update template_name to match your approved template');
  }

  // Example 4: Send template with image header
  console.log('\n' + '='.repeat(60));
  console.log('Sending template with image header...');
  console.log('='.repeat(60));

  try {
    const message = await sendTemplateWithHeaderImage(
      CHANNEL_ID!,
      CONTACT_ID!,
      'promotion_with_image',
      'https://example.com/promo-image.jpg',
      ['Summer Sale', '50%'],
      'en'
    );

    console.log('Template with image sent successfully!');
    console.log(`  Message ID: ${message.id}`);
  } catch (error) {
    handleTemplateError(error as Error);
    console.log('\nNote: Update template_name to match your approved template');
  }

  // Example 5: Send template with document header
  console.log('\n' + '='.repeat(60));
  console.log('Sending template with document header...');
  console.log('='.repeat(60));

  try {
    const message = await sendTemplateWithHeaderDocument(
      CHANNEL_ID!,
      CONTACT_ID!,
      'invoice_template',
      'https://example.com/invoice.pdf',
      'Invoice-2026-001.pdf',
      ['$199.99'],
      'en'
    );

    console.log('Template with document sent successfully!');
    console.log(`  Message ID: ${message.id}`);
  } catch (error) {
    handleTemplateError(error as Error);
    console.log('\nNote: Update template_name to match your approved template');
  }
}

main();
