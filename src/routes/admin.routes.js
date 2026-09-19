const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { listUsers, createUser, updateUser, deleteUser } = require('../controllers/admin-user.controller');
const { sendNotification, listNotifications } = require('../controllers/notification.controller');

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/users', listUsers);
router.post('/users', createUser);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

router.get('/notifications', listNotifications);
router.post('/notifications', sendNotification);

module.exports = router;