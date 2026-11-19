// src/queues.js
/**
 * Central definition of BullMQ queues used for background processing.
 * Queues are created lazily after Redis has been initialized.
 */
const { Queue } = require('bullmq');
const { getRedis } = require('../config/redis');

let queues;

function getQueues() {
  if (!queues) {
    const connection = getRedis();
    queues = {
      escrowQueue: new Queue('escrowTimeout', { connection }),
      payoutQueue: new Queue('payoutProcessing', { connection }),
      outboxQueue: new Queue('outboxConsumer', { connection })
    };
  }
  return queues;
}

module.exports = { getQueues };
