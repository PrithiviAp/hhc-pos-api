const mongoose = require('mongoose');
const StockMovement = require('../models/Stock');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination.util');


function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

// Now takes a range instead of a single day.
function dateRangeIST(fromStr, toStr) {
  const start = new Date(`${fromStr}T00:00:00+05:30`);
  const end = new Date(`${toStr}T00:00:00+05:30`);
  end.setDate(end.getDate() + 1); // make 'to' inclusive of its whole day
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw ApiError.badRequest('Invalid date range');
  }
  return { start, end };
}
/** Records a stock movement and atomically updates the product's cached quantity. */
async function recordMovement({ product, type, quantity, reason, reference, performedBy }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const delta = type === 'OUT' ? -Math.abs(quantity) : Math.abs(quantity);

      const prod = await Product.findById(product).session(session);
      if (!prod) throw ApiError.notFound('Product not found');
      if (prod.quantityInStock + delta < 0) {
        throw ApiError.badRequest(`Insufficient stock for ${prod.name}`);
      }

      prod.quantityInStock += delta;
      await prod.save({ session });

      const [movement] = await StockMovement.create(
        [{ product, type, quantity: Math.abs(quantity), reason, reference, performedBy }],
        { session }
      );
      result = movement;
    });
    return result;
  } finally {
    session.endSession();
  }
}

async function listMovements(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.product) filter.product = query.product;
  if (query.type) filter.type = query.type;

  const [items, total] = await Promise.all([
    StockMovement.find(filter).populate('product', 'name').sort('-createdAt').skip(skip).limit(limit),
    StockMovement.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function getSummary(query) {
  const { page, limit, skip } = getPagination(query);
  const today = todayIST();
  const fromStr = query.fromDate || today;
  const toStr = query.toDate || fromStr;
  const { start, end } = dateRangeIST(fromStr, toStr);

  const agg = await StockMovement.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: { product: '$product', type: '$type' }, qty: { $sum: '$quantity' } } },
  ]);

  if (agg.length === 0) {
    return { items: [], meta: buildMeta({ page, limit, total: 0 }), fromDate: fromStr, toDate: toStr };
  }

  const totals = {};
  for (const row of agg) {
    const pid = row._id.product.toString();
    totals[pid] = totals[pid] || { IN: 0, OUT: 0 };
    if (row._id.type === 'IN' || row._id.type === 'OUT') totals[pid][row._id.type] = row.qty;
  }

  const movedProductIds = Object.keys(totals);
  const productFilter = { _id: { $in: movedProductIds }, isActive: true };
  if (query.search) productFilter.name = new RegExp(query.search, 'i');

  const [allMatching, total] = await Promise.all([
    Product.find(productFilter).sort('name').select('name quantityInStock'),
    Product.countDocuments(productFilter),
  ]);

  const pageProducts = allMatching.slice(skip, skip + limit);
  const items = pageProducts.map((p) => ({
    product: { _id: p._id, name: p.name },
    rangeIn: totals[p._id.toString()]?.IN || 0,
    rangeOut: totals[p._id.toString()]?.OUT || 0,
    currentStock: p.quantityInStock,
  }));

  return { items, meta: buildMeta({ page, limit, total }), fromDate: fromStr, toDate: toStr };
}

async function getDrilldown({ product, fromDate, toDate, type }) {
  if (!product || !type) throw ApiError.badRequest('product and type are required');
  const today = todayIST();
  const fromStr = fromDate || today;
  const toStr = toDate || fromStr;
  const { start, end } = dateRangeIST(fromStr, toStr);

  const movements = await StockMovement.find({
    product,
    type,
    createdAt: { $gte: start, $lt: end },
  })
    .populate({ path: 'bill', select: 'billNumber customerName customerPhone siteAddress status items' })
    .sort('-createdAt');

  return movements.map((m) => {
    const billItem = m.bill?.items?.find((i) => i.product.toString() === product.toString());
    const outstanding = billItem ? billItem.quantity - billItem.quantityReturned : 0;

    return {
      _id: m._id,
      quantity: m.quantity,
      reason: m.reason,
      createdAt: m.createdAt,
      customerName: m.bill?.customerName || null,
      customerPhone: m.bill?.customerPhone || null,
      siteAddress: m.bill?.siteAddress || null,
      billNumber: m.bill?.billNumber || m.reference || null,
      // NEW — needed to drive the return action
      billId: m.bill?._id || null,
      billStatus: m.bill?.status || null,
      outstandingQty: type === 'OUT' ? outstanding : null,
      unit: billItem?.unit || null,
    };
  });
}

/** Category-grouped ledger report, matching the physical stock-register
 *  format: Count (opening balance) / In / Out / Total (closing balance)
 *  per product, grouped under its category. Includes every active product
 *  (not just ones with movement in the range) so a category's full sheet
 *  always renders, with zero rows for untouched products — same as the
 *  paper ledger. "Count" is derived as total - in + out rather than stored,
 *  since only the live current stock (total) is tracked; for a "today"
 *  range this is exactly the opening balance for the day. */
async function getCategorySummary(query) {
  const today = todayIST();
  const fromStr = query.fromDate || today;
  const toStr = query.toDate || fromStr;
  const { start, end } = dateRangeIST(fromStr, toStr);

  const [products, movementAgg] = await Promise.all([
    Product.find({ isActive: true })
      .populate('category', 'name nameTa')
      .sort('name')
      .select('name category quantityInStock'),
    StockMovement.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { product: '$product', type: '$type' }, qty: { $sum: '$quantity' } } },
    ]),
  ]);

  const totals = {};
  for (const row of movementAgg) {
    const pid = row._id.product.toString();
    totals[pid] = totals[pid] || { IN: 0, OUT: 0 };
    if (row._id.type === 'IN' || row._id.type === 'OUT') totals[pid][row._id.type] = row.qty;
  }

  const groupsMap = new Map();

  for (const p of products) {
    const catId = p.category?._id ? p.category._id.toString() : 'uncategorized';
    const catName = p.category?.name || 'Uncategorized';
    if (!groupsMap.has(catId)) {
      groupsMap.set(catId, {
        categoryId: catId === 'uncategorized' ? null : catId,
        categoryName: catName,
        products: [],
      });
    }

    const rangeIn = totals[p._id.toString()]?.IN || 0;
    const rangeOut = totals[p._id.toString()]?.OUT || 0;
    const total = p.quantityInStock;
    const count = Math.max(total - rangeIn + rangeOut, 0);

    groupsMap.get(catId).products.push({
      productId: p._id,
      name: p.name,
      count,
      in: rangeIn,
      out: rangeOut,
      total,
    });
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) =>
    a.categoryName === 'Uncategorized' ? 1 : b.categoryName === 'Uncategorized' ? -1 : a.categoryName.localeCompare(b.categoryName)
  );

  return { groups, fromDate: fromStr, toDate: toStr };
}

module.exports = { recordMovement, listMovements, getSummary, getDrilldown, getCategorySummary };