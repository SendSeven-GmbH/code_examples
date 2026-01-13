#!/usr/bin/env ruby
# frozen_string_literal: true

##
# SendSeven API - Media Attachments Example (Ruby)
#
# Demonstrates how to upload files and send media messages using the SendSeven API.

require 'net/http'
require 'json'
require 'uri'

# Load .env file if it exists
def load_env_file
  env_file = File.join(__dir__, '.env')
  return unless File.exist?(env_file)

  File.readlines(env_file).each do |line|
    line = line.strip
    next if line.empty? || line.start_with?('#')

    key, value = line.split('=', 2)
    ENV[key.strip] ||= value.strip if key && value
  end
end

load_env_file

# Configuration from environment
API_TOKEN = ENV['SENDSEVEN_API_TOKEN']
TENANT_ID = ENV['SENDSEVEN_TENANT_ID']
API_URL = ENV['SENDSEVEN_API_URL'] || 'https://api.sendseven.com/api/v1'
CONVERSATION_ID = ENV['CONVERSATION_ID']

# File size limits (in bytes)
IMAGE_MAX_SIZE = 16 * 1024 * 1024      # 16 MB
DOCUMENT_MAX_SIZE = 100 * 1024 * 1024  # 100 MB
VIDEO_MAX_SIZE = 16 * 1024 * 1024      # 16 MB
AUDIO_MAX_SIZE = 16 * 1024 * 1024      # 16 MB

# Supported content types by message type
SUPPORTED_TYPES = {
  'image' => %w[image/jpeg image/png image/gif image/webp],
  'document' => [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ],
  'video' => %w[video/mp4 video/3gpp],
  'audio' => %w[audio/aac audio/mpeg audio/ogg audio/amr audio/opus]
}.freeze

# Extension to content type mapping
CONTENT_TYPES = {
  # Images
  '.jpg' => 'image/jpeg',
  '.jpeg' => 'image/jpeg',
  '.png' => 'image/png',
  '.gif' => 'image/gif',
  '.webp' => 'image/webp',
  # Documents
  '.pdf' => 'application/pdf',
  '.doc' => 'application/msword',
  '.docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls' => 'application/vnd.ms-excel',
  '.xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt' => 'application/vnd.ms-powerpoint',
  '.pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt' => 'text/plain',
  # Video
  '.mp4' => 'video/mp4',
  '.3gp' => 'video/3gpp',
  # Audio
  '.aac' => 'audio/aac',
  '.mp3' => 'audio/mpeg',
  '.ogg' => 'audio/ogg',
  '.amr' => 'audio/amr',
  '.opus' => 'audio/opus'
}.freeze

##
# Get content type from file extension.
#
# @param file_path [String] Path to the file
# @return [String] The content type
def get_content_type(file_path)
  ext = File.extname(file_path).downcase
  CONTENT_TYPES[ext] || 'application/octet-stream'
end

##
# Get message type from content type.
#
# @param content_type [String] The content type
# @return [String] The message type (image, document, video, audio)
# @raise [RuntimeError] If content type is unsupported
def get_message_type(content_type)
  SUPPORTED_TYPES.each do |msg_type, types|
    return msg_type if types.include?(content_type)
  end
  raise "Unsupported content type: #{content_type}"
end

##
# Get maximum file size for a message type.
#
# @param message_type [String] The message type
# @return [Integer] Maximum size in bytes
def get_max_size(message_type)
  case message_type
  when 'image' then IMAGE_MAX_SIZE
  when 'document' then DOCUMENT_MAX_SIZE
  when 'video' then VIDEO_MAX_SIZE
  when 'audio' then AUDIO_MAX_SIZE
  else DOCUMENT_MAX_SIZE
  end
end

