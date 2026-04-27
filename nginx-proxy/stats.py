# Provides account-level summary analytics endpoints for the Flask RedirectIQ backend.
from flask import Blueprint, g, jsonify

from db import get_db
from middleware import login_required

stats_blueprint = Blueprint("stats", __name__, url_prefix="/stats")


@stats_blueprint.get("/summary")
@login_required
def summary():
    database = get_db()
    user_id = g.user["userId"]

    total_links = database.execute(
        "SELECT COUNT(*) AS count FROM links WHERE user_id = ?",
        (user_id,),
    ).fetchone()["count"]

    total_clicks = database.execute(
        """
        SELECT COUNT(*) AS count
        FROM clicks
        WHERE link_id IN (SELECT id FROM links WHERE user_id = ?)
        """,
        (user_id,),
    ).fetchone()["count"]

    active_links = database.execute(
        "SELECT COUNT(*) AS count FROM links WHERE user_id = ? AND active = 1",
        (user_id,),
    ).fetchone()["count"]

    clicks_last_7_days = database.execute(
        """
        SELECT COUNT(*) AS count
        FROM clicks
        WHERE link_id IN (SELECT id FROM links WHERE user_id = ?)
          AND datetime(clicked_at) >= datetime('now', '-6 days')
        """,
        (user_id,),
    ).fetchone()["count"]

    return jsonify(
        {
            "totalLinks": total_links,
            "totalClicks": total_clicks,
            "activeLinks": active_links,
            "clicksLast7Days": clicks_last_7_days,
        }
    )
