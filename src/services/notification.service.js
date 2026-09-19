const { emitNotification: emitToSocket, emitNotificationRead } = require('../utils/socket');

function emitNotification(notification, recipients, excludeUserId) {
  emitToSocket(notification, recipients, excludeUserId);
}

module.exports = { emitNotification, emitNotificationRead };