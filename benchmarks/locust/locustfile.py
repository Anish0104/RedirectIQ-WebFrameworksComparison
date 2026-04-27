# Runs a Locust load profile against the RedirectIQ redirect endpoint.
import os

from locust import HttpUser, between, task

BENCH_SLUG = os.getenv("REDIRECTIQ_BENCH_SLUG", "benchmark")


class RedirectIQUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(8)
    def redirect_endpoint(self):
        with self.client.get(f"/{BENCH_SLUG}", allow_redirects=False, catch_response=True) as response:
            if response.status_code != 302:
                response.failure(f"Expected 302, got {response.status_code}")

    @task(1)
    def health_endpoint(self):
        with self.client.get("/health", catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"Expected 200, got {response.status_code}")
