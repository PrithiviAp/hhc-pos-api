const { Router } = require('express');
const controller = require('../controllers/stock.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(authenticate);
router.get('/', controller.list);
router.post('/', authorize('admin', 'manager'), controller.create);
router.get('/summary', controller.summary);
router.get('/category-summary', controller.categorySummary);   // ← new
router.get('/drilldown', controller.drilldown);
module.exports = router;
