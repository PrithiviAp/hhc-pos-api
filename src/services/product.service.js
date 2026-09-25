const mongoose = require('mongoose');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination.util');
const productRepository = require('../repositories/product.repository');
const TRACKED_FIELDS = ['name', 'nameTa', 'category', 'perDayRate', 'unit', 'quantityInStock', 'isActive', 'alertEnabled', 'alertDays', 'qtyRateEnabled', 'qtyRates'];
const LOW_STOCK_THRESHOLD = 5;


function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveCategoryField(data) {
  if (data.category === undefined || data.category === null) return data;
  const raw = String(data.category).trim();
  if (!raw) {
    const { category, ...rest } = data;
    return rest;
  }
  if (mongoose.Types.ObjectId.isValid(raw) && String(new mongoose.Types.ObjectId(raw)) === raw) {
    return { ...data, category: raw };
  }
  let cat = await Category.findOne({ name: new RegExp(`^${escapeRegex(raw)}$`, 'i') });
  if (!cat) {
    cat = await Category.create({ name: raw });
  }
  return { ...data, category: cat._id };
}

async function listProducts(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = { isActive: true };

  if (query.search) {
    const search = query.search.trim();
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { nameTa: { $regex: search, $options: 'i' } },
    ];
  }
  if (query.category) {
    filter.category = query.category;
  }

  if (query.stockFilter === 'OUT') {
    filter.quantityInStock = { $lte: 0 };
  } else if (query.stockFilter === 'LOW') {
    filter.quantityInStock = { $gt: 0, $lte: LOW_STOCK_THRESHOLD };
  }

  const [items, total] = await Promise.all([
    productRepository.findMany({ filter, skip, limit }),
    productRepository.count(filter),
  ]);

  return { items, meta: buildMeta({ page, limit, total }) };
}

async function getProduct(id) {
  const product = await productRepository.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}


function normalizeQtyRateFields(data) {
  if (data.qtyRateEnabled === false || data.qtyRateEnabled === 'false' || data.qtyRateEnabled === undefined) {
    if ('qtyRateEnabled' in data || 'qtyRates' in data) {
      return { ...data, qtyRateEnabled: false, qtyRates: [] };
    }
    return data;
  }
  if (data.qtyRateEnabled === true || data.qtyRateEnabled === 'true') {
    const tiers = Array.isArray(data.qtyRates) ? data.qtyRates : [];
    if (tiers.length === 0) throw ApiError.badRequest('At least one quantity-wise rate is required when the toggle is enabled');
    const normalized = tiers
      .map((t) => ({ minQty: Number(t.minQty), rate: Number(t.rate) }))
      .sort((a, b) => a.minQty - b.minQty);
    return { ...data, qtyRateEnabled: true, qtyRates: normalized };
  }
  return data;
}

/** Normalizes the alert pair so the two fields never contradict each other
 *  in storage: alertEnabled=false always means alertDate=null, and
 *  alertEnabled=true requires a real date (already enforced at the
 *  validator level, but re-checked here since this fn is also the target
 *  for any future internal callers that skip HTTP validation). */
function normalizeAlertFields(data) {
  if (data.alertEnabled === false || data.alertEnabled === 'false' || data.alertEnabled === undefined) {
    return { ...data, alertEnabled: false, alertDays: null };
  }
  if (data.alertEnabled === true || data.alertEnabled === 'true') {
    const days = Number(data.alertDays);
    if (data.alertDays == null || Number.isNaN(days) || days < 0) {
      throw ApiError.badRequest('Alert days is required when the alert is enabled');
    }
    return { ...data, alertEnabled: true, alertDays: days };
  }
  return data;
}

