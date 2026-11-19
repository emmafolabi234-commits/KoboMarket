// src/services/adminService.js
/**
 * Admin Service – operations that require ADMIN role.
 * Placeholders for user freeze/unfreeze, vendor review, and ledger inspection.
 */
const ledgerRepo = require('../repositories/ledgerRepository');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Product = require('../../models/Product');
const { getPool } = require('../../config/database');

async function freezeUser(userUuid) {
  const user = await User.findOne({ userUuid });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  user.isFrozen = true;
  await user.save();
  // Optionally set account status to FROZEN in PostgreSQL
  const pool = getPool();
  await pool.query('UPDATE accounts SET status = $1 WHERE owner_type = $2 AND owner_id = $3', ['FROZEN', 'USER', userUuid]);
  return { success: true };
}

async function unfreezeUser(userUuid) {
  const user = await User.findOne({ userUuid });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  user.isFrozen = false;
  await user.save();
  const pool = getPool();
  await pool.query('UPDATE accounts SET status = $1 WHERE owner_type = $2 AND owner_id = $3', ['ACTIVE', 'USER', userUuid]);
  return { success: true };
}

/** Review vendor application – admin sets status */
async function reviewVendor({ vendorId, status, reviewedBy }) {
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw Object.assign(new Error('Vendor not found'), { status: 404 });
  if (!['APPROVED', 'REJECTED'].includes(status)) throw Object.assign(new Error('Invalid status'), { status: 400 });
  vendor.status = status;
  vendor.reviewedBy = reviewedBy;
  vendor.reviewedAt = new Date();
  await vendor.save();
  if (status === 'REJECTED') {
    await Product.updateMany({ vendorId: vendor.userUuid }, { $set: { isActive: false } });
  }
  return vendor;
}

/** Inspect ledger – returns a dump of accounts and recent transactions (placeholder) */
async function inspectLedger() {
  const pool = getPool();
  const accounts = await pool.query('SELECT * FROM accounts LIMIT 100');
  const transactions = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100');
  return { accounts: accounts.rows, transactions: transactions.rows };
}

module.exports = { freezeUser, unfreezeUser, reviewVendor, inspectLedger };
