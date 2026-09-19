const Bill = require('../models/Bill');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const StockMovement = require('../models/Stock');
const { isBillOverdue } = require('./bill.service');
const { getPagination, buildMeta } = require('../utils/pagination.util');
const Expense = require('../models/Expense');

const LOW_STOCK_THRESHOLD = 5;
function dateRangeFilter(query) {
  const filter = { status: { $ne: 'CANCELLED' } };
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  return filter;
}

async function overdueCount() {
  const candidates = await Bill.find({ status: { $nin: ['CANCELLED', 'RETURNED'] } });
  const now = new Date();
  return candidates.filter((b) => isBillOverdue(b, now)).length;
}

async function salesSummary(query) {
  const filter = dateRangeFilter(query);
  const [summary] = await Bill.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$grandTotal' },
        totalBills: { $sum: 1 },
        totalCollected: { $sum: '$amountPaid' },
        totalPending: { $sum: '$pendingAmount' },
        totalDiscount: { $sum: '$discount' },
      },
    },
  ]);
  return summary || { totalSales: 0, totalBills: 0, totalCollected: 0, totalPending: 0, totalDiscount: 0 };
}

function buildExpenseFilter({ from, to, category, search }) {
  const filter = {};
  if (category && category !== 'ALL') filter.category = category;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  if (search) {
    filter.$or = [
      { description: new RegExp(search, 'i') },
      { categoryLabel: new RegExp(search, 'i') },
    ];
  }
  return filter;
}

async function expensesReport(query) {
  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const filter = buildExpenseFilter(query);

  const [items, total] = await Promise.all([
    Expense.find(filter)
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Expense.countDocuments(filter),
  ]);

  const rows = items.map((e) => ({
    category: e.category,
    categoryLabel: e.category === 'OTHER' ? e.categoryLabel : e.category,
    description: e.description,
    amount: e.amount,
    date: e.createdAt,
    createdByName: e.createdBy?.name ?? '—',
  }));

  return { items: rows, meta: buildMeta({ page, limit, total }) };
}

// add: today's total expenses, used by dashboardStats()
async function todayExpensesTotal() {
  const { start, end } = getTodayRange();
  const [row] = await Expense.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total ?? 0;
}

async function salesByDay(query) {
  const filter = dateRangeFilter(query);
  return Bill.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: '$grandTotal' },
        bills: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

async function topProducts(query) {
  const filter = dateRangeFilter(query);
  return Bill.aggregate([
    { $match: filter },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        quantitySold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.total' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function todayIncome() {
  const { start, end } = getTodayRange();
  const rows = await Bill.aggregate([
    { $unwind: '$paymentHistory' },
    { $match: { 'paymentHistory.createdAt': { $gte: start, $lt: end } } },
    { $group: { _id: '$paymentHistory.type', total: { $sum: '$paymentHistory.amount' } } },
  ]);
  const payments = rows.find((r) => r._id === 'PAYMENT')?.total || 0;
  const refunds = rows.find((r) => r._id === 'REFUND')?.total || 0;
  return { payments, refunds, net: Math.round((payments - refunds) * 100) / 100 };
}


async function stockCounts() {
  const [lowStockCount, outOfStockCount] = await Promise.all([
    Product.countDocuments({
      isActive: true,
      quantityInStock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD },
    }),
    Product.countDocuments({
      isActive: true,
      quantityInStock: { $lte: 0 },
    }),
  ]);
  return { lowStockCount, outOfStockCount };
}

async function todayStockMovement() {
  const { start, end } = getTodayRange();
  const rows = await StockMovement.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: '$type', qty: { $sum: '$quantity' } } },
  ]);
  return {
    stockIn: rows.find((r) => r._id === 'IN')?.qty || 0,
    stockOut: rows.find((r) => r._id === 'OUT')?.qty || 0,
  };
}

async function todayBillsCount() {
  const { start, end } = getTodayRange();
  return Bill.countDocuments({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'CANCELLED' } });
}

async function dashboardStats() {
  const [income, stock, totalBillsToday, totalProducts, overallPending, overdue, totalExpensesToday, stockLevels] = await Promise.all([
    todayIncome(),
    todayStockMovement(),
    todayBillsCount(),
    Product.countDocuments({ isActive: true }),
    Bill.aggregate([
      { $match: { status: { $nin: ['CANCELLED'] } } },
      { $group: { _id: null, total: { $sum: '$pendingAmount' } } },
    ]),
    overdueCount(),
    todayExpensesTotal(),
    stockCounts(), // add
  ]);

  return {
    today: {
      totalSales: income.net,
      totalPayments: income.payments,
      totalRefunds: income.refunds,
      totalBills: totalBillsToday,
      stockIn: stock.stockIn,
      stockOut: stock.stockOut,
      totalExpenses: totalExpensesToday,
    },
    totalProducts,
    totalPendingAmount: overallPending[0]?.total ?? 0,
    overdueBillsCount: overdue,
    lowStockCount: stockLevels.lowStockCount, // add
    outOfStockCount: stockLevels.outOfStockCount, // add
  };
}

