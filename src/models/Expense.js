// src/models/expense.model.js
const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = ['WATER', 'FUEL', 'SALARY', 'TEA', 'OTHER'];

const expenseSchema = new mongoose.Schema(
  {
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    categoryLabel: { type: String, trim: true }, // required only when category === 'OTHER'
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

expenseSchema.index({ description: 'text' });
expenseSchema.index({ createdAt: -1 });
expenseSchema.index({ category: 1, createdAt: -1 });

expenseSchema.pre('validate', function (next) {
  if (this.category === 'OTHER' && !this.categoryLabel) {
    this.invalidate('categoryLabel', 'categoryLabel is required when category is OTHER');
  }
  next();
});

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;