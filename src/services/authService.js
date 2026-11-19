// src/services/authService.js
/**
 * Auth Service – registration, login, refresh token, logout, email verification, password reset.
 */
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/User');
const RefreshToken = require('../../models/RefreshToken');
const EmailVerificationToken = require('../../models/EmailVerificationToken');
const PasswordResetToken = require('../../models/PasswordResetToken');
const { createAccount } = require('../repositories/ledgerRepository');
require('dotenv').config();

// Helper to generate UUID v4 strings (simple wrapper)
const uuidv4 = () => crypto.randomUUID();

// Helper to hash tokens (SHA-256)
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getTokenTtl(name, defaultValue) {
  const ttl = process.env[name] === undefined ? defaultValue : Number(process.env[name]);
  if (!Number.isSafeInteger(ttl) || ttl <= 0) throw new Error(`${name} must be a positive integer`);
  return ttl;
}

/** Register a new user and send email verification */
async function register(data) {
  const { email, password, roles } = data;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('A valid email is required'), { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  }
  if (roles !== undefined) {
    throw Object.assign(new Error('Roles cannot be assigned during registration'), { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw Object.assign(new Error('User already exists'), { status: 409 });

  const passwordHash = await argon2.hash(password);
  const userUuid = uuidv4();
  const user = new User({
    userUuid,
    email: normalizedEmail,
    passwordHash,
    roles: ['BUYER'],
    isEmailVerified: false
  });
  const verificationTtl = getTokenTtl('EMAIL_VERIFICATION_TTL_MS', 24 * 60 * 60 * 1000);
  await user.save();

  const rawVerificationToken = uuidv4();
  const tokenHash = hashToken(rawVerificationToken);
  const expiresAt = new Date(Date.now() + verificationTtl);
  try {
    await createAccount({ owner_type: 'USER', owner_id: userUuid });
    await new EmailVerificationToken({ userUuid, tokenHash, expiresAt }).save();
  } catch (err) {
    await EmailVerificationToken.deleteOne({ userUuid });
    await User.deleteOne({ userUuid });
    throw err;
  }
  if (process.env.NODE_ENV === 'development') {
    console.info(`Development email verification token: ${rawVerificationToken}`);
  }

  return { userUuid, email: user.email };
}

/** Login – validate credentials, issue JWT and refresh token */
async function login(data) {
  const { email, password } = data;
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw Object.assign(new Error('Email and password are required'), { status: 400 });
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  if (user.isFrozen) throw Object.assign(new Error('Account is unavailable'), { status: 403 });
  if (!user.isEmailVerified) throw Object.assign(new Error('Email verification required'), { status: 403 });

  const accessToken = jwt.sign({ sub: user.userUuid, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: '15m' });

  // Create refresh token family and token
  const familyId = uuidv4();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await new RefreshToken({
    userUuid: user.userUuid,
    familyId,
    tokenHash,
    expiresAt,
    isUsed: false,
    isRevoked: false
  }).save();

  return { accessToken, refreshToken: rawToken };
}

/** Refresh – rotate token, detect reuse, and revoke the affected token family. */
async function refresh(rawRefreshToken) {
  if (typeof rawRefreshToken !== 'string' || !rawRefreshToken) {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
  }
  const match = await RefreshToken.findOne({ tokenHash: hashToken(rawRefreshToken) });
  if (!match) throw Object.assign(new Error('Invalid refresh token'), { status: 401 });

  // A reused token revokes only its own family, preserving other device sessions.
  if (match.isUsed || match.isRevoked) {
    await RefreshToken.updateMany({ userUuid: match.userUuid, familyId: match.familyId }, { $set: { isRevoked: true } });
    throw Object.assign(new Error('Refresh token reuse detected – session revoked'), { status: 401 });
  }

  if (match.expiresAt <= new Date()) {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
  }
  const user = await User.findOne({ userUuid: match.userUuid });
  if (!user || user.isFrozen || !user.isEmailVerified) {
    await RefreshToken.updateMany({ userUuid: match.userUuid, familyId: match.familyId }, { $set: { isRevoked: true } });
    throw Object.assign(new Error('Account is unavailable'), { status: 403 });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const replacement = new RefreshToken({
    userUuid: user.userUuid,
    familyId: match.familyId,
    tokenHash,
    expiresAt,
    isUsed: false,
    isRevoked: false
  });
  await replacement.save();

  const consumed = await RefreshToken.findOneAndUpdate(
    { _id: match._id, isUsed: false, isRevoked: false, expiresAt: { $gt: new Date() } },
    { $set: { isUsed: true, isRevoked: true } },
    { new: true }
  );
  if (!consumed) {
    await RefreshToken.updateMany({ userUuid: match.userUuid, familyId: match.familyId }, { $set: { isRevoked: true } });
    await replacement.deleteOne();
    throw Object.assign(new Error('Refresh token reuse detected – session revoked'), { status: 401 });
  }

  const accessToken = jwt.sign({ sub: user.userUuid, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: '15m' });

  return { accessToken, refreshToken: rawToken };
}

/** Logout – revoke the token family associated with this refresh token. */
async function logout(rawRefreshToken) {
  if (typeof rawRefreshToken !== 'string' || !rawRefreshToken) return;
  const token = await RefreshToken.findOne({ tokenHash: hashToken(rawRefreshToken) });
  if (token) {
    await RefreshToken.updateMany(
      { userUuid: token.userUuid, familyId: token.familyId },
      { $set: { isRevoked: true } }
    );
  }
}

/** Verify email – consume token and mark user as verified */
async function verifyEmail(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken) {
    throw Object.assign(new Error('Invalid or expired verification token'), { status: 400 });
  }
  const record = await EmailVerificationToken.findOneAndDelete({
    tokenHash: hashToken(rawToken),
    expiresAt: { $gt: new Date() }
  });
  if (!record) {
    throw Object.assign(new Error('Invalid or expired verification token'), { status: 400 });
  }

  const user = await User.findOne({ userUuid: record.userUuid });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  user.isEmailVerified = true;
  await user.save();
  return { message: 'Email verified successfully' };
}

/** Initiate password reset – send token via console (simulated) */
async function initiatePasswordReset(email) {
  if (typeof email !== 'string') return;
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) return; // silent per security best practice

  const rawToken = uuidv4();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + getTokenTtl('PASSWORD_RESET_TTL_MS', 60 * 60 * 1000));
  await new PasswordResetToken({ userUuid: user.userUuid, tokenHash, expiresAt }).save();

  if (process.env.NODE_ENV === 'development') {
    console.info(`Development password reset token: ${rawToken}`);
  }
}

/** Reset password using token */
async function resetPassword(rawToken, newPassword) {
  if (typeof rawToken !== 'string' || !rawToken || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw Object.assign(new Error('A valid token and password of at least 8 characters are required'), { status: 400 });
  }
  const record = await PasswordResetToken.findOneAndDelete({
    tokenHash: hashToken(rawToken),
    expiresAt: { $gt: new Date() }
  });
  if (!record) {
    throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
  }

  const user = await User.findOne({ userUuid: record.userUuid });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const passwordHash = await argon2.hash(newPassword);
  user.passwordHash = passwordHash;
  await user.save();
  await RefreshToken.updateMany({ userUuid: user.userUuid }, { $set: { isRevoked: true } });
  return { message: 'Password has been updated' };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  initiatePasswordReset,
  resetPassword
};
