#!/bin/bash
# Runs repeatable wrk and ApacheBench redirect benchmarks against RedirectIQ Docker containers.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_DIR="$ROOT_DIR/results"
LOCK_FILE="$RESULTS_DIR/.benchmark.lock"
CONCURRENCY_LEVELS=(1 10 50 100 250 500)
FRAMEWORKS=(node flask nginx apache)
DOCKER_SERVICES=(node-express python-flask nginx-proxy apache-proxy)
PORTS=(3001 3002 3003 3004)
CACHE_IMPACT_CONCURRENCY=100
CACHE_IMPACT_DURATION="30s"
ERROR_PROBE_REQUESTS=100
ERROR_PROBE_CONCURRENCY=500
RUN_ID="$(date +%s)"

mkdir -p "$RESULTS_DIR/graphs"
CURRENT_METRICS_PID=""

cleanup() {
    if [ -n "$CURRENT_METRICS_PID" ] && kill -0 "$CURRENT_METRICS_PID" >/dev/null 2>&1; then
        kill "$CURRENT_METRICS_PID" >/dev/null 2>&1 || true
        wait "$CURRENT_METRICS_PID" 2>/dev/null || true
    fi
    rm -f "$LOCK_FILE"
}

if [ -f "$LOCK_FILE" ]; then
    existing_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" >/dev/null 2>&1; then
        echo "Another benchmark run is already in progress (pid $existing_pid)."
        exit 1
    fi
    rm -f "$LOCK_FILE"
fi

printf '%s\n' "$$" >"$LOCK_FILE"
trap cleanup EXIT

for framework in "${FRAMEWORKS[@]}"; do
    mkdir -p "$RESULTS_DIR/$framework"
    rm -f "$RESULTS_DIR/$framework"/*.txt "$RESULTS_DIR/$framework"/*.csv "$RESULTS_DIR/$framework"/*.log
done

if ! command -v wrk >/dev/null 2>&1; then echo "wrk is not installed."; exit 1; fi
if ! command -v ab >/dev/null 2>&1; then echo "ab is not installed."; exit 1; fi
if ! command -v docker >/dev/null 2>&1; then echo "docker is not installed."; exit 1; fi

json_field() {
    local field_name="$1"
    python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get(sys.argv[1], ""))' "$field_name"
}

wait_for_health() {
    local port="$1"
    for _ in $(seq 1 30); do
        if curl -s -o /dev/null "http://127.0.0.1:${port}/health"; then return 0; fi
        sleep 1
    done
    return 1
}

restart_docker_service() {
    local service="$1"
    local public_port="$2"
    local log_file="$3"

    echo "Restarting Docker service: $service"
    docker compose restart "$service" >"$log_file" 2>&1

    if ! wait_for_health "$public_port"; then
        echo "Failed to restart $service on port $public_port."
        exit 1
    fi
    
    # On Mac, host-based psutil cannot monitor container processes easily.
    # We return a dummy PID to skip metrics collection if on Darwin.
    if [[ "$OSTYPE" == "darwin"* ]]; then
        printf '0\n'
    else
        docker inspect --format '{{.State.Pid}}' "$(docker compose ps -q "$service")"
    fi
}

run_wrk_with_retries() {
    local framework="$1"
    local concurrency="$2"
    local url="$3"
    local output_file="$4"
    local label="$5"
    local wrk_threads=4
    if [ "$concurrency" -lt "$wrk_threads" ]; then wrk_threads="$concurrency"; fi

    echo "Running ${label} wrk for $framework at concurrency $concurrency"
    for attempt in 1 2 3; do
        wrk -t"${wrk_threads}" -c"${concurrency}" -d"${CACHE_IMPACT_DURATION}" --latency "$url" >"$output_file" 2>&1 || true
        if grep -q "Requests/sec:" "$output_file"; then return 0; fi
        sleep 2
    done
    exit 1
}

run_error_probe() {
    local url="$1"
    local output_file="$2"
    seq 1 "$ERROR_PROBE_REQUESTS" | xargs -P"$ERROR_PROBE_CONCURRENCY" -I{} /bin/sh -c '
        code="$(curl -L -s -o /dev/null -w "%{http_code}" --max-time 10 "$1" || true)"
        printf "%s\n" "${code:-000}"
    ' _ "$url" >>"$output_file"
}

for index in "${!FRAMEWORKS[@]}"; do
    framework="${FRAMEWORKS[$index]}"
    service="${DOCKER_SERVICES[$index]}"
    port="${PORTS[$index]}"
    framework_dir="$RESULTS_DIR/$framework"
    restart_log="$framework_dir/restart_backend.log"
    
    # 1. Restart FIRST to ensure health and empty cache
    echo "--- Benchmarking $framework ---"
    backend_pid="$(restart_docker_service "$service" "$port" "$restart_log")"
    
    # 2. Prepare identity
    email="bench-${framework}-${RUN_ID}@test.com"
    password="bench123"
    curl -s -X POST "http://127.0.0.1:${port}/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" >/dev/null || true
    token="$(curl -s -X POST "http://127.0.0.1:${port}/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" | json_field token)"
    
    if [ -z "$token" ]; then echo "Failed to login to $framework"; exit 1; fi
    
    slug="$(curl -s -X POST "http://127.0.0.1:${port}/links" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"original_url":"https://example.com"}' | json_field slug)"
    if [ -z "$slug" ]; then echo "Failed to create link for $framework"; exit 1; fi
    printf '%s\n' "$slug" >"$framework_dir/slug.txt"
    benchmark_url="http://127.0.0.1:${port}/${slug}"

    # 3. Cold-cache run
    run_wrk_with_retries "$framework" "$CACHE_IMPACT_CONCURRENCY" "$benchmark_url" "$framework_dir/cold_wrk.txt" "cold-cache"
    run_error_probe "$benchmark_url" "$framework_dir/error_breakdown.txt"

    # 4. Warm-cache run
    for _ in 1 2 3 4 5; do curl -s -o /dev/null "$benchmark_url" || true; done
    run_wrk_with_retries "$framework" "$CACHE_IMPACT_CONCURRENCY" "$benchmark_url" "$framework_dir/warm_wrk.txt" "warm-cache"

    # 5. Concurrency sweep
    for concurrency in "${CONCURRENCY_LEVELS[@]}"; do
        run_wrk_with_retries "$framework" "$concurrency" "$benchmark_url" "$framework_dir/wrk_c${concurrency}.txt" "warm-state"
        ab -n 1000 -c "${concurrency}" "$benchmark_url" >"$framework_dir/ab_c${concurrency}.txt" 2>&1 || true
    done
done

echo "Benchmarking complete. Run: python3 benchmark/analyze.py"
