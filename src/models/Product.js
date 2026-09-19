const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameTa: String,
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },

  unit: {
    type: String,
    enum: ['Qty'],
    default: 'Qty'
  },

  perDayRate: {
    type: Number,
    required: true,
    min: 0
  },

  quantityInStock: {
    type: Number,
    default: 0,
    min: 0
  },

  alertEnabled: {
    type: Boolean,
    default: false
  },

alertDays: { type: Number, min: 0, default: null }, // e.g. 21 — "flag if not returned within 21 days of being borrowed"

  isActive: {
    type: Boolean,
    default: true
  },
}, {
  timestamps: true
});

// Add this
productSchema.index({
  name: 'text',
  nameTa: 'text'
});

productSchema.index({ alertEnabled: 1, alertDate: 1 });

module.exports = mongoose.model('Product', productSchema);