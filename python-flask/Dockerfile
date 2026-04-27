FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m venv .venv \
    && .venv/bin/pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data \
    && ln -sf /app/data/redirectiq.db /app/redirectiq.db \
    && ln -sf /app/data/redirectiq.db-wal /app/redirectiq.db-wal \
    && ln -sf /app/data/redirectiq.db-shm /app/redirectiq.db-shm

EXPOSE 3002

CMD ["bash", "run.sh"]
