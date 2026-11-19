// src/repositories/payoutRepository.js
/** Payout Repository – PostgreSQL queries for payouts */
const { getPool } = require('../../config/database');

async function createPayout({ vendorId, accountId, amountKobo, providerReference }) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO payouts (vendor_id, account_id, amount_kobo, status, provider_reference, created_at, updated_at)
     VALUES ($1, $2, $3, 'PENDING', $4, now(), now()) RETURNING *`,
    [vendorId, accountId, amountKobo, providerReference]
  );
  return res.rows[0];
}

async function getPayoutById(payoutId) {
  const pool = getPool();
  const res = await pool.query('SELECT * FROM payouts WHERE id = $1', [payoutId]);
  return res.rows[0];
}

module.exports = { createPayout, getPayoutById };
