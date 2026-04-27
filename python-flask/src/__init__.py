# Creates and configures the Flask RedirectIQ application instance.
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from .auth import auth_blueprint
from .db import init_app as init_db_app
from .extensions import limiter
from .links import links_blueprint
from .redirect import redirect_blueprint
from .stats import stats_blueprint


def create_app():
    load_dotenv()

    app_root = Path(__file__).resolve().parents[1]
    repo_root = app_root.parent
    frontend_dist = repo_root / "frontend" / "dist"
    db_path = os.getenv("DB_PATH", "./redirectiq-flask.db")
    resolved_db_path = Path(db_path)

    if not resolved_db_path.is_absolute():
        resolved_db_path = (app_root / resolved_db_path).resolve()

    app = Flask(__name__)
    app.config.update(
        APP_ROOT=str(app_root),
        REPO_ROOT=str(repo_root),
        PORT=int(os.getenv("PORT", "3002")),
        JWT_SECRET=os.getenv("JWT_SECRET", "supersecretkey123"),
        DB_PATH=db_path,
        RESOLVED_DB_PATH=str(resolved_db_path),
        CACHE_TTL_SECONDS=int(os.getenv("CACHE_TTL_SECONDS", "60")),
        PUBLIC_BASE_URL=os.getenv("PUBLIC_BASE_URL", "").rstrip("/"),
        FRONTEND_DIST=str(frontend_dist),
    )

    CORS(app)
    limiter.init_app(app)
    init_db_app(app)

    @app.after_request
    def add_common_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

    @app.errorhandler(429)
    def handle_rate_limit(error):
        return jsonify({"error": "Too many requests"}), 429

    @app.get("/health")
    @limiter.limit("200 per 15 minutes")
    def health():
        return jsonify(
            {
                "status": "ok",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    def serve_frontend_file(filename):
        dist_path = Path(app.config["FRONTEND_DIST"])
        file_path = dist_path / filename

        if not file_path.exists():
            return jsonify({"error": "Frontend build not found"}), 404

        return send_from_directory(dist_path, filename)

    @app.get("/")
    @app.get("/login")
    @app.get("/dashboard")
    def serve_frontend_index():
        return serve_frontend_file("index.html")

    @app.get("/assets/<path:filename>")
    def serve_frontend_assets(filename):
        assets_dir = Path(app.config["FRONTEND_DIST"]) / "assets"

        if not assets_dir.exists():
            return jsonify({"error": "Frontend assets not found"}), 404

        return send_from_directory(assets_dir, filename)

    @app.get("/favicon.svg")
    def serve_favicon():
        return serve_frontend_file("favicon.svg")

    @app.get("/icons.svg")
    def serve_icons():
        return serve_frontend_file("icons.svg")

    app.register_blueprint(auth_blueprint)
    app.register_blueprint(links_blueprint)
    app.register_blueprint(stats_blueprint)
    app.register_blueprint(redirect_blueprint)

    return app
