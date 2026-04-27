# Creates and runs the Flask RedirectIQ application with shared configuration and routes.
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

from auth import auth_blueprint
from db import init_app as init_db_app
from links import links_blueprint
from middleware import jwt_manager, limiter
from redirect import redirect_blueprint
from stats import stats_blueprint
from utils import json_error


def create_app():
    load_dotenv()

    app_root = Path(__file__).resolve().parent
    repo_root = app_root.parent
    frontend_dist = repo_root / "frontend" / "dist"
    db_path = os.getenv("DB_PATH", "./redirectiq.db")
    benchmark_mode = os.getenv("BENCHMARK_MODE", "false").lower() == "true"
    resolved_db_path = Path(db_path)

    if not resolved_db_path.is_absolute():
        resolved_db_path = (app_root / resolved_db_path).resolve()

    app = Flask(__name__)
    app.config.update(
        APP_ROOT=str(app_root),
        REPO_ROOT=str(repo_root),
        FRONTEND_DIST=str(frontend_dist),
        PORT=int(os.getenv("PORT", "3002")),
        JWT_SECRET=os.getenv("JWT_SECRET", "supersecretkey123"),
        JWT_SECRET_KEY=os.getenv("JWT_SECRET", "supersecretkey123"),
        DB_PATH=db_path,
        RESOLVED_DB_PATH=str(resolved_db_path),
        CACHE_TTL_SECONDS=int(os.getenv("CACHE_TTL_SECONDS", "60")),
        PUBLIC_BASE_URL=os.getenv("PUBLIC_BASE_URL", "").rstrip("/"),
        BENCHMARK_MODE=benchmark_mode,
        RATELIMIT_ENABLED=not benchmark_mode,
    )
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

    CORS(app)
    jwt_manager.init_app(app)
    limiter.init_app(app)
    init_db_app(app)

    @jwt_manager.invalid_token_loader
    def invalid_token_callback(reason):
        return json_error("Missing or invalid token", 401)

    @jwt_manager.unauthorized_loader
    def missing_token_callback(reason):
        return json_error("Missing or invalid token", 401)

    @jwt_manager.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return json_error("Missing or invalid token", 401)

    @jwt_manager.needs_fresh_token_loader
    def fresh_token_callback(jwt_header, jwt_payload):
        return json_error("Missing or invalid token", 401)

    @jwt_manager.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return json_error("Missing or invalid token", 401)

    @app.after_request
    def add_common_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

    @app.errorhandler(429)
    def handle_rate_limit(error):
        return jsonify({"error": "Too many requests"}), 429

    @app.errorhandler(404)
    def handle_missing_route(error):
        return json_error("Not found", 404)

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
        if not frontend_dist.exists():
            return json_error("Frontend build not found", 404)

        file_path = frontend_dist / filename

        if not file_path.exists():
            return json_error("Frontend build not found", 404)

        return send_from_directory(frontend_dist, filename)

    @app.get("/")
    @app.get("/login")
    @app.get("/dashboard")
    def serve_frontend_index():
        return serve_frontend_file("index.html")

    @app.get("/assets/<path:filename>")
    def serve_frontend_assets(filename):
        assets_dir = frontend_dist / "assets"

        if not assets_dir.exists():
            return json_error("Frontend assets not found", 404)

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


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "3002")), debug=False)
