// models/EmailVerificationToken.js
/**
 * Mongoose model for email verification tokens.
 * Token is a random string (UUID) stored hashed for security.
 * Expires after a configurable amount of time (default 24h).
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const EmailVerificationTokenSchema = new Schema({
  userUuid: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

EmailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

module.exports = mongoose.model('EmailVerificationToken', EmailVerificationTokenSchema);
