FROM python:3.11-slim

# Install system dependency required by pytesseract
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        libwebp7 \
        libpng16-16 \
        libjpeg62-turbo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render provides PORT dynamically
ENV PORT=10000
EXPOSE 10000

# Use production WSGI server
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT} --workers 2 --timeout 120"]
