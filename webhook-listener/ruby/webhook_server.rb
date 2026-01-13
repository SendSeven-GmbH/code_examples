#!/usr/bin/env ruby
# frozen_string_literal: true

##
# SendSeven API - Webhook Listener Example (Ruby/Sinatra)
#
# Demonstrates how to receive and verify SendSeven webhook events.

require 'sinatra'
require 'json'
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
WEBHOOK_SECRET = ENV['WEBHOOK_SECRET'] || ''
PORT = (ENV['PORT'] || '3000').to_i

set :port, PORT
set :bind, '0.0.0.0'

if WEBHOOK_SECRET.empty?
  puts 'Warning: WEBHOOK_SECRET not set - signatures will not be verified!'
end

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
# Handle incoming webhooks
post '/webhooks/sendseven' do
  content_type :json

  # Get headers
  signature = request.env['HTTP_X_SENDSEVEN_SIGNATURE'] || ''
  timestamp = request.env['HTTP_X_SENDSEVEN_TIMESTAMP'] || ''
  delivery_id = request.env['HTTP_X_SENDSEVEN_DELIVERY_ID'] || ''
  event_type = request.env['HTTP_X_SENDSEVEN_EVENT'] || ''

  # Verify required headers
  if signature.empty? || timestamp.empty? || delivery_id.empty? || event_type.empty?
    puts 'Missing required webhook headers'
    halt 400, { error: 'Missing required headers' }.to_json
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

  type = data['type'] || ''
  tenant_id = data['tenant_id'] || ''

  puts "Webhook received: delivery_id=#{delivery_id}, event=#{type}, tenant=#{tenant_id}"

  # Handle different event types
  begin
    case type
    when 'message.received'
      handle_message_received(data)
    when 'message.sent'
      handle_message_sent(data)
    when 'message.delivered'
      handle_message_delivered(data)
    when 'message.failed'
      handle_message_failed(data)
    when 'conversation.created'
      handle_conversation_created(data)
    when 'conversation.closed'
      handle_conversation_closed(data)
    when 'contact.created'
      handle_contact_created(data)
    else
      puts "  Unknown event type: #{type}"
    end
  rescue StandardError => e
    puts "Error processing webhook: #{e.message}"
  end

  # Return 200 OK
  { success: true, delivery_id: delivery_id }.to_json
end

def handle_message_received(payload)
  message = payload.dig('data', 'message') || {}
  contact = payload.dig('data', 'contact') || {}
  name = contact['name'] || 'Unknown'
  text = (message['text'] || '')[0, 50]
  puts "  Message received from #{name}: #{text}"
end

def handle_message_sent(payload)
  message_id = payload.dig('data', 'message', 'id')
  puts "  Message sent: #{message_id}"
end

def handle_message_delivered(payload)
  message_id = payload.dig('data', 'message', 'id')
  puts "  Message delivered: #{message_id}"
end

def handle_message_failed(payload)
  message_id = payload.dig('data', 'message', 'id')
  error = payload.dig('data', 'error', 'message') || 'Unknown error'
  puts "  Message failed: #{message_id} - #{error}"
end

def handle_conversation_created(payload)
  conv_id = payload.dig('data', 'conversation', 'id')
  puts "  Conversation created: #{conv_id}"
end

def handle_conversation_closed(payload)
  conv_id = payload.dig('data', 'conversation', 'id')
  puts "  Conversation closed: #{conv_id}"
end

def handle_contact_created(payload)
  contact = payload.dig('data', 'contact') || {}
  name = contact['name'] || 'Unknown'
  phone = contact['phone'] || 'No phone'
  puts "  Contact created: #{name} (#{phone})"
end

puts "Webhook server listening on port #{PORT}"
puts "Webhook endpoint: http://localhost:#{PORT}/webhooks/sendseven"
