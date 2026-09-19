const { Router } = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { myNotifications, markAsRead } = require('../controllers/notification.controller');

const router = Router();
router.get('/', authenticate, myNotifications);
router.patch('/:id/read', authenticate, markAsRead);

module.exports = router;