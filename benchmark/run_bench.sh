#!/bin/bash
# Runs repeatable wrk and ApacheBench redirect benchmarks across all RedirectIQ framework targets.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_DIR="$ROOT_DIR/results"
LOCK_FILE="$RESULTS_DIR/.benchmark.lock"
CONCURRENCY_LEVELS=(1 10 50 100 250 500)
FRAMEWORKS=(node flask nginx apache)
PORTS=(3001 3002 3003 3004)
INTERNAL_PORTS=("" "" 8003 8004)
CACHE_IMPACT_CONCURRENCY=100
CACHE_IMPACT_DURATION="30s"
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
    rm -f "$RESULTS_DIR/$framework"/wrk_c*.txt \
        "$RESULTS_DIR/$framework"/ab_c*.txt \
        "$RESULTS_DIR/$framework"/slug.txt \
        "$RESULTS_DIR/$framework"/cold_wrk.txt \
        "$RESULTS_DIR/$framework"/warm_wrk.txt \
        "$RESULTS_DIR/$framework"/restart_backend.log
done

if ! command -v wrk >/dev/null 2>&1; then
    echo "wrk is not installed. Install it first with: brew install wrk"
    exit 1
fi

if ! command -v ab >/dev/null 2>&1; then
    echo "ab is not installed. Install it first with: brew install httpd"
    exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
    echo "lsof is required so benchmark/run_bench.sh can restart backends for cold-cache runs."
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

wait_for_health() {
    local port="$1"

    for _ in $(seq 1 30); do
        if curl -s -o /dev/null "http://127.0.0.1:${port}/health"; then
            return 0
        fi

        sleep 1
    done

    return 1
}

stop_framework_processes() {
    local public_port="$1"
    local internal_port="${2:-}"
    local pids

    pids="$(
        {
            lsof -ti tcp:"$public_port" 2>/dev/null || true

            if [ -n "$internal_port" ]; then
                lsof -ti tcp:"$internal_port" 2>/dev/null || true
            fi
        } | sort -u
    )"

    if [ -z "$pids" ]; then
        return 0
    fi

    echo "$pids" | xargs kill >/dev/null 2>&1 || true
    sleep 1

    pids="$(
        {
            lsof -ti tcp:"$public_port" 2>/dev/null || true

            if [ -n "$internal_port" ]; then
                lsof -ti tcp:"$internal_port" 2>/dev/null || true
            fi
        } | sort -u
    )"

    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 >/dev/null 2>&1 || true
    fi
}

restart_framework_backend() {
    local framework="$1"
    local public_port="$2"
    local internal_port="$3"
    local framework_dir="$4"
    local log_file="$5"

    stop_framework_processes "$public_port" "$internal_port"

    case "$framework" in
        node)
            (
                cd "$ROOT_DIR/node-express"
                npm start
            ) >"$log_file" 2>&1 &
            ;;
        flask)
            (
                cd "$ROOT_DIR/python-flask"
                bash run.sh
            ) >"$log_file" 2>&1 &
            ;;
        nginx)
            (
                cd "$ROOT_DIR/nginx-proxy"
                bash run.sh
            ) >"$log_file" 2>&1 &
            ;;
        apache)
            (
                cd "$ROOT_DIR/apache-proxy"
                bash run.sh
            ) >"$log_file" 2>&1 &
            ;;
        *)
            echo "Unknown framework: $framework"
            exit 1
            ;;
    esac

    if ! wait_for_health "$public_port"; then
        echo "Failed to restart $framework on port $public_port. See $log_file."
        exit 1
    fi
}

run_wrk_with_retries() {
    local framework="$1"
    local concurrency="$2"
    local url="$3"
    local output_file="$4"
    local label="$5"
    local wrk_threads=4
    local wrk_succeeded=false

    if [ "$concurrency" -lt "$wrk_threads" ]; then
        wrk_threads="$concurrency"
    fi

    echo "Running ${label} wrk for $framework at concurrency $concurrency with ${wrk_threads} thread(s)"

    for attempt in 1 2 3; do
        wrk -t"${wrk_threads}" -c"${concurrency}" -d"${CACHE_IMPACT_DURATION}" --latency "$url" >"$output_file" 2>&1 || true

        if wrk_has_metrics "$output_file"; then
            wrk_succeeded=true
            break
        fi

        echo "${label} wrk attempt ${attempt} failed for $framework at concurrency $concurrency. Retrying after a short pause..."
        sleep 2
    done

    if [ "$wrk_succeeded" != true ]; then
        echo "${label} wrk failed for $framework at concurrency $concurrency after retries. See $output_file."
        exit 1
    fi
}

for index in "${!FRAMEWORKS[@]}"; do
    framework="${FRAMEWORKS[$index]}"
    port="${PORTS[$index]}"
    internal_port="${INTERNAL_PORTS[$index]}"
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

    cold_wrk_output="$framework_dir/cold_wrk.txt"
    warm_wrk_output="$framework_dir/warm_wrk.txt"
    restart_log="$framework_dir/restart_backend.log"
    benchmark_url="http://127.0.0.1:${port}/${slug}"

    echo "Restarting $framework before cold-cache measurement so the in-memory slug cache is empty"
    restart_framework_backend "$framework" "$port" "$internal_port" "$framework_dir" "$restart_log"
    run_wrk_with_retries "$framework" "$CACHE_IMPACT_CONCURRENCY" "$benchmark_url" "$cold_wrk_output" "cold-cache"

    for _ in 1 2 3 4 5; do
        curl -s -o /dev/null "$benchmark_url" || true
    done

    run_wrk_with_retries "$framework" "$CACHE_IMPACT_CONCURRENCY" "$benchmark_url" "$warm_wrk_output" "warm-cache"

    for concurrency in "${CONCURRENCY_LEVELS[@]}"; do
        wrk_output="$framework_dir/wrk_c${concurrency}.txt"
        ab_output="$framework_dir/ab_c${concurrency}.txt"
        run_wrk_with_retries "$framework" "$concurrency" "$benchmark_url" "$wrk_output" "warm-state"

        sleep 1

        echo "Running ab for $framework at concurrency $concurrency"
        if ! ab -n 1000 -c "${concurrency}" "http://127.0.0.1:${port}/${slug}" >"$ab_output" 2>&1; then
            echo "ab failed for $framework at concurrency $concurrency. See $ab_output. Continuing." | tee -a "$ab_output"
        fi

        sleep 1
    done
done

echo "Benchmarking complete. Run python benchmark/analyze.py to see results."
