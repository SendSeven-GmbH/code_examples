#!/usr/bin/env python3
"""
SendSeven API - Media Attachments Example

Demonstrates how to upload files and send media messages using the SendSeven API.
"""

import os
import sys
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration from environment
API_TOKEN = os.getenv("SENDSEVEN_API_TOKEN")
TENANT_ID = os.getenv("SENDSEVEN_TENANT_ID")
API_URL = os.getenv("SENDSEVEN_API_URL", "https://api.sendseven.com/api/v1")
CONVERSATION_ID = os.getenv("CONVERSATION_ID")

# File size limits (in bytes)
IMAGE_MAX_SIZE = 16 * 1024 * 1024  # 16 MB
DOCUMENT_MAX_SIZE = 100 * 1024 * 1024  # 100 MB
VIDEO_MAX_SIZE = 16 * 1024 * 1024  # 16 MB
AUDIO_MAX_SIZE = 16 * 1024 * 1024  # 16 MB

# Supported content types by message type
SUPPORTED_TYPES = {
    "image": ["image/jpeg", "image/png", "image/gif", "image/webp"],
    "document": [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
    ],
    "video": ["video/mp4", "video/3gpp"],
    "audio": ["audio/aac", "audio/mpeg", "audio/ogg", "audio/amr", "audio/opus"],
}


def get_headers() -> dict:
    """Get the standard API headers."""
    return {
        "Authorization": f"Bearer {API_TOKEN}",
        "X-Tenant-ID": TENANT_ID,
    }


def get_content_type(file_path: str) -> str:
    """Determine content type from file extension."""
    ext = Path(file_path).suffix.lower()
    content_types = {
        # Images
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        # Documents
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".txt": "text/plain",
        # Video
        ".mp4": "video/mp4",
        ".3gp": "video/3gpp",
        # Audio
        ".aac": "audio/aac",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".amr": "audio/amr",
        ".opus": "audio/opus",
    }
    return content_types.get(ext, "application/octet-stream")


def get_message_type(content_type: str) -> str:
    """Determine message type from content type."""
    for msg_type, types in SUPPORTED_TYPES.items():
        if content_type in types:
            return msg_type
    raise ValueError(f"Unsupported content type: {content_type}")


def get_max_size(message_type: str) -> int:
    """Get maximum file size for a message type."""
    limits = {
        "image": IMAGE_MAX_SIZE,
        "document": DOCUMENT_MAX_SIZE,
        "video": VIDEO_MAX_SIZE,
        "audio": AUDIO_MAX_SIZE,
    }
    return limits.get(message_type, DOCUMENT_MAX_SIZE)


def upload_attachment(file_path: str) -> dict:
    """
    Upload a file as an attachment.

    Args:
        file_path: Path to the file to upload

    Returns:
        dict: The created attachment object with id, filename, content_type, file_size, url

    Raises:
        FileNotFoundError: If the file doesn't exist
        ValueError: If file type is unsupported or file is too large
        requests.HTTPError: If the API request fails
    """
    # Validate file exists
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Get file info
    file_size = os.path.getsize(file_path)
    filename = os.path.basename(file_path)
    content_type = get_content_type(file_path)

    # Determine message type and validate
    try:
        message_type = get_message_type(content_type)
    except ValueError:
        raise ValueError(f"Unsupported file type: {content_type}")

    # Check file size
    max_size = get_max_size(message_type)
    if file_size > max_size:
        raise ValueError(
            f"File too large: {file_size} bytes (max {max_size} bytes for {message_type})"
        )

    url = f"{API_URL}/attachments"

    with open(file_path, "rb") as f:
        files = {"file": (filename, f, content_type)}
        response = requests.post(url, files=files, headers=get_headers())

    if response.status_code == 413:
        raise ValueError("File too large (server rejected)")
    elif response.status_code == 415:
        raise ValueError("Unsupported media type (server rejected)")

    response.raise_for_status()
    return response.json()


def send_media_message(
    conversation_id: str,
    attachment_id: str,
    message_type: str,
    caption: Optional[str] = None,
) -> dict:
    """
    Send a message with an attachment.

    Args:
        conversation_id: The UUID of the conversation
        attachment_id: The UUID of the uploaded attachment
        message_type: Type of message (image, document, video, audio)
        caption: Optional text caption for the message

    Returns:
        dict: The created message object

    Raises:
        requests.HTTPError: If the API request fails
    """
    url = f"{API_URL}/messages"

    headers = get_headers()
    headers["Content-Type"] = "application/json"

    payload = {
        "conversation_id": conversation_id,
        "message_type": message_type,
        "attachments": [attachment_id],
    }

    if caption:
        payload["text"] = caption

    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()

    return response.json()


