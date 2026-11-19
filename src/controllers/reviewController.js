/**
 * Review Controller – thin wrapper around productService.addReview
 */
const productService = require('../services/productService');

exports.addReview = async (req, res, next) => {
  try {
    const productId = req.params.id; // product id from URL
    const userUuid = req.user.sub; // authenticated buyer
    const { rating, comment } = req.body;
    const review = await productService.addReview(productId, userUuid, rating, comment);
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
};
