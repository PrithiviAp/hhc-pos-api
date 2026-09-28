const Site = require('../models/Site');
const Bill = require('../models/Bill');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination.util');
const { computeLiveTotals } = require('./bill.service');
/** Finds an existing site by (case-insensitive) address, or creates one.
 *  This is the single place site identity is decided, used both by the
 *  Site API itself and by bill.service when a bill only carries a free-text
 *  siteAddress. Since address is globally unique, this never depends on
 *  which customer is asking. */

function isBillAccruing(bill) {
  if (bill.returnDateUnknown) return true;
  return bill.items.some((i) => i.billingMode === 'OPEN' && (i.quantity - i.quantityReturned) > 0);
}


async function aggregateStatsForSites(siteIds) {
  const bills = await Bill.find({ site: { $in: siteIds }, status: { $ne: 'CANCELLED' } });

  const bySite = new Map();

  for (const bill of bills) {
    const siteKey = String(bill.site);
    if (!bySite.has(siteKey)) {
      bySite.set(siteKey, { totalBillAmount: 0, totalPendingAmount: 0, customersMap: new Map() });
    }
    const entry = bySite.get(siteKey);

    let billAmount = bill.grandTotal;
    let pendingAmount = bill.pendingAmount;
    if (bill.returnDateUnknown) {                 // ← THIS is the line to change
      const { liveGrandTotal, livePendingAmount } = computeLiveTotals(bill);
      billAmount = liveGrandTotal;
      pendingAmount = livePendingAmount;
    }

    entry.totalBillAmount += billAmount;
    entry.totalPendingAmount += pendingAmount;

    const custKey = String(bill.customer);
    let cust = entry.customersMap.get(custKey);
    if (!cust) {
      cust = {
        customerId: bill.customer,
        customerName: bill.customerName,
        customerPhone: bill.customerPhone,
        billAmount: 0,
        pendingAmount: 0,
        billCount: 0,
      };
      entry.customersMap.set(custKey, cust);
    }
    cust.billAmount += billAmount;
    cust.pendingAmount += pendingAmount;
    cust.billCount += 1;
  }

  const result = new Map();
  for (const [siteKey, entry] of bySite) {
    result.set(siteKey, {
      totalBillAmount: entry.totalBillAmount,
      totalPendingAmount: entry.totalPendingAmount,
      customers: Array.from(entry.customersMap.values()).map((c) => ({
        ...c,
        billAmount: Math.round(c.billAmount * 100) / 100,
        pendingAmount: Math.round(c.pendingAmount * 100) / 100,
      })),
    });
  }
  return result;
}

async function getSiteBills(siteId, query) {
  const site = await Site.findById(siteId);
  if (!site) throw ApiError.notFound('Site not found');

  const filter = { site: siteId };
  if (query.status && query.status !== 'ALL') filter.status = query.status;
  if (query.customer) filter.customer = query.customer;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const [rawItems, total] = await Promise.all([
    Bill.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Bill.countDocuments(filter),
  ]);

  const items = rawItems.map((b) => ({ ...b.toObject(), ...computeLiveTotals(b) }));
  return { items, meta: buildMeta({ page, limit, total }), site };
}

async function findOrCreateByAddress(address, extra = {}, session) {
  const normalizedAddress = address.trim().toLowerCase();
  let site = await Site.findOne({ normalizedAddress }).session(session ?? null);
  if (!site) {
    [site] = await Site.create([{ address, ...extra }], session ? { session } : undefined);
  }
  return site;
}

async function createSite({ name, address, createdBy }) {
  if (!address) throw ApiError.badRequest('Site address is required');

  const normalizedAddress = address.trim().toLowerCase();
  const existing = await Site.findOne({ normalizedAddress });
  if (existing) throw ApiError.badRequest('A site with this address already exists');

  return Site.create({ name, address, createdBy });
}

/** Per-site aggregate stats: total billed, total pending, and a customer-wise
 *  breakdown (each customer who has ever had a bill at this site, with their
 *  own pending amount and bill count). Cancelled bills are excluded from the
 *  money totals but bills of every other status count. */
// async function aggregateStatsForSites(siteIds) {
//   const rows = await Bill.aggregate([
//     { $match: { site: { $in: siteIds }, status: { $ne: 'CANCELLED' } } },
//     {
//       $group: {
//         _id: { site: '$site', customer: '$customer', customerName: '$customerName', customerPhone: '$customerPhone' },
//         billAmount: { $sum: '$grandTotal' },
//         pendingAmount: { $sum: '$pendingAmount' },
//         billCount: { $sum: 1 },
//       },
//     },
//   ]);

//   const bySite = new Map();
//   for (const row of rows) {
//     const siteKey = String(row._id.site);
//     if (!bySite.has(siteKey)) {
//       bySite.set(siteKey, { totalBillAmount: 0, totalPendingAmount: 0, customers: [] });
//     }
//     const entry = bySite.get(siteKey);
//     entry.totalBillAmount += row.billAmount;
//     entry.totalPendingAmount += row.pendingAmount;
//     entry.customers.push({
//       customerId: row._id.customer,
//       customerName: row._id.customerName,
//       customerPhone: row._id.customerPhone,
//       billAmount: Math.round(row.billAmount * 100) / 100,
//       pendingAmount: Math.round(row.pendingAmount * 100) / 100,
//       billCount: row.billCount,
//     });
//   }
//   return bySite;
// }

