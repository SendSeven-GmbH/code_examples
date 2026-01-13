#!/usr/bin/env python3
"""
SendSeven API - Send Message Example

Demonstrates how to send a text message using the SendSeven API.
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
CONVERSATION_ID = os.getenv("CONVERSATION_ID")


def send_message(conversation_id: str, text: str) -> dict:
    """
    Send a text message to a conversation.

    Args:
        conversation_id: The UUID of the conversation
        text: The message text to send

    Returns:
        dict: The created message object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/messages"

    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    }

    payload = {
        "conversation_id": conversation_id,
        "text": text,
        "message_type": "text",
    }

    response = requests.post(url, json=payload, headers=headers)
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

    if not CONVERSATION_ID:
        print("Error: CONVERSATION_ID environment variable is required")
        return

    print(f"Sending message to conversation: {CONVERSATION_ID}")

    try:
        message = send_message(
            conversation_id=CONVERSATION_ID,
            text="Hello from the SendSeven Python SDK! 🐍"
        )

        print("Message sent successfully!")
        print(f"  ID: {message['id']}")
        print(f"  Status: {message['status']}")
        print(f"  Created at: {message['created_at']}")

    except requests.HTTPError as e:
        print(f"API Error: {e.response.status_code}")
        print(f"Response: {e.response.text}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
