// src/validators/expense.validator.js
const { body } = require('express-validator');
const { EXPENSE_CATEGORIES } = require('../models/Expense');

const createExpenseValidator = [
  body('category')
    .isIn(EXPENSE_CATEGORIES)
    .withMessage(`category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`),
  body('categoryLabel')
    .if(body('category').equals('OTHER'))
    .trim()
    .notEmpty()
    .withMessage('categoryLabel is required when category is OTHER'),
  body('description').trim().notEmpty().withMessage('description is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
];

module.exports = { createExpenseValidator };