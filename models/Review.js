// src/models/Review.js
/**
 * Review model – one review per buyer per product.
 * Stored in MongoDB (non‑monetary data).
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReviewSchema = new Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  userUuid: { type: String, required: true, index: true }, // buyer's UUID from auth token
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Ensure a buyer can only leave one review per product
ReviewSchema.index({ productId: 1, userUuid: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);
