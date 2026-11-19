// src/services/payoutService.js
/**
 * Payout Service – exposes payout status and prevents unverified payout requests.
 */
const payoutRepo = require('../repositories/payoutRepository');
/** Do not debit funds until an actual payment provider is configured. */
async function requestPayout({ vendorUuid, amountKobo }) {
  throw Object.assign(
    new Error('Payouts are unavailable until a payout provider is configured'),
    { status: 503 }
  );
}

/** Get payout status by ID */
async function getPayoutStatus(payoutId, requesterUuid, isAdmin) {
  if (typeof payoutId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payoutId)) {
    throw Object.assign(new Error('Invalid payout id'), { status: 400 });
  }
  const payout = await payoutRepo.getPayoutById(payoutId);
  if (!payout) throw Object.assign(new Error('Payout not found'), { status: 404 });
  if (!isAdmin && payout.vendor_id !== requesterUuid) {
    throw Object.assign(new Error('You cannot view this payout'), { status: 403 });
  }
  return payout;
}

module.exports = { requestPayout, getPayoutStatus };
