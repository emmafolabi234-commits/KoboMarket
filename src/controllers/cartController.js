// src/controllers/cartController.js
/** Cart Controller – thin wrapper around cartService */
const cartService = require('../services/cartService');

exports.addToCart = async (req, res, next) => {
  try {
    const result = await cartService.addToCart({ ...req.body, buyerUuid: req.user.sub });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.getCart = async (req, res, next) => {
  try {
    const result = await cartService.getCart(req.user.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateCartItem = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { quantity } = req.body;
    const result = await cartService.updateCartItem({ buyerUuid: req.user.sub, itemId, quantity });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.removeCartItem = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const result = await cartService.removeCartItem({ buyerUuid: req.user.sub, itemId });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.clearCart = async (req, res, next) => {
  try {
    const result = await cartService.clearCart(req.user.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