// async function createProduct(data, performedBy) {
//  const payload = normalizeQtyRateFields(
//     normalizeAlertFields({ ...data, perDayRate: Number(data.perDayRate), unit: 'Qty' })
//   );
//   if (!payload.name || !String(payload.name).trim()) {
//     throw ApiError.badRequest('name is required');
//   }
//   if (Number.isNaN(payload.perDayRate) || payload.perDayRate < 0) {
//     throw ApiError.badRequest(`perDayRate is invalid for "${payload.name}"`);
//   }
//   const product = await productRepository.create(payload);
//   await productRepository.addHistory({
//     product: product._id,
//     action: 'CREATE',
//     changes: TRACKED_FIELDS.filter((f) => product[f] !== undefined).map((f) => ({ field: f, oldValue: null, newValue: product[f] })),
//     performedBy,
//   });
//   return product;
// }

// async function createProduct(data, performedBy) {
//   const payload = normalizeQtyRateFields(
//     normalizeAlertFields({ ...data, perDayRate: Number(data.perDayRate), unit: 'Qty' })
//   );
//   if (!payload.name || !String(payload.name).trim()) {
//     throw ApiError.badRequest('name is required');
//   }
//   if (Number.isNaN(payload.perDayRate) || payload.perDayRate < 0) {
//     throw ApiError.badRequest(`perDayRate is invalid for "${payload.name}"`);
//   }
//   const product = await productRepository.create(payload);
//   await productRepository.addHistory({
//     product: product._id,
//     action: 'CREATE',
//     changes: TRACKED_FIELDS.filter((f) => product[f] !== undefined).map((f) => ({
//       field: f,
//       oldValue: null,
//       newValue: f === 'category' ? (product.category?.name ?? null) : product[f],
//     })),
//     performedBy,
//   });
//   return product;
// }

async function createProduct(data, performedBy) {
  const withCategory = await resolveCategoryField(data);
  const payload = normalizeQtyRateFields(
    normalizeAlertFields({ ...withCategory, perDayRate: Number(withCategory.perDayRate), unit: 'Qty' })
  );
  if (!payload.name || !String(payload.name).trim()) {
    throw ApiError.badRequest('name is required');
  }
  if (Number.isNaN(payload.perDayRate) || payload.perDayRate < 0) {
    throw ApiError.badRequest(`perDayRate is invalid for "${payload.name}"`);
  }
  const product = await productRepository.create(payload);
  await productRepository.addHistory({
    product: product._id,
    action: 'CREATE',
    changes: TRACKED_FIELDS.filter((f) => product[f] !== undefined).map((f) => ({
      field: f,
      oldValue: null,
      newValue: f === 'category' ? (product.category?.name ?? null) : product[f],
    })),
    performedBy,
  });
  return product;
}

/** Bulk-inserts products one row at a time, reusing createProduct so each
 *  row still gets its own CREATE history entry and the same normalization/
 *  validation as a single create. A bad row (missing name, duplicate, etc.)
 *  does not abort the whole batch — it's collected into `failed` so the
 *  caller can see exactly which rows to fix and re-submit, while the good
 *  rows still go in. */
async function bulkCreateProducts(items, performedBy) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('products must be a non-empty array');
  }

  const created = [];
  const failed = [];

  for (const item of items) {
    try {
      const product = await createProduct(item, performedBy);
      created.push(product);
    } catch (err) {
      failed.push({ input: item, error: err.message });
    }
  }

  return { created, failed };
}

// async function updateProduct(id, data, performedBy) {
//   const existing = await productRepository.findById(id);
//   if (!existing) throw ApiError.notFound('Product not found');

//   const payload = normalizeQtyRateFields(
//     normalizeAlertFields({
//       ...data,
//       ...(data.perDayRate !== undefined ? { perDayRate: Number(data.perDayRate) } : {}),
//     })
//   );
//   const updated = await productRepository.update(id, payload);

//   const changes = TRACKED_FIELDS.filter((f) => f in payload)
//     .map((f) => ({ field: f, oldValue: existing[f], newValue: updated[f] }))
//     .filter((c) => String(c.oldValue) !== String(c.newValue));
//   if (changes.length > 0) {
//     await productRepository.addHistory({ product: id, action: 'UPDATE', changes, performedBy });
//   }
//   return updated;
// }

