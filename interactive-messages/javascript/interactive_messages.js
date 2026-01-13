/**
 * SendSeven API - Interactive Messages Example
 *
 * Demonstrates how to send interactive messages (buttons, lists, quick replies)
 * using the SendSeven API.
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
 * @returns {Object} Headers object
 */
function getHeaders() {
    return {
        'Authorization': `Bearer ${API_TOKEN}`,
        'X-Tenant-ID': TENANT_ID,
        'Content-Type': 'application/json',
    };
}

/**
 * Check what interactive message types a channel supports.
 * @param {string} channelId - The UUID of the channel
 * @returns {Promise<Object>} The channel capabilities
 */
async function checkChannelCapabilities(channelId) {
    const url = `${API_URL}/channels/${channelId}/capabilities`;

    const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders(),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
}

/**
 * Send a button message to a contact.
 * @param {string} channelId - The UUID of the channel
 * @param {string} contactId - The UUID of the contact
 * @param {string} body - The message body text
 * @param {Array<Object>} buttons - List of button objects with 'id' and 'title' (max 3)
 * @returns {Promise<Object>} The created message object
 */
async function sendButtonMessage(channelId, contactId, body, buttons) {
    const url = `${API_URL}/messages/send/interactive`;

    const payload = {
        channel_id: channelId,
        contact_id: contactId,
        type: 'buttons',
        body: body,
        buttons: buttons,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
}

/**
 * Send a list message with sections to a contact.
 * @param {string} channelId - The UUID of the channel
 * @param {string} contactId - The UUID of the contact
 * @param {string} body - The message body text
 * @param {string} buttonText - Text for the list button
 * @param {Array<Object>} sections - List of section objects with 'title' and 'rows'
 * @returns {Promise<Object>} The created message object
 */
async function sendListMessage(channelId, contactId, body, buttonText, sections) {
    const url = `${API_URL}/messages/send/interactive`;

    const payload = {
        channel_id: channelId,
        contact_id: contactId,
        type: 'list',
        body: body,
        button_text: buttonText,
        sections: sections,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
}

/**
 * Send a quick reply message to a contact.
 * @param {string} channelId - The UUID of the channel
 * @param {string} contactId - The UUID of the contact
 * @param {string} body - The message body text
 * @param {Array<Object>} buttons - List of quick reply button objects with 'id' and 'title'
 * @returns {Promise<Object>} The created message object
 */
async function sendQuickReplyMessage(channelId, contactId, body, buttons) {
    const url = `${API_URL}/messages/send/interactive`;

    const payload = {
        channel_id: channelId,
        contact_id: contactId,
        type: 'quick_reply',
        body: body,
        buttons: buttons,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
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

    if (!CHANNEL_ID) {
        console.error('Error: CHANNEL_ID environment variable is required');
        process.exit(1);
    }

    if (!CONTACT_ID) {
        console.error('Error: CONTACT_ID environment variable is required');
        process.exit(1);
    }

    // 1. Check channel capabilities first
    console.log(`Checking capabilities for channel: ${CHANNEL_ID}`);
    try {
        const capabilities = await checkChannelCapabilities(CHANNEL_ID);
        console.log(`Channel type: ${capabilities.channel_type || 'unknown'}`);
        const caps = capabilities.capabilities || {};
        console.log(`  Buttons: ${caps.interactive_buttons || false}`);
        console.log(`  Lists: ${caps.interactive_lists || false}`);
        console.log(`  Quick Replies: ${caps.quick_replies || false}`);
        console.log();
    } catch (error) {
        console.log(`Warning: Could not check capabilities: ${error.message}`);
        console.log('Proceeding anyway...');
        console.log();
    }

    // 2. Send a button message
    console.log('Sending button message...');
    try {
        const buttons = [
            { id: 'yes', title: 'Yes' },
            { id: 'no', title: 'No' },
            { id: 'maybe', title: 'Maybe Later' },
        ];

        const message = await sendButtonMessage(
            CHANNEL_ID,
            CONTACT_ID,
            'Would you like to proceed with your order?',
            buttons
        );

        console.log('Button message sent successfully!');
        console.log(`  ID: ${message.id}`);
        console.log(`  Status: ${message.status}`);
        console.log();
    } catch (error) {
        console.error(`Button message failed: ${error.message}`);
        console.log();
    }

    // 3. Send a list message
    console.log('Sending list message...');
    try {
        const sections = [
            {
                title: 'Electronics',
                rows: [
                    { id: 'phones', title: 'Phones', description: 'Latest smartphones' },
                    { id: 'laptops', title: 'Laptops', description: 'Portable computers' },
                ],
            },
            {
                title: 'Accessories',
                rows: [
                    { id: 'cases', title: 'Cases', description: 'Protective cases' },
                    { id: 'chargers', title: 'Chargers', description: 'Fast chargers' },
                ],
            },
        ];

        const message = await sendListMessage(
            CHANNEL_ID,
            CONTACT_ID,
            'Browse our product catalog:',
            'View Products',
            sections
        );

        console.log('List message sent successfully!');
        console.log(`  ID: ${message.id}`);
        console.log(`  Status: ${message.status}`);
        console.log();
    } catch (error) {
        console.error(`List message failed: ${error.message}`);
        console.log();
    }

    // 4. Send a quick reply message
    console.log('Sending quick reply message...');
    try {
        const quickReplies = [
            { id: 'excellent', title: 'Excellent' },
            { id: 'good', title: 'Good' },
            { id: 'poor', title: 'Poor' },
        ];

        const message = await sendQuickReplyMessage(
            CHANNEL_ID,
            CONTACT_ID,
            'How would you rate our service today?',
            quickReplies
        );

        console.log('Quick reply message sent successfully!');
        console.log(`  ID: ${message.id}`);
        console.log(`  Status: ${message.status}`);
    } catch (error) {
        console.error(`Quick reply message failed: ${error.message}`);
    }
}

main();
