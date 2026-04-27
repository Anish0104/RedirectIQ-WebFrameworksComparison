# Exposes protected Flask routes for link CRUD, QR codes, and analytics.
import io
from pathlib import Path
import uuid

import bcrypt
import qrcode
from flask import Blueprint, current_app, g, jsonify, request, send_file, send_from_directory

from .cache import delete_value
from .db import get_db
from .middleware import login_required
from .utils import (
    build_short_url,
    generate_slug,
    is_unique_constraint_error,
    is_valid_slug,
    json_error,
    normalize_split_ratio,
    parse_active_value,
    public_link_dict,
    row_to_dict,
)

links_blueprint = Blueprint("links", __name__, url_prefix="/links")

PUBLIC_LINK_COLUMNS = """
  id,
  user_id,
  original_url,
  slug,
  custom_slug,
  expires_at,
  active,
  is_split,
  split_url_b,
  split_ratio,
  created_at
"""


def get_owned_link(link_id, user_id):
    database = get_db()
    return database.execute(
        "SELECT * FROM links WHERE id = ? AND user_id = ?",
        (link_id, user_id),
    ).fetchone()


def maybe_serve_frontend_index():
    accept_header = request.headers.get("Accept", "")
    wants_html = "text/html" in accept_header and "application/json" not in accept_header

    if not wants_html:
        return None

    dist_path = Path(current_app.config["FRONTEND_DIST"])
    index_path = dist_path / "index.html"

    if not index_path.exists():
        return None

    return send_from_directory(dist_path, "index.html")


