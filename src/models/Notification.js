const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // empty = broadcast to all
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        readAt: { type: Date, required: true, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);