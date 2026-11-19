/**
 * JWT authentication middleware – validates access token and attaches user info to req.
 */
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
require('dotenv').config();

async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Invalid Authorization header' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await User.findOne({ userUuid: payload.sub });
    if (!user || user.isFrozen || !user.isEmailVerified) {
      return res.status(401).json({ error: 'Account is unavailable' });
    }
    req.user = { sub: user.userUuid, roles: user.roles };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;
