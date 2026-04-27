# Handles public redirects, password verification, and click logging for Flask RedirectIQ.
from datetime import datetime, timedelta, timezone
from html import escape
import random
import threading
from urllib.parse import quote
import uuid

import bcrypt
import requests
from flask import Blueprint, current_app, jsonify, make_response, redirect, request

from cache import get_value, set_value
from db import create_connection, get_db
from middleware import limiter
from utils import build_short_url, is_local_ip, json_error, normalize_ip, row_to_dict

redirect_blueprint = Blueprint("redirect", __name__)


def get_cached_link(slug):
    cached_link = get_value(slug)

    if cached_link is not None:
        return {"link": cached_link, "cacheStatus": "HIT"}

    database = get_db()
    link = database.execute(
        "SELECT * FROM links WHERE slug = ? AND active = 1",
        (slug,),
    ).fetchone()
    link_dict = row_to_dict(link)

    if link_dict is not None:
        set_value(slug, link_dict, current_app.config["CACHE_TTL_SECONDS"])

    return {"link": link_dict, "cacheStatus": "MISS"}


def has_valid_session(link_id, visitor_token):
    if not visitor_token:
        return False

    database = get_db()
    session = database.execute(
        """
        SELECT id
        FROM sessions
        WHERE link_id = ?
          AND visitor_token = ?
          AND datetime(expires_at) > datetime('now')
        """,
        (link_id, visitor_token),
    ).fetchone()
    return session is not None


def parse_expiration(value):
    if not value:
        return None

    normalized = str(value).replace("Z", "+00:00")

    if "T" not in normalized and " " in normalized:
        normalized = normalized.replace(" ", "T")

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def update_click_geo(db_path, click_id, ip_address):
    if not ip_address or is_local_ip(ip_address):
        return

    try:
        response = requests.get(
            f"http://ip-api.com/json/{ip_address}",
            params={"fields": "status,country,city"},
            timeout=3,
        )
        payload = response.json()
    except Exception:
        return

    if payload.get("status") != "success":
        return

    connection = create_connection(db_path)
    connection.execute(
        "UPDATE clicks SET country = ?, city = ? WHERE id = ?",
        (payload.get("country"), payload.get("city"), click_id),
    )
    connection.commit()
    connection.close()


def log_click_async(db_path, link_id, referrer, user_agent, ip_address):
    def worker():
        click_id = str(uuid.uuid4())

        try:
            connection = create_connection(db_path)
            connection.execute(
                "INSERT INTO clicks (id, link_id, referrer, user_agent) VALUES (?, ?, ?, ?)",
                (click_id, link_id, referrer, user_agent),
            )
            connection.commit()
            connection.close()
        except Exception:
            return

        update_click_geo(db_path, click_id, ip_address)

    threading.Thread(target=worker, daemon=True).start()


