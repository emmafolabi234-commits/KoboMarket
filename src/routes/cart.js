// src/routes/cart.js
const express = require('express');
const { addToCart, getCart, updateCartItem, removeCartItem, clearCart } = require('../controllers/cartController');
const authenticate = require('../middlewares/authenticate');
const rbac = require('../middlewares/rbac');

const router = express.Router();

router.post('/', authenticate, rbac(['BUYER']), addToCart);            // Add item(s) to cart
router.get('/', authenticate, rbac(['BUYER']), getCart);               // Get current cart for authenticated buyer
router.put('/:itemId', authenticate, rbac(['BUYER']), updateCartItem); // Update quantity of a specific cart item
router.delete('/:itemId', authenticate, rbac(['BUYER']), removeCartItem); // Remove a specific item
router.delete('/', authenticate, rbac(['BUYER']), clearCart);          // Empty the cart

module.exports = router;
