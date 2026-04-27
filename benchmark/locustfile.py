# Runs a realistic Locust workload against RedirectIQ endpoints for any framework target.
# Example: locust -f benchmark/locustfile.py --host=http://127.0.0.1:3001 --users=100 --spawn-rate=10 --run-time=60s --headless --csv=results/node/locust
import os
import random
import uuid

from locust import HttpUser, between, task


class RedirectIQUser(HttpUser):
    wait_time = between(1, 3)
    host = os.getenv("BASE_URL", "http://127.0.0.1:3001")

    def on_start(self):
        self.email = f"locust-{uuid.uuid4().hex[:10]}@test.com"
        self.password = "bench123"
        self.token = ""
        self.auth_headers = {}
        self.slugs = []
        self.register_and_login()
        self.ensure_link()

    def register_and_login(self):
        self.client.post(
            "/auth/register",
            json={"email": self.email, "password": self.password},
            name="/auth/register",
        )

        response = self.client.post(
            "/auth/login",
            json={"email": self.email, "password": self.password},
            name="/auth/login",
        )

        if not response.ok:
            return

        payload = response.json()
        self.token = payload.get("token", "")
        self.auth_headers = {"Authorization": f"Bearer {self.token}"}

    def ensure_link(self):
        if not self.token:
            return None

        response = self.client.post(
            "/links",
            json={"original_url": "https://example.com"},
            headers=self.auth_headers,
            name="/links [create]",
        )

        if not response.ok:
            return None

        slug = response.json().get("slug")

        if slug:
            self.slugs.append(slug)

        return slug

    @task(10)
    def redirect_slug(self):
        if not self.slugs:
            self.ensure_link()

        if not self.slugs:
            return

        slug = random.choice(self.slugs)
        self.client.get(f"/{slug}", allow_redirects=False, name="/:slug")

    @task(3)
    def create_link(self):
        if not self.token:
            return

        response = self.client.post(
            "/links",
            json={"original_url": "https://example.com"},
            headers=self.auth_headers,
            name="/links [create]",
        )

        if response.ok:
            slug = response.json().get("slug")

            if slug:
                self.slugs.append(slug)

    @task(2)
    def list_links(self):
        if not self.token:
            return

        self.client.get("/links", headers=self.auth_headers, name="/links [list]")

    @task(1)
    def summary(self):
        if not self.token:
            return

        self.client.get("/stats/summary", headers=self.auth_headers, name="/stats/summary")
