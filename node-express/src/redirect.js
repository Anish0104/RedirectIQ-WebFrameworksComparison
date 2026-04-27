// Serves public redirects, password protection, split routing, and click logging.
const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const cache = require('./cache');

const cacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS || 60);

function normalizeIp(ip) {
  if (!ip) {
    return '';
  }

  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isLocalIp(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCachedLink(slug) {
  const cachedLink = cache.get(slug);

  if (cachedLink) {
    return {
      link: cachedLink,
      cacheStatus: 'HIT'
    };
  }

  const link = db.prepare('SELECT * FROM links WHERE slug = ? AND active = 1').get(slug);

  if (link) {
    cache.set(slug, link, cacheTtlSeconds);
  }

  return {
    link: link || null,
    cacheStatus: 'MISS'
  };
}

function hasValidSession(linkId, visitorToken) {
  if (!visitorToken) {
    return false;
  }

  const session = db
    .prepare(
      `
        SELECT id
        FROM sessions
        WHERE link_id = ?
          AND visitor_token = ?
          AND datetime(expires_at) > datetime('now')
      `
    )
    .get(linkId, visitorToken);

  return Boolean(session);
}

function logClick(linkId, referrer, userAgent, ipAddress) {
  const clickId = uuidv4();

  try {
    db.prepare(
      'INSERT INTO clicks (id, link_id, referrer, user_agent) VALUES (?, ?, ?, ?)'
    ).run(clickId, linkId, referrer, userAgent);
  } catch (error) {
    return;
  }

  if (!ipAddress || isLocalIp(ipAddress)) {
    return;
  }

  axios
    .get(`http://ip-api.com/json/${encodeURIComponent(ipAddress)}?fields=status,country,city`, {
      timeout: 3000
    })
    .then(function updateGeo(response) {
      const payload = response && response.data ? response.data : {};

      if (payload.status !== 'success') {
        return;
      }

      db.prepare('UPDATE clicks SET country = ?, city = ? WHERE id = ?').run(
        payload.country || null,
        payload.city || null,
        clickId
      );
    })
    .catch(function ignoreGeoFailure() {});
}

function createRedirectRouter(redirectLimiter) {
  const router = express.Router();

  router.post('/verify-password/:slug', function verifyPassword(req, res) {
    const slug = req.params.slug;
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    const link = db
      .prepare('SELECT id, slug, password_hash FROM links WHERE slug = ? AND active = 1')
      .get(slug);

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (!link.password_hash) {
      return res.status(400).json({ error: 'Link is not password protected' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (!bcrypt.compareSync(password, link.password_hash)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const sessionId = uuidv4();
    const visitorToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO sessions (id, link_id, visitor_token, expires_at) VALUES (?, ?, ?, ?)'
    ).run(sessionId, link.id, visitorToken, expiresAt);

    res.setHeader('Cache-Control', 'no-store');
    res.cookie('visitor_token', visitorToken, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({ success: true });
  });

  router.get('/password-prompt/:slug', function passwordPrompt(req, res) {
    const slug = req.params.slug;
    const link = db
      .prepare('SELECT slug, password_hash FROM links WHERE slug = ? AND active = 1')
      .get(slug);

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (!link.password_hash) {
      return res.redirect(302, `/${encodeURIComponent(slug)}`);
    }

    const safeSlug = escapeHtml(slug);
    const encodedSlug = encodeURIComponent(slug);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Protected Link</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f5f7fb;
        color: #1f2937;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
      }
      .card {
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
        padding: 32px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 20px;
        color: #4b5563;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: 600;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        margin-bottom: 16px;
      }
      button {
        width: 100%;
        padding: 12px;
        border: 0;
        border-radius: 8px;
        background: #111827;
        color: #ffffff;
        font-weight: 600;
        cursor: pointer;
      }
      #error {
        min-height: 20px;
        margin-top: 12px;
        color: #dc2626;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Protected Link</h1>
      <p>Enter the password to continue to <strong>${safeSlug}</strong>.</p>
      <form id="password-form">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Continue</button>
        <div id="error"></div>
      </form>
    </div>
    <script>
      var form = document.getElementById('password-form');
      var errorBox = document.getElementById('error');
      var passwordInput = document.getElementById('password');

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        errorBox.textContent = '';

        fetch('/verify-password/${encodedSlug}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ password: passwordInput.value })
        })
          .then(function (response) {
            if (!response.ok) {
              return response.json().then(function (data) {
                throw new Error((data && data.error) || 'Invalid password');
              });
            }

            return response.json();
          })
          .then(function () {
            window.location.href = '/${encodedSlug}';
          })
          .catch(function (error) {
            errorBox.textContent = error.message;
          });
      });
    </script>
  </body>
</html>`);
  });

  router.get('/:slug', redirectLimiter, function redirectToDestination(req, res) {
    const slug = req.params.slug;
    const cacheResult = getCachedLink(slug);
    const link = cacheResult.link;

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    if (link.password_hash && !hasValidSession(link.id, req.cookies && req.cookies.visitor_token)) {
      return res.redirect(302, `/password-prompt/${encodeURIComponent(slug)}`);
    }

    const splitRatio = Number(link.split_ratio || 0.5);
    const destination =
      link.is_split && link.split_url_b && Math.random() >= splitRatio
        ? link.split_url_b
        : link.original_url;
    const referrer = req.get('referer') || null;
    const userAgent = req.get('user-agent') || null;
    const ipAddress = normalizeIp(req.ip);

    res.setHeader('Cache-Control', `public, max-age=${cacheTtlSeconds}`);
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-RedirectIQ-Cache', cacheResult.cacheStatus);
    res.redirect(302, destination);

    setImmediate(function queueClickLogging() {
      logClick(link.id, referrer, userAgent, ipAddress);
    });
  });

  return router;
}

module.exports = createRedirectRouter;
