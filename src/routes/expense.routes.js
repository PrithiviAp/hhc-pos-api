// src/routes/expense.routes.js
const { Router } = require('express');
const { createExpense, listExpenses, getExpense } = require('../controllers/expense.controller');
const { createExpenseValidator } = require('../validators/expense.validator');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authenticate, listExpenses);
router.get('/:id', authenticate, getExpense);
router.post('/', authenticate, createExpenseValidator, validate, createExpense);

module.exports = router;