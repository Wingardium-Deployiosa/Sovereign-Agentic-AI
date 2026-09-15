# Sovereign Voice Assistant - production Dockerfile
# Models are NOT baked into the image. Mount ./models and ./audio as needed.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libportaudio2 \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app ./app
COPY mock_backend ./mock_backend
COPY run_voice_assistant.py ./
COPY .env.example ./.env.example

RUN mkdir -p /app/models /app/audio

# By default run the deterministic demo so the container is useful
# without a microphone or local models.
CMD ["python", "run_voice_assistant.py", "--demo"]