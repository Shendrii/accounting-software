"""
Receipt OCR service using Tesseract (free, local, no API key).

POST /extract  — multipart image -> { "text": "..." }
GET  /health   — returns { "status": "ok", "engine": "tesseract <version>" }

Runs on port 5001 by default (5000 is taken by macOS AirPlay Receiver on
recent macOS versions).

Setup (macOS):
    brew install tesseract
    pip install -r requirements.txt
    python app.py

Optional environment variables:
    OCR_PORT       Port to listen on (default: 5001)
    TESSERACT_CMD  Absolute path to the tesseract binary (auto-detected if on PATH)
    TESSERACT_LANG Languages to load (default: "eng")
"""
import io
import os
import shutil

import pytesseract
from flask import Flask, jsonify, request
from PIL import Image, ImageOps

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

TESSERACT_LANG = os.environ.get("TESSERACT_LANG", "eng")

if os.environ.get("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]


def _ensure_tesseract_available() -> str:
    """Return the tesseract version string, or raise a helpful error."""
    cmd = pytesseract.pytesseract.tesseract_cmd
    if not shutil.which(cmd) and not os.path.isfile(cmd):
        raise RuntimeError(
            "Tesseract is not installed or not on PATH. "
            "Install it with `brew install tesseract` (macOS) or "
            "see https://tesseract-ocr.github.io/tessdoc/Installation.html"
        )
    return str(pytesseract.get_tesseract_version())


def _preprocess(image: Image.Image) -> Image.Image:
    """Light preprocessing for better OCR accuracy on receipts."""
    # Honour EXIF orientation so phone photos are upright
    image = ImageOps.exif_transpose(image)

    # Convert to grayscale to drop colour noise
    gray = image.convert("L")

    # Auto-stretch contrast (helps faded thermal receipts)
    return ImageOps.autocontrast(gray)


def extract_text_with_tesseract(image_bytes: bytes) -> str:
    """Run Tesseract on the given image bytes and return extracted text."""
    image = Image.open(io.BytesIO(image_bytes))
    image = _preprocess(image)
    # PSM 6 == Assume a single uniform block of text — good default for receipts
    config = "--psm 6"
    return pytesseract.image_to_string(image, lang=TESSERACT_LANG, config=config).strip()


@app.route("/health", methods=["GET"])
def health():
    try:
        version = _ensure_tesseract_available()
        return jsonify({"status": "ok", "engine": f"tesseract {version}"})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 503


@app.route("/extract", methods=["POST"])
def extract():
    if "image" not in request.files and "file" not in request.files:
        return jsonify({"error": "No image file"}), 400

    file = request.files.get("image") or request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    image_bytes = file.read()
    if not image_bytes:
        return jsonify({"error": "Empty file"}), 400

    try:
        _ensure_tesseract_available()
        text = extract_text_with_tesseract(image_bytes)
        return jsonify({"text": text or ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("OCR_PORT", "5001"))
    app.run(host="0.0.0.0", port=port)
