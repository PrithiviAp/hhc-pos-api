const mongoose = require('mongoose');

const qtyRateSchema = new mongoose.Schema({
  minQty: { type: Number, required: true, min: 1 },
  rate: { type: Number, required: true, min: 0 },
}, { _id: false });


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
qtyRateEnabled: { type: Boolean, default: false },
qtyRates: { type: [qtyRateSchema], default: [] },
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