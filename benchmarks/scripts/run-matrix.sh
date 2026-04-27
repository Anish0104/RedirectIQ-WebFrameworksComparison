#!/usr/bin/env bash
# Runs the RedirectIQ concurrency matrix with wrk and ab if they are installed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESULTS_DIR="${ROOT_DIR}/benchmarks/results"
HOST="${HOST:-http://127.0.0.1:3001}"
SLUG="${SLUG:-benchmark}"
DURATION="${DURATION:-30s}"
CONCURRENCIES=(1 10 50 100 250 500)

mkdir -p "${RESULTS_DIR}"

for concurrency in "${CONCURRENCIES[@]}"; do
  threads=$(( concurrency < 8 ? concurrency : 8 ))
  if [[ "${threads}" -lt 1 ]]; then
    threads=1
  fi

  echo "=== Concurrency ${concurrency} ==="

  if command -v wrk >/dev/null 2>&1; then
    REDIRECTIQ_BENCH_SLUG="${SLUG}" \
      wrk -t"${threads}" -c"${concurrency}" -d"${DURATION}" \
      -s "${ROOT_DIR}/benchmarks/wrk/redirect.lua" \
      "${HOST}" \
      | tee "${RESULTS_DIR}/wrk-c${concurrency}.txt"
  else
    echo "wrk not installed; skipping wrk run for concurrency ${concurrency}"
  fi

  if command -v ab >/dev/null 2>&1; then
    requests=$(( concurrency * 200 ))
    ab -k -c "${concurrency}" -n "${requests}" "${HOST}/${SLUG}" \
      | tee "${RESULTS_DIR}/ab-c${concurrency}.txt"
  else
    echo "ab not installed; skipping ab run for concurrency ${concurrency}"
  fi
done
