const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, env.jwt.accessSecret);
      socket.userId = payload.sub;
      socket.role = payload.role; // add
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    if (socket.role === 'admin') {
      socket.join('admins'); // add
    }
  });

  return io;
}

function emitNotification(notification, recipientIds, excludeUserId) {
  if (!io) return;
  if (recipientIds?.length) {
    recipientIds
      .filter((id) => String(id) !== String(excludeUserId))
      .forEach((id) => io.to(`user:${id}`).emit('notification', notification));
  } else {
    const emitter = excludeUserId ? io.except(`user:${excludeUserId}`) : io;
    emitter.emit('notification', notification);
  }
}

// New: tell every connected admin that a user read a notification.
function emitNotificationRead(notificationId, reader) {
  if (!io) return;
  io.to('admins').emit('notification-read', { notificationId, reader });
}

module.exports = { initSocket, emitNotification, emitNotificationRead };