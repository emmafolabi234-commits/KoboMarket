// src/repositories/disputeRepository.js
/** Dispute Repository – PostgreSQL queries for disputes */
const { getPool } = require('../../config/database');

async function createDispute({ subOrderId, openedBy, reason, evidence, client }) {
  const db = client || getPool();
  const res = await db.query(
    `INSERT INTO disputes (sub_order_id, opened_by, reason, evidence, status, created_at)
     VALUES ($1, $2, $3, $4, 'OPEN', now()) RETURNING *`,
    [subOrderId, openedBy, reason, evidence]
  );
  return res.rows[0];
}

async function resolveDispute({ disputeId, resolution, refundAmountKobo, adminId, adminNote, client }) {
  const db = client || getPool();
  const res = await db.query(
    `UPDATE disputes SET status = 'RESOLVED', resolution = $1, refund_amount_kobo = $2, resolved_by = $3, admin_note = $4, resolved_at = now()
     WHERE id = $5 RETURNING *`,
    [resolution, refundAmountKobo, adminId, adminNote, disputeId]
  );
  return res.rows[0];
}

module.exports = { createDispute, resolveDispute };
