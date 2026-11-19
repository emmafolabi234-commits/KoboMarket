/**
 * Mongoose User schema – stores identity data and references wallet account.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
  userUuid: { type: String, required: true, unique: true }, // canonical UUID v4
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  roles: [{ type: String, enum: ['BUYER', 'VENDOR', 'ADMIN'] }],
  isEmailVerified: { type: Boolean, default: false },
  isFrozen: { type: Boolean, default: false },
  verificationTokenHash: { type: String },
  verifyExpiresAt: { type: Date },
  resetTokenHash: { type: String },
  resetExpiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