async function incomeTrend({ days = 14 } = {}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (Number(days) - 1));

  const rows = await Bill.aggregate([
    { $unwind: '$paymentHistory' },
    { $match: { 'paymentHistory.createdAt': { $gte: start } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$paymentHistory.createdAt' } },
          type: '$paymentHistory.type',
        },
        total: { $sum: '$paymentHistory.amount' },
      },
    },
  ]);

  const byDate = {};
  for (const row of rows) {
    const d = row._id.date;
    byDate[d] = byDate[d] || { payments: 0, refunds: 0 };
    if (row._id.type === 'PAYMENT') byDate[d].payments = row.total;
    if (row._id.type === 'REFUND') byDate[d].refunds = row.total;
  }

  const result = [];
  const cursor = new Date(start);
  const endOfToday = new Date();
  endOfToday.setHours(0, 0, 0, 0);
  while (cursor <= endOfToday) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = byDate[key] || { payments: 0, refunds: 0 };
    result.push({ date: key, income: Math.round((entry.payments - entry.refunds) * 100) / 100 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

async function topBorrowedProducts({ limit = 5, days } = {}) {
  const match = { status: { $ne: 'CANCELLED' } };
  if (days) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (Number(days) - 1));
    match.createdAt = { $gte: start };
  }
  return Bill.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        timesBorrowed: { $sum: 1 },
        quantityBorrowed: { $sum: '$items.baseQuantity' },
      },
    },
    { $sort: { quantityBorrowed: -1 } },
    { $limit: Number(limit) },
  ]);
}

