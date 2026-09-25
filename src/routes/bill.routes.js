const { Router } = require('express');
const controller = require('../controllers/bill.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(authenticate);

router.get('/alerts/summary', authorize('admin'), controller.alerts);
router.get('/matrix', controller.matrix); 
router.patch('/:id/alerts/ack', authorize('admin'), controller.acknowledgeAlert);
router.patch('/:id/alerts/date', authorize('admin'), controller.updateAlertDate); // ← new
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.patch('/:id/cancel', authorize('admin', 'manager'), controller.cancel);
router.patch('/:id/return', controller.returnItems);
router.patch('/:id/pay', controller.pay);

module.exports = router;
