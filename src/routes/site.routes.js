const { Router } = require('express');
const controller = require('../controllers/site.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/customer/:customerId', controller.listForCustomer);
router.get('/:id', controller.getOne);
router.get('/:id/bills', controller.getBills);
router.get('/:id/bills/export', controller.getBillsExport);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', authorize('admin', 'manager'), controller.remove);

module.exports = router;

