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
    # Get headers
    signature = request.headers.get("X-Sendseven-Signature", "")
    timestamp = request.headers.get("X-Sendseven-Timestamp", "")
    delivery_id = request.headers.get("X-Sendseven-Delivery-Id", "")
    event_type = request.headers.get("X-Sendseven-Event", "")

    # Verify required headers
    if not all([signature, timestamp, delivery_id, event_type]):
        print("Missing required webhook headers")
        return jsonify({"error": "Missing required headers"}), 400

    # Verify signature
    if not verify_signature(request.data, signature, timestamp):
        print(f"Invalid signature for delivery {delivery_id}")
        return jsonify({"error": "Invalid signature"}), 401

    # Parse payload
    try:
        payload = request.get_json()
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
        return jsonify({"error": "Invalid JSON"}), 400

    event_type_key = payload.get("type", "")
    tenant_id = payload.get("tenant_id", "")

    print(f"Webhook received: delivery_id={delivery_id}, event={event_type_key}, tenant={tenant_id}")

    # Handle different event types
    try:
        if event_type_key == "message.received":
            handle_message_received(payload)
        elif event_type_key == "message.sent":
            handle_message_sent(payload)
        elif event_type_key == "message.delivered":
            handle_message_delivered(payload)
        elif event_type_key == "message.failed":
            handle_message_failed(payload)
        elif event_type_key == "conversation.created":
            handle_conversation_created(payload)
        elif event_type_key == "conversation.closed":
            handle_conversation_closed(payload)
        elif event_type_key == "conversation.assigned":
            handle_conversation_assigned(payload)
        elif event_type_key == "contact.created":
            handle_contact_created(payload)
        elif event_type_key == "contact.subscribed":
            handle_contact_subscribed(payload)
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


def handle_contact_created(payload: dict):
    """Process contact.created event."""
    data = payload.get("data", {})
    contact = data.get("contact", {})
    print(f"  Contact created: {contact.get('name', 'Unknown')} ({contact.get('phone', 'No phone')})")


def handle_contact_subscribed(payload: dict):
    """Process contact.subscribed event."""
    data = payload.get("data", {})
    contact = data.get("contact", {})
    subscription = data.get("subscription", {})
    print(f"  Contact {contact.get('name', 'Unknown')} subscribed to list {subscription.get('list_id')}")


if __name__ == "__main__":
    if not WEBHOOK_SECRET:
        print("Warning: WEBHOOK_SECRET not set - signatures will not be verified!")

    print(f"Starting webhook server on port {PORT}")
    print(f"Webhook endpoint: http://localhost:{PORT}/webhooks/sendseven")
    app.run(host="0.0.0.0", port=PORT, debug=True)
