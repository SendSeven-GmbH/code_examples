#!/usr/bin/env ruby
# frozen_string_literal: true

##
# SendSeven API - Echo Bot Example (Ruby/Sinatra)
#
# A simple bot that automatically replies to incoming messages.

require 'sinatra'
require 'json'
require 'net/http'
require 'uri'
require 'openssl'

# Load .env file
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

# Configuration
API_TOKEN = ENV['SENDSEVEN_API_TOKEN'] || ''
TENANT_ID = ENV['SENDSEVEN_TENANT_ID'] || ''
API_URL = ENV['SENDSEVEN_API_URL'] || 'https://api.sendseven.com/api/v1'
WEBHOOK_SECRET = ENV['WEBHOOK_SECRET'] || ''
PORT = (ENV['PORT'] || '3000').to_i

set :port, PORT
set :bind, '0.0.0.0'

# Validate configuration
if API_TOKEN.empty?
  puts 'Error: SENDSEVEN_API_TOKEN environment variable is required'
  exit 1
end

if TENANT_ID.empty?
  puts 'Error: SENDSEVEN_TENANT_ID environment variable is required'
  exit 1
end

if WEBHOOK_SECRET.empty?
  puts 'Warning: WEBHOOK_SECRET not set - signatures will not be verified!'
end

# Track processed deliveries (use Redis/database in production)
$processed_deliveries = {}

##
# Verify the webhook signature using HMAC-SHA256.
def verify_signature(payload, signature, timestamp)
  return false unless signature.start_with?('sha256=')

  provided_sig = signature[7..] # Remove 'sha256=' prefix

  # Reconstruct message
  message = "#{timestamp}.#{payload}"

  # Compute expected signature
  expected_sig = OpenSSL::HMAC.hexdigest('SHA256', WEBHOOK_SECRET, message)

  # Timing-safe comparison
  secure_compare(expected_sig, provided_sig)
end

##
# Timing-safe string comparison
def secure_compare(a, b)
  return false unless a.bytesize == b.bytesize

  l = a.unpack('C*')
  res = 0
  b.each_byte { |byte| res |= byte ^ l.shift }
  res.zero?
end

##
# Send a reply message to a conversation.
def send_reply(conversation_id, text)
  uri = URI("#{API_URL}/messages")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Post.new(uri)
  request['Authorization'] = "Bearer #{API_TOKEN}"
  request['X-Tenant-ID'] = TENANT_ID
  request['Content-Type'] = 'application/json'

  request.body = {
    conversation_id: conversation_id,
    text: text,
    message_type: 'text'
  }.to_json

  response = http.request(request)

  raise "API Error #{response.code}: #{response.body}" if response.code.to_i >= 400

  JSON.parse(response.body)
end

##
# Generate a reply based on message type.
def generate_reply(message_type, message_text)
  case message_type
  when 'text'
    message_text.empty? ? 'I received your message!' : "You said: \"#{message_text}\""
  when 'image'
    'I received your image! 📷'
  when 'audio'
    'I received your audio message! 🎵'
  when 'video'
    'I received your video! 🎬'
  when 'document'
    'I received your document! 📄'
  else
    'I received your message!'
  end
end

##
# Handle incoming webhooks
post '/webhooks/sendseven' do
  content_type :json

  # Get headers
  signature = request.env['HTTP_X_SENDSEVEN_SIGNATURE'] || ''
  timestamp = request.env['HTTP_X_SENDSEVEN_TIMESTAMP'] || ''
  delivery_id = request.env['HTTP_X_SENDSEVEN_DELIVERY_ID'] || ''

  # Verify required headers
  if signature.empty? || timestamp.empty? || delivery_id.empty?
    puts 'Missing required webhook headers'
    halt 400, { error: 'Missing required headers' }.to_json
  end

  # Check for duplicate (idempotency)
  if $processed_deliveries[delivery_id]
    puts "Duplicate delivery #{delivery_id}, skipping"
    return { success: true, duplicate: true }.to_json
  end

  # Read body
  payload = request.body.read

  # Verify signature
  if !WEBHOOK_SECRET.empty? && !verify_signature(payload, signature, timestamp)
    puts "Invalid signature for delivery #{delivery_id}"
    halt 401, { error: 'Invalid signature' }.to_json
  end

  # Parse payload
  begin
    data = JSON.parse(payload)
  rescue JSON::ParserError
    halt 400, { error: 'Invalid JSON' }.to_json
  end

  event_type = data['type'] || ''

  # Only process message.received events
  unless event_type == 'message.received'
    return { success: true, skipped: true }.to_json
  end

  # Extract message details
  message = data.dig('data', 'message') || {}
  contact = data.dig('data', 'contact') || {}

  # Only respond to inbound messages (avoid loops)
  unless message['direction'] == 'inbound'
    return { success: true, skipped: 'outbound' }.to_json
  end

  conversation_id = message['conversation_id'] || ''
  message_type = message['message_type'] || 'text'
  message_text = message['text'] || ''
  contact_name = contact['name'] || 'there'

  preview = message_text[0, 50] || '[media]'
  preview = '[media]' if preview.empty?
  puts "Received message from #{contact_name}: #{preview}"

  # Generate and send reply
  reply_text = generate_reply(message_type, message_text)

  begin
    result = send_reply(conversation_id, reply_text)
    puts "Reply sent: #{result['id']}"
    $processed_deliveries[delivery_id] = true
  rescue StandardError => e
    puts "Failed to send reply: #{e.message}"
  end

  # Return 200 OK
  { success: true }.to_json
end

##
# Health check endpoint
get '/health' do
  content_type :json
  { status: 'ok' }.to_json
end

puts "Echo Bot listening on port #{PORT}"
puts "Webhook endpoint: http://localhost:#{PORT}/webhooks/sendseven"
