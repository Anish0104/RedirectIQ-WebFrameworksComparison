# Production Dockerfile for Apache Proxy Backend

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends apache2 bash build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m venv .venv \
    && .venv/bin/pip install --no-cache-dir -r requirements.txt

COPY . .

# Set up runtime directories and symlinks for the database
RUN mkdir -p /app/data /app/logs \
    && ln -sf /app/data/redirectiq.db /app/redirectiq.db \
    && ln -sf /app/data/redirectiq.db-wal /app/redirectiq.db-wal \
    && ln -sf /app/data/redirectiq.db-shm /app/redirectiq.db-shm

EXPOSE 3004

CMD ["bash", "run.sh"]
