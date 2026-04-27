# Implements user registration and login endpoints for the Flask RedirectIQ backend.
from datetime import timedelta
import uuid

import bcrypt
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token

from db import get_db
from middleware import limiter
from utils import is_unique_constraint_error, json_error

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

        return json_error("Failed to register user", 500)

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

    token = create_access_token(identity=user["id"], expires_delta=timedelta(days=7))
    return jsonify({"token": token})
