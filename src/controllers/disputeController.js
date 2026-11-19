// src/controllers/disputeController.js
/** Dispute Controller – thin wrapper around disputeService */
const disputeService = require('../services/disputeService');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.openDispute = async (req, res, next) => {
  try {
    // Expected body: { subOrderId, reason, evidence }
    const { subOrderId, reason, evidence } = req.body;
    const openedBy = req.user.sub;
    const result = await disputeService.openDispute({ subOrderId, openedBy, reason, evidence });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.getDispute = async (req, res, next) => {
  try {
    const disputeId = req.params.id;
    if (!UUID_PATTERN.test(disputeId)) throw Object.assign(new Error('Invalid dispute id'), { status: 400 });
    // Simple fetch directly from PostgreSQL
    const { getPool } = require('../../config/database');
    const pool = getPool();
    const dbRes = await pool.query(
      `SELECT d.*, o.buyer_id
       FROM disputes d
       JOIN sub_orders so ON so.id = d.sub_order_id
       JOIN orders o ON o.id = so.order_id
       WHERE d.id = $1`,
      [disputeId]
    );
    if (dbRes.rowCount === 0) throw Object.assign(new Error('Dispute not found'), { status: 404 });
    const dispute = dbRes.rows[0];
    if (!req.user.roles.includes('ADMIN') && dispute.buyer_id !== req.user.sub) {
      throw Object.assign(new Error('You cannot view this dispute'), { status: 403 });
    }
    delete dispute.buyer_id;
    res.json(dispute);
  } catch (err) {
    next(err);
  }
};

exports.resolveDispute = async (req, res, next) => {
  try {
    const disputeId = req.params.id;
    const adminId = req.user.sub; // admin must be authenticated
    const { resolution, refundAmountKobo, adminNote } = req.body;
    const result = await disputeService.resolveDispute({ disputeId, resolution, refundAmountKobo, adminId, adminNote });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