async function topCustomers({ limit = 5 } = {}) {
  const rows = await Bill.aggregate([
    { $match: { status: { $ne: 'CANCELLED' }, customer: { $ne: null } } },
    {
      $addFields: {
        refundedAmount: {
          $sum: {
            $map: {
              input: { $filter: { input: '$paymentHistory', cond: { $eq: ['$$this.type', 'REFUND'] } } },
              as: 'r',
              in: '$$r.amount',
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$customer',
        totalPurchases: { $sum: { $subtract: ['$amountPaid', '$refundedAmount'] } },
        pendingAmount: { $sum: '$pendingAmount' },
      },
    },
    { $sort: { totalPurchases: -1 } },
    { $limit: Number(limit) },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
    {
      $project: {
        _id: '$customer._id',
        name: '$customer.name',
        phone: '$customer.phone',
        totalPurchases: { $round: ['$totalPurchases', 2] },
        pendingAmount: { $round: ['$pendingAmount', 2] },
      },
    },
  ]);
  return rows;
}
function buildDateStatusSearchFilter({ from, to, status, search, excludeCancelled = true }) {
  const filter = {};
  if (excludeCancelled && !status) filter.status = { $ne: 'CANCELLED' };
  if (status && status !== 'ALL') filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  if (search) {
    filter.$or = [
      { billNumber: new RegExp(search, 'i') },
      { customerName: new RegExp(search, 'i') },
      { customerPhone: new RegExp(search, 'i') },
    ];
  }
  return filter;
}

async function salesReport(query) {
  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const filter = buildDateStatusSearchFilter(query);

  const [items, total] = await Promise.all([
    Bill.find(filter).sort('-createdAt').skip(skip).limit(limit).select(
      'billNumber customerName customerPhone createdAt subTotal discount grandTotal amountPaid pendingAmount refundDue paymentMethod status'
    ),
    Bill.countDocuments(filter),
  ]);

  const rows = items.map((b) => ({
    billNumber: b.billNumber,
    date: b.createdAt,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    subTotal: b.subTotal,
    discount: b.discount,
    grandTotal: b.grandTotal,
    amountPaid: b.amountPaid,
    pendingAmount: b.pendingAmount,
    refundDue: b.refundDue,
    paymentMethod: b.paymentMethod,
    status: b.status,
  }));

  return { items: rows, meta: buildMeta({ page, limit, total }) };
}

async function productsReport(query) {
  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const filter = buildDateStatusSearchFilter({ from: query.from, to: query.to, excludeCancelled: true });
  delete filter.$or;

  const rows = await Bill.aggregate([
    { $match: filter },
    {
      $addFields: {
        discountRatio: {
          $cond: [{ $gt: ['$subTotal', 0] }, { $divide: ['$grandTotal', '$subTotal'] }, 1],
        },
      },
    },
    { $unwind: '$items' },
    { $addFields: { itemNetRevenue: { $multiply: ['$items.total', '$discountRatio'] } } },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        quantitySold: { $sum: '$items.baseQuantity' },
        timesBorrowed: { $sum: 1 },
        revenue: { $sum: '$itemNetRevenue' },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  const productIds = rows.map((r) => r._id);
  const products = await Product.find({ _id: { $in: productIds } }).select('name quantityInStock category');
  const byId = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

  let allResults = rows.map((r) => ({
    productId: r._id,
    name: r.name,
    quantitySold: r.quantitySold,
    timesBorrowed: r.timesBorrowed,
    revenue: Math.round(r.revenue * 100) / 100,
    currentStock: byId[r._id?.toString()]?.quantityInStock ?? null,
  }));

  if (query.search) {
    const re = new RegExp(query.search, 'i');
    allResults = allResults.filter((r) => re.test(r.name));
  }

  const total = allResults.length;
  const items = allResults.slice(skip, skip + limit);
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function pendingReport(query) {
  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const filter = { status: { $nin: ['CANCELLED'] }, pendingAmount: { $gt: 0 } };
  if (query.search) {
    filter.$or = [
      { billNumber: new RegExp(query.search, 'i') },
      { customerName: new RegExp(query.search, 'i') },
      { customerPhone: new RegExp(query.search, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    Bill.find(filter).sort('-pendingAmount').skip(skip).limit(limit).select(
      'billNumber customerName customerPhone createdAt returnDate returnDateUnknown grandTotal amountPaid pendingAmount status'
    ),
    Bill.countDocuments(filter),
  ]);

  const now = new Date();
  const rows = items.map((b) => ({
    billNumber: b.billNumber,
    date: b.createdAt,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    grandTotal: b.grandTotal,
    amountPaid: b.amountPaid,
    pendingAmount: b.pendingAmount,
    status: b.status,
    isOverdue: isBillOverdue(b, now),
    returnDate: b.returnDateUnknown ? null : b.returnDate,
  }));

  return { items: rows, meta: buildMeta({ page, limit, total }) };
}

async function billsReport(query) {
  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const filter = buildDateStatusSearchFilter({ ...query, excludeCancelled: false });

  const [items, total] = await Promise.all([
    Bill.find(filter).sort('-createdAt').skip(skip).limit(limit).select(
      'billNumber customerName customerPhone siteAddress items createdAt billingMode subTotal discount grandTotal amountPaid pendingAmount refundDue paymentMethod status returnDate returnDateUnknown'
    ),
    Bill.countDocuments(filter),
  ]);

  const rows = items.map((b) => ({
    billNumber: b.billNumber,
    date: b.createdAt,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    siteAddress: b.siteAddress,
    itemCount: b.items.length,
    itemsSummary: b.items.map((i) => `${i.name} x${i.quantity}`).join(', '),
    billingMode: b.billingMode,
    subTotal: b.subTotal,
    discount: b.discount,
    grandTotal: b.grandTotal,
    amountPaid: b.amountPaid,
    pendingAmount: b.pendingAmount,
    refundDue: b.refundDue,
    paymentMethod: b.paymentMethod,
    status: b.status,
    returnDate: b.returnDateUnknown ? null : b.returnDate,
  }));

  return { items: rows, meta: buildMeta({ page, limit, total }) };
}

function buildPaymentMethodMatch(query) {
  const match = { 'paymentHistory.type': 'PAYMENT' };
  if (query.method && query.method !== 'ALL') {
    match['paymentHistory.method'] = query.method;
  }
  if (query.from || query.to) {
    match['paymentHistory.createdAt'] = {};
    if (query.from) match['paymentHistory.createdAt'].$gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      match['paymentHistory.createdAt'].$lte = end;
    }
  }
  return match;
}

async function paymentMethodsReport(query) {
  const { page, limit, skip } = getPagination(query, { page: 1, limit: 10 });
  const match = buildPaymentMethodMatch(query);

  const [result] = await Bill.aggregate([
    { $unwind: '$paymentHistory' },
    { $match: match },
    {
      $facet: {
        totalsByMethod: [
          { $group: { _id: '$paymentHistory.method', total: { $sum: '$paymentHistory.amount' }, count: { $sum: 1 } } },
        ],
        items: [
          { $sort: { 'paymentHistory.createdAt': -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              billNumber: 1,
              customerName: 1,
              customerPhone: 1,
              amount: '$paymentHistory.amount',
              method: '$paymentHistory.method',
              note: '$paymentHistory.note',
              date: '$paymentHistory.createdAt',
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const totalsByMethod = result?.totalsByMethod ?? [];
  const items = result?.items ?? [];
  const total = result?.totalCount?.[0]?.count ?? 0;

  const totals = { CASH: 0, UPI: 0, CHEQUE: 0 };
  for (const row of totalsByMethod) {
    if (row._id in totals) totals[row._id] = Math.round(row.total * 100) / 100;
  }
  const grandTotal = Math.round((totals.CASH + totals.UPI + totals.CHEQUE) * 100) / 100;

  return {
    items,
    meta: { ...buildMeta({ page, limit, total }), totals, grandTotal },
  };
}

module.exports = {
  salesSummary, salesByDay, topProducts, dashboardStats,
  incomeTrend, topBorrowedProducts, topCustomers,
  salesReport, productsReport, pendingReport, billsReport,
  expensesReport, paymentMethodsReport
};