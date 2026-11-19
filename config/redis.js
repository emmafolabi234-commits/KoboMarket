require('dotenv').config();

const IORedis = require('ioredis');
const logger = require('../src/utils/logger');

let redis;

async function initRedis() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL not set');
  redis = new IORedis(url, {
    lazyConnect: true,
    connectTimeout: 10000,
    maxRetriesPerRequest: null,
    retryStrategy: retries => retries < 3 ? retries * 200 : null
  });
  redis.on('error', err => logger.error({ err }, 'Redis connection error'));
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    redis.disconnect();
    redis = undefined;
    throw err;
  }
  console.log('Redis connected');
}

function getRedis() {
  if (!redis) throw new Error('Redis not initialized');
  return redis;
}

module.exports = { initRedis, getRedis };
