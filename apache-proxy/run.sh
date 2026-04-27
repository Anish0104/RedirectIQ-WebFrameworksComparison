#!/bin/bash
# Starts Gunicorn and Apache together for the RedirectIQ Apache proxy benchmark target.
set -euo pipefail

if ! command -v apachectl >/dev/null 2>&1; then
    echo "apachectl is not installed. Install Apache HTTP Server first, then rerun this script."
    exit 1
fi

source .venv/bin/activate
mkdir -p logs

gunicorn -w 4 -b 127.0.0.1:8004 app:app &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" 2>/dev/null || true
    apachectl -f "$(pwd)/httpd.conf" -k stop 2>/dev/null || true
}

trap cleanup EXIT

apachectl -f "$(pwd)/httpd.conf" -k start
echo "Apache+Gunicorn running on port 3004"
wait "$BACKEND_PID"
