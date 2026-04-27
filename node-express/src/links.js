// Exposes authenticated link management, QR generation, and per-link analytics routes.
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const cache = require('./cache');
const { authenticateJWT } = require('./middleware');

const router = express.Router();
const publicLinkColumns = `
  id,
  user_id,
  original_url,
  slug,
  custom_slug,
  expires_at,
  active,
  is_split,
  split_url_b,
  split_ratio,
  created_at
`;

router.use(authenticateJWT);

function isUniqueConstraintError(error) {
  return Boolean(
    error &&
      (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
        String(error.message || '').includes('UNIQUE constraint failed'))
  );
}

function getOwnedLink(linkId, userId) {
  return db.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').get(linkId, userId);
}

function parseActiveValue(value) {
  if (typeof value === 'undefined') {
    return { value: null };
  }

  if (typeof value === 'boolean') {
    return { value: value ? 1 : 0 };
  }

  const numeric = Number(value);

  if (numeric === 0 || numeric === 1) {
    return { value: numeric };
  }

  return { error: 'active must be 0 or 1' };
}

function normalizeSplitRatio(value) {
  if (typeof value === 'undefined') {
    return 0.5;
  }

  const numeric = Number(value);

  if (Number.isNaN(numeric) || numeric < 0 || numeric > 1) {
    return null;
  }

  return numeric;
}

function getPublicBaseUrl(req) {
  const configuredBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim();
    const protocol = forwardedProto || req.protocol || 'http';
    const host = req.get('host');

    if (host) {
      return `${protocol}://${host}`;
    }
  }

  const port = process.env.PORT || '3001';
  return `http://localhost:${port}`;
}

function buildShortUrl(req, slug) {
  return `${getPublicBaseUrl(req)}/${slug}`;
}

function serializeLink(req, link) {
  if (!link) {
    return null;
  }

  const serializedLink = {
    ...link,
    short_url: buildShortUrl(req, link.slug)
  };

  if (Object.prototype.hasOwnProperty.call(serializedLink, 'total_clicks')) {
    serializedLink.totalClicks = Number(serializedLink.total_clicks || 0);
    delete serializedLink.total_clicks;
  }

  return serializedLink;
}

function maybeServeFrontendApp(req, res) {
  const acceptHeader = req.headers.accept || '';
  const wantsHtml = acceptHeader.includes('text/html') && !acceptHeader.includes('application/json');

  if (!wantsHtml) {
    return false;
  }

  const distIndexPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');

  if (!fs.existsSync(distIndexPath)) {
    return false;
  }

  res.sendFile(distIndexPath);
  return true;
}

