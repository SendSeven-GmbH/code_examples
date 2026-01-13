#!/usr/bin/env python3
"""
SendSeven API - Conversation Management Example

Demonstrates how to list, get, update, and close conversations using the SendSeven API.
"""

import os
from typing import Optional
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration from environment
API_TOKEN = os.getenv("SENDSEVEN_API_TOKEN")
TENANT_ID = os.getenv("SENDSEVEN_TENANT_ID")
API_URL = os.getenv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1")


def get_headers() -> dict:
    """Get common headers for API requests."""
    return {
        "Authorization": f"Bearer {API_TOKEN}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    }


def list_conversations(
    status: Optional[str] = None,
    needs_reply: Optional[bool] = None,
    assigned_to: Optional[str] = None,
    channel: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """
    List conversations with optional filtering.

    Args:
        status: Filter by status ('open', 'closed', 'pending')
        needs_reply: Filter to conversations awaiting reply
        assigned_to: Filter by assigned user ID
        channel: Filter by channel ('whatsapp', 'telegram', 'sms', 'email', etc.)
        page: Page number (default: 1)
        page_size: Items per page (default: 20, max: 100)

    Returns:
        dict: Paginated list of conversations

    Raises:
        requests.HTTPError: If the API request fails
    """
    params = {"page": page, "page_size": page_size}

    if status:
        params["status"] = status
    if needs_reply is not None:
        params["needs_reply"] = str(needs_reply).lower()
    if assigned_to:
        params["assigned_to"] = assigned_to
    if channel:
        params["channel"] = channel

    url = f"{API_URL}/conversations?{urlencode(params)}"
    response = requests.get(url, headers=get_headers())
    response.raise_for_status()

    return response.json()


def get_conversation(conversation_id: str) -> dict:
    """
    Get a single conversation by ID.

    Args:
        conversation_id: The UUID of the conversation

    Returns:
        dict: The conversation object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/conversations/{conversation_id}"
    response = requests.get(url, headers=get_headers())
    response.raise_for_status()

    return response.json()


def update_conversation(conversation_id: str, assigned_to: Optional[str] = None) -> dict:
    """
    Update a conversation (e.g., assign to a user).

    Args:
        conversation_id: The UUID of the conversation
        assigned_to: User ID to assign the conversation to

    Returns:
        dict: The updated conversation object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/conversations/{conversation_id}"
    payload = {}

    if assigned_to is not None:
        payload["assigned_to"] = assigned_to

    response = requests.put(url, json=payload, headers=get_headers())
    response.raise_for_status()

    return response.json()


def close_conversation(conversation_id: str) -> dict:
    """
    Close a conversation.

    Args:
        conversation_id: The UUID of the conversation

    Returns:
        dict: The closed conversation object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/conversations/{conversation_id}/close"
    response = requests.post(url, headers=get_headers())
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

    try:
        # Example 1: List all open conversations that need a reply
        print("=" * 60)
        print("Listing open conversations that need a reply...")
        print("=" * 60)

        result = list_conversations(status="open", needs_reply=True, page_size=5)

        print(f"Found {result['pagination']['total']} conversations")
        print(f"Page {result['pagination']['page']} of {result['pagination']['total_pages']}")
        print()

        for conv in result["items"]:
            print(f"  ID: {conv['id']}")
            print(f"  Channel: {conv['channel']}")
            print(f"  Status: {conv['status']}")
            print(f"  Last message: {conv.get('last_message_at', 'N/A')}")
            print()

        # Example 2: Get a single conversation (if we have any)
        if result["items"]:
            conversation_id = result["items"][0]["id"]

            print("=" * 60)
            print(f"Getting conversation details: {conversation_id}")
            print("=" * 60)

            conversation = get_conversation(conversation_id)
            print(f"  ID: {conversation['id']}")
            print(f"  Channel: {conversation['channel']}")
            print(f"  Status: {conversation['status']}")
            print(f"  Needs reply: {conversation.get('needs_reply', False)}")
            print(f"  Assigned to: {conversation.get('assigned_to', 'Unassigned')}")
            if "contact" in conversation:
                print(f"  Contact: {conversation['contact'].get('name', 'Unknown')}")
            print()

            # Example 3: Demonstrate update (commented out to avoid modifying data)
            # Uncomment to actually assign a conversation
            # print("=" * 60)
            # print("Assigning conversation to user...")
            # print("=" * 60)
            # user_id = "your-user-id-here"
            # updated = update_conversation(conversation_id, assigned_to=user_id)
            # print(f"  Assigned to: {updated.get('assigned_to')}")
            # print()

            # Example 4: Demonstrate close (commented out to avoid modifying data)
            # Uncomment to actually close the conversation
            # print("=" * 60)
            # print("Closing conversation...")
            # print("=" * 60)
            # closed = close_conversation(conversation_id)
            # print(f"  Status: {closed['status']}")
            # print(f"  Closed at: {closed.get('closed_at')}")

        print("=" * 60)
        print("Conversation management examples completed!")
        print("=" * 60)

    except requests.HTTPError as e:
        print(f"API Error: {e.response.status_code}")
        print(f"Response: {e.response.text}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
