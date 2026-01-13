/**
 * SendSeven API - Media Attachments Example (JavaScript)
 *
 * Demonstrates how to upload files and send media messages using the SendSeven API.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Configuration from environment
const API_TOKEN = process.env.SENDSEVEN_API_TOKEN;
const TENANT_ID = process.env.SENDSEVEN_TENANT_ID;
const API_URL = process.env.SENDSEVEN_API_URL || 'https://api.sendseven.com/api/v1';
const CONVERSATION_ID = process.env.CONVERSATION_ID;

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  image: 16 * 1024 * 1024,     // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
  video: 16 * 1024 * 1024,     // 16 MB
  audio: 16 * 1024 * 1024,     // 16 MB
};

// Supported content types by message type
const SUPPORTED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/amr', 'audio/opus'],
};

// Extension to content type mapping
const CONTENT_TYPES = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  // Video
  '.mp4': 'video/mp4',
  '.3gp': 'video/3gpp',
  // Audio
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.amr': 'audio/amr',
  '.opus': 'audio/opus',
};

/**
 * Get content type from file extension.
 * @param {string} filePath - Path to the file
 * @returns {string} The content type
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

/**
 * Get message type from content type.
 * @param {string} contentType - The content type
 * @returns {string} The message type (image, document, video, audio)
 */
function getMessageType(contentType) {
  for (const [msgType, types] of Object.entries(SUPPORTED_TYPES)) {
    if (types.includes(contentType)) {
      return msgType;
    }
  }
  throw new Error(`Unsupported content type: ${contentType}`);
}

/**
 * Upload a file as an attachment.
 * @param {string} filePath - Path to the file to upload
 * @returns {Promise<Object>} The created attachment object
 */
