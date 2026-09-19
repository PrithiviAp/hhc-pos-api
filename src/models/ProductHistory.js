const mongoose = require('mongoose');

/**
 * Append-only audit trail of product create/update events. Every time
 * the Add/Edit Product dialog is saved, a snapshot of what changed is
 * recorded here so the "History" view on the Products page has something
 * to show.
 */
const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const productHistorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    action: { type: String, enum: ['CREATE', 'UPDATE'], required: true },
    changes: { type: [changeSchema], default: [] },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProductHistory', productHistorySchema);
