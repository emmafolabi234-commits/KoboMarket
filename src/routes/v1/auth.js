// src/routes/v1/auth.js
const express = require('express');
const { register, verifyEmail, login, refresh, logout, forgotPassword, resetPassword } = require('../../controllers/v1/authController');
const loginRateLimiter = require('../../middlewares/loginRateLimiter');

const router = express.Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', loginRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
