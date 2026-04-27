# RedirectIQ Final Report Template

## 1. Project Goal

Summarize the Internet Services motivation for RedirectIQ:

- HTTP semantics
- caching behavior
- authentication and security
- concurrency models
- persistent storage
- static asset delivery
- benchmark methodology

## 2. Application Features

List the shared feature set implemented across the stacks:

- login/register
- link creation and deletion
- custom slugs
- password-protected links
- A/B split links
- expiry and activation toggles
- QR code generation
- analytics dashboard

## 3. Experimental Setup

- machine specs
- operating system
- benchmark tools and versions
- concurrency matrix
- duration per test
- warm-cache versus cold-cache methodology

## 4. Quantitative Results

### Redirect Throughput

Insert throughput chart and discuss req/sec by framework.

### Latency

Insert p50/p95/p99 chart and discuss the curve shape under load.

### Resource Usage

Insert CPU and RSS time-series and compare scaling behavior.

### Error Rate

Discuss timeouts, 429s, 5xx responses, and benchmark stability.

## 5. Qualitative Comparison

### Node.js / Express

- setup experience
- debugging experience
- strengths
- weaknesses

### Flask Dev Server

- setup experience
- debugging experience
- strengths
- weaknesses

### Nginx + uWSGI

- setup experience
- debugging experience
- strengths
- weaknesses

### Apache + mod_wsgi

- setup experience
- debugging experience
- strengths
- weaknesses

## 6. Interpretation

- Which stack delivered the best raw throughput?
- Which stack had the most predictable tail latency?
- How much did the in-memory cache improve redirect performance?
- What role did static asset delivery play?
- How did SQLite interaction shape performance?

## 7. Conclusion

State your final takeaway and explain which stack you would choose for:

- fastest benchmark result
- easiest development workflow
- most production-ready deployment path

## 8. Future Work

Describe the AI/ML extensions you plan to add after the baseline benchmark is complete.
