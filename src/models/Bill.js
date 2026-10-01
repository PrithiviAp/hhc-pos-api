const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    unit: { type: String, enum: ['Qty'], required: true },
    quantity: { type: Number, required: true, min: 0.01 },
    baseQuantity: { type: Number, required: true, min: 0.01 },
    quantityReturned: { type: Number, default: 0, min: 0 },

    rateUsed: { type: Number, required: true, min: 0 },
    rateBasis: { type: String, enum: ['DAY', 'OPEN'], required: true },
    billingMode: { type: String, enum: ['DAILY', 'OPEN'], required: true },

    returnDate: { type: Date },
notes: { type: String, trim: true, maxlength: 1000 },
    // What was actually billed upfront for DAILY items — the baseline
    // recordReturn compares actual days used against, to refund an early
    // return or charge extra for a late one.
    plannedDays: { type: Number, min: 0 },

    dayRate: { type: Number, min: 0 },

    lastReturnedAt: { type: Date },
    total: { type: Number, required: true, default: 0 },
    alertDueDateOverride: { type: Date, default: null }, 
    alertAcknowledgedAt: { type: Date, default: null },
  },
  { _id: false }
);

const billReturnEventSchema = new mongoose.Schema(
  {
    returnedAt: { type: Date, required: true },
    items: [{ product: mongoose.Schema.Types.ObjectId, name: String, quantity: Number }],
    amountPaidNow: { type: Number, default: 0 },
    refundGivenNow: { type: Number, default: 0 },
    refundWaived: { type: Boolean, default: false },
    overdueAmount: { type: Number, default: 0 },
    waived: { type: Boolean, default: false },
    // NEW
    discountAdjustment: { type: Number, default: 0 },     // delta applied to bill.discount at this return
    remainingWaived: { type: Boolean, default: false },
    remainingWaivedAmount: { type: Number, default: 0 },
  },
  { _id: false }
);
// models/Bill.js
const billPaymentEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['PAYMENT', 'REFUND'], required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['CASH', 'UPI', 'CHEQUE'], default: 'CASH' },  // was CARD/CREDIT
    note: { type: String, trim: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);
const billSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, required: true, trim: true },
    siteAddress: { type: String, required: true, trim: true },

    // Structured link to the Site this bill's items live at. Optional so
    // bills created before Site existed (or via any path that only has a
    // free-text address) keep working — siteAddress remains the source of
    // truth for display/printing either way.
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', index: true },

    items: { type: [billItemSchema], required: true },

    subTotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    paymentWaivedAmount: { type: Number, default: 0 }, 
    grandTotal: { type: Number, required: true },

    amountPaid: { type: Number, default: 0, min: 0 },
    pendingAmount: { type: Number, default: 0, min: 0 },
    refundDue: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ['PAID', 'PARTIAL', 'UNPAID'], default: 'UNPAID' },
     paymentMethod: { type: String, enum: ['CASH', 'UPI', 'CHEQUE'], default: 'CASH' }, 

    billingMode: { type: String, enum: ['DAILY', 'OPEN'], default: 'DAILY' },
    productWiseMode: { type: Boolean, default: false },
    returnDateUnknown: { type: Boolean, default: false },
    returnDate: { type: Date },

    status: { type: String, enum: ['BORROWED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED'], default: 'BORROWED' },
    returnedAt: { type: Date },

    returnHistory: { type: [billReturnEventSchema], default: [] },
    paymentHistory: { type: [billPaymentEventSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

billSchema.index({ billNumber: 'text', customerName: 'text', customerPhone: 'text' });
billSchema.index({ createdAt: -1 });
billSchema.index({ status: 1, createdAt: -1 });
billSchema.index({ site: 1, createdAt: -1 });
billSchema.pre('save', function (next) {
  if (this.status === 'RETURNED' && !this.returnedAt) {
    this.returnedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Bill', billSchema);