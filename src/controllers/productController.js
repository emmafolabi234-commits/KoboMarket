/**
 * Product Controller – thin wrapper around productService
 */
const productService = require('../services/productService');

exports.createProduct = async (req, res, next) => {
  try {
    const result = await productService.createProduct(req.body, req.user);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const result = await productService.getProduct(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const result = await productService.updateProduct(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const result = await productService.deleteProduct(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.searchProducts = async (req, res, next) => {
  try {
    const results = await productService.searchProducts(req.query);
    res.json(results);
  } catch (err) {
    next(err);
  }
};
