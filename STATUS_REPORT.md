# RedirectIQ Status Report

## 1. Executive Summary

RedirectIQ is a benchmark-oriented web application that implements the same URL shortener product across four backend setups:

- Node.js + Express on port `3001`
- Python + Flask + Gunicorn on port `3002`
- Nginx reverse proxy + Gunicorn on port `3003`
- Apache reverse proxy + Gunicorn on port `3004`

The project includes a shared React frontend, SQLite-backed persistence, authentication, redirect analytics, QR generation, password-protected links, A/B split traffic, and a benchmarking pipeline that compares throughput, latency, and error rate across frameworks.

At the time of this report, the core application flow, framework parity, benchmark runner, analyzer, results dashboard, and UI refresh work have all been completed. A benchmark run has already been generated, and the current overall winner is `Node`.

## 2. Project Goal

The goal of RedirectIQ is to study how different HTTP stacks behave under the same application workload. Instead of benchmarking toy endpoints, this project benchmarks a realistic redirect product that includes:

- HTTP redirect handling with `302` responses
- JWT-protected API routes
- SQLite reads and writes
- in-memory slug caching
- click logging and background geo-enrichment
- static asset serving
- reverse-proxy behavior
- frontend and backend integration

This makes the comparison more useful than a simple "hello world" benchmark because the tested route `GET /:slug` exercises real application logic.

## 3. Completed Scope

### Backend implementations

Completed:

- Node/Express backend
- Flask/Gunicorn backend
- Nginx + Gunicorn benchmark target
- Apache + Gunicorn benchmark target

All four targets expose the same RedirectIQ API behavior and run against the same conceptual SQLite schema:

- `users`
- `links`
- `clicks`
- `sessions`

### Frontend

Completed:

- login/register screen
- dashboard for link creation and summary metrics
- per-link analytics page
- benchmark results dashboard
- benchmark winner cards and charts
- QR preview flow
- refreshed UI shell and cleaner visual design
- stale-page restore fix so navigating away and back does not show old cached UI

### Benchmark pipeline

Completed:

- automated benchmark runner with `wrk` and `ab`
- realistic Locust workload definition
- analyzer that parses benchmark outputs
- graph generation with matplotlib
- machine-readable summary JSON generation
- frontend integration for benchmark summary and graphs

## 4. Implemented Product Features

The following shared product features are implemented across the stacks:

### Authentication

- user registration
- user login
- JWT issuance and validation
- protected routes for authenticated link management

### Link management

- create short links
- custom slugs
- list links
- delete links
- activate/deactivate links
- copyable short URLs

### Redirect behavior

- `302` redirects for active links
- TTL-based slug caching
- password-protected redirects
- password verification via session cookie
- expiry enforcement
- A/B split redirects using `split_ratio` and `split_url_b`

### Analytics

- total click counts
- dashboard summary counts
- per-link seven-day click history
- top referrers
- device breakdown
- geographic breakdown

### Utilities

- QR code generation as `image/png`
- health endpoint for each backend
- consistent JSON error format
- background geolocation lookup for click events

## 5. Benchmarking Features Completed

The benchmark system is fully wired end to end.

### What the benchmark script does

[benchmark/run_bench.sh](/Users/anish/Documents/redirectiq/benchmark/run_bench.sh) performs the following steps for each framework:

1. Registers a fresh benchmark user
2. Logs in and extracts a JWT
3. Creates a fresh short link
4. Saves the generated slug
5. Sends warmup redirect hits
6. Runs `wrk` against `GET /:slug`
7. Runs `ab` against `GET /:slug`
8. Saves raw outputs into `results/<framework>/`

### Concurrency matrix

The benchmark uses these concurrency levels:

- `1`
- `10`
- `50`
- `100`
- `250`
- `500`

### Tools used

- `curl` for setup requests
- `wrk` for sustained load and latency percentiles
- `ab` for additional fixed-request concurrency runs
- `locust` for mixed-user traffic simulation
- `matplotlib` for graph generation

### Metrics collected

- requests per second
- p50 latency
- p99 latency
- non-success response counts
- error rate at high concurrency

### Analyzer outputs

[benchmark/analyze.py](/Users/anish/Documents/redirectiq/benchmark/analyze.py) generates:

- `throughput_comparison.png`
- `latency_p50_p99.png`
- `latency_scaling_curve.png`
- `throughput_scaling_curve.png`
- `error_rate.png`
- `summary_table.png`
- `benchmark-summary.json`

## 6. Current Benchmark Results

The latest generated summary is stored in [results/graphs/benchmark-summary.json](/Users/anish/Documents/redirectiq/results/graphs/benchmark-summary.json).

Current winners:

