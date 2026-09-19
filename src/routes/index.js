const { Router } = require('express');

const authRoutes = require('./auth.routes');
const productRoutes = require('./product.routes');
const categoryRoutes = require('./category.routes');
const stockRoutes = require('./stock.routes');
const billRoutes = require('./bill.routes');
const customerRoutes = require('./customer.routes');
const reportRoutes = require('./report.routes');
const adminRoutes = require('./admin.routes');
const notificationRoutes = require('./notification.route');
const expenseRoutes = require('./expense.routes'); // add
const siteRoutes = require('./site.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/stock', stockRoutes);
router.use('/bills', billRoutes);
router.use('/customers', customerRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/expenses', expenseRoutes); // add
router.use('/sites', siteRoutes);

module.exports = router;