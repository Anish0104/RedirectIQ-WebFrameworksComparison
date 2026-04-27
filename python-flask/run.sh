#!/bin/bash
# Starts the Flask RedirectIQ backend with Gunicorn for local benchmarking.
set -euo pipefail

source .venv/bin/activate
exec gunicorn -w 4 -b 0.0.0.0:${PORT:-3002} app:app
