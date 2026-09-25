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
body('qtyRateEnabled').optional().isBoolean().withMessage('qtyRateEnabled must be true or false'),
body('qtyRates').custom((value, { req }) => {
  const enabled = req.body.qtyRateEnabled === true || req.body.qtyRateEnabled === 'true';
  if (!enabled) return true;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('At least one quantity-wise rate is required when qty-wise rate is enabled');
  }
  for (const tier of value) {
    if (tier.minQty == null || Number(tier.minQty) <= 0) throw new Error('Each tier needs a quantity greater than 0');
    if (tier.rate == null || Number(tier.rate) < 0) throw new Error('Each tier needs a valid rate');
  }
  return true;
}),
];

module.exports = { productValidator };