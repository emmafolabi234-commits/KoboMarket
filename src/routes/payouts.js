// src/routes/payouts.js
const express = require('express');
const { requestPayout, getPayoutStatus } = require('../controllers/payoutController');
const authenticate = require('../middlewares/authenticate');
const rbac = require('../middlewares/rbac');

const router = express.Router();

router.post('/request', authenticate, rbac(['VENDOR','ADMIN']), requestPayout); // vendor requests withdrawal
router.get('/:id', authenticate, rbac(['VENDOR','ADMIN']), getPayoutStatus); // check status

module.exports = router;
