// src/routes/admin.js
const express = require('express');
const { freezeUser, unfreezeUser, reviewVendor, inspectLedger } = require('../controllers/adminController');
const authenticate = require('../middlewares/authenticate');
const rbac = require('../middlewares/rbac');

const router = express.Router();

router.post('/users/:id/freeze', authenticate, rbac(['ADMIN']), freezeUser);
router.post('/users/:id/unfreeze', authenticate, rbac(['ADMIN']), unfreezeUser);
router.post('/vendors/:id/review', authenticate, rbac(['ADMIN']), reviewVendor); // admin approves/rejects vendor
router.get('/ledger', authenticate, rbac(['ADMIN']), inspectLedger);

module.exports = router;

