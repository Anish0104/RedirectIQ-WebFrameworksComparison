#!/usr/bin/env bash
# Samples CPU and RSS for a single process while a benchmark is running.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <pid> [output_csv]"
  exit 1
fi

PID="$1"
OUTPUT_FILE="${2:-benchmarks/results/process-stats.csv}"
INTERVAL="${INTERVAL:-1}"

mkdir -p "$(dirname "${OUTPUT_FILE}")"
echo "timestamp,cpu_percent,rss_kb,vsz_kb" > "${OUTPUT_FILE}"

while kill -0 "${PID}" 2>/dev/null; do
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  stats="$(ps -o %cpu= -o rss= -o vsz= -p "${PID}" | awk '{print $1 "," $2 "," $3}')"

  if [[ -n "${stats}" ]]; then
    echo "${timestamp},${stats}" >> "${OUTPUT_FILE}"
  fi

  sleep "${INTERVAL}"
done
