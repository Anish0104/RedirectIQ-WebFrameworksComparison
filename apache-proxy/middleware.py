# Provides shared JWT and rate-limiting middleware for the Flask RedirectIQ backend.
from functools import wraps

from flask import g
from flask_jwt_extended import JWTManager, get_jwt_identity, verify_jwt_in_request
from flask_jwt_extended.exceptions import JWTExtendedException
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from utils import json_error

jwt_manager = JWTManager()
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except JWTExtendedException:
            return json_error("Missing or invalid token", 401)

        user_id = get_jwt_identity()

        if not user_id:
            return json_error("Missing or invalid token", 401)

        g.user = {"userId": user_id}
        return view(*args, **kwargs)

    return wrapped_view
