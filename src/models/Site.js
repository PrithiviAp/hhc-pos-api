const mongoose = require('mongoose');

// A Site is a unique, standalone place — a job location, warehouse, etc.
// It is NOT owned by a single customer: several different customers can
// each have bills against the same site (e.g. a building where multiple
// contractors borrow equipment over time). Which customers have used a
// site, and how much each owes, is derived from Bill.site at query time
// (see site.service#getSite / #listSites) rather than stored here.
const siteSchema = new mongoose.Schema(
  {
    // Optional short label so the UI can show something nicer than a raw
    // address in a table, e.g. "Anna Nagar Warehouse".
    name: { type: String, trim: true },

    address: { type: String, required: true, trim: true },

    // Lowercased/trimmed mirror of `address`, used to enforce uniqueness
    // and for case-insensitive lookups without a collation-dependent index.
    normalizedAddress: { type: String, required: true, unique: true },

    // Soft-delete flag. Sites with unreturned bills can't be hard-deleted
    // (see site.service#deleteSite), so this is the normal "remove" path.
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

siteSchema.index({ name: 'text', address: 'text' });

siteSchema.pre('validate', function (next) {
  if (this.address) {
    this.normalizedAddress = this.address.trim().toLowerCase();
  }
  next();
});

module.exports = mongoose.model('Site', siteSchema);