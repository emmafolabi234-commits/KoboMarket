// src/services/orderService.js
/**
 * Checkout reserves MongoDB stock and commits order and ledger data atomically
 * in PostgreSQL, compensating the stock reservation if the database transaction
 * fails.
 */
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const ledgerService = require('./ledgerService');
const { getPool } = require('../../config/database');
const { randomUUID } = require('crypto');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getCommissionRateBps() {
  const commissionRateBps = process.env.COMMISSION_BPS === undefined
    ? 500
    : Number(process.env.COMMISSION_BPS);
  if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 10000) {
    throw new Error('COMMISSION_BPS must be an integer between 0 and 10000');
  }
  return commissionRateBps;
}

/** Helper to reserve stock in MongoDB with conditional update */
async function reserveStock(items, reservations) {
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw Object.assign(new Error('Invalid item quantity'), { status: 400 });
    }
    const filter = { _id: item.productId, isActive: true };
    const update = {};
    if (item.variantId) {
      filter.variants = { $elemMatch: { variantId: item.variantId, stock: { $gte: item.quantity } } };
      update.$inc = { 'variants.$.stock': -item.quantity };
    } else {
      filter.stock = { $gte: item.quantity };
      update.$inc = { stock: -item.quantity };
    }
    const product = await Product.findOneAndUpdate(filter, update, { new: true });
    if (!product) {
      const exists = await Product.exists({ _id: item.productId, isActive: true });
      if (!exists) throw Object.assign(new Error('Product not found or unavailable'), { status: 404 });
      throw Object.assign(new Error('Insufficient stock'), { status: 409 });
    }
    const variant = item.variantId
      ? product.variants.find(candidate => candidate.variantId === item.variantId)
      : null;
    if (item.variantId && !variant) {
      throw Object.assign(new Error('Product variant not found'), { status: 404 });
    }
    reservations.push({
      productId: product._id,
      variantId: item.variantId,
      quantity: item.quantity,
      vendorId: product.vendorId,
      productName: product.name,
      price: variant ? variant.priceKobo : product.basePriceKobo
    });
  }
  return reservations;
}

async function releaseStock(reservations) {
  const errors = [];
  for (const item of reservations) {
    try {
      const update = item.variantId
        ? { $inc: { 'variants.$[variant].stock': item.quantity } }
        : { $inc: { stock: item.quantity } };
      const options = item.variantId
        ? { arrayFilters: [{ 'variant.variantId': item.variantId }] }
        : undefined;
      const result = await Product.updateOne({ _id: item.productId }, update, options);
      if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
        throw new Error(`Could not release reserved stock for product ${item.productId}`);
      }
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length) {
    const error = new Error(`Could not release ${errors.length} stock reservation(s)`);
    error.causes = errors;
    throw error;
  }
}