async function uploadAttachment(filePath) {
  // Validate file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileStats = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const contentType = getContentType(filePath);
  const messageType = getMessageType(contentType);

  // Check file size
  const maxSize = FILE_SIZE_LIMITS[messageType];
  if (fileStats.size > maxSize) {
    throw new Error(`File too large: ${fileStats.size} bytes (max ${maxSize} bytes for ${messageType})`);
  }

  // Read file content
  const fileContent = fs.readFileSync(filePath);

  // Create form data boundary
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

  // Build multipart form data manually
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
    Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch(`${API_URL}/attachments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'X-Tenant-ID': TENANT_ID,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  });

  if (response.status === 413) {
    throw new Error('File too large (server rejected)');
  } else if (response.status === 415) {
    throw new Error('Unsupported media type (server rejected)');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Send a message with an attachment.
 * @param {string} conversationId - The UUID of the conversation
 * @param {string} attachmentId - The UUID of the uploaded attachment
 * @param {string} messageType - Type of message (image, document, video, audio)
 * @param {string} [caption] - Optional text caption for the message
 * @returns {Promise<Object>} The created message object
 */
async function sendMediaMessage(conversationId, attachmentId, messageType, caption = null) {
  const payload = {
    conversation_id: conversationId,
    message_type: messageType,
    attachments: [attachmentId],
  };

  if (caption) {
    payload.text = caption;
  }

  const response = await fetch(`${API_URL}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'X-Tenant-ID': TENANT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Download an attachment by ID.
 * @param {string} attachmentId - The UUID of the attachment
 * @param {string} outputPath - Path to save the downloaded file
 * @returns {Promise<void>}
 */
async function downloadAttachment(attachmentId, outputPath) {
  const response = await fetch(`${API_URL}/attachments/${attachmentId}/download`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'X-Tenant-ID': TENANT_ID,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  console.log(`Downloaded to: ${outputPath}`);
}

/**
 * Upload and send an image message.
 * @param {string} conversationId - The UUID of the conversation
 * @param {string} filePath - Path to the image file
 * @param {string} [caption] - Optional caption for the image
 * @returns {Promise<Object>} The created message object
 */
async function sendImage(conversationId, filePath, caption = null) {
  console.log(`Uploading image: ${filePath}`);
  const attachment = await uploadAttachment(filePath);
  console.log(`  Uploaded: ${attachment.id}`);

  console.log('Sending image message...');
  return sendMediaMessage(conversationId, attachment.id, 'image', caption);
}

/**
 * Upload and send a document message.
 * @param {string} conversationId - The UUID of the conversation
 * @param {string} filePath - Path to the document file
 * @param {string} [caption] - Optional caption for the document
 * @returns {Promise<Object>} The created message object
 */
async function sendDocument(conversationId, filePath, caption = null) {
  console.log(`Uploading document: ${filePath}`);
  const attachment = await uploadAttachment(filePath);
  console.log(`  Uploaded: ${attachment.id}`);

  console.log('Sending document message...');
  return sendMediaMessage(conversationId, attachment.id, 'document', caption);
}

/**
 * Upload and send a video message.
 * @param {string} conversationId - The UUID of the conversation
 * @param {string} filePath - Path to the video file
 * @param {string} [caption] - Optional caption for the video
 * @returns {Promise<Object>} The created message object
 */
async function sendVideo(conversationId, filePath, caption = null) {
  console.log(`Uploading video: ${filePath}`);
  const attachment = await uploadAttachment(filePath);
  console.log(`  Uploaded: ${attachment.id}`);

  console.log('Sending video message...');
  return sendMediaMessage(conversationId, attachment.id, 'video', caption);
}

/**
 * Upload and send an audio message.
 * @param {string} conversationId - The UUID of the conversation
 * @param {string} filePath - Path to the audio file
 * @param {string} [caption] - Optional caption for the audio
 * @returns {Promise<Object>} The created message object
 */
async function sendAudio(conversationId, filePath, caption = null) {
  console.log(`Uploading audio: ${filePath}`);
  const attachment = await uploadAttachment(filePath);
  console.log(`  Uploaded: ${attachment.id}`);

  console.log('Sending audio message...');
  return sendMediaMessage(conversationId, attachment.id, 'audio', caption);
}

/**
 * Demo: Upload a file and send it as a message.
 * Automatically detects the appropriate message type.
 */
async function demoUploadAndSend(filePath) {
  const contentType = getContentType(filePath);
  const messageType = getMessageType(contentType);

  console.log(`\n--- Sending ${messageType} ---`);
  console.log(`File: ${filePath}`);
  console.log(`Content-Type: ${contentType}`);

  const attachment = await uploadAttachment(filePath);
  console.log('Attachment uploaded:');
  console.log(`  ID: ${attachment.id}`);
  console.log(`  Filename: ${attachment.filename}`);
  console.log(`  Size: ${attachment.file_size} bytes`);

  const message = await sendMediaMessage(
    CONVERSATION_ID,
    attachment.id,
    messageType,
    `Here's a ${messageType} file!`
  );

  console.log('Message sent:');
  console.log(`  ID: ${message.id}`);
  console.log(`  Status: ${message.status}`);
  console.log(`  Created at: ${message.created_at}`);

  return message;
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

  console.log('SendSeven Media Attachments Example');
  console.log('='.repeat(40));
  console.log(`API URL: ${API_URL}`);
  console.log(`Conversation: ${CONVERSATION_ID}`);

  // Check for command line argument (file to upload)
  const filePath = process.argv[2];

  if (filePath) {
    try {
      await demoUploadAndSend(filePath);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log('\nUsage: node media-attachments.js <file_path>');
    console.log('\nSupported file types:');
    console.log('  Images:    .jpg, .jpeg, .png, .gif, .webp (max 16 MB)');
    console.log('  Documents: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt (max 100 MB)');
    console.log('  Video:     .mp4, .3gp (max 16 MB)');
    console.log('  Audio:     .aac, .mp3, .ogg, .amr, .opus (max 16 MB)');
    console.log('\nExample:');
    console.log('  node media-attachments.js /path/to/image.jpg');

    // Demo with a sample file if it exists
    const sampleFiles = ['sample.jpg', 'sample.png', 'sample.pdf'];
    for (const sample of sampleFiles) {
      if (fs.existsSync(sample)) {
        console.log(`\nFound sample file: ${sample}`);
        try {
          await demoUploadAndSend(sample);
        } catch (error) {
          console.error(`Error: ${error.message}`);
        }
        break;
      }
    }
  }
}

// Export functions for use as a module
module.exports = {
  uploadAttachment,
  sendMediaMessage,
  downloadAttachment,
  sendImage,
  sendDocument,
  sendVideo,
  sendAudio,
  getContentType,
  getMessageType,
};

main();
