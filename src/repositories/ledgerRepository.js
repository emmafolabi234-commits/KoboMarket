// src/repositories/ledgerRepository.js
/**
 * Ledger Repository – low‑level PostgreSQL queries for accounts, transactions, entries.
 */
const { getPool } = require('../../config/database');

async function createAccount({ owner_type, owner_id, currency = 'NGN' }) {
  if (!['USER', 'SYSTEM'].includes(owner_type) || typeof owner_id !== 'string' || !owner_id || !currency) {
    throw Object.assign(new Error('Invalid ledger account details'), { status: 400 });
  }
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO accounts (owner_type, owner_id, currency, balance_kobo, status)
     VALUES ($1, $2, $3, 0, 'ACTIVE')
     ON CONFLICT (owner_type, owner_id, currency) DO NOTHING RETURNING *`,
    [owner_type, owner_id, currency]
  );
  if (result.rowCount) return result.rows[0];
  const existing = await pool.query(
    'SELECT * FROM accounts WHERE owner_type = $1 AND owner_id = $2 AND currency = $3',
    [owner_type, owner_id, currency]
  );
  return existing.rows[0];
}

async function getAccountByOwner({ owner_type, owner_id }) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT * FROM accounts WHERE owner_type = $1 AND owner_id = $2 AND currency = $3`,
    [owner_type, owner_id, 'NGN']
  );
  return res.rows[0];
}

/** Post a balanced journal entry atomically. */
async function postJournalEntry({ reference, type, entries, client: transactionClient }) {
  if (typeof reference !== 'string' || !reference || typeof type !== 'string' || !type) {
    throw Object.assign(new Error('Transaction reference and type are required'), { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length < 2) {
    throw Object.assign(new Error('At least two ledger entries are required'), { status: 400 });
  }
  let debitTotal = 0n;
  let creditTotal = 0n;
  for (const entry of entries) {
    if (!entry.accountId || !['DEBIT', 'CREDIT'].includes(entry.direction) ||
        !Number.isSafeInteger(entry.amount) || entry.amount <= 0) {
      throw Object.assign(new Error('Invalid ledger entry'), { status: 400 });
    }
    if (entry.direction === 'DEBIT') debitTotal += BigInt(entry.amount);
    else creditTotal += BigInt(entry.amount);
  }
  if (debitTotal !== creditTotal) {
    throw Object.assign(new Error('Ledger entries must balance'), { status: 400 });
  }

  const ownsClient = !transactionClient;
  const client = transactionClient || await getPool().connect();
  let clientFailure;
  try {
    if (ownsClient) await client.query('BEGIN');
    const txRes = await client.query(
      `INSERT INTO transactions (reference, type, status, created_at)
       VALUES ($1, $2, 'POSTED', now()) RETURNING id`,
      [reference, type]
    );
    const txId = txRes.rows[0].id;
    const accountIds = [...new Set(entries.map(e => e.accountId))].sort();
    const accounts = new Map();
    for (const accountId of accountIds) {
      const result = await client.query(
        'SELECT id, owner_type, status, balance_kobo, currency FROM accounts WHERE id = $1 FOR UPDATE',
        [accountId]
      );
      const account = result.rows[0];
      if (!account) throw Object.assign(new Error('Ledger account not found'), { status: 404 });
      if (account.status !== 'ACTIVE' &&
          entries.some(entry => entry.accountId === accountId && entry.direction === 'DEBIT')) {
        throw Object.assign(new Error('Ledger account is frozen'), { status: 409 });
      }
      accounts.set(accountId, account);
    }

    const currencies = new Set([...accounts.values()].map(account => account.currency));
    if (currencies.size > 1) {
      throw Object.assign(new Error('Ledger entries cannot cross currencies'), { status: 400 });
    }

    for (const entry of entries) {
      const account = accounts.get(entry.accountId);
      const currentBalance = BigInt(account.balance_kobo);
      const amount = BigInt(entry.amount);
      const nextBalance = entry.direction === 'CREDIT'
        ? currentBalance + amount
        : currentBalance - amount;
      if (nextBalance < 0n) {
        throw Object.assign(new Error('Insufficient account balance'), { status: 409 });
      }
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, direction, amount_kobo, created_at)
         VALUES ($1, $2, $3, $4, now())`,
        [txId, entry.accountId, entry.direction, entry.amount]
      );
      await client.query('UPDATE accounts SET balance_kobo = $1 WHERE id = $2', [nextBalance.toString(), entry.accountId]);
      account.balance_kobo = nextBalance.toString();
    }
    if (ownsClient) await client.query('COMMIT');
    return { transactionId: txId };
  } catch (err) {
    if (ownsClient) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        err.rollbackError = rollbackErr;
        clientFailure = rollbackErr;
      }
    }
    if (err.code === '23505' && err.constraint === 'transactions_reference_key') {
      throw Object.assign(new Error('Transaction reference has already been used'), { status: 409 });
    }
    throw err;
  } finally {
    if (ownsClient) client.release(clientFailure);
  }
}

module.exports = { createAccount, getAccountByOwner, postJournalEntry };
