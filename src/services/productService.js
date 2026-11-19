/**
 * Product Service – business logic for catalogue management.
 */
const Product = require('../../models/Product');
const Review = require('../../models/Review');
const Vendor = require('../../models/Vendor');
const mongoose = require('mongoose');
const { getPool } = require('../../config/database');

function assertProductOwner(product, actor) {
  if (!actor.roles.includes('ADMIN') && product.vendorId !== actor.sub) {
    throw Object.assign(new Error('You cannot modify this product'), { status: 403 });
  }
}

/** Create a product for an approved vendor. */
async function createProduct(data, actor) {
  const vendorId = actor.roles.includes('ADMIN') ? data.vendorId : actor.sub;
  if (typeof vendorId !== 'string' || !vendorId) {
    throw Object.assign(new Error('Vendor is required'), { status: 400 });
  }
  const vendor = await Vendor.findOne({ userUuid: vendorId, status: 'APPROVED' });
  if (!vendor) throw Object.assign(new Error('Approved vendor profile required'), { status: 403 });
  const product = new Product({ ...data, vendorId });
  await product.save();
  return product;
}

/** Get product by id or slug */
async function getProduct(idOrSlug) {
  const filter = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };
  const product = await Product.findOne(filter);
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  return product;
}

/** Update product – limited fields */
async function updateProduct(id, updates, actor) {
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Product not found'), { status: 404 });
  const product = await Product.findById(id);
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  assertProductOwner(product, actor);
  const allowed = ['name', 'description', 'category', 'basePriceKobo', 'stock', 'variants', 'images', 'tags', 'isActive'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  Object.assign(product, filtered);
  await product.save();
  return product;
}

async function deleteProduct(id, actor) {
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Product not found'), { status: 404 });
  const product = await Product.findById(id);
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  assertProductOwner(product, actor);
  await product.deleteOne();
  return { success: true };
}

/** Search products – supports text search, filters, sorting, cursor pagination */
async function searchProducts(query = {}) {
  const {
    q,
    category,
    vendorId,
    minPrice,
    maxPrice,
    minRating,
    sort = 'relevance', // relevance | price_asc | price_desc | newest | rating
    limit = 20,
    cursor // base64 encoded offset
  } = query;

  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw Object.assign(new Error('Limit must be an integer between 1 and 100'), { status: 400 });
  }
  if (!['relevance', 'price_asc', 'price_desc', 'newest', 'rating'].includes(sort)) {
    throw Object.assign(new Error('Invalid product sort order'), { status: 400 });
  }
  if (q !== undefined && (typeof q !== 'string' || q.length > 200)) {
    throw Object.assign(new Error('Invalid search text'), { status: 400 });
  }
  const searchText = typeof q === 'string' ? q.trim() : '';
  for (const [name, value, max] of [
    ['minPrice', minPrice, Number.MAX_SAFE_INTEGER],
    ['maxPrice', maxPrice, Number.MAX_SAFE_INTEGER],
    ['minRating', minRating, 5]
  ]) {
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > max)) {
      throw Object.assign(new Error(`Invalid ${name}`), { status: 400 });
    }
  }
  if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
    throw Object.assign(new Error('minPrice cannot exceed maxPrice'), { status: 400 });
  }
  let offset = 0;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (!Number.isSafeInteger(decoded.offset) || decoded.offset < 0 || decoded.offset > 100000) throw new Error();
      offset = decoded.offset;
    } catch (err) {
      throw Object.assign(new Error('Invalid product cursor'), { status: 400 });
    }
  }
  const filter = {};
  if (searchText) filter.$text = { $search: searchText };
  if (category) filter.category = category;
  if (vendorId) filter.vendorId = vendorId;
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.basePriceKobo = {};
    if (minPrice !== undefined) filter.basePriceKobo.$gte = Number(minPrice);
    if (maxPrice !== undefined) filter.basePriceKobo.$lte = Number(maxPrice);
  }
  if (minRating !== undefined) filter.avgRating = { $gte: Number(minRating) };
  filter.isActive = true;

  // Build sort spec
  let sortSpec;
  switch (sort) {
    case 'price_asc':
      sortSpec = { basePriceKobo: 1, _id: 1 }; break;
    case 'price_desc':
      sortSpec = { basePriceKobo: -1, _id: 1 }; break;
    case 'newest':
      sortSpec = { createdAt: -1, _id: -1 }; break;
    case 'rating':
      sortSpec = { avgRating: -1, _id: -1 }; break;
    default:
      sortSpec = searchText ? { score: { $meta: 'textScore' }, _id: 1 } : { _id: 1 };
  }

  const queryBuilder = Product.find(filter).sort(sortSpec).skip(offset);

  const items = await queryBuilder.limit(parsedLimit + 1);

  const hasNext = items.length > parsedLimit;
  const results = hasNext ? items.slice(0, parsedLimit) : items;
  const nextCursor = hasNext
    ? Buffer.from(JSON.stringify({ offset: offset + results.length })).toString('base64')
    : null;

  return { results, nextCursor };
}

/** Add a review – enforces one‑review‑per‑buyer and updates avg rating */
async function addReview(productId, userUuid, rating, comment) {
  if (!mongoose.isValidObjectId(productId)) throw Object.assign(new Error('Product not found'), { status: 404 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 ||
      (comment !== undefined && (typeof comment !== 'string' || comment.length > 2000))) {
    throw Object.assign(new Error('Invalid review'), { status: 400 });
  }
  // Verify product exists
  const product = await Product.findById(productId);
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

  const completedOrder = await getPool().query(
    `SELECT 1 FROM orders o
     JOIN sub_orders so ON so.order_id = o.id
     JOIN order_items oi ON oi.sub_order_id = so.id
     WHERE o.buyer_id = $1 AND oi.product_id = $2 AND so.status = 'COMPLETED'
     LIMIT 1`,
    [userUuid, productId]
  );
  if (!completedOrder.rowCount) {
    throw Object.assign(new Error('A completed purchase is required to review this product'), { status: 403 });
  }

  // Create review (unique index will enforce one per buyer)
  const review = new Review({ productId, userUuid, rating, comment });
  try {
    await review.save();
  } catch (err) {
    if (err.code === 11000) throw Object.assign(new Error('You have already reviewed this product'), { status: 409 });
    throw err;
  }

  // Atomically recalculate avgRating & reviewCount using aggregation pipeline
  const agg = await Review.aggregate([
    { $match: { productId: mongoose.Types.ObjectId(productId) } },
    { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
  ]);

  const { avgRating, reviewCount } = agg[0] || { avgRating: 0, reviewCount: 0 };
  await Product.findByIdAndUpdate(productId, { avgRating, reviewCount });

  return review;
}

module.exports = { createProduct, getProduct, updateProduct, deleteProduct, searchProducts, addReview };
