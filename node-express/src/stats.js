// Provides authenticated account-level summary metrics across a user's links.
const express = require('express');
const db = require('./db');
const { authenticateJWT } = require('./middleware');

const router = express.Router();

router.use(authenticateJWT);

router.get('/summary', function summary(req, res) {
  const userId = req.user.userId;

  const totalLinks = db
    .prepare('SELECT COUNT(*) AS count FROM links WHERE user_id = ?')
    .get(userId).count;

  const totalClicks = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM clicks
        WHERE link_id IN (SELECT id FROM links WHERE user_id = ?)
      `
    )
    .get(userId).count;

  const activeLinks = db
    .prepare('SELECT COUNT(*) AS count FROM links WHERE user_id = ? AND active = 1')
    .get(userId).count;

  const clicksLast7Days = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM clicks
        WHERE link_id IN (SELECT id FROM links WHERE user_id = ?)
          AND datetime(clicked_at) >= datetime('now', '-6 days')
      `
    )
    .get(userId).count;

  return res.json({
    totalLinks,
    totalClicks,
    activeLinks,
    clicksLast7Days
  });
});

module.exports = router;
