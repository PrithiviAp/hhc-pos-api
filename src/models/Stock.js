const mongoose = require('mongoose');
const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ['IN', 'OUT', 'ADJUSTMENT'], required: true },
    quantity: { type: Number, required: true },
    reason: { type: String, trim: true },
    reference: { type: String, trim: true },
    bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' }, // NEW — links to the borrow/return bill, if any
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockMovement', stockMovementSchema);
