# Benchmark Plan

The primary benchmark endpoint is `GET /:slug`, which exercises routing, cache lookup, redirect generation, and asynchronous click logging.

## Target Metrics

- Throughput in requests per second
- Latency distribution: p50, p95, p99
- Error rate
- CPU usage over time
- Memory usage over time
- Cached versus uncached redirect behavior

## Concurrency Matrix

- `1`
- `10`
- `50`
- `100`
- `250`
- `500`

## Tools

- `wrk` for sustained HTTP load and latency stats
- `ab` for quick concurrency sweeps
- `locust` for scriptable user-behavior load patterns

## Suggested Protocol

1. Build the frontend once: `cd frontend && npm run build`
2. Start the target implementation.
3. Create a benchmark slug such as `bench-node` or `bench-flask`.
4. Warm the redirect cache with 5 to 10 manual requests.
5. Run the concurrency matrix with `benchmarks/scripts/run-matrix.sh`.
6. In parallel, run `benchmarks/scripts/collect-process-stats.sh <pid>`.
7. Copy key numbers into `benchmarks/results/template.csv`.
8. Summarize findings in `docs/final-report-template.md`.

## Cache Comparison

- Cached case: warm the slug first, then run the benchmark.
- Uncached case: restart the service or clear the in-memory cache, then run the benchmark again.
- Compare `X-RedirectIQ-Cache` behavior and the req/sec improvement between both runs.
