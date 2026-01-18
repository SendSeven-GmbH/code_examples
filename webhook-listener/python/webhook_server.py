#!/usr/bin/env python3
"""
SendSeven API - Webhook Listener Example (Python/Flask)

Demonstrates how to receive and verify SendSeven webhook events.
"""

import os
import hmac
import hashlib
import json
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Configuration
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
PORT = int(os.getenv("PORT", 3000))
LOG_PAYLOADS = os.getenv("LOG_PAYLOADS", "false").lower() in ("true", "1", "yes")


def verify_signature(payload: bytes, signature: str, timestamp: str) -> bool:
    """
    Verify the webhook signature using HMAC-SHA256.

    Args:
        payload: Raw request body bytes
        signature: Value of X-Sendseven-Signature header
        timestamp: Value of X-Sendseven-Timestamp header

    Returns:
        bool: True if signature is valid
    """
    if not signature.startswith("sha256="):
        return False

    provided_sig = signature[7:]  # Remove 'sha256=' prefix

    # Reconstruct the message: timestamp.json_payload
    # Sort keys to ensure consistent JSON serialization
    payload_dict = json.loads(payload)
    json_payload = json.dumps(payload_dict, separators=(",", ":"), sort_keys=True)
    message = f"{timestamp}.{json_payload}"

    # Compute expected signature
    expected_sig = hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(expected_sig, provided_sig)


@app.route("/webhooks/sendseven", methods=["POST"])
def handle_webhook():
    """Handle incoming SendSeven webhooks."""
    # Parse payload first to check for verification challenge
    try:
        payload = request.get_json()
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
        return jsonify({"error": "Invalid JSON"}), 400

    # Handle verification challenges (no signature verification needed)
    # SendSeven sends this when you create/update a webhook to verify ownership
    if payload.get("type") == "sendseven_verification":
        challenge = payload.get("challenge")
        print(f"Verification challenge received: {challenge[:8]}...")
        return jsonify({"challenge": challenge}), 200

    # Get headers for regular events
    signature = request.headers.get("X-Sendseven-Signature", "")
    timestamp = request.headers.get("X-Sendseven-Timestamp", "")
    delivery_id = request.headers.get("X-Sendseven-Delivery-Id", "")
    event_type = request.headers.get("X-Sendseven-Event", "")

    # Verify required headers
    if not all([signature, timestamp, delivery_id, event_type]):
        print("Missing required webhook headers")
        return jsonify({"error": "Missing required headers"}), 400

    # Verify signature (payload already parsed above)
    if not verify_signature(request.data, signature, timestamp):
        print(f"Invalid signature for delivery {delivery_id}")
        return jsonify({"error": "Invalid signature"}), 401

    event_type_key = payload.get("type", "")
    tenant_id = payload.get("tenant_id", "")

    print(f"Webhook received: delivery_id={delivery_id}, event={event_type_key}, tenant={tenant_id}")

    # Log full payload if debugging is enabled
    if LOG_PAYLOADS:
        print(f"Full payload:\n{json.dumps(payload, indent=2)}")

    # Handle different event types
    try:
        # Message events (WhatsApp, Telegram, SMS, etc.)
        if event_type_key == "message.received":
            handle_message_received(payload)
        elif event_type_key == "message.sent":
            handle_message_sent(payload)
        elif event_type_key == "message.delivered":
            handle_message_delivered(payload)
        elif event_type_key == "message.failed":
            handle_message_failed(payload)
        elif event_type_key == "message.read":
            handle_message_read(payload)

        # Email events
        elif event_type_key == "email.received":
            handle_email_received(payload)
        elif event_type_key == "email.sent":
            handle_email_sent(payload)
        elif event_type_key == "email.delivered":
            handle_email_delivered(payload)
        elif event_type_key == "email.bounced":
            handle_email_bounced(payload)
        elif event_type_key == "email.opened":
            handle_email_opened(payload)
        elif event_type_key == "email.complained":
            handle_email_complained(payload)

        # Conversation events
        elif event_type_key == "conversation.created":
            handle_conversation_created(payload)
        elif event_type_key == "conversation.closed":
            handle_conversation_closed(payload)
        elif event_type_key == "conversation.assigned":
            handle_conversation_assigned(payload)
        elif event_type_key == "conversation.reopened":
            handle_conversation_reopened(payload)

        # Contact events
        elif event_type_key == "contact.created":
            handle_contact_created(payload)
        elif event_type_key == "contact.updated":
            handle_contact_updated(payload)
        elif event_type_key == "contact.deleted":
            handle_contact_deleted(payload)
        elif event_type_key == "contact.subscribed":
            handle_contact_subscribed(payload)
        elif event_type_key == "contact.unsubscribed":
            handle_contact_unsubscribed(payload)

        # Tracking events
        elif event_type_key == "link.clicked":
            handle_link_clicked(payload)
        else:
            print(f"Unknown event type: {event_type_key}")
    except Exception as e:
        print(f"Error processing webhook: {e}")
        # Still return 200 - webhook was received

    # Always return 200 quickly
    return jsonify({"success": True, "delivery_id": delivery_id}), 200


def handle_message_received(payload: dict):
    """Process message.received event."""
    data = payload.get("data", {})
    message = data.get("message", {})
    contact = data.get("contact", {})

    print(f"  Message received from {contact.get('name', 'Unknown')}: {message.get('text', '')[:50]}")


def handle_message_sent(payload: dict):
    """Process message.sent event."""
    data = payload.get("data", {})
    message = data.get("message", {})
    print(f"  Message sent: {message.get('id')}")