@redirect_blueprint.post("/verify-password/<slug>")
def verify_password(slug):
    payload = request.get_json(silent=True) or {}
    password = payload.get("password") or ""
    database = get_db()
    link = database.execute(
        "SELECT id, slug, password_hash FROM links WHERE slug = ? AND active = 1",
        (slug,),
    ).fetchone()

    if not link:
        return json_error("Link not found", 404)

    if not link["password_hash"]:
        return json_error("Link is not password protected", 400)

    if not password:
        return json_error("Password is required", 400)

    if not bcrypt.checkpw(password.encode("utf-8"), link["password_hash"].encode("utf-8")):
        return json_error("Invalid password", 401)

    session_id = str(uuid.uuid4())
    visitor_token = str(uuid.uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()

    database.execute(
        "INSERT INTO sessions (id, link_id, visitor_token, expires_at) VALUES (?, ?, ?, ?)",
        (session_id, link["id"], visitor_token, expires_at),
    )
    database.commit()

    response = jsonify({"success": True})
    response.headers["Cache-Control"] = "no-store"
    response.set_cookie(
        "visitor_token",
        visitor_token,
        httponly=True,
        max_age=24 * 60 * 60,
        samesite="Lax",
    )
    return response


@redirect_blueprint.get("/password-prompt/<slug>")
def password_prompt(slug):
    database = get_db()
    link = database.execute(
        "SELECT slug, password_hash FROM links WHERE slug = ? AND active = 1",
        (slug,),
    ).fetchone()

    if not link:
        return json_error("Link not found", 404)

    if not link["password_hash"]:
        return redirect(f"/{quote(slug, safe='')}", code=302)

    safe_slug = escape(slug)
    encoded_slug = quote(slug, safe="")
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Protected Link</title>
    <style>
      body {{
        font-family: Arial, sans-serif;
        background: #f5f7fb;
        color: #1f2937;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
      }}
      .card {{
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
        padding: 32px;
      }}
      h1 {{
        margin: 0 0 12px;
        font-size: 24px;
      }}
      p {{
        margin: 0 0 20px;
        color: #4b5563;
      }}
      label {{
        display: block;
        margin-bottom: 8px;
        font-weight: 600;
      }}
      input {{
        width: 100%;
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        margin-bottom: 16px;
      }}
      button {{
        width: 100%;
        padding: 12px;
        border: 0;
        border-radius: 8px;
        background: #111827;
        color: #ffffff;
        font-weight: 600;
        cursor: pointer;
      }}
      #error {{
        min-height: 20px;
        margin-top: 12px;
        color: #dc2626;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Protected Link</h1>
      <p>Enter the password to continue to <strong>{safe_slug}</strong>.</p>
      <form id="password-form">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Continue</button>
        <div id="error"></div>
      </form>
    </div>
    <script>
      var form = document.getElementById('password-form');
      var errorBox = document.getElementById('error');
      var passwordInput = document.getElementById('password');

      form.addEventListener('submit', function (event) {{
        event.preventDefault();
        errorBox.textContent = '';

        fetch('/verify-password/{encoded_slug}', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          credentials: 'same-origin',
          body: JSON.stringify({{ password: passwordInput.value }})
        }})
          .then(function (response) {{
            if (!response.ok) {{
              return response.json().then(function (data) {{
                throw new Error((data && data.error) || 'Invalid password');
              }});
            }}

            return response.json();
          }})
          .then(function () {{
            window.location.href = '/{encoded_slug}';
          }})
          .catch(function (error) {{
            errorBox.textContent = error.message;
          }});
      }});
    </script>
  </body>
</html>"""
    response = make_response(html)
    response.headers["Content-Type"] = "text/html; charset=utf-8"
    response.headers["Cache-Control"] = "no-store"
    return response


@redirect_blueprint.get("/<slug>")
@limiter.limit("100 per minute")
def redirect_to_destination(slug):
    cache_result = get_cached_link(slug)
    link = cache_result["link"]

    if not link:
        return json_error("Link not found", 404)

    expiration_time = parse_expiration(link.get("expires_at"))

    if expiration_time and expiration_time < datetime.now(timezone.utc):
        return json_error("Link has expired", 410)

    visitor_token = request.cookies.get("visitor_token")

    if link.get("password_hash") and not has_valid_session(link["id"], visitor_token):
        return redirect(f"/password-prompt/{quote(slug, safe='')}", code=302)

    split_ratio = float(link.get("split_ratio") or 0.5)
    destination = link["original_url"]

    if link.get("is_split") and link.get("split_url_b"):
        destination = link["original_url"] if random.random() < split_ratio else link["split_url_b"]

    response = redirect(destination, code=302)
    response.headers["Cache-Control"] = f"public, max-age={current_app.config['CACHE_TTL_SECONDS']}"
    response.headers["Vary"] = "Cookie"
    response.headers["X-RedirectIQ-Cache"] = cache_result["cacheStatus"]
    response.headers["Content-Location"] = build_short_url(slug)

    ip_source = request.access_route[0] if request.access_route else (request.remote_addr or "")
    ip_address = normalize_ip(ip_source)
    referrer = request.headers.get("Referer")
    user_agent = request.headers.get("User-Agent")

    log_click_async(
        current_app.config["RESOLVED_DB_PATH"],
        link["id"],
        referrer,
        user_agent,
        ip_address,
    )

    return response
