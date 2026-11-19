// models/Notification.js
/** Mongoose Notification schema – inbox for users */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  userUuid: { type: String, required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

NotificationSchema.index({ userUuid: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
