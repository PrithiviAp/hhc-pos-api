const { Router } = require('express');
const controller = require('../controllers/category.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(authenticate);
router.get('/', controller.list);
router.post('/', authorize('admin', 'manager'), controller.create);
router.patch('/:id', authorize('admin', 'manager'), controller.update);
router.delete('/:id', authorize('admin'), controller.remove);

module.exports = router;
