const { Router } = require('express');
const controller = require('../controllers/bill.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(authenticate);

router.get('/alerts/summary', authorize('admin'), controller.alerts);
router.patch('/:id/alerts/ack', authorize('admin'), controller.acknowledgeAlert); // before /:id/... is fine, these are more specific than /:id alone
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.patch('/:id/cancel', authorize('admin', 'manager'), controller.cancel);
router.patch('/:id/return', controller.returnItems);
router.patch('/:id/pay', controller.pay);

module.exports = router;
