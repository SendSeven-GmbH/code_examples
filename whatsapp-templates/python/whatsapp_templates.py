#!/usr/bin/env python3
"""
SendSeven API - WhatsApp Templates Example

Demonstrates how to list and send WhatsApp template messages using the SendSeven API.
Features:
- List available templates
- Send template with text parameters
- Send template with header (image/document)
- Handle template categories (marketing, utility, authentication)
- Error handling for template not found, unapproved templates
"""

import os
import requests
from dotenv import load_dotenv
from typing import Optional

# Load environment variables from .env file
load_dotenv()

# Configuration from environment
API_TOKEN = os.getenv("SENDSEVEN_API_TOKEN")
TENANT_ID = os.getenv("SENDSEVEN_TENANT_ID")
API_URL = os.getenv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1")
CHANNEL_ID = os.getenv("CHANNEL_ID")
CONTACT_ID = os.getenv("CONTACT_ID")


def get_headers() -> dict:
    """Get common headers for API requests."""
    return {
        "Authorization": f"Bearer {API_TOKEN}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    }


def list_templates(category: Optional[str] = None, status: str = "APPROVED") -> list:
    """
    List available WhatsApp templates.

    Args:
        category: Filter by category (MARKETING, UTILITY, AUTHENTICATION)
        status: Filter by status (default: APPROVED)

    Returns:
        list: List of template objects

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/whatsapp/templates"
    params = {"status": status}
    if category:
        params["category"] = category

    response = requests.get(url, headers=get_headers(), params=params)
    response.raise_for_status()

    data = response.json()
    return data.get("items", data) if isinstance(data, dict) else data


def send_template_message(
    channel_id: str,
    contact_id: str,
    template_name: str,
    language_code: str = "en",
    components: Optional[list] = None,
) -> dict:
    """
    Send a WhatsApp template message.

    Args:
        channel_id: The UUID of the WhatsApp channel
        contact_id: The UUID of the contact to send to
        template_name: Name of the approved template
        language_code: Language code (default: en)
        components: Template components with parameters

    Returns:
        dict: The created message object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/messages/send/template"

    payload = {
        "channel_id": channel_id,
        "contact_id": contact_id,
        "template_name": template_name,
        "language_code": language_code,
    }

    if components:
        payload["components"] = components

    response = requests.post(url, json=payload, headers=get_headers())
    response.raise_for_status()

    return response.json()


def send_template_with_text_params(
    channel_id: str,
    contact_id: str,
    template_name: str,
    body_params: list[str],
    language_code: str = "en",
) -> dict:
    """
    Send a template message with text parameters in the body.

    Args:
        channel_id: The UUID of the WhatsApp channel
        contact_id: The UUID of the contact
        template_name: Name of the approved template
        body_params: List of text values for body placeholders
        language_code: Language code (default: en)

    Returns:
        dict: The created message object
    """
    components = [
        {
            "type": "body",
            "parameters": [{"type": "text", "text": param} for param in body_params],
        }
    ]

    return send_template_message(
        channel_id=channel_id,
        contact_id=contact_id,
        template_name=template_name,
        language_code=language_code,
        components=components,
    )


def send_template_with_header_image(
    channel_id: str,
    contact_id: str,
    template_name: str,
    image_url: str,
    body_params: Optional[list[str]] = None,
    language_code: str = "en",
) -> dict:
    """
    Send a template message with an image header.

    Args:
        channel_id: The UUID of the WhatsApp channel
        contact_id: The UUID of the contact
        template_name: Name of the approved template
        image_url: URL of the header image
        body_params: Optional list of text values for body placeholders
        language_code: Language code (default: en)

    Returns:
        dict: The created message object
    """
    components = [
        {
            "type": "header",
            "parameters": [{"type": "image", "image": {"link": image_url}}],
        }
    ]

    if body_params:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": param} for param in body_params],
            }
        )

    return send_template_message(
        channel_id=channel_id,
        contact_id=contact_id,
        template_name=template_name,
        language_code=language_code,
        components=components,
    )


def send_template_with_header_document(
    channel_id: str,
    contact_id: str,
    template_name: str,
    document_url: str,
    filename: str,
    body_params: Optional[list[str]] = None,
    language_code: str = "en",
) -> dict:
    """
    Send a template message with a document header.

    Args:
        channel_id: The UUID of the WhatsApp channel
        contact_id: The UUID of the contact
        template_name: Name of the approved template
        document_url: URL of the document
        filename: Display filename for the document
        body_params: Optional list of text values for body placeholders
        language_code: Language code (default: en)

    Returns:
        dict: The created message object
    """
    components = [
        {
            "type": "header",
            "parameters": [
                {
                    "type": "document",
                    "document": {"link": document_url, "filename": filename},
                }
            ],
        }
    ]

    if body_params:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": param} for param in body_params],
            }
        )

    return send_template_message(
        channel_id=channel_id,
        contact_id=contact_id,
        template_name=template_name,
        language_code=language_code,
        components=components,
    )