- Throughput winner: `Node` with `7738.40 req/s` at concurrency `500`
- Latency winner: `Node` with `24.45 ms p99` at concurrency `100`
- Overall winner: `Node`

Summary table from the generated benchmark:

| Framework | Best Throughput | p50 @ c100 | p99 @ c100 | p99 @ c500 | Error Rate @ c500 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node | 8653.73 req/s | 9.09 ms | 24.45 ms | 817.15 ms | 0.00% |
| Flask | 562.24 req/s | 38.27 ms | 67.49 ms | 86.07 ms | 0.00% |
| Nginx | 4358.20 req/s | 18.64 ms | 55.47 ms | 342.64 ms | 86.07% |
| Apache | 562.64 req/s | 20.53 ms | 1520.00 ms | 150.98 ms | 4.95% |

Interpretation of the current run:

- `Node` is the strongest overall performer on this machine
- `Flask` is stable but substantially slower
- `Nginx` reaches higher throughput than Flask/Apache but shows a very high error rate in this run
- `Apache` is functional but has worse tail-latency behavior at some checkpoints

## 7. Runtime Configuration

Current `.env` configuration:

### Node

[node-express/.env](/Users/anish/Documents/redirectiq/node-express/.env)

```env
PORT=3001
HOST=0.0.0.0
JWT_SECRET=supersecretkey123
DB_PATH=./redirectiq.db
CACHE_TTL_SECONDS=60
PUBLIC_BASE_URL=
BENCHMARK_MODE=true
```

### Flask

[python-flask/.env](/Users/anish/Documents/redirectiq/python-flask/.env)

```env
PORT=3002
JWT_SECRET=supersecretkey123
DB_PATH=./redirectiq.db
CACHE_TTL_SECONDS=60
PUBLIC_BASE_URL=
BENCHMARK_MODE=true
```

### Nginx

[nginx-proxy/.env](/Users/anish/Documents/redirectiq/nginx-proxy/.env)

```env
PORT=8003
NGINX_PORT=3003
JWT_SECRET=supersecretkey123
DB_PATH=./redirectiq.db
CACHE_TTL_SECONDS=60
PUBLIC_BASE_URL=
BENCHMARK_MODE=true
```

### Apache

[apache-proxy/.env](/Users/anish/Documents/redirectiq/apache-proxy/.env)

```env
PORT=8004
APACHE_PORT=3004
JWT_SECRET=supersecretkey123
DB_PATH=./redirectiq.db
CACHE_TTL_SECONDS=60
PUBLIC_BASE_URL=
BENCHMARK_MODE=true
```

Note:

- `BENCHMARK_MODE=true` is currently enabled to disable rate limiting during benchmark runs
- if this is used as a normal app rather than a benchmark run, rate limiting can be re-enabled by setting `BENCHMARK_MODE=false`

## 8. How To Run The Project

### Recommended local development flow

#### Terminal 1: Node backend

```bash
cd /Users/anish/Documents/redirectiq/node-express
npm install
npm start
```

#### Terminal 2: Flask backend

```bash
cd /Users/anish/Documents/redirectiq/python-flask
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
bash run.sh
```

#### Terminal 3: Nginx backend

```bash
cd /Users/anish/Documents/redirectiq/nginx-proxy
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
bash run.sh
```

#### Terminal 4: Apache backend

```bash
cd /Users/anish/Documents/redirectiq/apache-proxy
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
bash run.sh
```

#### Terminal 5: Frontend

```bash
cd /Users/anish/Documents/redirectiq/frontend
npm install
npm run dev
```

Open:

- `http://localhost:5173`

### Frontend-only preview through a backend

If the frontend has been built, the backend targets can serve the compiled frontend from `frontend/dist`.

Build the frontend:

```bash
cd /Users/anish/Documents/redirectiq/frontend
npm run build
```

Then start one backend and open that backend’s port.

## 9. How To Run The Benchmark

Install benchmark tools if needed:

```bash
brew install wrk
brew install httpd
brew install nginx
python3 -m pip install matplotlib pandas locust
```

Run the benchmark:

```bash
cd /Users/anish/Documents/redirectiq
bash benchmark/run_bench.sh
python3 benchmark/analyze.py
```

Outputs are written to:

- [results/node](/Users/anish/Documents/redirectiq/results/node)
- [results/flask](/Users/anish/Documents/redirectiq/results/flask)
- [results/nginx](/Users/anish/Documents/redirectiq/results/nginx)
- [results/apache](/Users/anish/Documents/redirectiq/results/apache)
- [results/graphs](/Users/anish/Documents/redirectiq/results/graphs)

Frontend benchmark dashboard:

- `http://localhost:5173/results`

## 10. API Endpoints

