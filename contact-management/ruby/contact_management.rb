#!/usr/bin/env ruby
# frozen_string_literal: true

##
# SendSeven API - Contact Management Example (Ruby)
#
# Demonstrates CRUD operations for contacts using the SendSeven API.

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
# Make an HTTP request to the API.
#
# @param method [String] HTTP method (GET, POST, PUT, DELETE)
# @param endpoint [String] API endpoint
# @param body [Hash, nil] Request body (optional)
# @return [Hash] Parsed JSON response
# @raise [RuntimeError] If the API request fails
def make_request(method, endpoint, body = nil)
  uri = URI("#{API_URL}#{endpoint}")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = case method.upcase
            when 'GET'
              Net::HTTP::Get.new(uri)
            when 'POST'
              Net::HTTP::Post.new(uri)
            when 'PUT'
              Net::HTTP::Put.new(uri)
            when 'DELETE'
              Net::HTTP::Delete.new(uri)
            else
              raise "Unsupported HTTP method: #{method}"
            end

  request['Authorization'] = "Bearer #{API_TOKEN}"
  request['X-Tenant-ID'] = TENANT_ID
  request['Content-Type'] = 'application/json'

  request.body = body.to_json if body

  response = http.request(request)

  raise "API Error #{response.code}: #{response.body}" if response.code.to_i >= 400

  JSON.parse(response.body)
end

##
# Create a new contact.
#
# @param contact_data [Hash] Contact data
# @return [Hash] The created contact object
def create_contact(contact_data)
  make_request('POST', '/contacts', contact_data)
end

##
# List contacts with pagination.
#
# @param page [Integer] Page number (1-indexed)
# @param page_size [Integer] Number of contacts per page
# @return [Hash] Paginated response with items and pagination info
def list_contacts(page = 1, page_size = 20)
  make_request('GET', "/contacts?page=#{page}&page_size=#{page_size}")
end

##
# Get a single contact by ID.
#
# @param contact_id [String] The contact's UUID
# @return [Hash] The contact object
def get_contact(contact_id)
  make_request('GET', "/contacts/#{contact_id}")
end

##
# Update an existing contact.
#
# @param contact_id [String] The contact's UUID
# @param contact_data [Hash] Contact data to update
# @return [Hash] The updated contact object
def update_contact(contact_id, contact_data)
  make_request('PUT', "/contacts/#{contact_id}", contact_data)
end

##
# Delete a contact.
#
# @param contact_id [String] The contact's UUID
# @return [Hash] Deletion confirmation
def delete_contact(contact_id)
  make_request('DELETE', "/contacts/#{contact_id}")
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

  puts 'SendSeven Contact Management Example'
  puts '=' * 40

  begin
    # 1. Create a new contact
    puts "\n1. Creating a new contact..."
    contact = create_contact(
      phone_number: '+1234567890',
      email: 'john.doe@example.com',
      first_name: 'John',
      last_name: 'Doe',
      company: 'Acme Inc'
    )
    contact_id = contact['id']
    puts "   Created contact: #{contact_id}"
    puts "   Name: #{contact['first_name']} #{contact['last_name']}"
    puts "   Email: #{contact['email']}"
    puts "   Phone: #{contact['phone_number']}"

    # 2. List contacts
    puts "\n2. Listing contacts..."
    contacts_response = list_contacts(1, 10)
    pagination = contacts_response['pagination']
    puts "   Total contacts: #{pagination['total']}"
    puts "   Page #{pagination['page']} of #{pagination['total_pages']}"
    contacts_response['items'].first(3).each do |c|
      name = "#{c['first_name']} #{c['last_name']}".strip
      name = 'Unnamed' if name.empty?
      puts "   - #{c['id']}: #{name}"
    end

    # 3. Get single contact
    puts "\n3. Getting contact #{contact_id}..."
    fetched_contact = get_contact(contact_id)
    puts "   ID: #{fetched_contact['id']}"
    puts "   Name: #{fetched_contact['first_name']} #{fetched_contact['last_name']}"
    puts "   Company: #{fetched_contact['company']}"

    # 4. Update contact
    puts "\n4. Updating contact #{contact_id}..."
    updated_contact = update_contact(contact_id,
                                     first_name: 'Jane',
                                     company: 'New Company Inc')
    puts "   Updated name: #{updated_contact['first_name']} #{updated_contact['last_name']}"
    puts "   Updated company: #{updated_contact['company']}"

    # 5. Delete contact
    puts "\n5. Deleting contact #{contact_id}..."
    delete_result = delete_contact(contact_id)
    deleted = delete_result['success'] || true
    puts "   Deleted: #{deleted}"

    puts "\n#{'=' * 40}"
    puts 'All operations completed successfully!'
  rescue StandardError => e
    puts "\nError: #{e.message}"
    exit 1
  end
end

main if __FILE__ == $PROGRAM_NAME
