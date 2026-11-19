// src/routes/wallet.js
const express = require('express');
const { fundWallet, getBalance, withdraw } = require('../controllers/walletController');
const authenticate = require('../middlewares/authenticate');

const router = express.Router();

router.post('/fund', authenticate, fundWallet);
router.get('/balance', authenticate, getBalance);
router.post('/withdraw', authenticate, withdraw);

module.exports = router;
