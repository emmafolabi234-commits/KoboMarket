// src/services/disputeService.js
/**
 * Dispute Service – business logic for opening and resolving disputes.
 */
const disputeRepo = require('../repositories/disputeRepository');
const ledgerService = require('./ledgerService');
const { getPool } = require('../../config/database');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function openDispute({ subOrderId, openedBy, reason, evidence }) {
  if (typeof subOrderId !== 'string' || !UUID_PATTERN.test(subOrderId) || typeof openedBy !== 'string') {
    throw Object.assign(new Error('Invalid dispute request'), { status: 400 });
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw Object.assign(new Error('A dispute reason is required'), { status: 400 });
  }
  const pool = getPool();
  const client = await pool.connect();
  let clientFailure;
  try {
    await client.query('BEGIN');
    const subRes = await client.query(
      `SELECT so.status, o.buyer_id
       FROM sub_orders so JOIN orders o ON o.id = so.order_id
       WHERE so.id = $1 FOR UPDATE OF so`,
      [subOrderId]
    );
    if (subRes.rowCount === 0) throw Object.assign(new Error('Sub-order not found'), { status: 404 });
    const { status, buyer_id: buyerId } = subRes.rows[0];
    if (buyerId !== openedBy) throw Object.assign(new Error('You cannot dispute this order'), { status: 403 });
    if (status !== 'PAID' && status !== 'SHIPPED' && status !== 'DELIVERED') {
      throw Object.assign(new Error('Dispute cannot be opened in current sub-order state'), { status: 400 });
    }
    const dispute = await disputeRepo.createDispute({
      subOrderId,
      openedBy,
      reason: reason.trim(),
      evidence,
      client
    });
    await client.query('UPDATE sub_orders SET status = $1 WHERE id = $2', ['DISPUTED', subOrderId]);
    await client.query('COMMIT');
    return dispute;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      err.rollbackError = rollbackErr;
      clientFailure = rollbackErr;
    }
    if (err.code === '23505') throw Object.assign(new Error('A dispute already exists for this order'), { status: 409 });
    throw err;
  } finally {
    client.release(clientFailure);
  }
}

async function resolveDispute({ disputeId, resolution, refundAmountKobo, adminId, adminNote }) {
  if (typeof disputeId !== 'string' || !UUID_PATTERN.test(disputeId)) {
    throw Object.assign(new Error('Invalid dispute id'), { status: 400 });
  }
  if (!['REFUND_BUYER', 'RELEASE_TO_VENDOR'].includes(resolution)) {
    throw Object.assign(new Error('Resolution must be REFUND_BUYER or RELEASE_TO_VENDOR'), { status: 400 });
  }
  if (!Number.isSafeInteger(refundAmountKobo) || refundAmountKobo < 0 ||
      (resolution === 'RELEASE_TO_VENDOR' && refundAmountKobo !== 0) ||
      (resolution === 'REFUND_BUYER' && refundAmountKobo === 0)) {
    throw Object.assign(new Error('Invalid refund amount'), { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  let clientFailure;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT d.id, d.status AS dispute_status, so.id AS sub_order_id,
              so.vendor_id, so.subtotal_kobo, so.commission_rate_bps, o.buyer_id
       FROM disputes d
       JOIN sub_orders so ON so.id = d.sub_order_id
       JOIN orders o ON o.id = so.order_id
       WHERE d.id = $1 FOR UPDATE OF d, so`,
      [disputeId]
    );
    if (!result.rowCount) throw Object.assign(new Error('Dispute not found'), { status: 404 });
    const dispute = result.rows[0];
    if (dispute.dispute_status !== 'OPEN') {
      throw Object.assign(new Error('Dispute is already resolved'), { status: 409 });
    }

    const subtotal = Number(dispute.subtotal_kobo);
    if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
      throw Object.assign(new Error('Invalid order subtotal'), { status: 409 });
    }
    if (refundAmountKobo > subtotal) {
      throw Object.assign(new Error('Refund exceeds the order subtotal'), { status: 400 });
    }
    if (resolution === 'RELEASE_TO_VENDOR' && refundAmountKobo !== 0) {
      throw Object.assign(new Error('Vendor release cannot include a refund'), { status: 400 });
    }

    const accountResult = await client.query(
      `SELECT id, owner_type, owner_id FROM accounts
       WHERE currency = 'NGN'
         AND ((owner_type = 'USER' AND owner_id = ANY($1::text[]))
           OR (owner_type = 'SYSTEM' AND owner_id = ANY($2::text[])))`,
      [[dispute.buyer_id, dispute.vendor_id], ['PLATFORM_ESCROW', 'PLATFORM_REVENUE']]
    );
    const accounts = new Map(accountResult.rows.map(account => [`${account.owner_type}:${account.owner_id}`, account.id]));
    const escrowId = accounts.get('SYSTEM:PLATFORM_ESCROW');
    const buyerId = accounts.get(`USER:${dispute.buyer_id}`);
    const vendorId = accounts.get(`USER:${dispute.vendor_id}`);
    const revenueId = accounts.get('SYSTEM:PLATFORM_REVENUE');
    if (!escrowId || !buyerId || !vendorId || !revenueId) {
      throw Object.assign(new Error('Required ledger accounts are not initialized'), { status: 409 });
    }

    const vendorGross = subtotal - refundAmountKobo;
    const commission = Number((BigInt(vendorGross) * BigInt(dispute.commission_rate_bps)) / 10000n);
    const entries = [{ accountId: escrowId, direction: 'DEBIT', amount: subtotal }];
    if (refundAmountKobo > 0) entries.push({ accountId: buyerId, direction: 'CREDIT', amount: refundAmountKobo });
    if (vendorGross - commission > 0) {
      entries.push({ accountId: vendorId, direction: 'CREDIT', amount: vendorGross - commission });
    }
    if (commission > 0) entries.push({ accountId: revenueId, direction: 'CREDIT', amount: commission });
    if (subtotal > 0) {
      await ledgerService.postTransaction({
        reference: `dispute-${disputeId}`,
        type: 'DISPUTE_RESOLUTION',
        entries,
        client
      });
    }

    const resolved = await disputeRepo.resolveDispute({
      disputeId,
      resolution,
      refundAmountKobo,
      adminId,
      adminNote,
      client
    });
    await client.query(
      `UPDATE sub_orders SET status = $1, completed_at = CASE WHEN $1 = 'COMPLETED' THEN now() ELSE completed_at END
       WHERE id = $2`,
      [vendorGross > 0 ? 'COMPLETED' : 'CANCELLED', dispute.sub_order_id]
    );
    await client.query('COMMIT');
    return resolved;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      err.rollbackError = rollbackErr;
      clientFailure = rollbackErr;
    }
    throw err;
  } finally {
    client.release(clientFailure);
  }
}

module.exports = { openDispute, resolveDispute };