// async function updateProduct(id, data, performedBy) {
//   const existing = await productRepository.findById(id);
//   if (!existing) throw ApiError.notFound('Product not found');

//   const payload = normalizeQtyRateFields(
//     normalizeAlertFields({
//       ...data,
//       ...(data.perDayRate !== undefined ? { perDayRate: Number(data.perDayRate) } : {}),
//     })
//   );
//   const updated = await productRepository.update(id, payload);

//   const changes = TRACKED_FIELDS.filter((f) => f in payload)
//     .map((f) => {
//       if (f === 'category') {
//         return {
//           field: f,
//           oldValue: existing.category?.name ?? null,
//           newValue: updated.category?.name ?? null,
//         };
//       }
//       return { field: f, oldValue: existing[f], newValue: updated[f] };
//     })
//     .filter((c) => String(c.oldValue) !== String(c.newValue));

//   if (changes.length > 0) {
//     await productRepository.addHistory({ product: id, action: 'UPDATE', changes, performedBy });
//   }
//   return updated;
// }

async function updateProduct(id, data, performedBy) {
  const existing = await productRepository.findById(id);
  if (!existing) throw ApiError.notFound('Product not found');

  const withCategory = await resolveCategoryField(data);
  const payload = normalizeQtyRateFields(
    normalizeAlertFields({
      ...withCategory,
      ...(withCategory.perDayRate !== undefined ? { perDayRate: Number(withCategory.perDayRate) } : {}),
    })
  );
  const updated = await productRepository.update(id, payload);

  const changes = TRACKED_FIELDS.filter((f) => f in payload)
    .map((f) => {
      if (f === 'category') {
        return { field: f, oldValue: existing.category?.name ?? null, newValue: updated.category?.name ?? null };
      }
      return { field: f, oldValue: existing[f], newValue: updated[f] };
    })
    .filter((c) => String(c.oldValue) !== String(c.newValue));

  if (changes.length > 0) {
    await productRepository.addHistory({ product: id, action: 'UPDATE', changes, performedBy });
  }
  return updated;
}

async function deleteProduct(id) {
  const deleted = await productRepository.softDelete(id);
  if (!deleted) throw ApiError.notFound('Product not found');
  return deleted;
}

async function getProductHistory(id) {
  return productRepository.listHistory(id);
}

/** Products whose alert date has arrived (or passed) and is still enabled —
 *  for a dashboard widget / cron job to surface restock reminders. Not
 *  wired to a route here since none was asked for, but this is the natural
 *  next piece if/when that's needed. */
async function listDueAlerts(now = new Date()) {
  return productRepository.findMany({
    filter: { isActive: true, alertEnabled: true, alertDate: { $lte: now } },
    skip: 0,
    limit: 200,
  });
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

/** Buckets every active, alert-enabled product into Today / Previous
 *  (overdue — alert date passed and still enabled, meaning nobody
 *  actioned it) / Incoming (future). Used by the header alert bell. */
async function getAlertBuckets(now = new Date()) {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [today, previous, incoming] = await Promise.all([
    productRepository.findMany({
      filter: { isActive: true, alertEnabled: true, alertDate: { $gte: todayStart, $lte: todayEnd } },
      skip: 0, limit: 200, sort: 'alertDate',
    }),
    productRepository.findMany({
      filter: { isActive: true, alertEnabled: true, alertDate: { $lt: todayStart } },
      skip: 0, limit: 200, sort: '-alertDate',
    }),
    productRepository.findMany({
      filter: { isActive: true, alertEnabled: true, alertDate: { $gt: todayEnd } },
      skip: 0, limit: 200, sort: 'alertDate',
    }),
  ]);

  return { today, previous, incoming };
}

module.exports = {
  listProducts, getProduct, createProduct, bulkCreateProducts, updateProduct, deleteProduct,
  getProductHistory, listDueAlerts, getAlertBuckets,
};