// src/routes/notifications.js
const express = require('express');
const { getNotifications, markAsRead } = require('../controllers/notificationController');
const authenticate = require('../middlewares/authenticate');

const router = express.Router();

router.get('/', authenticate, getNotifications); // list notifications for auth user
router.post('/read/:id', authenticate, markAsRead); // mark a notification read

module.exports = router;
