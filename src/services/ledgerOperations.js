// src/services/ledgerOperations.js
/**
 * Ledger Operations – higher‑level helper functions that build the required
 * double‑entry ledger rows for common money movements in KoboMarket.
 * All operations are atomic via the underlying `postJournalEntry` repository
 * which runs inside a PostgreSQL transaction and locks the involved accounts.
 */

const { getAccountByOwner, postJournalEntry } = require('../repositories/ledgerRepository');
const { randomUUID } = require('crypto');

// System account identifiers – names used in the `owner_type` / `owner_id` fields.
const SYSTEM_ACCOUNTS = {
  ESCROW: 'PLATFORM_ESCROW',
  REVENUE: 'PLATFORM_REVENUE',
  PAYOUT_CLEARING: 'PLATFORM_PAYOUT_CLEARING'
};

/** Helper to fetch (and cache) system account IDs */
const systemAccountCache = {};
async function getSystemAccountId(name) {
  if (systemAccountCache[name]) return systemAccountCache[name];
  const account = await getAccountByOwner({ owner_type: 'SYSTEM', owner_id: SYSTEM_ACCOUNTS[name] });
  if (!account) throw Object.assign(new Error(`System account ${name} not found`), { status: 500 });
  systemAccountCache[name] = account.id;
  return account.id;
}

/**
 * Generic fund transfer – creates a debit on `fromAccountId` and a credit on
 * `toAccountId`. `type` is a domain‑specific string (e.g., 'ESCROW_HOLD').
 */
async function transfer({ fromAccountId, toAccountId, amountKobo, reference = null, type = 'TRANSFER' }) {
  if (amountKobo <= 0) throw Object.assign(new Error('Transfer amount must be positive'), { status: 400 });
  const ref = reference || randomUUID();
  const entries = [
    { accountId: fromAccountId, direction: 'DEBIT', amount: amountKobo },
    { accountId: toAccountId, direction: 'CREDIT', amount: amountKobo }
  ];
  return postJournalEntry({ reference: ref, type, entries });
}

/** Hold buyer funds in escrow */
async function escrowHold({ buyerAccountId, amountKobo }) {
  const escrowId = await getSystemAccountId('ESCROW');
  return transfer({ fromAccountId: buyerAccountId, toAccountId: escrowId, amountKobo, type: 'ESCROW_HOLD' });
}

/** Release escrow to vendor, taking commission */
async function escrowRelease({ vendorAccountId, amountKobo, commissionBps }) {
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    throw Object.assign(new Error('Release amount must be a positive integer'), { status: 400 });
  }
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
    throw Object.assign(new Error('Invalid commission rate'), { status: 400 });
  }
  const escrowId = await getSystemAccountId('ESCROW');
  const revenueId = await getSystemAccountId('REVENUE');
  const commission = Number((BigInt(amountKobo) * BigInt(commissionBps)) / 10000n);
  const vendorAmount = amountKobo - commission;

  const entries = [];
  // Debit escrow for the total amount
  entries.push({ accountId: escrowId, direction: 'DEBIT', amount: amountKobo });
  // Credit vendor for net amount
  entries.push({ accountId: vendorAccountId, direction: 'CREDIT', amount: vendorAmount });
  // Credit platform revenue for commission (if any)
  if (commission > 0) {
    entries.push({ accountId: revenueId, direction: 'CREDIT', amount: commission });
  }

  const reference = randomUUID();
  return postJournalEntry({ reference, type: 'ESCROW_RELEASE', entries });
}

/** Refund buyer from escrow (e.g., dispute resolved in buyer's favour) */
async function escrowRefund({ buyerAccountId, amountKobo }) {
  const escrowId = await getSystemAccountId('ESCROW');
  const entries = [
    { accountId: escrowId, direction: 'DEBIT', amount: amountKobo },
    { accountId: buyerAccountId, direction: 'CREDIT', amount: amountKobo }
  ];
  return postJournalEntry({ reference: randomUUID(), type: 'ESCROW_REFUND', entries });
}

/** Payout movements remain disabled until a provider confirms transfers. */
async function initiatePayout() {
  throw Object.assign(new Error('Payouts are unavailable until a payout provider is configured'), { status: 503 });
}

async function completePayout() {
  throw Object.assign(new Error('Payouts are unavailable until a payout provider is configured'), { status: 503 });
}

module.exports = {
  transfer,
  escrowHold,
  escrowRelease,
  escrowRefund,
  initiatePayout,
  completePayout
};
