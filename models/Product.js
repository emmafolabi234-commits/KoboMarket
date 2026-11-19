/**
 * Mongoose Product schema – catalogue entries and inventory.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const VariantSchema = new Schema({
  variantId: { type: String, required: true },
  sku: { type: String },
  priceKobo: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
});

const ProductSchema = new Schema({
  vendorId: { type: String, required: true, index: true }, // canonical userUuid of vendor
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  category: { type: String },
  basePriceKobo: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  variants: [VariantSchema],
  images: [{ type: String }],
  tags: [{ type: String }],
  avgRating: { type: Number, min: 0, max: 5, default: 0 },
  reviewCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

ProductSchema.index({ name: 'text', description: 'text', tags: 1 });
ProductSchema.index({ isActive: 1, category: 1, basePriceKobo: 1 });

module.exports = mongoose.model('Product', ProductSchema);
