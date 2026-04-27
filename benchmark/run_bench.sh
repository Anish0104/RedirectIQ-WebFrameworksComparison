#!/bin/bash
# Runs repeatable wrk and ApacheBench redirect benchmarks across all RedirectIQ framework targets.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_DIR="$ROOT_DIR/results"
LOCK_FILE="$RESULTS_DIR/.benchmark.lock"
CONCURRENCY_LEVELS=(1 10 50 100 250 500)
FRAMEWORKS=(node flask nginx apache)
PORTS=(3001 3002 3003 3004)
RUN_ID="$(date +%s)"

mkdir -p "$RESULTS_DIR/graphs"

cleanup() {
    rm -f "$LOCK_FILE"
}

if [ -f "$LOCK_FILE" ]; then
    existing_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"

    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" >/dev/null 2>&1; then
        echo "Another benchmark run is already in progress (pid $existing_pid)."
        echo "Wait for it to finish before starting a new one."
        exit 1
    fi

    echo "Removing stale benchmark lock."
    rm -f "$LOCK_FILE"
fi

printf '%s\n' "$$" >"$LOCK_FILE"
trap cleanup EXIT

for framework in "${FRAMEWORKS[@]}"; do
    mkdir -p "$RESULTS_DIR/$framework"
    rm -f "$RESULTS_DIR/$framework"/wrk_c*.txt "$RESULTS_DIR/$framework"/ab_c*.txt "$RESULTS_DIR/$framework"/slug.txt
done

if ! command -v wrk >/dev/null 2>&1; then
    echo "wrk is not installed. Install it first with: brew install wrk"
    exit 1
fi

if ! command -v ab >/dev/null 2>&1; then
    echo "ab is not installed. Install it first with: brew install httpd"
    exit 1
fi

json_field() {
    local field_name="$1"
    python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get(sys.argv[1], ""))' "$field_name"
}

wrk_has_metrics() {
    local output_file="$1"
    grep -q "Requests/sec:" "$output_file"
}

for index in "${!FRAMEWORKS[@]}"; do
    framework="${FRAMEWORKS[$index]}"
    port="${PORTS[$index]}"
    framework_dir="$RESULTS_DIR/$framework"
    email="bench-${framework}-${RUN_ID}@test.com"
    password="bench123"

    mkdir -p "$framework_dir"

    echo "Preparing benchmark identity for $framework on port $port"
    curl -s -X POST "http://127.0.0.1:${port}/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" >/dev/null || true

    token="$(
        curl -s -X POST "http://127.0.0.1:${port}/auth/login" \
            -H "Content-Type: application/json" \
            -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" | json_field token
    )"

    if [ -z "$token" ]; then
        echo "Failed to obtain a JWT token for $framework on port $port"
        exit 1
    fi

    slug="$(
        curl -s -X POST "http://127.0.0.1:${port}/links" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d '{"original_url":"https://example.com"}' | json_field slug
    )"

    if [ -z "$slug" ]; then
        echo "Failed to create a benchmark link for $framework on port $port"
        exit 1
    fi

    printf '%s\n' "$slug" >"$framework_dir/slug.txt"

    for _ in 1 2 3 4 5; do
        curl -s -o /dev/null "http://127.0.0.1:${port}/${slug}" || true
    done

    for concurrency in "${CONCURRENCY_LEVELS[@]}"; do
        wrk_output="$framework_dir/wrk_c${concurrency}.txt"
        ab_output="$framework_dir/ab_c${concurrency}.txt"
        wrk_threads=4

        if [ "${concurrency}" -lt "${wrk_threads}" ]; then
            wrk_threads="${concurrency}"
        fi

        echo "Running wrk for $framework at concurrency $concurrency with ${wrk_threads} thread(s)"
        wrk_succeeded=false

        for attempt in 1 2 3; do
            wrk -t"${wrk_threads}" -c"${concurrency}" -d30s --latency "http://127.0.0.1:${port}/${slug}" >"$wrk_output" 2>&1 || true

            if wrk_has_metrics "$wrk_output"; then
                wrk_succeeded=true
                break
            fi

            echo "wrk attempt ${attempt} failed for $framework at concurrency $concurrency. Retrying after a short pause..."
            sleep 2
        done

        if [ "$wrk_succeeded" != true ]; then
            echo "wrk failed for $framework at concurrency $concurrency after retries. See $wrk_output."
            exit 1
        fi

        sleep 1

        echo "Running ab for $framework at concurrency $concurrency"
        if ! ab -n 1000 -c "${concurrency}" "http://127.0.0.1:${port}/${slug}" >"$ab_output" 2>&1; then
            echo "ab failed for $framework at concurrency $concurrency. See $ab_output. Continuing." | tee -a "$ab_output"
        fi

        sleep 1
    done
done

echo "Benchmarking complete. Run python benchmark/analyze.py to see results."
