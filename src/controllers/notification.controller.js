const Notification = require('../models/Notification');
const { emitNotification, emitNotificationRead } = require('../services/notification.service');


async function sendNotification(req, res, next) {
  try {
    const { message, recipients } = req.body;
    const notification = await Notification.create({ message, sentBy: req.user._id, recipients });
    emitNotification(notification, recipients, req.user._id);
    res.status(201).json({ success: true, statusCode: 201, message: 'Notification sent', data: notification });
  } catch (err) { next(err); }
}

// Admin: full log, with who has read each one and when.
async function listNotifications(req, res, next) {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .populate('sentBy', 'name username')
      .populate('readBy.user', 'name username');
    res.json({ success: true, statusCode: 200, message: 'Notifications fetched', data: notifications });
  } catch (err) { next(err); }
}

// User: their own inbox, excluding ones they sent.
async function myNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({
      sentBy: { $ne: req.user._id },
      $or: [{ recipients: { $size: 0 } }, { recipients: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('sentBy', 'name username');
    res.json({ success: true, statusCode: 200, message: 'Notifications fetched', data: notifications });
  } catch (err) { next(err); }
}

// User: report that they've read a specific notification.
async function markAsRead(req, res, next) {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, statusCode: 404, message: 'Notification not found' });
    }

    const alreadyRead = notification.readBy.some((r) => String(r.user) === String(req.user._id));
    if (!alreadyRead) {
      const readAt = new Date();
      notification.readBy.push({ user: req.user._id, readAt });
      await notification.save();

  emitNotificationRead(notification._id.toString(), {
  _id: req.user._id.toString(),
  name: req.user.name,
  username: req.user.username,
  readAt,
});
    }

    res.json({ success: true, statusCode: 200, message: 'Marked as read' });
  } catch (err) { next(err); }
}

module.exports = { sendNotification, listNotifications, myNotifications, markAsRead };