##
# Upload a file as an attachment.
#
# @param file_path [String] Path to the file to upload
# @return [Hash] The created attachment object
# @raise [RuntimeError] If the API request fails
def upload_attachment(file_path)
  # Validate file exists
  raise "File not found: #{file_path}" unless File.exist?(file_path)

  file_size = File.size(file_path)
  filename = File.basename(file_path)
  content_type = get_content_type(file_path)
  message_type = get_message_type(content_type)

  # Check file size
  max_size = get_max_size(message_type)
  if file_size > max_size
    raise "File too large: #{file_size} bytes (max #{max_size} bytes for #{message_type})"
  end

  uri = URI("#{API_URL}/attachments")

  # Create multipart form data
  boundary = "----FormBoundary#{rand(36**16).to_s(36)}"
  file_content = File.binread(file_path)

  body = []
  body << "--#{boundary}\r\n"
  body << "Content-Disposition: form-data; name=\"file\"; filename=\"#{filename}\"\r\n"
  body << "Content-Type: #{content_type}\r\n\r\n"
  body << file_content
  body << "\r\n--#{boundary}--\r\n"

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Post.new(uri)
  request['Authorization'] = "Bearer #{API_TOKEN}"
  request['X-Tenant-ID'] = TENANT_ID
  request['Content-Type'] = "multipart/form-data; boundary=#{boundary}"
  request.body = body.join

  response = http.request(request)

  case response.code.to_i
  when 413
    raise 'File too large (server rejected)'
  when 415
    raise 'Unsupported media type (server rejected)'
  when 400..599
    raise "API Error #{response.code}: #{response.body}"
  end

  JSON.parse(response.body)
end

##
# Send a message with an attachment.
#
# @param conversation_id [String] The UUID of the conversation
# @param attachment_id [String] The UUID of the uploaded attachment
# @param message_type [String] Type of message (image, document, video, audio)
# @param caption [String, nil] Optional text caption for the message
# @return [Hash] The created message object
# @raise [RuntimeError] If the API request fails
def send_media_message(conversation_id, attachment_id, message_type, caption = nil)
  uri = URI("#{API_URL}/messages")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Post.new(uri)
  request['Authorization'] = "Bearer #{API_TOKEN}"
  request['X-Tenant-ID'] = TENANT_ID
  request['Content-Type'] = 'application/json'

  payload = {
    conversation_id: conversation_id,
    message_type: message_type,
    attachments: [attachment_id]
  }
  payload[:text] = caption if caption

  request.body = payload.to_json

  response = http.request(request)

  if response.code.to_i >= 400
    raise "API Error #{response.code}: #{response.body}"
  end

  JSON.parse(response.body)
end

##
# Download an attachment by ID.
#
# @param attachment_id [String] The UUID of the attachment
# @param output_path [String] Path to save the downloaded file
# @raise [RuntimeError] If the API request fails
def download_attachment(attachment_id, output_path)
  uri = URI("#{API_URL}/attachments/#{attachment_id}/download")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Get.new(uri)
  request['Authorization'] = "Bearer #{API_TOKEN}"
  request['X-Tenant-ID'] = TENANT_ID

  response = http.request(request)

  if response.code.to_i >= 400
    raise "API Error #{response.code}: #{response.body}"
  end

  File.binwrite(output_path, response.body)
  puts "Downloaded to: #{output_path}"
end

##
# Upload and send an image message.
#
# @param conversation_id [String] The UUID of the conversation
# @param file_path [String] Path to the image file
# @param caption [String, nil] Optional caption for the image
# @return [Hash] The created message object
def send_image(conversation_id, file_path, caption = nil)
  puts "Uploading image: #{file_path}"
  attachment = upload_attachment(file_path)
  puts "  Uploaded: #{attachment['id']}"

  puts 'Sending image message...'
  send_media_message(conversation_id, attachment['id'], 'image', caption)
end

##
# Upload and send a document message.
#
# @param conversation_id [String] The UUID of the conversation
# @param file_path [String] Path to the document file
# @param caption [String, nil] Optional caption for the document
# @return [Hash] The created message object
def send_document(conversation_id, file_path, caption = nil)
  puts "Uploading document: #{file_path}"
  attachment = upload_attachment(file_path)
  puts "  Uploaded: #{attachment['id']}"

  puts 'Sending document message...'
  send_media_message(conversation_id, attachment['id'], 'document', caption)