def handle_message_delivered(payload: dict):
    """Process message.delivered event."""
    data = payload.get("data", {})
    message = data.get("message", {})
    print(f"  Message delivered: {message.get('id')}")


def handle_message_failed(payload: dict):
    """Process message.failed event."""
    data = payload.get("data", {})
    message = data.get("message", {})
    error = data.get("error", {})
    print(f"  Message failed: {message.get('id')} - {error.get('message', 'Unknown error')}")


def handle_message_read(payload: dict):
    """Process message.read event."""
    data = payload.get("data", {})
    message = data.get("message", {})
    print(f"  Message read: {message.get('id')}")


# ============================================================================
# Email Event Handlers
# ============================================================================

def handle_email_received(payload: dict):
    """Process email.received event."""
    data = payload.get("data", {})
    email = data.get("email", {})
    contact = data.get("contact", {})
    print(f"  Email received from {email.get('from_email', 'Unknown')}: {email.get('subject', 'No subject')[:50]}")


def handle_email_sent(payload: dict):
    """Process email.sent event."""
    data = payload.get("data", {})
    email = data.get("email", {})
    print(f"  Email sent: {email.get('id')} to {email.get('to_emails', [])}")


def handle_email_delivered(payload: dict):
    """Process email.delivered event."""
    data = payload.get("data", {})
    email = data.get("email", {})
    print(f"  Email delivered: {email.get('id')} (message_id: {email.get('message_id', 'N/A')})")


def handle_email_bounced(payload: dict):
    """Process email.bounced event."""
    data = payload.get("data", {})
    email = data.get("email", {})
    bounce_type = data.get("bounce_type", "unknown")
    bounce_subtype = data.get("bounce_subtype", "")
    print(f"  Email bounced: {email.get('id')} - {bounce_type}/{bounce_subtype}")


def handle_email_opened(payload: dict):
    """Process email.opened event."""
    data = payload.get("data", {})
    email = data.get("email", {})
    open_count = data.get("open_count", 1)
    print(f"  Email opened: {email.get('id')} (open_count: {open_count})")


def handle_email_complained(payload: dict):
    """Process email.complained event (spam report)."""
    data = payload.get("data", {})
    email = data.get("email", {})
    complaint_type = data.get("complaint_type", "unknown")
    print(f"  Email complained (spam report): {email.get('id')} - {complaint_type}")


# ============================================================================
# Conversation Event Handlers
# ============================================================================

def handle_conversation_created(payload: dict):
    """Process conversation.created event."""
    data = payload.get("data", {})
    conversation = data.get("conversation", {})
    print(f"  Conversation created: {conversation.get('id')}")


def handle_conversation_closed(payload: dict):
    """Process conversation.closed event."""
    data = payload.get("data", {})
    conversation = data.get("conversation", {})
    print(f"  Conversation closed: {conversation.get('id')}")


def handle_conversation_assigned(payload: dict):
    """Process conversation.assigned event."""
    data = payload.get("data", {})
    conversation = data.get("conversation", {})
    assigned_to = data.get("assigned_to", {})
    print(f"  Conversation {conversation.get('id')} assigned to {assigned_to.get('name', 'Unknown')}")


def handle_conversation_reopened(payload: dict):
    """Process conversation.reopened event."""
    data = payload.get("data", {})
    conversation = data.get("conversation", {})
    print(f"  Conversation reopened: {conversation.get('id')}")


# ============================================================================
# Contact Event Handlers
# ============================================================================

def handle_contact_created(payload: dict):
    """Process contact.created event."""
    data = payload.get("data", {})
    contact = data.get("contact", {})
    print(f"  Contact created: {contact.get('name', 'Unknown')} ({contact.get('phone', 'No phone')})")


def handle_contact_updated(payload: dict):
    """Process contact.updated event."""
    data = payload.get("data", {})
    contact = data.get("contact", {})
    changes = data.get("changes", {})
    print(f"  Contact updated: {contact.get('id')} - changes: {list(changes.keys())}")


def handle_contact_deleted(payload: dict):
    """Process contact.deleted event."""
    data = payload.get("data", {})
    contact = data.get("contact", {})
    print(f"  Contact deleted: {contact.get('id')} ({contact.get('name', 'Unknown')})")


def handle_contact_subscribed(payload: dict):
    """Process contact.subscribed event."""
    data = payload.get("data", {})
    contact = data.get("contact", {})
    subscription = data.get("subscription", {})
    print(f"  Contact {contact.get('name', 'Unknown')} subscribed to list {subscription.get('list_id')}")


def handle_contact_unsubscribed(payload: dict):
    """Process contact.unsubscribed event."""
    data = payload.get("data", {})
    contact = data.get("contact", {})
    subscription = data.get("subscription", {})
    print(f"  Contact {contact.get('name', 'Unknown')} unsubscribed from list {subscription.get('list_id')}")


def handle_link_clicked(payload: dict):
    """Process link.clicked event."""
    data = payload.get("data", {})
    link = data.get("link", {})
    contact = data.get("contact", {})
    print(f"  Link clicked: {link.get('url', 'Unknown URL')} by {contact.get('name', 'Unknown')}")


if __name__ == "__main__":
    if not WEBHOOK_SECRET:
        print("Warning: WEBHOOK_SECRET not set - signatures will not be verified!")

    print(f"Starting webhook server on port {PORT}")
    print(f"Payload logging: {'ENABLED' if LOG_PAYLOADS else 'disabled'}")
    print(f"Webhook endpoint: http://localhost:{PORT}/webhooks/sendseven")
    app.run(host="0.0.0.0", port=PORT, debug=True)
