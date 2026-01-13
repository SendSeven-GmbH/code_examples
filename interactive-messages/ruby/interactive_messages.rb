#!/usr/bin/env ruby
# frozen_string_literal: true

#
# SendSeven API - Interactive Messages Example
#
# Demonstrates how to send interactive messages (buttons, lists, quick replies)
# using the SendSeven API.
#

require 'net/http'
require 'uri'
require 'json'
require 'dotenv'

# Load environment variables from .env file
Dotenv.load

# Configuration from environment
API_TOKEN = ENV['SENDSEVEN_API_TOKEN']
TENANT_ID = ENV['SENDSEVEN_TENANT_ID']
API_URL = ENV['SENDSEVEN_API_URL'] || 'https://api.sendseven.com/api/v1'
CHANNEL_ID = ENV['CHANNEL_ID']
CONTACT_ID = ENV['CONTACT_ID']

# Get common headers for API requests
def get_headers
  {
    'Authorization' => "Bearer #{API_TOKEN}",
    'X-Tenant-ID' => TENANT_ID,
    'Content-Type' => 'application/json'
  }
end

# Make an HTTP request to the API
def make_request(method, url, body = nil)
  uri = URI.parse(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = case method
            when :get
              Net::HTTP::Get.new(uri.request_uri)
            when :post
              req = Net::HTTP::Post.new(uri.request_uri)
              req.body = body.to_json if body
              req
            else
              raise "Unsupported method: #{method}"
            end

  get_headers.each { |key, value| request[key] = value }

  response = http.request(request)

  unless response.is_a?(Net::HTTPSuccess)
    raise "HTTP #{response.code}: #{response.body}"
  end

  JSON.parse(response.body)
end

# Check what interactive message types a channel supports
def check_channel_capabilities(channel_id)
  url = "#{API_URL}/channels/#{channel_id}/capabilities"
  make_request(:get, url)
end

# Send a button message to a contact
def send_button_message(channel_id, contact_id, body, buttons)
  url = "#{API_URL}/messages/send/interactive"

  payload = {
    channel_id: channel_id,
    contact_id: contact_id,
    type: 'buttons',
    body: body,
    buttons: buttons
  }

  make_request(:post, url, payload)
end

# Send a list message with sections to a contact
def send_list_message(channel_id, contact_id, body, button_text, sections)
  url = "#{API_URL}/messages/send/interactive"

  payload = {
    channel_id: channel_id,
    contact_id: contact_id,
    type: 'list',
    body: body,
    button_text: button_text,
    sections: sections
  }

  make_request(:post, url, payload)
end

# Send a quick reply message to a contact
def send_quick_reply_message(channel_id, contact_id, body, buttons)
  url = "#{API_URL}/messages/send/interactive"

  payload = {
    channel_id: channel_id,
    contact_id: contact_id,
    type: 'quick_reply',
    body: body,
    buttons: buttons
  }

  make_request(:post, url, payload)
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

  if CHANNEL_ID.nil? || CHANNEL_ID.empty?
    puts 'Error: CHANNEL_ID environment variable is required'
    exit 1
  end

  if CONTACT_ID.nil? || CONTACT_ID.empty?
    puts 'Error: CONTACT_ID environment variable is required'
    exit 1
  end

  # 1. Check channel capabilities first
  puts "Checking capabilities for channel: #{CHANNEL_ID}"
  begin
    capabilities = check_channel_capabilities(CHANNEL_ID)
    puts "Channel type: #{capabilities['channel_type'] || 'unknown'}"
    caps = capabilities['capabilities'] || {}
    puts "  Buttons: #{caps['interactive_buttons'] || false}"
    puts "  Lists: #{caps['interactive_lists'] || false}"
    puts "  Quick Replies: #{caps['quick_replies'] || false}"
    puts
  rescue StandardError => e
    puts "Warning: Could not check capabilities: #{e.message}"
    puts 'Proceeding anyway...'
    puts
  end

  # 2. Send a button message
  puts 'Sending button message...'
  begin
    buttons = [
      { id: 'yes', title: 'Yes' },
      { id: 'no', title: 'No' },
      { id: 'maybe', title: 'Maybe Later' }
    ]

    message = send_button_message(
      CHANNEL_ID,
      CONTACT_ID,
      'Would you like to proceed with your order?',
      buttons
    )

    puts 'Button message sent successfully!'
    puts "  ID: #{message['id']}"
    puts "  Status: #{message['status']}"
    puts
  rescue StandardError => e
    puts "Button message failed: #{e.message}"
    puts
  end

  # 3. Send a list message
  puts 'Sending list message...'
  begin
    sections = [
      {
        title: 'Electronics',
        rows: [
          { id: 'phones', title: 'Phones', description: 'Latest smartphones' },
          { id: 'laptops', title: 'Laptops', description: 'Portable computers' }
        ]
      },
      {
        title: 'Accessories',
        rows: [
          { id: 'cases', title: 'Cases', description: 'Protective cases' },
          { id: 'chargers', title: 'Chargers', description: 'Fast chargers' }
        ]
      }
    ]

    message = send_list_message(
      CHANNEL_ID,
      CONTACT_ID,
      'Browse our product catalog:',
      'View Products',
      sections
    )

    puts 'List message sent successfully!'
    puts "  ID: #{message['id']}"
    puts "  Status: #{message['status']}"
    puts
  rescue StandardError => e
    puts "List message failed: #{e.message}"
    puts
  end

  # 4. Send a quick reply message
  puts 'Sending quick reply message...'
  begin
    quick_replies = [
      { id: 'excellent', title: 'Excellent' },
      { id: 'good', title: 'Good' },
      { id: 'poor', title: 'Poor' }
    ]

    message = send_quick_reply_message(
      CHANNEL_ID,
      CONTACT_ID,
      'How would you rate our service today?',
      quick_replies
    )

    puts 'Quick reply message sent successfully!'
    puts "  ID: #{message['id']}"
    puts "  Status: #{message['status']}"
  rescue StandardError => e
    puts "Quick reply message failed: #{e.message}"
  end
end

main if __FILE__ == $PROGRAM_NAME