async function listSites(query) {
  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const filter = {};
  if (query.active !== undefined) filter.isActive = query.active === 'true' || query.active === true;
  if (query.search) {
    filter.$or = [{ name: new RegExp(query.search, 'i') }, { address: new RegExp(query.search, 'i') }];
  }

  const [sites, total] = await Promise.all([
    Site.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Site.countDocuments(filter),
  ]);

  const statsMap = await aggregateStatsForSites(sites.map((s) => s._id));

  const items = sites.map((s) => {
    const stats = statsMap.get(String(s._id));
    return {
      ...s.toObject(),
      totalBillAmount: Math.round((stats?.totalBillAmount ?? 0) * 100) / 100,
      totalPendingAmount: Math.round((stats?.totalPendingAmount ?? 0) * 100) / 100,
      customerCount: stats?.customers.length ?? 0,
      customers: stats?.customers ?? [],
    };
  });

  return { items, meta: buildMeta({ page, limit, total }) };
}

async function getSite(id) {
  const site = await Site.findById(id);
  if (!site) throw ApiError.notFound('Site not found');

  const statsMap = await aggregateStatsForSites([site._id]);
  const stats = statsMap.get(String(site._id));

  return {
    ...site.toObject(),
    totalBillAmount: Math.round((stats?.totalBillAmount ?? 0) * 100) / 100,
    totalPendingAmount: Math.round((stats?.totalPendingAmount ?? 0) * 100) / 100,
    customerCount: stats?.customers.length ?? 0,
    customers: stats?.customers ?? [],
  };
}

async function updateSite(id, { name, address, isActive }) {
  const site = await Site.findById(id);
  if (!site) throw ApiError.notFound('Site not found');

  if (address !== undefined && address.trim().toLowerCase() !== site.normalizedAddress) {
    const clash = await Site.findOne({ normalizedAddress: address.trim().toLowerCase(), _id: { $ne: id } });
    if (clash) throw ApiError.badRequest('Another site already uses this address');
    site.address = address;
  }
  if (name !== undefined) site.name = name;
  if (isActive !== undefined) site.isActive = isActive;

  await site.save();
  return site;
}

// Soft-delete only. A site with bills still out (BORROWED / PARTIALLY_RETURNED)
// can't be removed — equipment tied to it is still outstanding.
async function deleteSite(id) {
  const site = await Site.findById(id);
  if (!site) throw ApiError.notFound('Site not found');

  const activeBillCount = await Bill.countDocuments({
    site: id,
    status: { $in: ['BORROWED', 'PARTIALLY_RETURNED'] },
  });
  if (activeBillCount > 0) {
    throw ApiError.badRequest('Cannot remove a site with active (unreturned) bills — settle or return them first');
  }

  site.isActive = false;
  await site.save();
  return site;
}

/** Bills for one site, for the "view details" drilldown and the three
 *  download variants (full / date-wise / customer-wise) — all three are
 *  just this same endpoint with different query params, so the export
 *  format decision stays on the frontend. */
async function getSiteBills(siteId, query) {
  const site = await Site.findById(siteId);
  if (!site) throw ApiError.notFound('Site not found');

  const filter = { site: siteId };
  if (query.status && query.status !== 'ALL') filter.status = query.status;
  if (query.customer) filter.customer = query.customer;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 }); // ← was 500
  const [items, total] = await Promise.all([
    Bill.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Bill.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }), site };
}

/** Sites a given customer has ever had a bill at, each with that customer's
 *  own pending amount at that site — used on the Customers page/history. */
async function listSitesForCustomer(customerId) {
  const rows = await Bill.aggregate([
    { $match: { customer: customerId, status: { $ne: 'CANCELLED' }, site: { $ne: null } } },
    {
      $group: {
        _id: '$site',
        billAmount: { $sum: '$grandTotal' },
        pendingAmount: { $sum: '$pendingAmount' },
        billCount: { $sum: 1 },
      },
    },
  ]);
  if (!rows.length) return [];

  const sites = await Site.find({ _id: { $in: rows.map((r) => r._id) } });
  const siteMap = new Map(sites.map((s) => [String(s._id), s]));

  return rows
    .filter((r) => siteMap.has(String(r._id)))
    .map((r) => ({
      site: siteMap.get(String(r._id)),
      billAmount: Math.round(r.billAmount * 100) / 100,
      pendingAmount: Math.round(r.pendingAmount * 100) / 100,
      billCount: r.billCount,
    }));
}

async function getSiteBillsForExport(siteId, query) {
  const site = await Site.findById(siteId);
  if (!site) throw ApiError.notFound('Site not found');

  const filter = { site: siteId };
  if (query.status && query.status !== 'ALL') filter.status = query.status;
  if (query.customer) filter.customer = query.customer;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  const items = await Bill.find(filter).sort('-createdAt');
  return { items, site };
}

module.exports = {
  createSite, listSites, getSite, updateSite, deleteSite, getSiteBills, getSiteBillsForExport,
  listSitesForCustomer, findOrCreateByAddress,
};