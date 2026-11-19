// src/routes/products.js
const express = require('express');
const { createProduct, getProduct, updateProduct, deleteProduct, searchProducts } = require('../controllers/productController');
const { addReview } = require('../controllers/reviewController');
const authenticate = require('../middlewares/authenticate');
const rbac = require('../middlewares/rbac');

const router = express.Router();

router.post('/', authenticate, rbac(['VENDOR','ADMIN']), createProduct);
router.get('/search', authenticate, rbac(['BUYER','VENDOR','ADMIN']), searchProducts);
router.get('/:id', authenticate, rbac(['BUYER','VENDOR','ADMIN']), getProduct);
router.put('/:id', authenticate, rbac(['VENDOR','ADMIN']), updateProduct);
router.delete('/:id', authenticate, rbac(['VENDOR','ADMIN']), deleteProduct);
router.post('/:id/reviews', authenticate, rbac(['BUYER']), addReview);

module.exports = router;
