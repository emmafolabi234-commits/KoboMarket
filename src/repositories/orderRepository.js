// src/repositories/orderRepository.js
/**
 * Order Repository – PostgreSQL queries for orders, sub_orders, order_items.
 */
const { getPool } = require('../../config/database');

async function createOrder({ buyerId, totalAmountKobo, idempotencyKey }) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO orders (buyer_id, total_amount_kobo, idempotency_key, created_at)
     VALUES ($1, $2, $3, now()) RETURNING *`,
    [buyerId, totalAmountKobo, idempotencyKey]
  );
  return res.rows[0];
}

async function createSubOrder({ orderId, vendorId, subtotalKobo, commissionRateBps, status }) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO sub_orders (order_id, vendor_id, subtotal_kobo, commission_rate_bps, status, created_at)
     VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
    [orderId, vendorId, subtotalKobo, commissionRateBps, status]
  );
  return res.rows[0];
}

async function createOrderItem({ subOrderId, productId, variantId, productNameSnapshot, unitPriceKobo, quantity }) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO order_items (sub_order_id, product_id, variant_id, product_name_snapshot, unit_price_kobo, quantity, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING *`,
    [subOrderId, productId, variantId, productNameSnapshot, unitPriceKobo, quantity]
  );
  return res.rows[0];
}

module.exports = { createOrder, createSubOrder, createOrderItem };
