// src/workers/escrowWorker.js
/**
 * Escrow Timeout Worker – checks if an escrow should be released after the
 * configured timeout. Jobs are added to the `escrowTimeout` BullMQ queue with a
 * delay equal to the escrow timeout (in milliseconds). When the job runs, it
 * uses the Ledger Operations service to release the escrow to the vendor and
 * capture platform commission.
 */
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const orderService = require('../services/orderService');
const logger = require('../utils/logger');

let worker;

function startEscrowWorker() {
  if (worker) return worker;
  worker = new Worker('escrowTimeout', async job => {
    const subOrderId = job.data.subOrderId || job.data.orderId;
    if (!subOrderId) throw new Error('Escrow job is missing its sub-order id');
    await orderService.completeSubOrder(subOrderId);
    return { success: true, subOrderId };
  }, { connection: getRedis(), concurrency: 5 });

  worker.on('completed', job => {
    logger.info({ subOrderId: job.returnvalue.subOrderId }, 'Escrow release completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ err, subOrderId: job && (job.data.subOrderId || job.data.orderId) }, 'Escrow release failed');
  });
  worker.on('error', err => {
    logger.error({ err }, 'Escrow worker error');
  });
  return worker;
}

module.exports = { startEscrowWorker };
