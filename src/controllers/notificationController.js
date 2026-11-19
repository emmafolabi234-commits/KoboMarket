// src/controllers/notificationController.js
/** Notification Controller – reads notifications from MongoDB */
const Notification = require('../../models/Notification');

exports.getNotifications = async (req, res, next) => {
  try {
    const userUuid = req.user.sub;
    const notifications = await Notification.find({ userUuid }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const userUuid = req.user.sub;
    const notificationId = req.params.id;
    const notif = await Notification.findOneAndUpdate({ _id: notificationId, userUuid }, { isRead: true }, { new: true });
    if (!notif) throw Object.assign(new Error('Notification not found'), { status: 404 });
    res.json(notif);
  } catch (err) {
    next(err);
  }
};
