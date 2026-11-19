/**
 * Mongoose Refresh Token schema – stores hashed refresh tokens per user family.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const RefreshTokenSchema = new Schema({
  userUuid: { type: String, required: true, index: true },
  familyId: { type: String, required: true }, // token family identifier
  tokenHash: { type: String, required: true, unique: true },
  isRevoked: { type: Boolean, default: false },
  isUsed: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

RefreshTokenSchema.index({ userUuid: 1, familyId: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