/** Main checkout entry point */
async function checkout({ buyerUuid, idempotencyKey }) {
  if (typeof buyerUuid !== 'string' || typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim().length === 0 || idempotencyKey.length > 200) {
    throw Object.assign(new Error('A valid idempotency key is required'), { status: 400 });
  }
  const commissionRateBps = getCommissionRateBps();
  const pool = getPool();
  const previousOrder = await pool.query(
    'SELECT id, total_amount_kobo FROM orders WHERE buyer_id = $1 AND idempotency_key = $2',
    [buyerUuid, idempotencyKey]
  );
  if (previousOrder.rowCount) {
    return { orderId: previousOrder.rows[0].id, totalKobo: Number(previousOrder.rows[0].total_amount_kobo) };
  }

  // Load cart
  const cart = await Cart.findOne({ buyerUuid });
  if (!cart || cart.items.length === 0) throw Object.assign(new Error('Cart empty'), { status: 400 });

  const sagaId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const sagaResult = await pool.query(
    `INSERT INTO checkout_sagas (id, buyer_id, idempotency_key, state, reservation_items, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'RESERVING', $4, $5, now(), now())
     ON CONFLICT (buyer_id, idempotency_key) DO NOTHING RETURNING id`,
    [sagaId, buyerUuid, idempotencyKey, JSON.stringify(cart.items), expiresAt]
  );
  if (!sagaResult.rowCount) {
    throw Object.assign(new Error('Checkout with this idempotency key is already in progress'), { status: 409 });
  }

  let reservations = [];
  let client;
  let clientFailure;
  let transactionStarted = false;
  try {
    await reserveStock(cart.items, reservations);

    let totalKobo = 0;
    const subOrdersMap = new Map();
    for (const item of reservations) {
      if (!Number.isSafeInteger(item.price) || item.price < 0) {
        throw Object.assign(new Error('Invalid product price'), { status: 400 });
      }
      const lineTotal = item.price * item.quantity;
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(totalKobo + lineTotal)) {
        throw Object.assign(new Error('Order total is outside the supported range'), { status: 400 });
      }
      totalKobo += lineTotal;
      if (!subOrdersMap.has(item.vendorId)) {
        subOrdersMap.set(item.vendorId, { subtotal: 0, items: [] });
      }
      const sub = subOrdersMap.get(item.vendorId);
      sub.subtotal += lineTotal;
      if (!Number.isSafeInteger(sub.subtotal)) {
        throw Object.assign(new Error('Vendor subtotal is outside the supported range'), { status: 400 });
      }
      sub.items.push(item);
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    // Create parent order
    const orderRes = await client.query(
      `INSERT INTO orders (buyer_id, total_amount_kobo, idempotency_key, created_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [buyerUuid, totalKobo, idempotencyKey]
    );
    const orderId = orderRes.rows[0].id;

    // For each vendor sub‑order
    for (const [vendorUuid, sub] of subOrdersMap.entries()) {
      const subRes = await client.query(
        `INSERT INTO sub_orders (order_id, vendor_id, subtotal_kobo, commission_rate_bps, status, created_at)
         VALUES ($1, $2, $3, $4, 'PAID', now()) RETURNING id`,
        [orderId, vendorUuid, sub.subtotal, commissionRateBps]
      );
      const subOrderId = subRes.rows[0].id;

      for (const it of sub.items) {
        await client.query(
          `INSERT INTO order_items (sub_order_id, product_id, variant_id, product_name_snapshot, unit_price_kobo, quantity, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())`,
          [subOrderId, it.productId.toString(), it.variantId || null, it.productName, it.price, it.quantity]
        );
      }
    }

    // Post escrow journal entry (buyer -> PLATFORM_ESCROW)
    const escrowRef = `escrow-${orderId}`;
    const buyerAccount = await client.query(
      'SELECT id FROM accounts WHERE owner_type = $1 AND owner_id = $2 AND currency = $3',
      ['USER', buyerUuid, 'NGN']
    );
    const escrowAccount = await client.query(
      'SELECT id FROM accounts WHERE owner_type = $1 AND owner_id = $2 AND currency = $3',
      ['SYSTEM', 'PLATFORM_ESCROW', 'NGN']
    );
    if (!buyerAccount.rowCount || !escrowAccount.rowCount) {
      throw Object.assign(new Error('Wallet account is not initialized'), { status: 409 });
    }
    if (totalKobo > 0) {
      await ledgerService.postTransaction({
        reference: escrowRef,
        type: 'ESCROW_LOCK',
        entries: [
          { accountId: buyerAccount.rows[0].id, direction: 'DEBIT', amount: totalKobo },
          { accountId: escrowAccount.rows[0].id, direction: 'CREDIT', amount: totalKobo }
        ],
        client
      });
    }

    // Update saga state
    await client.query(
      `UPDATE checkout_sagas SET state = 'COMMITTED', updated_at = now() WHERE id = $1`,
      [sagaId]
    );

    await client.query('COMMIT');
    transactionStarted = false;
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        err.rollbackError = rollbackErr;
        clientFailure = rollbackErr;
      }
    }
    let compensationError;
    try {
      await releaseStock(reservations);
    } catch (releaseErr) {
      compensationError = releaseErr;
    }
    const state = compensationError ? 'COMPENSATION_REQUIRED' : 'FAILED';
    try {
      await pool.query(
        `UPDATE checkout_sagas SET state = $1, last_error = $2, updated_at = now() WHERE id = $3`,
        [state, compensationError ? `${err.message}; ${compensationError.message}` : err.message, sagaId]
      );
    } catch (sagaErr) {
      err.sagaUpdateError = sagaErr;
      err.status = 500;
    }
    if (compensationError) err.compensationError = compensationError;
    throw err;
  } finally {
    if (client) client.release(clientFailure);
  }

  // Avoid deleting cart changes made while checkout was running.
  await Cart.deleteOne({ _id: cart._id, updatedAt: cart.updatedAt });
  const order = await pool.query('SELECT id, total_amount_kobo FROM orders WHERE buyer_id = $1 AND idempotency_key = $2', [buyerUuid, idempotencyKey]);
  return { orderId: order.rows[0].id, totalKobo: Number(order.rows[0].total_amount_kobo) };
}

async function completeSubOrder(subOrderId) {
  if (typeof subOrderId !== 'string' || !UUID_PATTERN.test(subOrderId)) {
    throw Object.assign(new Error('Invalid sub-order id'), { status: 400 });
  }
  const pool = getPool();
  const client = await pool.connect();
  let clientFailure;
  try {
    await client.query('BEGIN');
    const subOrderResult = await client.query(
      `SELECT id, vendor_id, subtotal_kobo, commission_rate_bps, status
       FROM sub_orders WHERE id = $1 FOR UPDATE`,
      [subOrderId]
    );
    if (!subOrderResult.rowCount) throw Object.assign(new Error('Sub-order not found'), { status: 404 });
    const subOrder = subOrderResult.rows[0];
    if (subOrder.status === 'COMPLETED') {
      await client.query('COMMIT');
      return { subOrderId, status: 'COMPLETED' };
    }
    if (subOrder.status !== 'DELIVERED') {
      throw Object.assign(new Error('Only delivered sub-orders can be completed'), { status: 409 });
    }

    const subtotal = Number(subOrder.subtotal_kobo);
    if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
      throw Object.assign(new Error('Invalid sub-order total'), { status: 409 });
    }
    const accounts = await client.query(
      `SELECT id, owner_type, owner_id FROM accounts
       WHERE currency = 'NGN'
         AND ((owner_type = 'USER' AND owner_id = $1)
           OR (owner_type = 'SYSTEM' AND owner_id = ANY($2::text[])))`,
      [subOrder.vendor_id, ['PLATFORM_ESCROW', 'PLATFORM_REVENUE']]
    );
    const accountIds = new Map(accounts.rows.map(account => [`${account.owner_type}:${account.owner_id}`, account.id]));
    const escrowId = accountIds.get('SYSTEM:PLATFORM_ESCROW');
    const vendorId = accountIds.get(`USER:${subOrder.vendor_id}`);
    const revenueId = accountIds.get('SYSTEM:PLATFORM_REVENUE');
    if (!escrowId || !vendorId || !revenueId) {
      throw Object.assign(new Error('Required ledger accounts are not initialized'), { status: 409 });
    }

    if (subtotal > 0) {
      const commission = Number((BigInt(subtotal) * BigInt(subOrder.commission_rate_bps)) / 10000n);
      const entries = [{ accountId: escrowId, direction: 'DEBIT', amount: subtotal }];
      if (subtotal - commission > 0) {
        entries.push({ accountId: vendorId, direction: 'CREDIT', amount: subtotal - commission });
      }
      if (commission > 0) entries.push({ accountId: revenueId, direction: 'CREDIT', amount: commission });
      await ledgerService.postTransaction({
        reference: `escrow-release-${subOrderId}`,
        type: 'ESCROW_RELEASE',
        entries,
        client
      });
    }
    await client.query(
      `UPDATE sub_orders SET status = 'COMPLETED', completed_at = now() WHERE id = $1`,
      [subOrderId]
    );
    await client.query('COMMIT');
    return { subOrderId, status: 'COMPLETED' };
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

module.exports = { checkout, completeSubOrder };
