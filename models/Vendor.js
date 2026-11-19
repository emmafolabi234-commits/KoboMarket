/**
 * Mongoose Vendor schema – marketplace storefront profile.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const VendorSchema = new Schema({
  userUuid: { type: String, required: true, unique: true }, // links to auth user
  storeName: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  bankDetails: {
    accountNumber: { type: String },
    bankCode: { type: String }
  },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  reviewedBy: { type: String }, // admin userUuid
  reviewedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vendor', VendorSchema);