@links_blueprint.route("", methods=["POST"], strict_slashes=False)
@login_required
def create_link():
    payload = request.get_json(silent=True) or {}
    original_url = (payload.get("original_url") or "").strip()
    custom_slug = (payload.get("custom_slug") or "").strip()
    expires_at = (payload.get("expires_at") or "").strip() or None
    password = payload.get("password") or None
    split_url_b = (payload.get("split_url_b") or "").strip() or None

    if not original_url:
        return json_error("original_url is required", 400)

    if custom_slug and not is_valid_slug(custom_slug):
        return json_error(
            "custom_slug may only contain letters, numbers, underscores, and hyphens",
            400,
        )

    split_ratio = normalize_split_ratio(payload.get("split_ratio")) if split_url_b else 0.5

    if split_url_b and split_ratio is None:
        return json_error("split_ratio must be between 0 and 1", 400)

    link_id = str(uuid.uuid4())
    slug = custom_slug or generate_slug()
    password_hash = None

    if password:
        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")

    database = get_db()

    try:
        database.execute(
            """
            INSERT INTO links (
              id,
              user_id,
              original_url,
              slug,
              custom_slug,
              expires_at,
              password_hash,
              is_split,
              split_url_b,
              split_ratio
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                link_id,
                g.user["userId"],
                original_url,
                slug,
                1 if custom_slug else 0,
                expires_at,
                password_hash,
                1 if split_url_b else 0,
                split_url_b,
                split_ratio,
            ),
        )
        database.commit()
    except Exception as error:
        if is_unique_constraint_error(error):
            return json_error("Slug already exists", 409)

        raise

    return (
        jsonify(
            {
                "id": link_id,
                "slug": slug,
                "short_url": build_short_url(slug),
            }
        ),
        201,
    )


@links_blueprint.route("", methods=["GET"], strict_slashes=False)
@login_required
def list_links():
    database = get_db()
    links = database.execute(
        f"""
        SELECT
          {PUBLIC_LINK_COLUMNS},
          (SELECT COUNT(*) FROM clicks WHERE clicks.link_id = links.id) AS total_clicks
        FROM links
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        """,
        (g.user["userId"],),
    ).fetchall()
    return jsonify([public_link_dict(link) for link in links])


@links_blueprint.get("/<link_id>/stats")
@login_required
def link_stats(link_id):
    frontend_response = maybe_serve_frontend_index()

    if frontend_response is not None:
        return frontend_response

    database = get_db()
    link = database.execute(
        f"SELECT {PUBLIC_LINK_COLUMNS} FROM links WHERE id = ? AND user_id = ?",
        (link_id, g.user["userId"]),
    ).fetchone()

    if not link:
        return json_error("Link not found", 404)

    total_clicks = database.execute(
        "SELECT COUNT(*) AS count FROM clicks WHERE link_id = ?",
        (link["id"],),
    ).fetchone()["count"]

    last_7_days = database.execute(
        """
        SELECT date(clicked_at) AS day, COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
          AND datetime(clicked_at) >= datetime('now', '-6 days')
        GROUP BY date(clicked_at)
        ORDER BY day ASC
        """,
        (link["id"],),
    ).fetchall()

    top_referrers = database.execute(
        """
        SELECT COALESCE(NULLIF(referrer, ''), 'Direct') AS referrer, COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
        GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct')
        ORDER BY count DESC
        LIMIT 5
        """,
        (link["id"],),
    ).fetchall()

    device_breakdown = database.execute(
        """
        SELECT
          CASE WHEN user_agent LIKE '%Mobile%' THEN 'Mobile' ELSE 'Desktop' END AS device,
          COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
        GROUP BY CASE WHEN user_agent LIKE '%Mobile%' THEN 'Mobile' ELSE 'Desktop' END
        ORDER BY count DESC
        """,
        (link["id"],),
    ).fetchall()

    geo_breakdown = database.execute(
        """
        SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS country, COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
        GROUP BY COALESCE(NULLIF(country, ''), 'Unknown')
        ORDER BY count DESC
        LIMIT 5
        """,
        (link["id"],),
    ).fetchall()

    return jsonify(
        {
            "link": public_link_dict(link),
            "totalClicks": total_clicks,
            "last7Days": [row_to_dict(row) for row in last_7_days],
            "topReferrers": [row_to_dict(row) for row in top_referrers],
            "deviceBreakdown": [row_to_dict(row) for row in device_breakdown],
            "geoBreakdown": [row_to_dict(row) for row in geo_breakdown],
        }
    )


@links_blueprint.put("/<link_id>")
@login_required
def update_link(link_id):
    payload = request.get_json(silent=True) or {}
    existing_link = get_owned_link(link_id, g.user["userId"])

    if not existing_link:
        return json_error("Link not found", 404)

    parsed_active = parse_active_value(payload.get("active"))

    if parsed_active.get("error"):
        return json_error(parsed_active["error"], 400)

    expires_at = payload["expires_at"] if "expires_at" in payload else None
    original_url = payload["original_url"] if "original_url" in payload else None

    database = get_db()
    database.execute(
        """
        UPDATE links
        SET
          active = COALESCE(?, active),
          expires_at = COALESCE(?, expires_at),
          original_url = COALESCE(?, original_url)
        WHERE id = ? AND user_id = ?
        """,
        (
            parsed_active["value"],
            expires_at,
            original_url,
            link_id,
            g.user["userId"],
        ),
    )
    database.commit()
    delete_value(existing_link["slug"])

    updated_link = database.execute(
        f"SELECT {PUBLIC_LINK_COLUMNS} FROM links WHERE id = ? AND user_id = ?",
        (link_id, g.user["userId"]),
    ).fetchone()

    return jsonify(public_link_dict(updated_link))


@links_blueprint.delete("/<link_id>")
@login_required
def delete_link(link_id):
    existing_link = get_owned_link(link_id, g.user["userId"])

    if not existing_link:
        return json_error("Link not found", 404)

    database = get_db()
    database.execute("DELETE FROM sessions WHERE link_id = ?", (link_id,))
    database.execute("DELETE FROM clicks WHERE link_id = ?", (link_id,))
    database.execute("DELETE FROM links WHERE id = ?", (link_id,))
    database.commit()

    delete_value(existing_link["slug"])
    return jsonify({"message": "Link deleted"})


@links_blueprint.get("/<link_id>/qr")
@login_required
def link_qr(link_id):
    link = get_owned_link(link_id, g.user["userId"])

    if not link:
        return json_error("Link not found", 404)

    image = qrcode.make(build_short_url(link["slug"]))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)

    return send_file(buffer, mimetype="image/png")