def send_image(conversation_id: str, file_path: str, caption: Optional[str] = None) -> dict:
    """
    Upload and send an image message.

    Args:
        conversation_id: The UUID of the conversation
        file_path: Path to the image file
        caption: Optional caption for the image

    Returns:
        dict: The created message object
    """
    print(f"Uploading image: {file_path}")
    attachment = upload_attachment(file_path)
    print(f"  Uploaded: {attachment['id']}")

    print(f"Sending image message...")
    message = send_media_message(conversation_id, attachment["id"], "image", caption)
    return message


def send_document(conversation_id: str, file_path: str, caption: Optional[str] = None) -> dict:
    """
    Upload and send a document message.

    Args:
        conversation_id: The UUID of the conversation
        file_path: Path to the document file
        caption: Optional caption for the document

    Returns:
        dict: The created message object
    """
    print(f"Uploading document: {file_path}")
    attachment = upload_attachment(file_path)
    print(f"  Uploaded: {attachment['id']}")

    print(f"Sending document message...")
    message = send_media_message(conversation_id, attachment["id"], "document", caption)
    return message


def send_video(conversation_id: str, file_path: str, caption: Optional[str] = None) -> dict:
    """
    Upload and send a video message.

    Args:
        conversation_id: The UUID of the conversation
        file_path: Path to the video file
        caption: Optional caption for the video

    Returns:
        dict: The created message object
    """
    print(f"Uploading video: {file_path}")
    attachment = upload_attachment(file_path)
    print(f"  Uploaded: {attachment['id']}")

    print(f"Sending video message...")
    message = send_media_message(conversation_id, attachment["id"], "video", caption)
    return message


def send_audio(conversation_id: str, file_path: str, caption: Optional[str] = None) -> dict:
    """
    Upload and send an audio message.

    Args:
        conversation_id: The UUID of the conversation
        file_path: Path to the audio file
        caption: Optional caption for the audio

    Returns:
        dict: The created message object
    """
    print(f"Uploading audio: {file_path}")
    attachment = upload_attachment(file_path)
    print(f"  Uploaded: {attachment['id']}")

    print(f"Sending audio message...")
    message = send_media_message(conversation_id, attachment["id"], "audio", caption)
    return message


def demo_upload_and_send(file_path: str):
    """
    Demo: Upload a file and send it as a message.
    Automatically detects the appropriate message type.
    """
    content_type = get_content_type(file_path)
    message_type = get_message_type(content_type)

    print(f"\n--- Sending {message_type} ---")
    print(f"File: {file_path}")
    print(f"Content-Type: {content_type}")

    attachment = upload_attachment(file_path)
    print(f"Attachment uploaded:")
    print(f"  ID: {attachment['id']}")
    print(f"  Filename: {attachment['filename']}")
    print(f"  Size: {attachment['file_size']} bytes")

    message = send_media_message(
        CONVERSATION_ID,
        attachment["id"],
        message_type,
        f"Here's a {message_type} file!"
    )

    print(f"Message sent:")
    print(f"  ID: {message['id']}")
    print(f"  Status: {message['status']}")
    print(f"  Created at: {message['created_at']}")

    return message


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

    print("SendSeven Media Attachments Example")
    print("=" * 40)
    print(f"API URL: {API_URL}")
    print(f"Conversation: {CONVERSATION_ID}")

    # Check for command line argument (file to upload)
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        try:
            demo_upload_and_send(file_path)
        except FileNotFoundError as e:
            print(f"Error: {e}")
        except ValueError as e:
            print(f"Validation Error: {e}")
        except requests.HTTPError as e:
            print(f"API Error: {e.response.status_code}")
            print(f"Response: {e.response.text}")
    else:
        print("\nUsage: python media_attachments.py <file_path>")
        print("\nSupported file types:")
        print("  Images:    .jpg, .jpeg, .png, .gif, .webp (max 16 MB)")
        print("  Documents: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt (max 100 MB)")
        print("  Video:     .mp4, .3gp (max 16 MB)")
        print("  Audio:     .aac, .mp3, .ogg, .amr, .opus (max 16 MB)")
        print("\nExample:")
        print("  python media_attachments.py /path/to/image.jpg")

        # Demo with a sample file if it exists
        sample_files = ["sample.jpg", "sample.png", "sample.pdf"]
        for sample in sample_files:
            if os.path.exists(sample):
                print(f"\nFound sample file: {sample}")
                try:
                    demo_upload_and_send(sample)
                except Exception as e:
                    print(f"Error: {e}")
                break


if __name__ == "__main__":
    main()
