# Shares common helpers for JSON responses, slugs, URLs, and parsing logic in Flask RedirectIQ.
import os
import re
import uuid

from flask import current_app, has_request_context, jsonify, request

SLUG_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


def json_error(message, status_code):
    response = jsonify({"error": message})
    response.status_code = status_code
    return response


def row_to_dict(row):
    return dict(row) if row is not None else None


def public_link_dict(row):
    link = row_to_dict(row)

    if not link:
        return None

    link.pop("password_hash", None)

    if "total_clicks" in link:
        link["totalClicks"] = int(link.pop("total_clicks") or 0)

    if link.get("slug"):
        link["short_url"] = build_short_url(link["slug"])

    return link


def is_unique_constraint_error(error):
    return "UNIQUE constraint failed" in str(error)


def parse_active_value(value):
    if value is None:
        return {"value": None}

    if isinstance(value, bool):
        return {"value": 1 if value else 0}

    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return {"error": "active must be 0 or 1"}

    if numeric not in (0, 1):
        return {"error": "active must be 0 or 1"}

    return {"value": numeric}


def normalize_split_ratio(value):
    if value is None or value == "":
        return 0.5

    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None

    if numeric < 0 or numeric > 1:
        return None

    return numeric


def is_valid_slug(value):
    return bool(SLUG_PATTERN.match(value))


def generate_slug():
    return uuid.uuid4().hex[:7]


def build_short_url(slug):
    public_base_url = current_app.config.get("PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL", "")

    if public_base_url:
        return f"{public_base_url.rstrip('/')}/{slug}"

    if has_request_context():
        return f"{request.host_url.rstrip('/')}/{slug}"

    return f"http://localhost:{current_app.config.get('PORT', 3002)}/{slug}"


def normalize_ip(ip_address):
    if not ip_address:
        return ""

    candidate = str(ip_address).split(",")[0].strip()
    return candidate[7:] if candidate.startswith("::ffff:") else candidate


def is_local_ip(ip_address):
    return ip_address in {"127.0.0.1", "::1", "localhost"}
