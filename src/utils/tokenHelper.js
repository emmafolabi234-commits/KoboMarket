// src/utils/tokenHelper.js
/**
 * Small helper for generating opaque tokens and hashing them.
 * The raw token is sent to the user (email link, etc.).
 * The hashed version is stored in the DB for security.
 */
const crypto = require('crypto');

function generateRawToken() {
  // 32‑byte random string, hex‑encoded (64 chars)
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(raw) {
  // Use SHA‑256 – fast and deterministic for look‑ups
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = { generateRawToken, hashToken };
