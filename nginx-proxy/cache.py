# Provides a tiny in-memory TTL cache for Flask RedirectIQ slug lookups.
import threading
import time

_store = {}
_lock = threading.Lock()


def set_value(key, value, ttl_seconds):
    ttl = max(int(ttl_seconds), 0)
    expires_at = time.time() + ttl

    with _lock:
        _store[key] = {"value": value, "expires_at": expires_at}


def get_value(key):
    with _lock:
        entry = _store.get(key)

        if not entry:
            return None

        if entry["expires_at"] <= time.time():
            _store.pop(key, None)
            return None

        return entry["value"]


def delete_value(key):
    with _lock:
        _store.pop(key, None)


def clear():
    with _lock:
        _store.clear()
