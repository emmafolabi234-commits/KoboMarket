require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters');
}

const app = require('./app');
const logger = require('./utils/logger');
const { initPostgres } = require('../config/database');
const { initMongo } = require('../config/mongo');
const { initRedis } = require('../config/redis');

(async () => {
  try {
    await initPostgres();
    await initMongo();
    await initRedis();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      logger.info(`KoboMarket API listening on port ${port}`);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start service');
    process.exit(1);
  }
})();
