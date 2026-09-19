const { Router } = require('express');
const controller = require('../controllers/customer.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(authenticate);
router.get('/', controller.list);
router.get('/search', controller.searchNames);
router.get('/:id', controller.getOne);
router.patch('/:id/pay', controller.payPending);
router.get('/:id/history', controller.history);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', authorize('admin', 'manager'), controller.remove);
router.patch('/:id/settle', controller.settlePending);

module.exports = router;
