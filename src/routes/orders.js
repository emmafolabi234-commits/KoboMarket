// src/routes/orders.js
const express = require('express');
const { checkout } = require('../services/orderService');
const authenticate = require('../middlewares/authenticate');
const rbac = require('../middlewares/rbac');

const router = express.Router();

// Checkout endpoint – expects buyerId from auth and idempotencyKey
router.post('/checkout', authenticate, rbac(['BUYER']), async (req, res, next) => {
  try {
    const buyerUuid = req.user.sub;
    const { idempotencyKey } = req.body;
    const result = await checkout({ buyerUuid, idempotencyKey });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
