#!/usr/bin/env python3
"""
SendSeven API - Interactive Messages Example

Demonstrates how to send interactive messages (buttons, lists, quick replies)
using the SendSeven API.
"""

import os
import requests
from dotenv import load_dotenv

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


def check_channel_capabilities(channel_id: str) -> dict:
    """
    Check what interactive message types a channel supports.

    Args:
        channel_id: The UUID of the channel

    Returns:
        dict: The channel capabilities

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/channels/{channel_id}/capabilities"
    response = requests.get(url, headers=get_headers())
    response.raise_for_status()
    return response.json()


def send_button_message(
    channel_id: str,
    contact_id: str,
    body: str,
    buttons: list[dict]
) -> dict:
    """
    Send a button message to a contact.

    Args:
        channel_id: The UUID of the channel
        contact_id: The UUID of the contact
        body: The message body text
        buttons: List of button objects with 'id' and 'title' (max 3)

    Returns:
        dict: The created message object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/messages/send/interactive"

    payload = {
        "channel_id": channel_id,
        "contact_id": contact_id,
        "type": "buttons",
        "body": body,
        "buttons": buttons,
    }

    response = requests.post(url, json=payload, headers=get_headers())
    response.raise_for_status()
    return response.json()


def send_list_message(
    channel_id: str,
    contact_id: str,
    body: str,
    button_text: str,
    sections: list[dict]
) -> dict:
    """
    Send a list message with sections to a contact.

    Args:
        channel_id: The UUID of the channel
        contact_id: The UUID of the contact
        body: The message body text
        button_text: Text for the list button
        sections: List of section objects with 'title' and 'rows'

    Returns:
        dict: The created message object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/messages/send/interactive"

    payload = {
        "channel_id": channel_id,
        "contact_id": contact_id,
        "type": "list",
        "body": body,
        "button_text": button_text,
        "sections": sections,
    }

    response = requests.post(url, json=payload, headers=get_headers())
    response.raise_for_status()
    return response.json()


def send_quick_reply_message(
    channel_id: str,
    contact_id: str,
    body: str,
    buttons: list[dict]
) -> dict:
    """
    Send a quick reply message to a contact.

    Args:
        channel_id: The UUID of the channel
        contact_id: The UUID of the contact
        body: The message body text
        buttons: List of quick reply button objects with 'id' and 'title'

    Returns:
        dict: The created message object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/messages/send/interactive"

    payload = {
        "channel_id": channel_id,
        "contact_id": contact_id,
        "type": "quick_reply",
        "body": body,
        "buttons": buttons,
    }

    response = requests.post(url, json=payload, headers=get_headers())
    response.raise_for_status()
    return response.json()


def main():
    # Validate configuration
    if not API_TOKEN:
        print("Error: SENDSEVEN_API_TOKEN environment variable is required")
        return

    if not TENANT_ID:
        print("Error: SENDSEVEN_TENANT_ID environment variable is required")
        return

    if not CHANNEL_ID:
        print("Error: CHANNEL_ID environment variable is required")
        return

    if not CONTACT_ID:
        print("Error: CONTACT_ID environment variable is required")
        return

    # 1. Check channel capabilities first
    print(f"Checking capabilities for channel: {CHANNEL_ID}")
    try:
        capabilities = check_channel_capabilities(CHANNEL_ID)
        print(f"Channel type: {capabilities.get('channel_type', 'unknown')}")
        caps = capabilities.get("capabilities", {})
        print(f"  Buttons: {caps.get('interactive_buttons', False)}")
        print(f"  Lists: {caps.get('interactive_lists', False)}")
        print(f"  Quick Replies: {caps.get('quick_replies', False)}")
        print()
    except requests.HTTPError as e:
        print(f"Warning: Could not check capabilities: {e.response.status_code}")
        print("Proceeding anyway...")
        print()

    # 2. Send a button message
    print("Sending button message...")
    try:
        buttons = [
            {"id": "yes", "title": "Yes"},
            {"id": "no", "title": "No"},
            {"id": "maybe", "title": "Maybe Later"},
        ]

        message = send_button_message(
            channel_id=CHANNEL_ID,
            contact_id=CONTACT_ID,
            body="Would you like to proceed with your order?",
            buttons=buttons
        )

        print("Button message sent successfully!")
        print(f"  ID: {message['id']}")
        print(f"  Status: {message['status']}")
        print()

    except requests.HTTPError as e:
        print(f"Button message failed: {e.response.status_code}")
        print(f"Response: {e.response.text}")
        print()

    # 3. Send a list message
    print("Sending list message...")
    try:
        sections = [
            {
                "title": "Electronics",
                "rows": [
                    {"id": "phones", "title": "Phones", "description": "Latest smartphones"},
                    {"id": "laptops", "title": "Laptops", "description": "Portable computers"},
                ],
            },
            {
                "title": "Accessories",
                "rows": [
                    {"id": "cases", "title": "Cases", "description": "Protective cases"},
                    {"id": "chargers", "title": "Chargers", "description": "Fast chargers"},
                ],
            },
        ]

        message = send_list_message(
            channel_id=CHANNEL_ID,
            contact_id=CONTACT_ID,
            body="Browse our product catalog:",
            button_text="View Products",
            sections=sections
        )

        print("List message sent successfully!")
        print(f"  ID: {message['id']}")
        print(f"  Status: {message['status']}")
        print()

    except requests.HTTPError as e:
        print(f"List message failed: {e.response.status_code}")
        print(f"Response: {e.response.text}")
        print()

    # 4. Send a quick reply message
    print("Sending quick reply message...")
    try:
        quick_replies = [
            {"id": "excellent", "title": "Excellent"},
            {"id": "good", "title": "Good"},
            {"id": "poor", "title": "Poor"},
        ]

        message = send_quick_reply_message(
            channel_id=CHANNEL_ID,
            contact_id=CONTACT_ID,
            body="How would you rate our service today?",
            buttons=quick_replies
        )

        print("Quick reply message sent successfully!")
        print(f"  ID: {message['id']}")
        print(f"  Status: {message['status']}")

    except requests.HTTPError as e:
        print(f"Quick reply message failed: {e.response.status_code}")
        print(f"Response: {e.response.text}")


if __name__ == "__main__":
    main()
