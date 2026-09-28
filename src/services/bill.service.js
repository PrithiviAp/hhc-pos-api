
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const StockMovement = require('../models/Stock');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination.util');

async function generateBillNumber() {
  const today = new Date();
  const prefix = `HHC${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
  const count = await Bill.countDocuments({ billNumber: new RegExp(`^${prefix}`) });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

function isPastDate(dateVal, now = new Date()) {
  if (!dateVal) return false;
  const d = new Date(dateVal).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  return d < today;
}

function isBillOverdue(bill, now = new Date()) {
  if (bill.status === 'RETURNED' || bill.status === 'CANCELLED') return false;
  if (bill.productWiseMode) {
    return bill.items.some((item) => {
      if (item.quantityReturned >= item.quantity) return false;
      if (item.billingMode !== 'DAILY' || !item.returnDate) return false;
      return isPastDate(item.returnDate, now);
    });
  }
  if (bill.returnDateUnknown || !bill.returnDate) return false;
  return isPastDate(bill.returnDate, now);
}

function derivePaymentStatus(amountPaid, grandTotal) {
  if (amountPaid <= 0) return 'UNPAID';
  if (amountPaid >= grandTotal) return 'PAID';
  return 'PARTIAL';
}

function computeOpenAmount(dayRate, elapsedMs, qty) {
  if (elapsedMs <= 0 || qty <= 0 || !dayRate) return 0;
  const hoursElapsed = elapsedMs / 3600000;
  const days = Math.max(Math.ceil(hoursElapsed / 24), 1);
  return Math.round(days * dayRate * qty * 100) / 100;
}

function ratesFor(item) {
  return { dayRate: item.dayRate ?? item.rateUsed };
}

function daysBetween(from, to) {
  const fromMs = new Date(from).setHours(0, 0, 0, 0);
  const toMs = new Date(to).setHours(0, 0, 0, 0);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    throw ApiError.badRequest('A valid return date is required for daily billing');
  }
  return Math.max(Math.round((toMs - fromMs) / 86400000), 0) + 1;
}

function pushPaymentEvent(bill, { type, amount, method, note, performedBy }) {
  if (!amount || amount <= 0) return;
  bill.paymentHistory.push({ type, amount, method: method || bill.paymentMethod, note, performedBy, createdAt: new Date() });
}

async function findOrCreateCustomer({ name, phone, address }, session) {
  let customer = await Customer.findOne({ phone }).session(session);
  if (customer) {
    let dirty = false;
    if (name && customer.name !== name) { customer.name = name; dirty = true; }
    if (address && customer.address !== address) { customer.address = address; dirty = true; }
    if (dirty) await customer.save({ session });
    return customer;
  }
  const [created] = await Customer.create([{ name, phone, address }], { session });
  return created;
}

async function resolveSite({ site, siteAddress, session }) {
  if (site) {
    const siteDoc = await Site.findById(site).session(session);
    if (!siteDoc) throw ApiError.badRequest('Site not found');
    return siteDoc;
  }

  if (!siteAddress) return null;

  const normalizedAddress = siteAddress.trim().toLowerCase();
  let siteDoc = await Site.findOne({ normalizedAddress }).session(session);

  if (!siteDoc) {
    [siteDoc] = await Site.create([{ address: siteAddress }], { session });
  }
  return siteDoc;
}

function computeLiveTotals(bill, now = new Date()) {
  let liveSubTotal = 0;
  for (const item of bill.items) {
    if (item.billingMode !== 'OPEN') {
      liveSubTotal += item.total;
      continue;
    }
    const outstanding = item.quantity - item.quantityReturned;
    let estimate = item.total;
    if (outstanding > 0) {
      const { dayRate } = ratesFor(item);
      estimate += computeOpenAmount(dayRate, now - bill.createdAt, outstanding);
    }
    liveSubTotal += estimate;
  }
  const liveGrandTotal = Math.max(liveSubTotal - bill.discount, 0);
  const livePendingAmount = Math.max(liveGrandTotal - bill.amountPaid, 0);
  return { liveGrandTotal, livePendingAmount };
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, days) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }


async function createBill({
  customerName, customerPhone, siteAddress, site, items, discount = 0,
  amountPaid, paymentMethod = 'CASH', returnDate, borrowDate, billingMode = 'DAILY',
  productWiseMode = false, returnDateUnknown = false, notes, createdBy,
}) {
  if (!items?.length) throw ApiError.badRequest('Bill must contain at least one item');
  if (!customerName || !customerPhone || !siteAddress) {
    throw ApiError.badRequest('Customer name, phone and site address are required');
  }

  let effectiveBillingMode = billingMode;
  let effectiveReturnDateUnknown = returnDateUnknown;
  if (!productWiseMode && !returnDateUnknown) {
    if (billingMode === 'DAILY' && !returnDate) {
      effectiveBillingMode = 'OPEN';
      effectiveReturnDateUnknown = true;
    }
  }

  const session = await mongoose.startSession();
  try {
    let bill;
    await session.withTransaction(async () => {
      const billItems = [];
      let subTotal = 0;
     const now = new Date();
const borrowedAt = borrowDate ? new Date(borrowDate) : now;
if (Number.isNaN(borrowedAt.getTime())) throw ApiError.badRequest('Invalid borrow date');
      const billId = new mongoose.Types.ObjectId();

      for (const line of items) {
        const product = await Product.findById(line.product).session(session);
        if (!product) throw ApiError.notFound(`Product not found: ${line.product}`);

        const baseQuantity = line.quantity;
        if (product.quantityInStock < baseQuantity) {
          throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
        }

        let lineBillingMode = productWiseMode ? (line.billingMode || 'OPEN') : effectiveBillingMode;
        if (productWiseMode && lineBillingMode === 'DAILY' && !line.returnDate) {
          lineBillingMode = 'OPEN';
        }

        let billItem;

  if (lineBillingMode === 'DAILY') {
  const rateUsed = resolveEffectiveRate(product, line.quantity); 
          if (!rateUsed) throw ApiError.badRequest(`${product.name} has no daily rate set`);
       const days = productWiseMode ? daysBetween(borrowedAt, line.returnDate) : daysBetween(borrowedAt, returnDate);

          const lineTotal = Math.round(rateUsed * days * line.quantity * 100) / 100;

          billItem = {
            product: product._id, name: product.name, unit: 'Qty',
            quantity: line.quantity, baseQuantity, quantityReturned: 0,
            rateUsed, rateBasis: 'DAY', billingMode: 'DAILY',
            returnDate: productWiseMode ? line.returnDate : undefined,
            plannedDays: days,
            total: lineTotal,
          };
          subTotal += lineTotal;
} else {
  const dayRate = resolveEffectiveRate(product, line.quantity) || 0;
          if (!dayRate) {
            throw ApiError.badRequest(`${product.name} has no rate configured for open-ended billing`);
          }
          billItem = {
            product: product._id, name: product.name, unit: 'Qty',
            quantity: line.quantity, baseQuantity, quantityReturned: 0,
            rateUsed: dayRate, rateBasis: 'DAY',
            billingMode: 'OPEN',
            dayRate,
            total: 0,
          };
        }

        billItems.push(billItem);

        product.quantityInStock -= baseQuantity;
        await product.save({ session });
  await StockMovement.create(
  [{ product: product._id, type: 'OUT', quantity: baseQuantity, reason: 'Borrowed',
     bill: billId, performedBy: createdBy, createdAt: borrowedAt }],
  { session }
);
      }

      const grandTotal = Math.max(subTotal - discount, 0);
      if (!Number.isFinite(grandTotal)) {
        throw ApiError.badRequest('Could not compute a valid bill total — check billing inputs');
      }

      const hasOpenLines = billItems.some((i) => i.billingMode === 'OPEN');
      const requestedPaid = amountPaid == null ? 0 : amountPaid;
      if (!hasOpenLines && requestedPaid > grandTotal) {
        throw ApiError.badRequest(
          `Paid amount (₹${requestedPaid.toFixed(2)}) cannot exceed the total amount (₹${grandTotal.toFixed(2)}).`
        );
      }

      const finalAmountPaid = amountPaid == null ? 0 : Math.max(amountPaid, 0);
      const pendingAmount = Math.max(grandTotal - finalAmountPaid, 0);
      const billNumber = await generateBillNumber();
      const customer = await findOrCreateCustomer({ name: customerName, phone: customerPhone, address: siteAddress }, session);
      customer.totalPurchases += grandTotal;
      await customer.save({ session });

      // Sites are global/unique, so this can run independently of the customer lookup above.
      const siteDoc = await resolveSite({ site, siteAddress, session });

      const overallMode = productWiseMode ? 'DAILY' : effectiveBillingMode;
      const initialPaymentHistory = finalAmountPaid > 0
        ? [{ type: 'PAYMENT', amount: finalAmountPaid, method: paymentMethod, note: 'Initial payment', performedBy: createdBy, createdAt: now }]
        : [];

      const [createdBill] = await Bill.create([{
        _id: billId,
        createdAt: borrowedAt, 
        billNumber, customer: customer._id, customerName, customerPhone, siteAddress,
        site: siteDoc?._id,
        items: billItems, subTotal, discount, grandTotal,
        amountPaid: finalAmountPaid, pendingAmount, refundDue: 0,
        paymentStatus: derivePaymentStatus(finalAmountPaid, grandTotal),
        paymentMethod, billingMode: overallMode, productWiseMode,
        returnDateUnknown: productWiseMode ? false : effectiveReturnDateUnknown,
        returnDate: !productWiseMode && overallMode === 'DAILY' ? returnDate || undefined : undefined,
        status: 'BORROWED', createdBy,
        notes: notes ? notes.trim() : undefined,
        paymentHistory: initialPaymentHistory,
      }], { session });
      bill = createdBill;
    });
    return bill;
  } finally {
    session.endSession();
  }
}

async function listBills(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.search) {
    filter.$or = [
      { billNumber: new RegExp(query.search, 'i') },
      { customerName: new RegExp(query.search, 'i') },
      { customerPhone: new RegExp(query.search, 'i') },
    ];
  }
  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }
  if (query.site) {
    filter.site = query.site;
  }
  if (query.customer) {
    filter.customer = query.customer;
  }

  const pendingOnly = query.pendingOnly === 'true' || query.pendingOnly === true;
  const overdueOnly = query.overdueOnly === 'true' || query.overdueOnly === true;

  if (!pendingOnly && !overdueOnly) {
    const [items, total] = await Promise.all([
      Bill.find(filter).sort('-createdAt').skip(skip).limit(limit),
      Bill.countDocuments(filter),
    ]);
    const withLive = items.map((b) => ({ ...b.toObject(), ...computeLiveTotals(b) }));
    return { items: withLive, meta: buildMeta({ page, limit, total }) };
  }

  if (!filter.status) {
    filter.status = { $ne: 'CANCELLED' };
  }

  const candidates = await Bill.find(filter).sort('-createdAt');
  const now = new Date();
  let withLive = candidates.map((b) => ({ ...b.toObject(), ...computeLiveTotals(b) }));

  if (pendingOnly) {
    withLive = withLive.filter((b) => (b.returnDateUnknown ? b.livePendingAmount > 0 : b.pendingAmount > 0));
  }
  if (overdueOnly) {
    withLive = withLive.filter((b) => isBillOverdue(b, now));
  }

  const total = withLive.length;
  const items = withLive.slice(skip, skip + limit);
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function getBill(id) {
  const bill = await Bill.findById(id)
    .populate('createdBy', 'name username')
    .populate('site', 'name address contactPhone');
  if (!bill) throw ApiError.notFound('Bill not found');
  return { ...bill.toObject(), ...computeLiveTotals(bill) };
}

async function cancelBill(id) {
  const bill = await Bill.findById(id);
  if (!bill) throw ApiError.notFound('Bill not found');
  if (bill.status === 'CANCELLED') throw ApiError.badRequest('Bill already cancelled');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of bill.items) {
        const outstanding = item.quantity - item.quantityReturned;
        if (outstanding > 0) {
          await Product.findByIdAndUpdate(item.product, { $inc: { quantityInStock: outstanding } }, { session });
          await StockMovement.create(
            [{ product: item.product, type: 'IN', quantity: outstanding, reason: 'Bill cancelled', reference: bill.billNumber, bill: bill._id }],
            { session }
          );
        }
      }
      bill.status = 'CANCELLED';
      await bill.save({ session });
    });
  } finally {
    session.endSession();
  }
  return bill;
}

async function recordReturn(id, {
  items, amountPaid, refundGivenNow: manualRefund, paymentMethod,
  waiveOverdue, waiveRefund, waiveRemaining, performedBy,
}) {
  const bill = await Bill.findById(id);
  if (!bill) throw ApiError.notFound('Bill not found');
  if (bill.status === 'CANCELLED') throw ApiError.badRequest('Cannot return items on a cancelled bill');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const returnedLines = [];
      let overdueAmountTotal = 0;

      for (const line of items) {
        const billItem = bill.items.find((i) => i.product.toString() === line.product);
        if (!billItem) throw ApiError.badRequest(`Item not found on this bill: ${line.product}`);
        const outstanding = billItem.quantity - billItem.quantityReturned;
        const qty = Math.min(line.quantity, outstanding);
        if (qty <= 0) continue;

        if (billItem.billingMode === 'OPEN') {
          const { dayRate } = ratesFor(billItem);
          const finalized = computeOpenAmount(dayRate, now - bill.createdAt, qty);
          billItem.total += finalized;
          bill.subTotal += finalized;
        } else if (billItem.billingMode === 'DAILY' && billItem.plannedDays) {
          const actualDays = daysBetween(bill.createdAt, now);
          const originalPerUnit = billItem.rateUsed * billItem.plannedDays;
          const actualPerUnit = billItem.rateUsed * actualDays;
          let diff = Math.round((actualPerUnit - originalPerUnit) * qty * 100) / 100;

          if (diff > 0) {
            overdueAmountTotal += diff;
            if (waiveOverdue) diff = 0;
          }

          billItem.total += diff;
          bill.subTotal += diff;
        }

        billItem.quantityReturned += qty;
        billItem.lastReturnedAt = now;
        billItem.alertAcknowledgedAt = null;
        returnedLines.push({ product: billItem.product, name: billItem.name, quantity: qty });

        await Product.findByIdAndUpdate(billItem.product, { $inc: { quantityInStock: qty } }, { session });
        await StockMovement.create(
          [{ product: billItem.product, type: 'IN', quantity: qty, reason: 'Returned', reference: bill.billNumber, bill: bill._id, performedBy }],
          { session }
        );
      }

      if (returnedLines.length === 0) return;

      bill.subTotal = Math.max(bill.subTotal, 0);
      bill.grandTotal = Math.max(bill.subTotal - bill.discount, 0);

      const allReturned = bill.items.every((i) => i.quantityReturned >= i.quantity);
      const anyReturned = bill.items.some((i) => i.quantityReturned > 0);
      bill.status = allReturned ? 'RETURNED' : anyReturned ? 'PARTIALLY_RETURNED' : bill.status;
      if (allReturned) bill.returnedAt = now;

      if (amountPaid && amountPaid > 0) {
        const projectedPaid = bill.amountPaid + amountPaid;
        if (projectedPaid > bill.grandTotal) {
          throw ApiError.badRequest(
            `Amount paid now (₹${amountPaid.toFixed(2)}) would push total paid (₹${projectedPaid.toFixed(2)}) above the bill total (₹${bill.grandTotal.toFixed(2)}).`
          );
        }
        bill.amountPaid = projectedPaid;
        pushPaymentEvent(bill, { type: 'PAYMENT', amount: amountPaid, method: paymentMethod, performedBy, note: 'Paid at return' });
      }

      let rawPending = bill.grandTotal - bill.amountPaid;

      // Fold whatever is still owed after "amount paid now" into the
      // discount instead of leaving it as a pending balance.
      let remainingWaived = false;
      let remainingWaivedAmount = 0;
      let discountAdjustment = 0;
      if (rawPending > 0 && waiveRemaining) {
        remainingWaivedAmount = Math.round(rawPending * 100) / 100;
        discountAdjustment = remainingWaivedAmount;
        bill.discount = Math.round((bill.discount + rawPending) * 100) / 100;
        bill.grandTotal = Math.max(bill.subTotal - bill.discount, 0);
        rawPending = bill.grandTotal - bill.amountPaid; // ~0
        remainingWaived = true;
      }

      let refundGivenNow = 0;
      let refundWaived = false;

      if (rawPending >= 0) {
        bill.pendingAmount = rawPending;
        bill.refundDue = 0;
      } else {
        const overpayment = -rawPending;
        const requestedRefund = manualRefund != null ? Math.max(manualRefund, 0) : 0;

        if (requestedRefund <= 0 && !waiveRefund) {
          throw ApiError.badRequest(
            `This return results in an overpayment of ₹${overpayment.toFixed(2)}. Enter a refund amount or choose "No Refund" before confirming.`
          );
        }

        refundGivenNow = Math.min(requestedRefund, overpayment);
        const leftover = Math.round((overpayment - refundGivenNow) * 100) / 100;

        if (leftover > 0 && !waiveRefund) {
          bill.pendingAmount = 0;
          bill.refundDue = leftover;
        } else {
          bill.pendingAmount = 0;
          bill.refundDue = 0;
          refundWaived = leftover > 0;
        }

        if (refundGivenNow > 0) {
          pushPaymentEvent(bill, { type: 'REFUND', amount: refundGivenNow, performedBy, note: 'Refund on early return' });
          if (bill.customer) {
            await Customer.findByIdAndUpdate(bill.customer, { $inc: { totalPurchases: -refundGivenNow } }, { session });
          }
        }
      }

      bill.paymentStatus = bill.refundDue > 0 || refundGivenNow > 0 || refundWaived || remainingWaived
        ? 'PAID'
        : derivePaymentStatus(bill.amountPaid, bill.grandTotal);

      bill.returnHistory.push({
        returnedAt: now,
        items: returnedLines,
        amountPaidNow: amountPaid || 0,
        refundGivenNow,
        refundWaived,
        overdueAmount: Math.round(overdueAmountTotal * 100) / 100,
        waived: !!waiveOverdue && overdueAmountTotal > 0,
        discountAdjustment,
        remainingWaived,
        remainingWaivedAmount,
      });

      await bill.save({ session });
    });
    return bill;
  } finally {
    session.endSession();
  }
}
async function recordPayment(id, amount, paymentMethod, waiveRemaining, performedBy) {
  const bill = await Bill.findById(id);
  if (!bill) throw ApiError.notFound('Bill not found');

  const amt = amount || 0;
  if (amt < 0) throw ApiError.badRequest('Payment amount cannot be negative');
  if (amt <= 0 && !waiveRemaining) {
    throw ApiError.badRequest('Payment amount must be greater than zero');
  }

  const validMethods = ['CASH', 'UPI', 'CHEQUE'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    throw ApiError.badRequest(`Invalid payment method: ${paymentMethod}`);
  }

  let remainingWaived = false;

  if (bill.returnDateUnknown) {
    const { liveGrandTotal } = computeLiveTotals(bill);
    const projectedPaid = bill.amountPaid + amt;

    if (projectedPaid > liveGrandTotal && !waiveRemaining) {
      throw ApiError.badRequest(
        `Payment would push paid amount (₹${projectedPaid.toFixed(2)}) above the current total (₹${liveGrandTotal.toFixed(2)}).`
      );
    }

    bill.amountPaid = projectedPaid;
    let rawPending = liveGrandTotal - bill.amountPaid;

    if (rawPending > 0 && waiveRemaining) {
      bill.discount = Math.round((bill.discount + rawPending) * 100) / 100;
      rawPending = 0;
      remainingWaived = true;
    }

    bill.pendingAmount = Math.max(rawPending, 0);
    bill.paymentStatus = remainingWaived ? 'PAID' : derivePaymentStatus(bill.amountPaid, liveGrandTotal);
  } else {
    const projectedPaid = bill.amountPaid + amt;

    if (projectedPaid > bill.grandTotal && !waiveRemaining) {
      throw ApiError.badRequest(
        `Payment would push paid amount (₹${projectedPaid.toFixed(2)}) above the total (₹${bill.grandTotal.toFixed(2)}).`
      );
    }

    bill.amountPaid = projectedPaid;
    let rawPending = bill.grandTotal - bill.amountPaid;

    if (rawPending > 0 && waiveRemaining) {
      bill.discount = Math.round((bill.discount + rawPending) * 100) / 100;
      bill.grandTotal = Math.max(bill.subTotal - bill.discount, 0);
      rawPending = bill.grandTotal - bill.amountPaid; // ~0
      remainingWaived = true;
    }

    bill.pendingAmount = Math.max(rawPending, 0);
    bill.paymentStatus = remainingWaived ? 'PAID' : derivePaymentStatus(bill.amountPaid, bill.grandTotal);
  }

  pushPaymentEvent(bill, { type: 'PAYMENT', amount: amt, method: paymentMethod, performedBy, note: 'Settled payment' });
  await bill.save();
  return bill;
}

async function getBillAlertBuckets(now = new Date()) {
  const alertProducts = await Product.find(
    { isActive: true, alertEnabled: true, alertDays: { $ne: null } },
    'name alertDays'
  );
  if (alertProducts.length === 0) return { today: [], previous: [], incoming: [] };

  const alertDaysByProduct = new Map(alertProducts.map((p) => [p._id.toString(), p.alertDays]));
  const productIds = alertProducts.map((p) => p._id);

  const bills = await Bill.find({
    status: { $in: ['BORROWED', 'PARTIALLY_RETURNED'] },
    'items.product': { $in: productIds },
  }).populate('site', 'name address');

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const today = [];
  const previous = [];
  const incoming = [];

  for (const bill of bills) {               // ← restored outer loop
    for (const item of bill.items) {
      const alertDays = alertDaysByProduct.get(item.product.toString());
      if (alertDays == null) continue;

      const outstanding = item.quantity - item.quantityReturned;
      if (outstanding <= 0) continue;

      const takenDate = bill.createdAt;
      const computedDueDate = addDays(takenDate, alertDays);
      const dueDate = item.alertDueDateOverride || computedDueDate;

      const entry = {
        billId: bill._id,
        billNumber: bill.billNumber,
        productId: item.product,
        customer: bill.customer,
        customerName: bill.customerName,
        customerPhone: bill.customerPhone,
        siteAddress: bill.site?.address || bill.siteAddress,
        productName: item.name,
        quantityOutstanding: outstanding,
        dueDate,
        dueDateEdited: !!item.alertDueDateOverride,
        daysOverdue: Math.max(Math.round((todayStart - startOfDay(dueDate)) / 86400000), 0),
        acknowledged: !!item.alertAcknowledgedAt,
      };

      if (dueDate < todayStart) previous.push(entry);
      else if (dueDate >= todayStart && dueDate <= todayEnd) today.push(entry);
      else incoming.push(entry);
    }
  }                                          // ← closes outer loop

  today.sort((a, b) => a.dueDate - b.dueDate);
  previous.sort((a, b) => b.daysOverdue - a.daysOverdue);
  incoming.sort((a, b) => a.dueDate - b.dueDate);

  return { today, previous, incoming };
}
async function acknowledgeBillAlert(billId, productId) {
  const bill = await Bill.findById(billId);
  if (!bill) throw ApiError.notFound('Bill not found');

  const item = bill.items.find((i) => i.product.toString() === productId);
  if (!item) throw ApiError.notFound('Item not found on this bill');

  item.alertAcknowledgedAt = new Date();
  await bill.save();
  return bill;
}

function resolveEffectiveRate(product, quantity) {
  if (product.qtyRateEnabled && Array.isArray(product.qtyRates) && product.qtyRates.length > 0) {
    const applicable = product.qtyRates
      .filter((t) => quantity >= t.minQty)
      .sort((a, b) => b.minQty - a.minQty)[0];
    if (applicable) return applicable.rate;
  }
  return product.perDayRate;
}

async function updateAlertDueDate(billId, productId, dueDate) {
  const bill = await Bill.findById(billId);
  if (!bill) throw ApiError.notFound('Bill not found');

  const item = bill.items.find((i) => i.product.toString() === productId);
  if (!item) throw ApiError.notFound('Item not found on this bill');

  if (dueDate == null) {
    item.alertDueDateOverride = null;
  } else {
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) throw ApiError.badRequest('Invalid due date');
    item.alertDueDateOverride = parsed;
  }
  item.alertAcknowledgedAt = null;

  await bill.save();
  return bill;
}


/** Ledger-style matrix: one row per non-cancelled bill, one column per
 *  active product, cell = quantity originally taken (baseQuantity, not
 *  reduced by returns — this is a log of everything ever borrowed, like
 *  a paper register). No pagination or filters, matching the paper-ledger
 *  format this is modeled on. */
async function getStockMatrix() {
  const [products, bills] = await Promise.all([
    Product.find({ isActive: true }).sort('name').select('name'),
    Bill.find({ status: { $ne: 'CANCELLED' } })
      .sort('createdAt')
      .select('billNumber customerName createdAt returnDate returnDateUnknown productWiseMode items'),
  ]);

  const rows = bills.map((bill) => {
    const quantities = {};
    for (const item of bill.items) {
      const pid = item.product.toString();
      quantities[pid] = (quantities[pid] || 0) + item.baseQuantity;
    }

    let returnDate = null;
    if (bill.productWiseMode) {
      // Per-item return dates — show the earliest one set, if any, as a hint.
      const dates = bill.items
        .filter((i) => i.billingMode === 'DAILY' && i.returnDate)
        .map((i) => new Date(i.returnDate).getTime());
      returnDate = dates.length ? new Date(Math.min(...dates)) : null;
    } else if (!bill.returnDateUnknown && bill.returnDate) {
      returnDate = bill.returnDate;
    }

    return {
      billId: bill._id,
      billNumber: bill.billNumber,
      customerName: bill.customerName,
      borrowedDate: bill.createdAt,
      returnDate,
      quantities,
    };
  });

  return {
    products: products.map((p) => ({ _id: p._id, name: p.name })),
    rows,
  };
}

module.exports = {
  createBill, listBills, getBill, cancelBill, recordReturn, recordPayment, isBillOverdue,
  computeLiveTotals, getBillAlertBuckets, acknowledgeBillAlert, updateAlertDueDate,
  getStockMatrix,
};