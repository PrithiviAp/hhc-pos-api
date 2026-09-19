const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const siteService = require('./site.service');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination.util');
const { computeLiveTotals } = require('./bill.service');

function refundedAmount(bill) {
  return (bill.returnHistory || []).reduce((sum, e) => sum + (e.refundGivenNow || 0), 0);
}

function derivePaymentStatus(amountPaid, grandTotal) {
  if (amountPaid <= 0) return 'UNPAID';
  if (amountPaid >= grandTotal) return 'PAID';
  return 'PARTIAL';
}

/** True while a bill's true cost is still a moving target — open-ended
 *  billing with no fixed return date, and not yet actually returned. */
function isLiveBill(bill) {
  return bill.returnDateUnknown && bill.status !== 'RETURNED';
}

/** What a single bill currently owes, right now — the live per-day total
 *  for open/unreturned bills, the stored figure otherwise. Mirrors the
 *  same distinction bill-history.html already draws in the UI. */
function owedAmount(bill) {
  return isLiveBill(bill) ? computeLiveTotals(bill).livePendingAmount : bill.pendingAmount;
}

async function list(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = { isActive: true };
  if (query.search) {
    filter.$or = [
      { name: new RegExp(query.search, 'i') },
      { phone: new RegExp(query.search, 'i') },
    ];
  }

  const [customers, total] = await Promise.all([
    Customer.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);

  const customerIds = customers.map((c) => c._id);
  // Live/open-ended totals need day-based math per bill, not a pure Mongo
  // aggregation — same reason bill.service.js#listBills falls back to a
  // JS-side pass for pendingOnly/overdueOnly.
  const bills = await Bill.find({ customer: { $in: customerIds }, status: { $ne: 'CANCELLED' } });

const statsMap = new Map();
for (const bill of bills) {
  const key = String(bill.customer);
  const entry = statsMap.get(key) ?? { pendingAmount: 0, totalRefunded: 0, totalPurchases: 0 };
  entry.pendingAmount += owedAmount(bill);
  entry.totalRefunded += refundedAmount(bill);
  entry.totalPurchases += purchasedAmount(bill); // ADD
  statsMap.set(key, entry);
}

const items = customers.map((c) => {
  const stats = statsMap.get(String(c._id));
  return {
    ...c.toObject(),
    pendingAmount: Math.round((stats?.pendingAmount ?? 0) * 100) / 100,
    totalRefunded: Math.round((stats?.totalRefunded ?? 0) * 100) / 100,
    totalPurchases: Math.round((stats?.totalPurchases ?? 0) * 100) / 100, // ADD — overrides stored field
  };
});
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function getById(id) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

async function create(payload) {
  return Customer.create(payload);
}

async function update(id, payload) {
  const customer = await Customer.findByIdAndUpdate(id, payload, { new: true });
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

async function remove(id) {
  const customer = await Customer.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

async function getHistory(id) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const bills = await Bill.find({ customer: id, status: { $ne: 'CANCELLED' } })
    .populate('site', 'name address')
    .sort('-createdAt');

  const billsWithRefund = bills.map((b) => {
    const live = isLiveBill(b) ? computeLiveTotals(b) : null;
    return {
      ...b.toObject(),
      refundedAmount: refundedAmount(b),
      liveGrandTotal: live?.liveGrandTotal,
      livePendingAmount: live?.livePendingAmount,
    };
  });

  const totalPendingAmount = billsWithRefund.reduce(
    (sum, b) => sum + (b.livePendingAmount ?? b.pendingAmount), 0
  );
  const totalRefunded = billsWithRefund.reduce((sum, b) => sum + b.refundedAmount, 0);

  // ADD: net amount actually collected across these bills
  const totalPurchases = billsWithRefund.reduce((sum, b) => sum + purchasedAmount(b), 0);

  const pendingItemsMap = new Map();
  for (const bill of bills) {
    for (const item of bill.items) {
      const outstanding = item.quantity - item.quantityReturned;
      if (outstanding > 0) {
        const key = item.product.toString();
        const existing = pendingItemsMap.get(key);
        pendingItemsMap.set(key, {
          product: item.product,
          name: item.name,
          quantityPending: (existing?.quantityPending ?? 0) + outstanding,
        });
      }
    }
  }

  const sites = await siteService.listSitesForCustomer(id);

  // CHANGED: override stored totalPurchases with the live-computed value
  return {
    customer: { ...customer.toObject(), totalPurchases: Math.round(totalPurchases * 100) / 100 },
    bills: billsWithRefund,
    totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
    totalRefunded: Math.round(totalRefunded * 100) / 100,
    pendingItems: Array.from(pendingItemsMap.values()),
    sites,
  };
}


function purchasedAmount(bill) {
  return bill.amountPaid - refundedAmount(bill);
}
/** Every bill that currently owes something, live-aware. Bills with
 *  owed <= 0 are dropped — nothing to distribute to them. */
function buildOwedList(bills) {
  const list = [];
  for (const bill of bills) {
    const live = isLiveBill(bill);
    const owed = live ? computeLiveTotals(bill).livePendingAmount : bill.pendingAmount;
    if (owed > 0) {
      list.push({
        bill, owed, isLive: live,
        liveGrandTotal: live ? computeLiveTotals(bill).liveGrandTotal : undefined,
      });
    }
  }
  return list;
}

/** Splits `amount` equally across every bill in `owedList`, capped at what
 *  each bill actually owes. A bill that hits its cap drops out and its
 *  unused share cascades to the bills still below theirs, round-robin,
 *  until the amount is exhausted or every bill is fully covered. */
function distributeEqually(amount, owedList) {
  const applied = new Map(owedList.map(({ bill }) => [bill._id.toString(), 0]));
  let remainingAmount = Math.round(amount * 100) / 100;
  let active = owedList.filter((o) => o.owed > 0);

  while (remainingAmount > 0.004 && active.length > 0) {
    const share = Math.round((remainingAmount / active.length) * 100) / 100;
    let distributedThisRound = 0;
    const nextActive = [];

    for (const entry of active) {
      const key = entry.bill._id.toString();
      const already = applied.get(key);
      const capacity = Math.round((entry.owed - already) * 100) / 100;
      const give = Math.min(share, capacity, Math.round((remainingAmount - distributedThisRound) * 100) / 100);

      if (give > 0) {
        applied.set(key, Math.round((already + give) * 100) / 100);
        distributedThisRound = Math.round((distributedThisRound + give) * 100) / 100;
      }
      if (Math.round((capacity - give) * 100) / 100 > 0.004) nextActive.push(entry);
    }

    remainingAmount = Math.round((remainingAmount - distributedThisRound) * 100) / 100;
    active = nextActive;
    if (distributedThisRound <= 0) break; // guards against rounding stalls
  }

  return applied;
}

async function payPending(id, amount, paymentMethod = 'CASH', refundGivenNow, waiveOverpayment) {
  if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');

  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const bills = await Bill.find({ customer: id, status: { $ne: 'CANCELLED' } }).sort('createdAt');
  const owedList = buildOwedList(bills);

  const totalPending = Math.round(owedList.reduce((sum, o) => sum + o.owed, 0) * 100) / 100;
  const overpayment = Math.round((amount - totalPending) * 100) / 100;

  let refundToGive = 0;
  let refundWaived = false;

  if (overpayment > 0) {
    const requestedRefund = refundGivenNow != null ? Math.max(refundGivenNow, 0) : 0;

    if (requestedRefund <= 0 && !waiveOverpayment) {
      throw ApiError.badRequest(
        `Amount received (₹${amount.toFixed(2)}) exceeds the pending total (₹${totalPending.toFixed(2)}) by ₹${overpayment.toFixed(2)}. Enter a refund amount or waive it before confirming.`
      );
    }

    refundToGive = Math.min(requestedRefund, overpayment);
    const leftover = Math.round((overpayment - refundToGive) * 100) / 100;
    refundWaived = leftover > 0 && !!waiveOverpayment;
  }

  const amountToDistribute = Math.min(amount, totalPending);
  const applied = distributeEqually(amountToDistribute, owedList);

  let billsUpdated = 0;
  for (const { bill, owed, liveGrandTotal, isLive } of owedList) {
    const appliedAmount = applied.get(bill._id.toString()) ?? 0;
    if (appliedAmount <= 0) continue;

    bill.amountPaid = Math.round((bill.amountPaid + appliedAmount) * 100) / 100;

    if (isLive) {
      // Same convention as bill.service.js#recordPayment for open bills:
      // store today's live pending as a snapshot; it recomputes fresh
      // again on the next fetch if the item is still out tomorrow.
      bill.pendingAmount = Math.max(Math.round((liveGrandTotal - bill.amountPaid) * 100) / 100, 0);
      bill.paymentStatus = derivePaymentStatus(bill.amountPaid, liveGrandTotal);
    } else {
      bill.pendingAmount = Math.max(Math.round((owed - appliedAmount) * 100) / 100, 0);
      bill.paymentStatus = bill.pendingAmount === 0 ? 'PAID' : 'PARTIAL';
    }

    bill.paymentHistory.push({
      type: 'PAYMENT',
      amount: appliedAmount,
      method: paymentMethod,
      note: 'Pending amount settled (split across bills)',
      createdAt: new Date(),
    });
    await bill.save();
    billsUpdated += 1;
  }

  if (refundToGive > 0 && bills.length > 0) {
    const refundBill = bills[bills.length - 1];
    refundBill.paymentHistory.push({
      type: 'REFUND',
      amount: refundToGive,
      method: paymentMethod,
      note: 'Refund on overpayment (pending settlement)',
      createdAt: new Date(),
    });
    await refundBill.save();
    customer.totalPurchases -= refundToGive;
    await customer.save();
  }

  const remainingPending = Math.max(Math.round((totalPending - amountToDistribute) * 100) / 100, 0);

  return {
    billsUpdated,
    amountApplied: amountToDistribute,
    remainingPending,              // add — how much of totalPending is still unpaid
    overpayment: overpayment > 0 ? overpayment : 0,
    refundGiven: refundToGive,
    refundWaived,
  };
}

async function settlePendingAcrossBills(customerId, {
  amount,
  paymentMethod = 'CASH',
  discountRemaining = false,
  returnAllProducts = false,
  refundGivenNow,
  waiveOverpayment,
}) {
  if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');

  const customer = await Customer.findById(customerId);
  if (!customer) throw ApiError.notFound('Customer not found');

  const bills = await Bill.find({
    customer: customerId,
    status: { $in: ['BORROWED', 'PARTIALLY_RETURNED'] },
  }).sort('createdAt');

  const owedList = buildOwedList(bills); // today's live-aware owed per bill
  const totalOwedToday = Math.round(owedList.reduce((s, o) => s + o.owed, 0) * 100) / 100;
  if (totalOwedToday <= 0) throw ApiError.badRequest('No pending amount to settle');

const shortfall = Math.round((totalOwedToday - amount) * 100) / 100;
const overpayment = shortfall < 0 ? -shortfall : 0;


if (shortfall > 0.004 && returnAllProducts && !discountRemaining) {
  throw ApiError.badRequest(
    `Amount received (₹${amount.toFixed(2)}) is ₹${shortfall.toFixed(2)} short of today's pending total (₹${totalOwedToday.toFixed(2)}). Choose "Discount remaining" to return everything, or lower "Return all products".`
  );
}
  if (overpayment > 0) {
    const requestedRefund = refundGivenNow != null ? Math.max(refundGivenNow, 0) : 0;
    if (requestedRefund <= 0 && !waiveOverpayment) {
      throw ApiError.badRequest(
        `Amount exceeds today's pending total by ₹${overpayment.toFixed(2)}. Enter a refund amount or waive it.`
      );
    }
  }

const discountApplied = (discountRemaining && shortfall > 0) ? shortfall : 0;
const discountPerBill = discountApplied > 0
  ? distributeEqually(discountApplied, owedList)
  : new Map(owedList.map(({ bill }) => [bill._id.toString(), 0]));

  const amountToDistribute = Math.min(amount, totalOwedToday);
  const paidPerBill = distributeEqually(amountToDistribute, owedList);

  let billsUpdated = 0;
  let billsReturned = 0;

  for (const entry of owedList) {
    const { bill, owed, isLive, liveGrandTotal } = entry;
    const key = bill._id.toString();
    const paidNow = paidPerBill.get(key) ?? 0;
    const discountNow = discountPerBill.get(key) ?? 0;

    if (paidNow > 0) {
      bill.amountPaid = Math.round((bill.amountPaid + paidNow) * 100) / 100;
      bill.paymentHistory.push({
        type: 'PAYMENT',
        amount: paidNow,
        method: paymentMethod,
        note: returnAllProducts ? 'Full settlement + return (split across bills)' : 'Pending settled (split across bills)',
        createdAt: new Date(),
      });
    }

    if (returnAllProducts) {
      const returnedItems = bill.items
        .filter((i) => i.quantityReturned < i.quantity)
        .map((i) => ({ product: i.product, name: i.name, quantity: i.quantity - i.quantityReturned }));
      for (const item of bill.items) item.quantityReturned = item.quantity;

      if (isLive && liveGrandTotal != null) {
        bill.grandTotal = liveGrandTotal; // freeze the accruing bill at today's value
      }
      bill.discount = Math.round(((bill.discount || 0) + discountNow) * 100) / 100;
      bill.pendingAmount = 0;
      bill.paymentStatus = 'PAID';
      bill.status = 'RETURNED';
      bill.returnedAt = new Date();

      bill.returnHistory.push({
        returnedAt: new Date(),
        items: returnedItems,
        amountPaidNow: paidNow,
        refundGivenNow: 0,
        refundWaived: false,
        overdueAmount: 0,
        waived: discountNow > 0,
        discountAdjustment: discountNow,
        remainingWaived: discountNow > 0,
        remainingWaivedAmount: discountNow,
      });
      billsReturned += 1;
    } else if (discountNow > 0) {
      // Discount-only path — items stay as-is. Live/OPEN bills are left
      // untouched so they recompute fresh tomorrow (that's the point).
      if (!isLive) {
        bill.discount = Math.round(((bill.discount || 0) + discountNow) * 100) / 100;
        bill.grandTotal = Math.max(Math.round((bill.grandTotal - discountNow) * 100) / 100, 0);
        bill.pendingAmount = Math.max(Math.round((owed - paidNow - discountNow) * 100) / 100, 0);
        bill.paymentStatus = bill.pendingAmount === 0 ? 'PAID' : 'PARTIAL';
      }
      bill.paymentHistory.push({
        type: 'PAYMENT',
        amount: 0,
        method: paymentMethod,
        note: `Discounted ₹${discountNow.toFixed(2)} for today only`,
        createdAt: new Date(),
      });
    } else if (paidNow > 0 && !isLive) {
      const remaining = Math.max(Math.round((owed - paidNow) * 100) / 100, 0);
      bill.pendingAmount = remaining;
      bill.paymentStatus = remaining === 0 ? 'PAID' : 'PARTIAL';
    }

    if (paidNow > 0 || discountNow > 0 || returnAllProducts) {
      await bill.save();
      billsUpdated += 1;
    }
  }

  let refundToGive = 0;
  if (overpayment > 0) {
    refundToGive = Math.min(refundGivenNow != null ? Math.max(refundGivenNow, 0) : 0, overpayment);
    if (refundToGive > 0 && bills.length > 0) {
      bills[bills.length - 1].paymentHistory.push({
        type: 'REFUND', amount: refundToGive, method: paymentMethod,
        note: 'Refund on overpayment (customer settlement)', createdAt: new Date(),
      });
      await bills[bills.length - 1].save();
    }
  }

  return { totalOwedToday, amountApplied: amountToDistribute, discountApplied, billsUpdated, billsReturned, overpayment, refundGiven: refundToGive };
}

module.exports = { list, getById, create, update, remove, getHistory, payPending, settlePendingAcrossBills };