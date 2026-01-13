#!/usr/bin/env python3
"""
SendSeven API - Echo Bot Example (Python/Flask)

A simple bot that automatically replies to incoming messages.
"""

import os
import hmac
import hashlib
import json
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Configuration
API_TOKEN = os.getenv("SENDSEVEN_API_TOKEN", "")
TENANT_ID = os.getenv("SENDSEVEN_TENANT_ID", "")
API_URL = os.getenv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
PORT = int(os.getenv("PORT", 3000))

# Track processed delivery IDs to avoid duplicates
processed_deliveries = set()


def verify_signature(payload: bytes, signature: str, timestamp: str) -> bool:
    """Verify the webhook signature using HMAC-SHA256."""
    if not signature.startswith("sha256="):
        return False

    provided_sig = signature[7:]
    payload_dict = json.loads(payload)
    json_payload = json.dumps(payload_dict, separators=(",", ":"), sort_keys=True)
    message = f"{timestamp}.{json_payload}"

    expected_sig = hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected_sig, provided_sig)


def send_reply(conversation_id: str, text: str) -> dict:
    """Send a reply message to a conversation."""
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


@app.route("/webhooks/sendseven", methods=["POST"])
def handle_webhook():
    """Handle incoming SendSeven webhooks."""
    # Get headers
    signature = request.headers.get("X-Sendseven-Signature", "")
    timestamp = request.headers.get("X-Sendseven-Timestamp", "")
    delivery_id = request.headers.get("X-Sendseven-Delivery-Id", "")

    # Verify required headers
    if not all([signature, timestamp, delivery_id]):
        return jsonify({"error": "Missing required headers"}), 400

    # Check for duplicate delivery (idempotency)
    if delivery_id in processed_deliveries:
        print(f"Duplicate delivery {delivery_id}, skipping")
        return jsonify({"success": True, "duplicate": True}), 200

    # Verify signature
    if WEBHOOK_SECRET and not verify_signature(request.data, signature, timestamp):
        print(f"Invalid signature for delivery {delivery_id}")
        return jsonify({"error": "Invalid signature"}), 401

    # Parse payload
    payload = request.get_json()
    event_type = payload.get("type", "")

    # Only process message.received events
    if event_type != "message.received":
        return jsonify({"success": True, "skipped": True}), 200

    # Extract message details
    data = payload.get("data", {})
    message = data.get("message", {})
    contact = data.get("contact", {})

    # Only respond to inbound messages (avoid loops)
    if message.get("direction") != "inbound":
        return jsonify({"success": True, "skipped": "outbound"}), 200

    conversation_id = message.get("conversation_id")
    message_type = message.get("message_type", "text")
    message_text = message.get("text", "")
    contact_name = contact.get("name", "there")

    print(f"Received message from {contact_name}: {message_text[:50] if message_text else '[media]'}")

    # Generate reply based on message type
    if message_type == "text" and message_text:
        reply_text = f'You said: "{message_text}"'
    elif message_type == "image":
        reply_text = "I received your image! 📷"
    elif message_type == "audio":
        reply_text = "I received your audio message! 🎵"
    elif message_type == "video":
        reply_text = "I received your video! 🎬"
    elif message_type == "document":
        reply_text = "I received your document! 📄"
    else:
        reply_text = "I received your message!"

    # Send the reply
    try:
        result = send_reply(conversation_id, reply_text)
        print(f"Reply sent: {result.get('id')}")
        processed_deliveries.add(delivery_id)
    except requests.HTTPError as e:
        print(f"Failed to send reply: {e.response.status_code} - {e.response.text}")
    except Exception as e:
        print(f"Error sending reply: {e}")

    return jsonify({"success": True}), 200


if __name__ == "__main__":
    # Validate configuration
    if not API_TOKEN:
        print("Error: SENDSEVEN_API_TOKEN is required")
        exit(1)
    if not TENANT_ID:
        print("Error: SENDSEVEN_TENANT_ID is required")
        exit(1)

    if not WEBHOOK_SECRET:
        print("Warning: WEBHOOK_SECRET not set - signatures will not be verified!")

    print(f"Echo Bot starting on port {PORT}")
    print(f"Webhook endpoint: http://localhost:{PORT}/webhooks/sendseven")
    app.run(host="0.0.0.0", port=PORT, debug=True)
