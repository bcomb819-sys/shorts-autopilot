# 24/7 Cloud Backend for Shorts Autopilot (runs even when your laptop is completely OFF!)
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    HOST=0.0.0.0 \
    PORT=3456 \
    CHROME=/usr/bin/chromium \
    FACELESS_HOME=/app/.faceless-shorts \
    SKILL_DIR=/app/vendor/faceless-shorts \
    SOFTWARE_GL=1 \
    QS="&res=0.75&aa=0&shadow=1024" \
    FPS=24

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg chromium python3 python3-venv python3-pip ca-certificates curl \
    fonts-inter fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

# Create private Python venv + download free Kokoro voice & Whisper small.en models into image/cache
RUN python3 -m venv /app/.faceless-shorts/venv \
    && /app/.faceless-shorts/venv/bin/pip install --no-cache-dir numpy scipy kokoro-onnx faster-whisper \
    && /app/.faceless-shorts/venv/bin/python /app/vendor/faceless-shorts/scripts/voice.py --download \
    && /app/.faceless-shorts/venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')"

EXPOSE 3456
CMD ["node", "src/server.js"]