The project exposes these application endpoints:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create a new user |
| `POST` | `/auth/login` | Log in and return a JWT |
| `GET` | `/links` | List links for the authenticated user |
| `POST` | `/links` | Create a link |
| `GET` | `/links/:id/stats` | View analytics for a link |
| `PUT` | `/links/:id` | Update a link |
| `DELETE` | `/links/:id` | Delete a link |
| `GET` | `/links/:id/qr` | Generate a QR code |
| `GET` | `/stats/summary` | Dashboard summary metrics |
| `GET` | `/health` | Service health check |
| `GET` | `/:slug` | Redirect to original URL |
| `POST` | `/verify-password/:slug` | Verify password for a protected link |
| `GET` | `/password-prompt/:slug` | Render a basic password form |

## 11. High-Level Architecture

### Shared behavior across backends

All four backends implement the same RedirectIQ logic:

- auth routes
- link CRUD routes
- QR generation
- summary route
- redirect route
- click logging
- in-memory cache
- password verification route

### Frontend architecture

Main frontend entry points:

- [frontend/src/App.jsx](/Users/anish/Documents/redirectiq/frontend/src/App.jsx) - router and protected routes
- [frontend/src/api.js](/Users/anish/Documents/redirectiq/frontend/src/api.js) - API client helpers
- [frontend/src/pages/Login.jsx](/Users/anish/Documents/redirectiq/frontend/src/pages/Login.jsx) - auth screen
- [frontend/src/pages/Dashboard.jsx](/Users/anish/Documents/redirectiq/frontend/src/pages/Dashboard.jsx) - main control room
- [frontend/src/pages/LinkStats.jsx](/Users/anish/Documents/redirectiq/frontend/src/pages/LinkStats.jsx) - per-link analytics
- [frontend/src/pages/BenchmarkResults.jsx](/Users/anish/Documents/redirectiq/frontend/src/pages/BenchmarkResults.jsx) - benchmark dashboard
- [frontend/src/components/Navbar.jsx](/Users/anish/Documents/redirectiq/frontend/src/components/Navbar.jsx) - app shell
- [frontend/src/index.css](/Users/anish/Documents/redirectiq/frontend/src/index.css) - visual system and layout

### Node backend architecture

Main Node backend files:

- [node-express/src/server.js](/Users/anish/Documents/redirectiq/node-express/src/server.js) - Express app, middleware, static serving, route mounting
- [node-express/src/auth.js](/Users/anish/Documents/redirectiq/node-express/src/auth.js) - register and login
- [node-express/src/links.js](/Users/anish/Documents/redirectiq/node-express/src/links.js) - link CRUD and QR
- [node-express/src/redirect.js](/Users/anish/Documents/redirectiq/node-express/src/redirect.js) - slug resolution and redirect behavior
- [node-express/src/stats.js](/Users/anish/Documents/redirectiq/node-express/src/stats.js) - summary metrics
- [node-express/src/db.js](/Users/anish/Documents/redirectiq/node-express/src/db.js) - SQLite setup
- [node-express/src/cache.js](/Users/anish/Documents/redirectiq/node-express/src/cache.js) - TTL cache
- [node-express/src/middleware.js](/Users/anish/Documents/redirectiq/node-express/src/middleware.js) - auth helpers

### Flask backend architecture

Main Flask files:

- [python-flask/app.py](/Users/anish/Documents/redirectiq/python-flask/app.py) - app factory, config, static serving, blueprint registration
- [python-flask/auth.py](/Users/anish/Documents/redirectiq/python-flask/auth.py)
- [python-flask/links.py](/Users/anish/Documents/redirectiq/python-flask/links.py)
- [python-flask/redirect.py](/Users/anish/Documents/redirectiq/python-flask/redirect.py)
- [python-flask/stats.py](/Users/anish/Documents/redirectiq/python-flask/stats.py)
- [python-flask/db.py](/Users/anish/Documents/redirectiq/python-flask/db.py)
- [python-flask/cache.py](/Users/anish/Documents/redirectiq/python-flask/cache.py)
- [python-flask/middleware.py](/Users/anish/Documents/redirectiq/python-flask/middleware.py)
- [python-flask/utils.py](/Users/anish/Documents/redirectiq/python-flask/utils.py)
- [python-flask/run.sh](/Users/anish/Documents/redirectiq/python-flask/run.sh)

### Proxy-target architecture

Nginx target:

- [nginx-proxy/app.py](/Users/anish/Documents/redirectiq/nginx-proxy/app.py)
- [nginx-proxy/nginx.conf](/Users/anish/Documents/redirectiq/nginx-proxy/nginx.conf)
- [nginx-proxy/run.sh](/Users/anish/Documents/redirectiq/nginx-proxy/run.sh)

Apache target:

