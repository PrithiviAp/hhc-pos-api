    const { Router } = require('express');
    const controller = require('../controllers/product.controller');
    const { productValidator } = require('../validators/product.validator');
    const validate = require('../middlewares/validate.middleware');
    const { authenticate, authorize } = require('../middlewares/auth.middleware');

    const router = Router();

    router.use(authenticate);

    router.get('/alerts/summary', authorize('admin'), controller.alerts);
    router.get('/', controller.list);
    router.get('/:id', controller.getOne);
    router.get('/:id/history', controller.history);
    router.post('/bulk', authorize('admin', 'manager'), controller.bulkCreate);
    router.post('/', authorize('admin', 'manager'), productValidator, validate, controller.create);
    router.patch('/:id', authorize('admin', 'manager'), productValidator, validate, controller.update);
    router.delete('/:id', authorize('admin'), controller.remove);

    module.exports = router;