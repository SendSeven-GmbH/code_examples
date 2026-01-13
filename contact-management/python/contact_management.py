#!/usr/bin/env python3
"""
SendSeven API - Contact Management Example

Demonstrates CRUD operations for contacts using the SendSeven API.
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


def get_headers() -> dict:
    """Get common headers for API requests."""
    return {
        "Authorization": f"Bearer {API_TOKEN}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    }


def create_contact(
    phone_number: Optional[str] = None,
    email: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    company: Optional[str] = None,
) -> dict:
    """
    Create a new contact.

    Args:
        phone_number: Phone number in E.164 format
        email: Email address
        first_name: Contact's first name
        last_name: Contact's last name
        company: Company name

    Returns:
        dict: The created contact object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/contacts"

    payload = {}
    if phone_number:
        payload["phone_number"] = phone_number
    if email:
        payload["email"] = email
    if first_name:
        payload["first_name"] = first_name
    if last_name:
        payload["last_name"] = last_name
    if company:
        payload["company"] = company

    response = requests.post(url, json=payload, headers=get_headers())
    response.raise_for_status()

    return response.json()


def list_contacts(page: int = 1, page_size: int = 20) -> dict:
    """
    List contacts with pagination.

    Args:
        page: Page number (1-indexed)
        page_size: Number of contacts per page

    Returns:
        dict: Paginated response with items and pagination info

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/contacts"
    params = {"page": page, "page_size": page_size}

    response = requests.get(url, params=params, headers=get_headers())
    response.raise_for_status()

    return response.json()


def get_contact(contact_id: str) -> dict:
    """
    Get a single contact by ID.

    Args:
        contact_id: The contact's UUID

    Returns:
        dict: The contact object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/contacts/{contact_id}"

    response = requests.get(url, headers=get_headers())
    response.raise_for_status()

    return response.json()


def update_contact(
    contact_id: str,
    phone_number: Optional[str] = None,
    email: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    company: Optional[str] = None,
) -> dict:
    """
    Update an existing contact.

    Args:
        contact_id: The contact's UUID
        phone_number: Phone number in E.164 format
        email: Email address
        first_name: Contact's first name
        last_name: Contact's last name
        company: Company name

    Returns:
        dict: The updated contact object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/contacts/{contact_id}"

    payload = {}
    if phone_number is not None:
        payload["phone_number"] = phone_number
    if email is not None:
        payload["email"] = email
    if first_name is not None:
        payload["first_name"] = first_name
    if last_name is not None:
        payload["last_name"] = last_name
    if company is not None:
        payload["company"] = company

    response = requests.put(url, json=payload, headers=get_headers())
    response.raise_for_status()

    return response.json()


def delete_contact(contact_id: str) -> dict:
    """
    Delete a contact.

    Args:
        contact_id: The contact's UUID

    Returns:
        dict: Deletion confirmation

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/contacts/{contact_id}"

    response = requests.delete(url, headers=get_headers())
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

    print("SendSeven Contact Management Example")
    print("=" * 40)

    try:
        # 1. Create a new contact
        print("\n1. Creating a new contact...")
        contact = create_contact(
            phone_number="+1234567890",
            email="john.doe@example.com",
            first_name="John",
            last_name="Doe",
            company="Acme Inc"
        )
        contact_id = contact["id"]
        print(f"   Created contact: {contact_id}")
        print(f"   Name: {contact.get('first_name')} {contact.get('last_name')}")
        print(f"   Email: {contact.get('email')}")
        print(f"   Phone: {contact.get('phone_number')}")

        # 2. List contacts
        print("\n2. Listing contacts...")
        contacts_response = list_contacts(page=1, page_size=10)
        print(f"   Total contacts: {contacts_response['pagination']['total']}")
        print(f"   Page {contacts_response['pagination']['page']} of {contacts_response['pagination']['total_pages']}")
        for c in contacts_response["items"][:3]:  # Show first 3
            name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or "Unnamed"
            print(f"   - {c['id']}: {name}")

        # 3. Get single contact
        print(f"\n3. Getting contact {contact_id}...")
        fetched_contact = get_contact(contact_id)
        print(f"   ID: {fetched_contact['id']}")
        print(f"   Name: {fetched_contact.get('first_name')} {fetched_contact.get('last_name')}")
        print(f"   Company: {fetched_contact.get('company')}")

        # 4. Update contact
        print(f"\n4. Updating contact {contact_id}...")
        updated_contact = update_contact(
            contact_id,
            first_name="Jane",
            company="New Company Inc"
        )
        print(f"   Updated name: {updated_contact.get('first_name')} {updated_contact.get('last_name')}")
        print(f"   Updated company: {updated_contact.get('company')}")

        # 5. Delete contact
        print(f"\n5. Deleting contact {contact_id}...")
        delete_result = delete_contact(contact_id)
        print(f"   Deleted: {delete_result.get('success', True)}")

        print("\n" + "=" * 40)
        print("All operations completed successfully!")

    except requests.HTTPError as e:
        print(f"\nAPI Error: {e.response.status_code}")
        print(f"Response: {e.response.text}")
    except Exception as e:
        print(f"\nError: {e}")


if __name__ == "__main__":
    main()
