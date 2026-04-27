# RedirectIQ — Web Framework Benchmark

## What is this?
RedirectIQ is a production-style URL shortener with authentication, analytics, QR generation, password-protected redirects, and A/B traffic splitting. This repository runs the same redirect application in four different backend setups so you can benchmark them under identical load and compare throughput, tail latency, and error behavior.

## Quick Start (run everything)

### Step 1 — Start all backends
Terminal 1 - Node.js
```bash
cd node-express && npm install && npm start
```

Terminal 2 - Flask
```bash
cd python-flask && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && bash run.sh
```

Terminal 3 - Nginx
```bash
cd nginx-proxy && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && bash run.sh
```

Terminal 4 - Apache
```bash
cd apache-proxy && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && bash run.sh
```

### Step 2 — Start the frontend
```bash
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`

### Step 3 — Run benchmarks
```bash
brew install wrk
brew install httpd
pip install locust
bash benchmark/run_bench.sh
```

### Step 4 — See results
```bash
python3 -m pip install -r benchmark/requirements.txt
python benchmark/analyze.py
```

Graphs are saved to `results/graphs/`, the overall winner is printed to the console, and the frontend results dashboard is available at `http://localhost:5173/results`.

## Architecture diagram (ASCII)
```text
                           +-------------------------+
                           | React Frontend (Vite)   |
                           | http://localhost:5173   |
                           +------------+------------+
                                        |
      +----------------------+----------+-----------+----------------------+
      |                      |                      |                      |
+-----v------+        +------v------+        +------v------+        +------v------+
| Node       |        | Flask       |        | Nginx Proxy |        | Apache Proxy|
| Express    |        | Gunicorn    |        | -> Gunicorn |        | -> Gunicorn |
| :3001      |        | :3002       |        | :3003       |        | :3004       |
+-----+------+        +------+-------+       +------+-------+       +------+------+
      |                      |               | 127.0.0.1:8003 |      | 127.0.0.1:8004
      |                      |               +---------------+      +---------------+
      |                      |
      +----------- identical RedirectIQ API behavior ----------+
                              |
                      +-------v-------+
                      | SQLite schema |
                      | users         |
                      | links         |
                      | clicks        |
                      | sessions      |
                      +---------------+
```

## Endpoints
| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Register a dashboard user. |
| `POST` | `/auth/login` | Log in and receive a JWT. |
| `GET` | `/links` | List the authenticated user’s short links. |
| `POST` | `/links` | Create a short link, optional password, optional expiry, optional split destination. |
| `GET` | `/links/:id/stats` | Return click totals, 7-day series, referrers, device split, and geo data. |
| `PUT` | `/links/:id` | Update `active`, `expires_at`, or `original_url`. |
| `DELETE` | `/links/:id` | Delete a link plus its clicks and password sessions. |
| `GET` | `/links/:id/qr` | Generate a PNG QR code for a short link. |
| `GET` | `/stats/summary` | Return dashboard-level totals for links and clicks. |
| `GET` | `/health` | Return service health and a timestamp. |
| `GET` | `/:slug` | Resolve the short link, enforce expiry/password/split logic, and issue a `302` redirect. |
| `POST` | `/verify-password/:slug` | Validate a protected-link password and set a visitor session cookie. |
| `GET` | `/password-prompt/:slug` | Render a minimal HTML password form for protected links. |

## Project layout
```text
redirectiq/
├── node-express/
├── frontend/
├── python-flask/
├── nginx-proxy/
├── apache-proxy/
├── benchmark/
└── results/
```

## Benchmark methodology
- Redirect performance is measured against the public `GET /:slug` route because it exercises slug lookup, cache hits or misses, redirect generation, and async click logging.
- The benchmark script creates a fresh test user and a fresh short link on each framework before each run so every target uses a valid JWT and a valid slug.
- `benchmark/run_bench.sh` sends real HTTP traffic with `curl` for setup, then `wrk` and `ab` directly against `http://127.0.0.1:<port>/<slug>` for each framework.
- `wrk` is used for sustained load and latency percentiles with `--latency`, and `ab` is used for simple fixed-request concurrency sweeps.
- Concurrency levels are `1`, `10`, `50`, `100`, `250`, and `500`.
- Metrics collected are requests per second, p50 latency, p99 latency, and non-success response rate.
- `benchmark/analyze.py` reads the saved `wrk` outputs from `results/<framework>/` and generates comparison plots plus a summary table in `results/graphs/`.

## Notes
- The Node.js and React implementations were provided already and remain the baseline target for parity.
- The Nginx and Apache variants proxy to the same Flask application logic so the benchmark isolates the effect of the fronting server and request pipeline.
- The proxy configs assume `nginx` and `apachectl` are installed locally. On this machine, `apachectl` is available and `nginx` was not installed at build time.
