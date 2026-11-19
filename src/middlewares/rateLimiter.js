const rateLimit = require('express-rate-limit');
const {RedisStore} = require('rate-limit-redis');
const { getRedis } = require('../../config/redis');

// Simple sliding window rate limiter using Redis
let limiter;

function createLimiter() {
  if (!limiter) {
    limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        sendCommand: (...args) => getRedis().call(...args)
      })
    });
  }
  return limiter;
}

module.exports = (req, res, next) => createLimiter()(req, res, next);
