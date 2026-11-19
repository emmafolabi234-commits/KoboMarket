/**
 * Vendor Service – business logic for vendor onboarding and profile management.
 */
const Vendor = require('../../models/Vendor');
const User = require('../../models/User');
const Product = require('../../models/Product');
const mongoose = require('mongoose');

/** Create a pending vendor profile for the authenticated user. */
async function createVendor({ userUuid, storeName, description, bankDetails }) {
  if (typeof storeName !== 'string' || storeName.trim().length === 0) {
    throw Object.assign(new Error('Store name is required'), { status: 400 });
  }
  // Verify user exists and has VENDOR role (or can be upgraded)
  const user = await User.findOne({ userUuid });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const slug = storeName.trim().toLowerCase().replace(/\s+/g, '-');
  const vendor = new Vendor({
    userUuid,
    storeName: storeName.trim(),
    slug,
    description,
    bankDetails,
    status: 'PENDING'
  });
  try {
    await vendor.save();
  } catch (err) {
    if (err.code === 11000) throw Object.assign(new Error('Vendor profile already exists'), { status: 409 });
    throw err;
  }
  if (!user.roles.includes('VENDOR')) {
    user.roles.push('VENDOR');
    try {
      await user.save();
    } catch (err) {
      await vendor.deleteOne();
      throw err;
    }
  }
  return vendor;
}

/** Get vendor profile by id or slug */
async function getVendor(idOrSlug, actor) {
  const filter = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };
  const vendor = await Vendor.findOne(filter);
  if (!vendor) throw Object.assign(new Error('Vendor not found'), { status: 404 });
  if (actor.roles.includes('ADMIN') || actor.sub === vendor.userUuid) return vendor;
  const publicVendor = vendor.toObject();
  delete publicVendor.bankDetails;
  return publicVendor;
}

/** Update vendor profile – only allowed fields */
async function updateVendor(id, updates, actor) {
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Vendor not found'), { status: 404 });
  const vendor = await Vendor.findById(id);
  if (!vendor) throw Object.assign(new Error('Vendor not found'), { status: 404 });
  if (!actor.roles.includes('ADMIN') && vendor.userUuid !== actor.sub) {
    throw Object.assign(new Error('You cannot modify this vendor'), { status: 403 });
  }
  const allowed = ['storeName', 'description', 'bankDetails'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  if (filtered.storeName !== undefined &&
      (typeof filtered.storeName !== 'string' || filtered.storeName.trim().length === 0)) {
    throw Object.assign(new Error('Store name cannot be empty'), { status: 400 });
  }
  if (filtered.storeName !== undefined) filtered.storeName = filtered.storeName.trim();
  Object.assign(vendor, filtered);
  if (filtered.storeName) {
    vendor.slug = filtered.storeName.toLowerCase().trim().replace(/\s+/g, '-');
  }
  try {
    await vendor.save();
  } catch (err) {
    if (err.code === 11000) throw Object.assign(new Error('Store name is already in use'), { status: 409 });
    throw err;
  }
  return vendor;
}

async function deleteVendor(id, actor) {
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Vendor not found'), { status: 404 });
  const vendor = await Vendor.findById(id);
  if (!vendor) throw Object.assign(new Error('Vendor not found'), { status: 404 });
  if (!actor.roles.includes('ADMIN') && vendor.userUuid !== actor.sub) {
    throw Object.assign(new Error('You cannot delete this vendor'), { status: 403 });
  }
  await Product.updateMany({ vendorId: vendor.userUuid }, { $set: { isActive: false } });
  await vendor.deleteOne();
  return { success: true };
}

module.exports = { createVendor, getVendor, updateVendor, deleteVendor };
