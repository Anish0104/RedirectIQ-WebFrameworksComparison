# Runs an in-process smoke test against the rebuilt flat-file Flask RedirectIQ app.
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app


def main():
    app = create_app()
    client = app.test_client()
    email = f"redirectiq-smoke-{uuid.uuid4().hex[:8]}@test.com"
    custom_slug = f"smoke{uuid.uuid4().hex[:6]}"
    credentials = {
        "email": email,
        "password": "password123",
    }

    print("--- TEST 1: Register ---")
    register_response = client.post("/auth/register", json=credentials)
    print("Status:", register_response.status_code)
    print("Data:", register_response.get_json())

    print("--- TEST 2: Login ---")
    login_response = client.post("/auth/login", json=credentials)
    print("Status:", login_response.status_code)
    print("Data:", login_response.get_json())
    token = (login_response.get_json() or {}).get("token")

    if not token:
        raise RuntimeError("No token returned from login")

    headers = {"Authorization": f"Bearer {token}"}

    print("--- TEST 3: Create Link ---")
    create_response = client.post(
        "/links",
        json={"original_url": "https://google.com", "custom_slug": custom_slug},
        headers=headers,
    )
    print("Status:", create_response.status_code)
    print("Data:", create_response.get_json())
    created_link = create_response.get_json() or {}
    link_id = created_link.get("id")
    slug = created_link.get("slug")

    if not link_id or not slug:
        raise RuntimeError("No link id or slug returned from link creation")

    print("--- TEST 4: List Links ---")
    list_response = client.get("/links", headers=headers)
    print("Status:", list_response.status_code)
    print("Data:", list_response.get_json())

    print("--- TEST 5: Redirect By Slug ---")
    redirect_response = client.get(f"/{slug}", follow_redirects=False)
    print("Status:", redirect_response.status_code)
    print("Location:", redirect_response.headers.get("Location"))

    print("--- TEST 6: Stats Summary ---")
    summary_response = None

    for _ in range(10):
        summary_response = client.get("/stats/summary", headers=headers)
        payload = summary_response.get_json() or {}

        if payload.get("totalClicks", 0) >= 1:
            break

        time.sleep(0.1)

    print("Status:", summary_response.status_code)
    print("Data:", summary_response.get_json())

    print("--- TEST 7: Link Stats ---")
    stats_response = client.get(f"/links/{link_id}/stats", headers=headers)
    print("Status:", stats_response.status_code)
    print("Data:", stats_response.get_json())

    print("ALL TESTS DONE")


if __name__ == "__main__":
    main()
