// Handles user registration and login for RedirectIQ.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const router = express.Router();

function isUniqueConstraintError(error) {
  return Boolean(
    error &&
      (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
        String(error.message || '').includes('UNIQUE constraint failed'))
  );
}

router.post('/register', function register(req, res) {
  const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    db.prepare(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)'
    ).run(id, email, passwordHash);

    return res.status(201).json({ message: 'User registered' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    return res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/login', function login(req, res) {
  const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || 'supersecretkey123',
    { expiresIn: '7d' }
  );

  return res.json({ token });
});

module.exports = router;
