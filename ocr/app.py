"""
Receipt OCR service using Tesseract.
POST /extract with multipart image → returns { "text": "..." }
"""
import os
import tempfile
from flask import Flask, request, jsonify
import pytesseract
from PIL import Image

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB

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
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1] or ".jpg") as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        try:
            img = Image.open(tmp_path)
            if img.mode not in ("L", "RGB", "RGBA"):
                img = img.convert("RGB")
            text = pytesseract.image_to_string(img, lang="eng").strip()
            return jsonify({"text": text or ""})
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
