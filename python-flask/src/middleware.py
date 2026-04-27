# Provides JWT authentication decorators for protected Flask endpoints.
from functools import wraps

import jwt
from flask import current_app, g, request

from .utils import json_error


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        authorization = request.headers.get("Authorization", "")
        parts = authorization.split(" ", 1)

        if len(parts) != 2 or parts[0] != "Bearer" or not parts[1]:
            return json_error("Missing or invalid token", 401)

        try:
            payload = jwt.decode(
                parts[1],
                current_app.config["JWT_SECRET"],
                algorithms=["HS256"],
            )
        except jwt.InvalidTokenError:
            return json_error("Missing or invalid token", 401)

        user_id = payload.get("userId")

        if not user_id:
            return json_error("Missing or invalid token", 401)

        g.user = {"userId": user_id}
        return view(*args, **kwargs)

    return wrapped_view
