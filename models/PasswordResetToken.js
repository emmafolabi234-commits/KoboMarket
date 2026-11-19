// models/PasswordResetToken.js
/**
 * Mongoose model for password‑reset tokens.
 * Stored hashed (SHA‑256) and TTL‑indexed.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PasswordResetTokenSchema = new Schema({
  userUuid: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
