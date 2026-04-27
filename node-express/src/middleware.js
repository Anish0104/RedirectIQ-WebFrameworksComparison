// Verifies JWT bearer tokens and attaches the authenticated user to the request.
const jwt = require('jsonwebtoken');

function authenticateJWT(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey123');
    req.user = { userId: payload.userId };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
}

module.exports = {
  authenticateJWT
};
