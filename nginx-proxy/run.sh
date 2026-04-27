#!/bin/bash
# Starts Gunicorn and Nginx together for the RedirectIQ Nginx proxy benchmark target.
set -euo pipefail

if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx is not installed. Install it first, then rerun this script."
    exit 1
fi

source .venv/bin/activate
mkdir -p logs client_body_temp proxy_temp fastcgi_temp uwsgi_temp scgi_temp

gunicorn -w 4 -b 127.0.0.1:8003 app:app &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" 2>/dev/null || true
    nginx -c "$(pwd)/nginx.conf" -p "$(pwd)" -s stop 2>/dev/null || true
}

trap cleanup EXIT

nginx -c "$(pwd)/nginx.conf" -p "$(pwd)"
echo "Nginx+Gunicorn running on port 3003"
wait "$BACKEND_PID"
