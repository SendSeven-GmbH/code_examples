#!/usr/bin/env ruby
# frozen_string_literal: true

##
# SendSeven API - WhatsApp Templates Example (Ruby)
#
# Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
# Features:
# - List available templates
# - Send template with text parameters
# - Send template with header (image/document)
# - Handle template categories (marketing, utility, authentication)
# - Error handling for template not found, unapproved templates

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
CHANNEL_ID = ENV['CHANNEL_ID']
CONTACT_ID = ENV['CONTACT_ID']

##
# Get common headers for API requests.
#
# @return [Hash] Headers hash
def get_headers
  {
    'Authorization' => "Bearer #{API_TOKEN}",
    'X-Tenant-ID' => TENANT_ID,
    'Content-Type' => 'application/json'
  }
end

##
# Make a GET request to the API.
#
# @param endpoint [String] API endpoint
# @param params [Hash] Query parameters
# @return [Hash, Array] Response data
# @raise [RuntimeError] If the API request fails
def api_get(endpoint, params = {})
  uri = URI("#{API_URL}#{endpoint}")
  uri.query = URI.encode_www_form(params) unless params.empty?

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Get.new(uri)
  get_headers.each { |key, value| request[key] = value }

  response = http.request(request)

  if response.code.to_i >= 400
    raise "API Error #{response.code}: #{response.body}"
  end

  JSON.parse(response.body)
end

##
# Make a POST request to the API.
#
# @param endpoint [String] API endpoint
# @param payload [Hash] Request body
# @return [Hash] Response data
# @raise [RuntimeError] If the API request fails
def api_post(endpoint, payload)
  uri = URI("#{API_URL}#{endpoint}")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'

  request = Net::HTTP::Post.new(uri)
  get_headers.each { |key, value| request[key] = value }
  request.body = payload.to_json

  response = http.request(request)

  if response.code.to_i >= 400
    raise "API Error #{response.code}: #{response.body}"
  end

  JSON.parse(response.body)
end

##
# List available WhatsApp templates.
#
# @param category [String, nil] Filter by category (MARKETING, UTILITY, AUTHENTICATION)
# @param status [String] Filter by status (default: APPROVED)
# @return [Array] List of template objects
# @raise [RuntimeError] If the API request fails
def list_templates(category = nil, status = 'APPROVED')
  params = { status: status }
  params[:category] = category if category

  data = api_get('/whatsapp/templates', params)
  data.is_a?(Hash) && data['items'] ? data['items'] : data
end

##
# Send a WhatsApp template message.
#
# @param channel_id [String] The UUID of the WhatsApp channel
# @param contact_id [String] The UUID of the contact to send to
# @param template_name [String] Name of the approved template
# @param language_code [String] Language code (default: en)
# @param components [Array] Template components with parameters
# @return [Hash] The created message object
# @raise [RuntimeError] If the API request fails
def send_template_message(channel_id, contact_id, template_name, language_code = 'en', components = [])
  payload = {
    channel_id: channel_id,
    contact_id: contact_id,
    template_name: template_name,
    language_code: language_code
  }

  payload[:components] = components unless components.empty?

  api_post('/messages/send/template', payload)
end

##
# Send a template message with text parameters in the body.
#
# @param channel_id [String] The UUID of the WhatsApp channel
# @param contact_id [String] The UUID of the contact
# @param template_name [String] Name of the approved template
# @param body_params [Array<String>] List of text values for body placeholders
# @param language_code [String] Language code (default: en)
# @return [Hash] The created message object
# @raise [RuntimeError] If the API request fails
def send_template_with_text_params(channel_id, contact_id, template_name, body_params, language_code = 'en')
  components = [
    {
      type: 'body',
      parameters: body_params.map { |param| { type: 'text', text: param } }
    }
  ]

  send_template_message(channel_id, contact_id, template_name, language_code, components)
end

##
# Send a template message with an image header.
#
# @param channel_id [String] The UUID of the WhatsApp channel
# @param contact_id [String] The UUID of the contact
# @param template_name [String] Name of the approved template
# @param image_url [String] URL of the header image
# @param body_params [Array<String>] Optional list of text values for body placeholders
# @param language_code [String] Language code (default: en)
# @return [Hash] The created message object
# @raise [RuntimeError] If the API request fails
def send_template_with_header_image(channel_id, contact_id, template_name, image_url, body_params = [], language_code = 'en')
  components = [
    {
      type: 'header',
      parameters: [{ type: 'image', image: { link: image_url } }]
    }
  ]

  unless body_params.empty?
    components << {
      type: 'body',
      parameters: body_params.map { |param| { type: 'text', text: param } }
    }
  end

  send_template_message(channel_id, contact_id, template_name, language_code, components)
end

