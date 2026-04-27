FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends apache2 bash build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m venv .venv \
    && .venv/bin/pip install --no-cache-dir -r requirements.txt

COPY . .

RUN groupadd -r _www \
    && useradd -r -g _www _www \
    && mkdir -p /app/data /app/logs /private/etc /Users/anish/Documents/redirectiq /usr/libexec \
    && ln -sf /etc/apache2 /private/etc/apache2 \
    && ln -sf /usr/lib/apache2/modules /usr/libexec/apache2 \
    && ln -sf /app /Users/anish/Documents/redirectiq/apache-proxy \
    && ln -sf /app/data/redirectiq.db /app/redirectiq.db \
    && ln -sf /app/data/redirectiq.db-wal /app/redirectiq.db-wal \
    && ln -sf /app/data/redirectiq.db-shm /app/redirectiq.db-shm

EXPOSE 3004

CMD ["bash", "run.sh"]