router.post('/', function createLink(req, res) {
  const originalUrl =
    req.body && typeof req.body.original_url === 'string' ? req.body.original_url.trim() : '';
  const requestedSlug =
    req.body && typeof req.body.custom_slug === 'string' ? req.body.custom_slug.trim() : '';
  const expiresAt =
    req.body && typeof req.body.expires_at === 'string' && req.body.expires_at.trim()
      ? req.body.expires_at.trim()
      : null;
  const password =
    req.body && typeof req.body.password === 'string' && req.body.password.length
      ? req.body.password
      : null;
  const splitUrlB =
    req.body && typeof req.body.split_url_b === 'string' && req.body.split_url_b.trim()
      ? req.body.split_url_b.trim()
      : null;

  if (!originalUrl) {
    return res.status(400).json({ error: 'original_url is required' });
  }

  if (requestedSlug && !/^[A-Za-z0-9_-]+$/.test(requestedSlug)) {
    return res.status(400).json({ error: 'custom_slug may only contain letters, numbers, underscores, and hyphens' });
  }

  const splitRatio = splitUrlB ? normalizeSplitRatio(req.body.split_ratio) : 0.5;

  if (splitUrlB && splitRatio === null) {
    return res.status(400).json({ error: 'split_ratio must be between 0 and 1' });
  }

  const id = uuidv4();
  const slug = requestedSlug || uuidv4().replace(/-/g, '').slice(0, 7);
  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
  const isSplit = splitUrlB ? 1 : 0;

  try {
    db.prepare(
      `
        INSERT INTO links (
          id,
          user_id,
          original_url,
          slug,
          custom_slug,
          expires_at,
          password_hash,
          is_split,
          split_url_b,
          split_ratio
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      id,
      req.user.userId,
      originalUrl,
      slug,
      requestedSlug ? 1 : 0,
      expiresAt,
      passwordHash,
      isSplit,
      splitUrlB,
      splitRatio
    );

    return res.status(201).json({
      id,
      slug,
      short_url: buildShortUrl(req, slug)
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'Slug already exists' });
    }

    return res.status(500).json({ error: 'Failed to create link' });
  }
});

router.get('/', function listLinks(req, res) {
  const links = db
    .prepare(
      `
        SELECT
          ${publicLinkColumns},
          (SELECT COUNT(*) FROM clicks WHERE clicks.link_id = links.id) AS total_clicks
        FROM links
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
      `
    )
    .all(req.user.userId)
    .map(function decorateLink(link) {
      return serializeLink(req, link);
    });

  return res.json(links);
});

router.get('/:id/stats', function linkStats(req, res) {
  if (maybeServeFrontendApp(req, res)) {
    return;
  }

  const link = db
    .prepare(`SELECT ${publicLinkColumns} FROM links WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.userId);

  if (!link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  const totalClicks = db
    .prepare('SELECT COUNT(*) AS count FROM clicks WHERE link_id = ?')
    .get(link.id).count;

  const last7Days = db
    .prepare(
      `
        SELECT date(clicked_at) AS day, COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
          AND datetime(clicked_at) >= datetime('now', '-6 days')
        GROUP BY date(clicked_at)
        ORDER BY day ASC
      `
    )
    .all(link.id);

  const topReferrers = db
    .prepare(
      `
        SELECT COALESCE(NULLIF(referrer, ''), 'Direct') AS referrer, COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
        GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct')
        ORDER BY count DESC
        LIMIT 5
      `
    )
    .all(link.id);

  const deviceBreakdown = db
    .prepare(
      `
        SELECT
          CASE WHEN user_agent LIKE '%Mobile%' THEN 'Mobile' ELSE 'Desktop' END AS device,
          COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
        GROUP BY CASE WHEN user_agent LIKE '%Mobile%' THEN 'Mobile' ELSE 'Desktop' END
        ORDER BY count DESC
      `
    )
    .all(link.id);

  const geoBreakdown = db
    .prepare(
      `
        SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS country, COUNT(*) AS count
        FROM clicks
        WHERE link_id = ?
        GROUP BY COALESCE(NULLIF(country, ''), 'Unknown')
        ORDER BY count DESC
        LIMIT 5
      `
    )
    .all(link.id);

  return res.json({
    link: serializeLink(req, link),
    totalClicks,
    last7Days,
    topReferrers,
    deviceBreakdown,
    geoBreakdown
  });
});

router.put('/:id', function updateLink(req, res) {
  const existingLink = getOwnedLink(req.params.id, req.user.userId);

  if (!existingLink) {
    return res.status(404).json({ error: 'Link not found' });
  }

  const parsedActive = parseActiveValue(req.body ? req.body.active : undefined);

  if (parsedActive.error) {
    return res.status(400).json({ error: parsedActive.error });
  }

  const expiresAt =
    req.body && Object.prototype.hasOwnProperty.call(req.body, 'expires_at')
      ? req.body.expires_at
      : null;
  const originalUrl =
    req.body && Object.prototype.hasOwnProperty.call(req.body, 'original_url')
      ? req.body.original_url
      : null;

  db.prepare(
    `
      UPDATE links
      SET
        active = COALESCE(?, active),
        expires_at = COALESCE(?, expires_at),
        original_url = COALESCE(?, original_url)
      WHERE id = ? AND user_id = ?
    `
  ).run(parsedActive.value, expiresAt, originalUrl, req.params.id, req.user.userId);

  cache.del(existingLink.slug);

  const updatedLink = db
    .prepare(`SELECT ${publicLinkColumns} FROM links WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.userId);

  return res.json(serializeLink(req, updatedLink));
});

router.delete('/:id', function deleteLink(req, res) {
  const existingLink = getOwnedLink(req.params.id, req.user.userId);

  if (!existingLink) {
    return res.status(404).json({ error: 'Link not found' });
  }

  const removeLink = db.transaction(function removeLinkRecords(linkId) {
    db.prepare('DELETE FROM sessions WHERE link_id = ?').run(linkId);
    db.prepare('DELETE FROM clicks WHERE link_id = ?').run(linkId);
    db.prepare('DELETE FROM links WHERE id = ?').run(linkId);
  });

  removeLink(existingLink.id);
  cache.del(existingLink.slug);

  return res.json({ message: 'Link deleted' });
});

router.get('/:id/qr', function qrCode(req, res) {
  const link = db
    .prepare(`SELECT ${publicLinkColumns} FROM links WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.userId);

  if (!link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  QRCode.toBuffer(buildShortUrl(req, link.slug))
    .then(function sendQr(buffer) {
      res.setHeader('Content-Type', 'image/png');
      res.send(buffer);
    })
    .catch(function handleQrError() {
      res.status(500).json({ error: 'Failed to generate QR code' });
    });
});

module.exports = router;