##
# Send a template message with a document header.
#
# @param channel_id [String] The UUID of the WhatsApp channel
# @param contact_id [String] The UUID of the contact
# @param template_name [String] Name of the approved template
# @param document_url [String] URL of the document
# @param filename [String] Display filename for the document
# @param body_params [Array<String>] Optional list of text values for body placeholders
# @param language_code [String] Language code (default: en)
# @return [Hash] The created message object
# @raise [RuntimeError] If the API request fails
def send_template_with_header_document(channel_id, contact_id, template_name, document_url, filename, body_params = [], language_code = 'en')
  components = [
    {
      type: 'header',
      parameters: [{ type: 'document', document: { link: document_url, filename: filename } }]
    }
  ]

  unless body_params.empty?
    components << {
      type: 'body',
      parameters: body_params.map { |param| { type: 'text', text: param } }
    }
  end

  send_template_message(channel_id, contact_id, template_name, language_code, components)
end

##
# Handle and display template-specific errors.
#
# @param error [StandardError] The error object
def handle_template_error(error)
  message = error.message
  status_code = message.match(/API Error (\d+)/)&.[](1)&.to_i || 0

  case status_code
  when 404
    puts "Template not found: #{message}"
    puts 'Tip: Verify the template name exists and is approved'
  when 400
    if message.downcase.include?('not approved')
      puts "Template not approved: #{message}"
      puts 'Tip: Only APPROVED templates can be sent'
    elsif message.downcase.include?('parameter')
      puts "Parameter mismatch: #{message}"
      puts 'Tip: Ensure the number of parameters matches the template'
    else
      puts "Bad request: #{message}"
    end
  when 401
    puts 'Authentication failed: Check your API token'
  when 403
    puts 'Permission denied: Token may lack required scopes'
  else
    puts "Error: #{message}"
  end
end

##
# Validate required configuration.
#
# @return [Boolean] True if all required variables are set
def validate_config
  missing = []
  missing << 'SENDSEVEN_API_TOKEN' if API_TOKEN.nil? || API_TOKEN.empty?
  missing << 'SENDSEVEN_TENANT_ID' if TENANT_ID.nil? || TENANT_ID.empty?
  missing << 'CHANNEL_ID' if CHANNEL_ID.nil? || CHANNEL_ID.empty?
  missing << 'CONTACT_ID' if CONTACT_ID.nil? || CONTACT_ID.empty?

  unless missing.empty?
    puts 'Error: Missing required environment variables:'
    missing.each { |var| puts "  - #{var}" }
    return false
  end
  true
end

def main
  return unless validate_config

  # Example 1: List all approved templates
  puts '=' * 60
  puts 'Listing approved WhatsApp templates...'
  puts '=' * 60

  begin
    templates = list_templates
    if templates.empty?
      puts 'No approved templates found.'
      puts 'Create templates in the WhatsApp Business Manager first.'
      return
    end

    puts "Found #{templates.length} template(s):\n\n"
    templates.first(5).each do |template|
      puts "  Name: #{template['name']}"
      puts "  Category: #{template['category']}"
      puts "  Language: #{template['language']}"
      puts "  Status: #{template['status']}"
      puts
    end
  rescue StandardError => e
    handle_template_error(e)
    return
  end

  # Example 2: List templates by category
  puts '=' * 60
  puts 'Listing MARKETING templates...'
  puts '=' * 60

  begin
    marketing_templates = list_templates('MARKETING')
    puts "Found #{marketing_templates.length} marketing template(s)"
  rescue StandardError => e
    handle_template_error(e)
  end

  # Example 3: Send a template with text parameters
  puts "\n#{'=' * 60}"
  puts 'Sending template with text parameters...'
  puts '=' * 60

  begin
    message = send_template_with_text_params(
      CHANNEL_ID,
      CONTACT_ID,
      'order_confirmation',
      ['John Doe', 'ORD-12345'],
      'en'
    )

    puts 'Template message sent successfully!'
    puts "  Message ID: #{message['id']}"
    puts "  Status: #{message['status']}"
  rescue StandardError => e
    handle_template_error(e)
    puts "\nNote: Update template_name to match your approved template"
  end

  # Example 4: Send template with image header
  puts "\n#{'=' * 60}"
  puts 'Sending template with image header...'
  puts '=' * 60

  begin
    message = send_template_with_header_image(
      CHANNEL_ID,
      CONTACT_ID,
      'promotion_with_image',
      'https://example.com/promo-image.jpg',
      ['Summer Sale', '50%'],
      'en'
    )

    puts 'Template with image sent successfully!'
    puts "  Message ID: #{message['id']}"
  rescue StandardError => e
    handle_template_error(e)
    puts "\nNote: Update template_name to match your approved template"
  end

  # Example 5: Send template with document header
  puts "\n#{'=' * 60}"
  puts 'Sending template with document header...'
  puts '=' * 60

  begin
    message = send_template_with_header_document(
      CHANNEL_ID,
      CONTACT_ID,
      'invoice_template',
      'https://example.com/invoice.pdf',
      'Invoice-2026-001.pdf',
      ['$199.99'],
      'en'
    )

    puts 'Template with document sent successfully!'
    puts "  Message ID: #{message['id']}"
  rescue StandardError => e
    handle_template_error(e)
    puts "\nNote: Update template_name to match your approved template"
  end
end

main if __FILE__ == $PROGRAM_NAME