end

##
# Upload and send a video message.
#
# @param conversation_id [String] The UUID of the conversation
# @param file_path [String] Path to the video file
# @param caption [String, nil] Optional caption for the video
# @return [Hash] The created message object
def send_video(conversation_id, file_path, caption = nil)
  puts "Uploading video: #{file_path}"
  attachment = upload_attachment(file_path)
  puts "  Uploaded: #{attachment['id']}"

  puts 'Sending video message...'
  send_media_message(conversation_id, attachment['id'], 'video', caption)
end

##
# Upload and send an audio message.
#
# @param conversation_id [String] The UUID of the conversation
# @param file_path [String] Path to the audio file
# @param caption [String, nil] Optional caption for the audio
# @return [Hash] The created message object
def send_audio(conversation_id, file_path, caption = nil)
  puts "Uploading audio: #{file_path}"
  attachment = upload_attachment(file_path)
  puts "  Uploaded: #{attachment['id']}"

  puts 'Sending audio message...'
  send_media_message(conversation_id, attachment['id'], 'audio', caption)
end

##
# Demo: Upload a file and send it as a message.
# Automatically detects the appropriate message type.
#
# @param file_path [String] Path to the file to upload
# @return [Hash] The created message object
def demo_upload_and_send(file_path)
  content_type = get_content_type(file_path)
  message_type = get_message_type(content_type)

  puts "\n--- Sending #{message_type} ---"
  puts "File: #{file_path}"
  puts "Content-Type: #{content_type}"

  attachment = upload_attachment(file_path)
  puts 'Attachment uploaded:'
  puts "  ID: #{attachment['id']}"
  puts "  Filename: #{attachment['filename']}"
  puts "  Size: #{attachment['file_size']} bytes"

  message = send_media_message(
    CONVERSATION_ID,
    attachment['id'],
    message_type,
    "Here's a #{message_type} file!"
  )

  puts 'Message sent:'
  puts "  ID: #{message['id']}"
  puts "  Status: #{message['status']}"
  puts "  Created at: #{message['created_at']}"

  message
end

def main
  # Validate configuration
  if API_TOKEN.nil? || API_TOKEN.empty?
    puts 'Error: SENDSEVEN_API_TOKEN environment variable is required'
    exit 1
  end

  if TENANT_ID.nil? || TENANT_ID.empty?
    puts 'Error: SENDSEVEN_TENANT_ID environment variable is required'
    exit 1
  end

  if CONVERSATION_ID.nil? || CONVERSATION_ID.empty?
    puts 'Error: CONVERSATION_ID environment variable is required'
    exit 1
  end

  puts 'SendSeven Media Attachments Example'
  puts '=' * 40
  puts "API URL: #{API_URL}"
  puts "Conversation: #{CONVERSATION_ID}"

  # Check for command line argument (file to upload)
  file_path = ARGV[0]

  if file_path
    begin
      demo_upload_and_send(file_path)
    rescue StandardError => e
      puts "Error: #{e.message}"
      exit 1
    end
  else
    puts "\nUsage: ruby media_attachments.rb <file_path>"
    puts "\nSupported file types:"
    puts '  Images:    .jpg, .jpeg, .png, .gif, .webp (max 16 MB)'
    puts '  Documents: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt (max 100 MB)'
    puts '  Video:     .mp4, .3gp (max 16 MB)'
    puts '  Audio:     .aac, .mp3, .ogg, .amr, .opus (max 16 MB)'
    puts "\nExample:"
    puts '  ruby media_attachments.rb /path/to/image.jpg'

    # Demo with a sample file if it exists
    %w[sample.jpg sample.png sample.pdf].each do |sample|
      next unless File.exist?(sample)

      puts "\nFound sample file: #{sample}"
      begin
        demo_upload_and_send(sample)
      rescue StandardError => e
        puts "Error: #{e.message}"
      end
      break
    end
  end
end

main if __FILE__ == $PROGRAM_NAME
