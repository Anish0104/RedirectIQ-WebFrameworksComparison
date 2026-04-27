// Provides a tiny in-memory cache for RedirectIQ slug lookups.
const store = new Map();

// This cache is used to keep slug lookups warm for the benchmark.
function set(key, value, ttlSeconds) {
  const ttl = Number(ttlSeconds) || 0;
  const expiresAt = Date.now() + ttl * 1000;

  store.set(key, { value, expiresAt });
}

function get(key) {
  const entry = store.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

function del(key) {
  store.delete(key);
}

function clear() {
  store.clear();
}

module.exports = {
  set,
  get,
  del,
  clear
};
