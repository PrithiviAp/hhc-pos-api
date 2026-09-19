// validators/product.validator.js
const { body } = require('express-validator');

const productValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),

  body('unit')
    .optional()
    .isIn(['Qty']).withMessage('Unit must be Qty'),

  body('perDayRate')
    .notEmpty().withMessage('Per-day rate is required')
    .isFloat({ min: 0 }).withMessage('Per-day rate must be a positive number'),

  body('quantityInStock')
    .optional()
    .isInt({ min: 0 }).withMessage('Stock quantity must be zero or greater'),

  body('nameTa').optional().trim(),
  body('category').optional().isMongoId().withMessage('Invalid category'),

body('alertEnabled').optional().isBoolean().withMessage('alertEnabled must be true or false'),
body('alertDays').custom((value, { req }) => {
  if (req.body.alertEnabled === true || req.body.alertEnabled === 'true') {
    if (value === undefined || value === null || value === '') throw new Error('Alert days is required when the alert is enabled');
    if (!Number.isInteger(Number(value)) || Number(value) < 0) throw new Error('Alert days must be a whole number, 0 or more');
  }
  return true;
}),
];

module.exports = { productValidator };