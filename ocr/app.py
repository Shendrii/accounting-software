"""
Receipt OCR service using Google Cloud Vision API.
POST /extract with multipart image → returns { "text": "..." }

Authentication (use one):
- API Key: set GCP_API_KEY to the key from Credentials → API keys → Show key (easiest)
- Service account: set GOOGLE_APPLICATION_CREDENTIALS to path to a JSON key file
"""
import base64
import os
import requests
from flask import Flask, request, jsonify
from google.cloud import vision

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB

VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate"

def extract_text_with_api_key(image_bytes: bytes, api_key: str) -> str:
    """Call Vision API with API key (the string from 'Show key' in API keys)."""
    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(image_bytes).decode("utf-8")},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
            }
        ]
    }
    r = requests.post(
        f"{VISION_ANNOTATE_URL}?key={api_key}",
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if "responses" not in data or not data["responses"]:
        return ""
    resp = data["responses"][0]
    if "error" in resp:
        raise RuntimeError(resp["error"].get("message", str(resp["error"])))
    full_text = resp.get("fullTextAnnotation", {})
    return full_text.get("text", "").strip()

def extract_text_with_service_account(image_bytes: bytes) -> str:
    """Use service account JSON (GOOGLE_APPLICATION_CREDENTIALS)."""
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)
    response = client.document_text_detection(image=image)
    if response.error.message:
        raise RuntimeError(response.error.message)
    if response.full_text_annotation:
        return response.full_text_annotation.text.strip()
    return ""

def extract_text_with_vision(image_bytes: bytes) -> str:
    """Use Cloud Vision document_text_detection. Prefer API key if set."""
    api_key = os.environ.get("GCP_API_KEY") or os.environ.get("GOOGLE_CLOUD_VISION_API_KEY")
    if api_key and api_key.strip():
        return extract_text_with_api_key(image_bytes, api_key.strip())
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and os.path.isfile(creds_path):
        return extract_text_with_service_account(image_bytes)
    raise RuntimeError(
        "Google Cloud Vision needs either GCP_API_KEY (API key from Credentials → API keys → Show key) "
        "or GOOGLE_APPLICATION_CREDENTIALS pointing to a service account JSON file."
    )

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/extract", methods=["POST"])
def extract():
    if "image" not in request.files and "file" not in request.files:
        return jsonify({"error": "No image file"}), 400
    file = request.files.get("image") or request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
    try:
        image_bytes = file.read()
        if not image_bytes:
            return jsonify({"error": "Empty file"}), 400
        text = extract_text_with_vision(image_bytes)
        return jsonify({"text": text or ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
