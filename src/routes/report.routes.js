
const { Router } = require('express');
const controller = require('../controllers/report.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();
router.use(authenticate);
router.get('/dashboard', controller.dashboard);
router.get('/sales-summary', controller.summary);
router.get('/sales-by-day', controller.byDay);
router.get('/top-products', controller.topProducts);
router.get('/income-trend', controller.incomeTrend);
router.get('/top-borrowed-products', controller.topBorrowedProducts);
router.get('/top-customers', controller.topCustomers);
router.get('/sales-report', controller.salesReport);
router.get('/products-report', controller.productsReport);
router.get('/pending-report', controller.pendingReport);
router.get('/bills-report', controller.billsReport);
router.get('/expenses-report', controller.expensesReport); // add
router.get('/payment-methods-report', controller.paymentMethodsReport);

module.exports = router;