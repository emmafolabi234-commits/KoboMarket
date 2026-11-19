/**
 * Cart Service – business logic for mutable basket.
 */
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const mongoose = require('mongoose');

/** Add items to cart (creates cart if missing) */
async function addToCart({ buyerUuid, items }) {
  if (typeof buyerUuid !== 'string' || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('Cart items are required'), { status: 400 });
  }
  let cart = await Cart.findOne({ buyerUuid });
  if (!cart) cart = new Cart({ buyerUuid, items: [] });

  for (const item of items) {
    if (!item || !mongoose.isValidObjectId(item.productId) ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw Object.assign(new Error('Invalid cart item'), { status: 400 });
    }
    const product = await Product.findById(item.productId);
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
    if (!product.isActive) throw Object.assign(new Error('Product is unavailable'), { status: 400 });
    let priceKobo = product.basePriceKobo;
    if (item.variantId) {
      const variant = product.variants.find(candidate => candidate.variantId === item.variantId);
      if (!variant) throw Object.assign(new Error('Product variant not found'), { status: 404 });
      priceKobo = variant.priceKobo;
    }
    const existing = cart.items.find(i => i.productId === item.productId && i.variantId === item.variantId);
    if (existing) {
      existing.quantity += item.quantity;
      existing.snapshotPriceKobo = priceKobo;
    } else {
      cart.items.push({
        productId: item.productId,
        variantId: item.variantId,
        vendorId: product.vendorId,
        quantity: item.quantity,
        snapshotPriceKobo: priceKobo
      });
    }
  }
  cart.updatedAt = new Date();
  await cart.save();
  return cart;
}

/** Get cart for buyer */
async function getCart(buyerUuid) {
  const cart = await Cart.findOne({ buyerUuid });
  return cart || { buyerUuid, items: [] };
}

/** Update quantity of a specific cart item */
async function updateCartItem({ buyerUuid, itemId, quantity }) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw Object.assign(new Error('Quantity must be a non-negative integer'), { status: 400 });
  }
  const cart = await Cart.findOne({ buyerUuid });
  if (!cart) throw Object.assign(new Error('Cart not found'), { status: 404 });
  const item = cart.items.id(itemId);
  if (!item) throw Object.assign(new Error('Cart item not found'), { status: 404 });
  if (quantity <= 0) {
    cart.items.pull(itemId);
  } else {
    item.quantity = quantity;
  }
  cart.updatedAt = new Date();
  await cart.save();
  return cart;
}

/** Remove a specific item */
async function removeCartItem({ buyerUuid, itemId }) {
  return updateCartItem({ buyerUuid, itemId, quantity: 0 });
}

/** Clear all items */
async function clearCart(buyerUuid) {
  await Cart.deleteOne({ buyerUuid });
  return { success: true };
}

module.exports = { addToCart, getCart, updateCartItem, removeCartItem, clearCart };
