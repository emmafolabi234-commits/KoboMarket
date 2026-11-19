// src/middlewares/loginRateLimiter.js
/**
 * Rate‑limiter for login attempts – max 5 failed attempts per 15 min per email+IP.
 * Uses Redis (via ioredis) and express‑rate‑limit.
 */
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedis } = require('../../config/redis');

// Helper to generate a unique key from email and IP address
function keyGenerator(req) {
  const rawEmail = req.body && req.body.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase().slice(0, 254) : '';
  const ip = ipKeyGenerator(req.ip);
  return `login:${email}:${ip}`;
}

let loginLimiter;

function createLimiter() {
  if (!loginLimiter) {
    loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      keyGenerator,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        sendCommand: (...args) => getRedis().call(...args)
      })
    });
  }
  return loginLimiter;
}

module.exports = (req, res, next) => createLimiter()(req, res, next);
