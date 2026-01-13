#!/usr/bin/env ruby
# frozen_string_literal: true

##
# SendSeven API - Send Message Example (Ruby)
#
# Demonstrates how to send a text message using the SendSeven API.

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

##
# Send a text message to a conversation.
#
# @param conversation_id [String] The UUID of the conversation
# @param text [String] The message text to send
# @return [Hash] The created message object
# @raise [RuntimeError] If the API request fails
def send_message(conversation_id, text)
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

  if response.code.to_i >= 400
    raise "API Error #{response.code}: #{response.body}"
  end

  JSON.parse(response.body)
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

  puts "Sending message to conversation: #{CONVERSATION_ID}"

  begin
    message = send_message(CONVERSATION_ID, 'Hello from the SendSeven Ruby SDK! 💎')

    puts 'Message sent successfully!'
    puts "  ID: #{message['id']}"
    puts "  Status: #{message['status']}"
    puts "  Created at: #{message['created_at']}"
  rescue StandardError => e
    puts "Error: #{e.message}"
    exit 1
  end
end

main if __FILE__ == $PROGRAM_NAME
