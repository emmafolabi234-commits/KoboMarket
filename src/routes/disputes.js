// src/routes/disputes.js
const express = require('express');
const { openDispute, getDispute, resolveDispute } = require('../controllers/disputeController');
const authenticate = require('../middlewares/authenticate');
const rbac = require('../middlewares/rbac');

const router = express.Router();

// Buyer can open dispute
router.post('/', authenticate, rbac(['BUYER']), openDispute);
// Buyer can view own dispute, Admin can view any – allow both roles
router.get('/:id', authenticate, rbac(['BUYER','ADMIN']), getDispute);
// Admin resolves dispute
router.post('/:id/resolve', authenticate, rbac(['ADMIN']), resolveDispute);

module.exports = router;