- [apache-proxy/app.py](/Users/anish/Documents/redirectiq/apache-proxy/app.py)
- [apache-proxy/httpd.conf](/Users/anish/Documents/redirectiq/apache-proxy/httpd.conf)
- [apache-proxy/run.sh](/Users/anish/Documents/redirectiq/apache-proxy/run.sh)

## 12. Important Repository Structure

Top-level working structure:

```text
redirectiq/
├── README.md
├── STATUS_REPORT.md
├── node-express/
├── python-flask/
├── nginx-proxy/
├── apache-proxy/
├── frontend/
├── benchmark/
├── results/
├── docs/
└── deploy/
```

Important folders:

- `node-express/` - Express implementation
- `python-flask/` - Flask implementation
- `nginx-proxy/` - Nginx reverse-proxy target
- `apache-proxy/` - Apache reverse-proxy target
- `frontend/` - React/Vite UI
- `benchmark/` - active benchmark scripts
- `results/` - generated raw and parsed benchmark outputs
- `docs/` - report templates and comparison notes
- `deploy/` - deployment-oriented configs

Generated and runtime files you usually do not edit:

- `frontend/dist/`
- `node_modules/`
- `*.db`
- `*.db-wal`
- `*.db-shm`
- `results/*`
- proxy log files

## 13. Submission-Oriented Feature Checklist

### Core app requirements

- [x] user registration and login
- [x] JWT-protected APIs
- [x] SQLite persistence
- [x] identical shared API behavior across framework targets
- [x] dashboard for link management
- [x] link analytics page
- [x] QR generation
- [x] health endpoint

### Redirect logic requirements

- [x] active/inactive link support
- [x] expiry support
- [x] password-protected redirects
- [x] password verification flow
- [x] A/B split redirect support
- [x] in-memory slug cache with TTL
- [x] click logging
- [x] background geolocation

### Benchmark requirements

- [x] benchmark runner script
- [x] wrk-based redirect benchmark
- [x] ApacheBench benchmark
- [x] Locust mixed-user workload
- [x] parser/analyzer
- [x] graph generation
- [x] winner declaration
- [x] frontend benchmark dashboard

### Frontend polish requirements

- [x] refreshed cleaner UI
- [x] persistent benchmark results summary handling
- [x] chart display on results page
- [x] inline QR preview
- [x] stale cached-page reload fix

## 14. Known Notes And Limitations

- The Nginx and Apache variants intentionally reuse the Flask application logic behind different fronting servers, so they are useful for pipeline comparison but not for measuring independent business-logic implementations.
- `BENCHMARK_MODE=true` is currently enabled because this repository was being exercised for load benchmarking.
- The benchmark outcome depends on the machine, OS, installed system tools, and local server behavior, so winners can differ on another environment.
- The current run shows high Nginx error rate, which should be discussed in the final submission rather than ignored.
- Some extra directories such as `benchmarks/` and `deploy/` exist for supporting material, but the main benchmark flow used for the working project is in `benchmark/`.

## 15. Verification Status

Recently verified in this repository:

- frontend lint passes via `npm run lint`
- frontend production build passes via `npm run build`
- benchmark summary was successfully generated
- benchmark results were successfully rendered in the frontend results page

Useful output locations:

- [results/graphs/benchmark-summary.json](/Users/anish/Documents/redirectiq/results/graphs/benchmark-summary.json)
- [results/graphs/throughput_comparison.png](/Users/anish/Documents/redirectiq/results/graphs/throughput_comparison.png)
- [results/graphs/latency_p50_p99.png](/Users/anish/Documents/redirectiq/results/graphs/latency_p50_p99.png)
- [results/graphs/latency_scaling_curve.png](/Users/anish/Documents/redirectiq/results/graphs/latency_scaling_curve.png)
- [results/graphs/throughput_scaling_curve.png](/Users/anish/Documents/redirectiq/results/graphs/throughput_scaling_curve.png)
- [results/graphs/error_rate.png](/Users/anish/Documents/redirectiq/results/graphs/error_rate.png)
- [results/graphs/summary_table.png](/Users/anish/Documents/redirectiq/results/graphs/summary_table.png)

## 16. Final Status

Project status: `Completed baseline submission scope`

Completed and ready for submission:

- full 4-target backend benchmark setup
- shared React frontend
- benchmark runner and analyzer
- generated benchmark outputs
- cleaned UI for demo and navigation
- detailed documentation and status reporting

Recommended final submission attachments:

- [README.md](/Users/anish/Documents/redirectiq/README.md)
- [STATUS_REPORT.md](/Users/anish/Documents/redirectiq/STATUS_REPORT.md)
- [results/graphs/benchmark-summary.json](/Users/anish/Documents/redirectiq/results/graphs/benchmark-summary.json)
- the generated graph PNGs in [results/graphs](/Users/anish/Documents/redirectiq/results/graphs)
