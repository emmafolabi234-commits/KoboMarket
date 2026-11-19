// src/services/ledgerService.js
/**
 * Ledger Service – high‑level API for posting financial movements.
 * All monetary amounts are expressed in integer kobo.
 */
const ledgerRepo = require('../repositories/ledgerRepository');

/**
 * Post a balanced transaction.
 * entries: [{ accountId, direction: 'DEBIT'|'CREDIT', amount }]
 */
async function postTransaction({ reference, type, entries, client }) {
  return ledgerRepo.postJournalEntry({ reference, type, entries, client });
}

module.exports = { postTransaction };
