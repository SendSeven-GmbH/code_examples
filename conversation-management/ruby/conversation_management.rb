#!/usr/bin/env ruby
# frozen_string_literal: true

##
# SendSeven API - Conversation Management Example (Ruby)
#
# Demonstrates how to list, get, update, and close conversations using the SendSeven API.

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

##
# Get common headers for API requests.
def get_headers
  {
    'Authorization' => "Bearer #{API_TOKEN}",
    'X-Tenant-ID' => TENANT_ID,
    'Content-Type' => 'application/json'
  }
end

##
# List conversations with optional filtering.
#
# @param options [Hash] Filter options
# @option options [String] :status Filter by status ('open', 'closed', 'pending')
# @option options [Boolean] :needs_reply Filter to conversations awaiting reply
# @option options [String] :assigned_to Filter by assigned user ID
# @option options [String] :channel Filter by channel
# @option options [Integer] :page Page number (default: 1)
# @option options [Integer] :page_size Items per page (default: 20)
# @return [Hash] Paginated list of conversations
# @raise [RuntimeError] If the API request fails
def list_conversations(options = {})
  params = {
    'page' => options[:page] || 1,
    'page_size' => options[:page_size] || 20
  }

  params['status'] = options[:status] if options[:status]
  params['needs_reply'] = options[:needs_reply].to_s if options.key?(:needs_reply)
  params['assigned_to'] = options[:assigned_to] if options[:assigned_to]
  params['channel'] = options[:channel] if options[:channel]

  query_string = URI.encode_www_form(params)
  uri = URI("#{API_URL}/conversations?#{query_string}")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Get.new(uri)
  get_headers.each { |key, value| request[key] = value }

  response = http.request(request)

  raise "API Error #{response.code}: #{response.body}" if response.code.to_i >= 400

  JSON.parse(response.body)
end

##
# Get a single conversation by ID.
#
# @param conversation_id [String] The UUID of the conversation
# @return [Hash] The conversation object
# @raise [RuntimeError] If the API request fails
def get_conversation(conversation_id)
  uri = URI("#{API_URL}/conversations/#{conversation_id}")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Get.new(uri)
  get_headers.each { |key, value| request[key] = value }

  response = http.request(request)

  raise "API Error #{response.code}: #{response.body}" if response.code.to_i >= 400

  JSON.parse(response.body)
end

##
# Update a conversation (e.g., assign to a user).
#
# @param conversation_id [String] The UUID of the conversation
# @param assigned_to [String, nil] User ID to assign to
# @return [Hash] The updated conversation object
# @raise [RuntimeError] If the API request fails
def update_conversation(conversation_id, assigned_to: nil)
  uri = URI("#{API_URL}/conversations/#{conversation_id}")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Put.new(uri)
  get_headers.each { |key, value| request[key] = value }

  payload = {}
  payload[:assigned_to] = assigned_to if assigned_to
  request.body = payload.to_json

  response = http.request(request)

  raise "API Error #{response.code}: #{response.body}" if response.code.to_i >= 400

  JSON.parse(response.body)
end

##
# Close a conversation.
#
# @param conversation_id [String] The UUID of the conversation
# @return [Hash] The closed conversation object
# @raise [RuntimeError] If the API request fails
def close_conversation(conversation_id)
  uri = URI("#{API_URL}/conversations/#{conversation_id}/close")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Post.new(uri)
  get_headers.each { |key, value| request[key] = value }

  response = http.request(request)

  raise "API Error #{response.code}: #{response.body}" if response.code.to_i >= 400

  JSON.parse(response.body)
end

def print_separator
  puts '=' * 60
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

  begin
    # Example 1: List all open conversations that need a reply
    print_separator
    puts 'Listing open conversations that need a reply...'
    print_separator

    result = list_conversations(
      status: 'open',
      needs_reply: true,
      page_size: 5
    )

    puts "Found #{result['pagination']['total']} conversations"
    puts "Page #{result['pagination']['page']} of #{result['pagination']['total_pages']}"
    puts

    result['items'].each do |conv|
      puts "  ID: #{conv['id']}"
      puts "  Channel: #{conv['channel']}"
      puts "  Status: #{conv['status']}"
      puts "  Last message: #{conv['last_message_at'] || 'N/A'}"
      puts
    end

    # Example 2: Get a single conversation (if we have any)
    unless result['items'].empty?
      conversation_id = result['items'][0]['id']

      print_separator
      puts "Getting conversation details: #{conversation_id}"
      print_separator

      conversation = get_conversation(conversation_id)
      puts "  ID: #{conversation['id']}"
      puts "  Channel: #{conversation['channel']}"
      puts "  Status: #{conversation['status']}"
      puts "  Needs reply: #{conversation['needs_reply']}"
      puts "  Assigned to: #{conversation['assigned_to'] || 'Unassigned'}"
      if conversation['contact']
        puts "  Contact: #{conversation['contact']['name'] || 'Unknown'}"
      end
      puts

      # Example 3: Demonstrate update (commented out to avoid modifying data)
      # Uncomment to actually assign a conversation
      # print_separator
      # puts 'Assigning conversation to user...'
      # print_separator
      # user_id = 'your-user-id-here'
      # updated = update_conversation(conversation_id, assigned_to: user_id)
      # puts "  Assigned to: #{updated['assigned_to']}"
      # puts

      # Example 4: Demonstrate close (commented out to avoid modifying data)
      # Uncomment to actually close the conversation
      # print_separator
      # puts 'Closing conversation...'
      # print_separator
      # closed = close_conversation(conversation_id)
      # puts "  Status: #{closed['status']}"
      # puts "  Closed at: #{closed['closed_at']}"
    end

    print_separator
    puts 'Conversation management examples completed!'
    print_separator

  rescue StandardError => e
    puts "Error: #{e.message}"
    exit 1
  end
end

main if __FILE__ == $PROGRAM_NAME
