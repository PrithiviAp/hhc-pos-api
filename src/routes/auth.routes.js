const { Router } = require('express');
const { login, logout, me } = require('../controllers/auth.controller');
const { loginValidator } = require('../validators/auth.validator');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/login', loginValidator, validate, login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;
