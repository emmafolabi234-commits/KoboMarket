/**
 * Mongoose Cart schema – buyer's mutable basket.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const CartItemSchema = new Schema({
  productId: { type: String, required: true },
  variantId: { type: String },
  vendorId: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  snapshotPriceKobo: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
});

const CartSchema = new Schema({
  buyerUuid: { type: String, required: true, unique: true },
  items: [CartItemSchema],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', CartSchema);