def handle_template_error(error: requests.HTTPError) -> None:
    """Handle and display template-specific errors."""
    status_code = error.response.status_code
    try:
        error_body = error.response.json()
        error_message = error_body.get("detail", error.response.text)
    except Exception:
        error_message = error.response.text

    if status_code == 404:
        print(f"Template not found: {error_message}")
        print("Tip: Verify the template name exists and is approved")
    elif status_code == 400:
        if "not approved" in error_message.lower():
            print(f"Template not approved: {error_message}")
            print("Tip: Only APPROVED templates can be sent")
        elif "parameter" in error_message.lower():
            print(f"Parameter mismatch: {error_message}")
            print("Tip: Ensure the number of parameters matches the template")
        else:
            print(f"Bad request: {error_message}")
    elif status_code == 401:
        print("Authentication failed: Check your API token")
    elif status_code == 403:
        print("Permission denied: Token may lack required scopes")
    else:
        print(f"API Error {status_code}: {error_message}")


def validate_config() -> bool:
    """Validate required configuration."""
    missing = []
    if not API_TOKEN:
        missing.append("SENDSEVEN_API_TOKEN")
    if not TENANT_ID:
        missing.append("SENDSEVEN_TENANT_ID")
    if not CHANNEL_ID:
        missing.append("CHANNEL_ID")
    if not CONTACT_ID:
        missing.append("CONTACT_ID")

    if missing:
        print("Error: Missing required environment variables:")
        for var in missing:
            print(f"  - {var}")
        return False
    return True


def main():
    if not validate_config():
        return

    # Example 1: List all approved templates
    print("=" * 60)
    print("Listing approved WhatsApp templates...")
    print("=" * 60)

    try:
        templates = list_templates()
        if not templates:
            print("No approved templates found.")
            print("Create templates in the WhatsApp Business Manager first.")
            return

        print(f"Found {len(templates)} template(s):\n")
        for template in templates[:5]:  # Show first 5
            print(f"  Name: {template.get('name')}")
            print(f"  Category: {template.get('category')}")
            print(f"  Language: {template.get('language')}")
            print(f"  Status: {template.get('status')}")
            print()

    except requests.HTTPError as e:
        handle_template_error(e)
        return

    # Example 2: List templates by category
    print("=" * 60)
    print("Listing MARKETING templates...")
    print("=" * 60)

    try:
        marketing_templates = list_templates(category="MARKETING")
        print(f"Found {len(marketing_templates)} marketing template(s)")
    except requests.HTTPError as e:
        handle_template_error(e)

    # Example 3: Send a template with text parameters
    print("\n" + "=" * 60)
    print("Sending template with text parameters...")
    print("=" * 60)

    try:
        # Example: order_confirmation template with customer name and order ID
        message = send_template_with_text_params(
            channel_id=CHANNEL_ID,
            contact_id=CONTACT_ID,
            template_name="order_confirmation",
            body_params=["John Doe", "ORD-12345"],
            language_code="en",
        )

        print("Template message sent successfully!")
        print(f"  Message ID: {message.get('id')}")
        print(f"  Status: {message.get('status')}")

    except requests.HTTPError as e:
        handle_template_error(e)
        print("\nNote: Update template_name to match your approved template")

    # Example 4: Send template with image header
    print("\n" + "=" * 60)
    print("Sending template with image header...")
    print("=" * 60)

    try:
        message = send_template_with_header_image(
            channel_id=CHANNEL_ID,
            contact_id=CONTACT_ID,
            template_name="promotion_with_image",
            image_url="https://example.com/promo-image.jpg",
            body_params=["Summer Sale", "50%"],
            language_code="en",
        )

        print("Template with image sent successfully!")
        print(f"  Message ID: {message.get('id')}")

    except requests.HTTPError as e:
        handle_template_error(e)
        print("\nNote: Update template_name to match your approved template")

    # Example 5: Send template with document header
    print("\n" + "=" * 60)
    print("Sending template with document header...")
    print("=" * 60)

    try:
        message = send_template_with_header_document(
            channel_id=CHANNEL_ID,
            contact_id=CONTACT_ID,
            template_name="invoice_template",
            document_url="https://example.com/invoice.pdf",
            filename="Invoice-2026-001.pdf",
            body_params=["$199.99"],
            language_code="en",
        )

        print("Template with document sent successfully!")
        print(f"  Message ID: {message.get('id')}")

    except requests.HTTPError as e:
        handle_template_error(e)
        print("\nNote: Update template_name to match your approved template")


if __name__ == "__main__":
    main()
