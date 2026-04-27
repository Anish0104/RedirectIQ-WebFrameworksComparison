# Implements the Flask registration and login endpoints for RedirectIQ.
from datetime import datetime, timedelta, timezone
import uuid

import bcrypt
import jwt
from flask import Blueprint, current_app, jsonify, request

from .db import get_db
from .extensions import limiter
from .utils import is_unique_constraint_error, json_error

auth_blueprint = Blueprint("auth", __name__, url_prefix="/auth")


@auth_blueprint.post("/register")
@limiter.limit("20 per 15 minutes")
def register():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""

    if not email or not password:
        return json_error("Email and password are required", 400)

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")
    database = get_db()

    try:
        database.execute(
            "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
            (str(uuid.uuid4()), email, password_hash),
        )
        database.commit()
    except Exception as error:
        if is_unique_constraint_error(error):
            return json_error("Email already exists", 409)

        raise

    return jsonify({"message": "User registered"}), 201


@auth_blueprint.post("/login")
@limiter.limit("20 per 15 minutes")
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""

    if not email or not password:
        return json_error("Email and password are required", 400)

    database = get_db()
    user = database.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not user:
        return json_error("Invalid email or password", 401)

    password_hash = user["password_hash"].encode("utf-8")

    if not bcrypt.checkpw(password.encode("utf-8"), password_hash):
        return json_error("Invalid email or password", 401)

    token = jwt.encode(
        {
            "userId": user["id"],
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        },
        current_app.config["JWT_SECRET"],
        algorithm="HS256",
    )

    return jsonify({"token": token})
