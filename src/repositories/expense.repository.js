// src/repositories/expense.repository.js
const Expense = require('../models/Expense');
const { EXPENSE_CATEGORIES } = require('../models/Expense');
function create(data) {
  return Expense.create(data).then((doc) => doc.populate('createdBy', 'name'));
}

async function findAndCount({ search, category, fromDate, toDate, page = 1, limit = 20 }) {
  const filter = {};
  if (category) filter.category = category;

  if (search) {
    const orClauses = [
      { description: { $regex: search, $options: 'i' } },
      { categoryLabel: { $regex: search, $options: 'i' } },
    ];

    // also match if the search term is (a prefix of) a category enum value,
    // e.g. "water" -> WATER, "fuel" -> FUEL
    const matchedCategories = EXPENSE_CATEGORIES.filter((c) =>
      c.toLowerCase().includes(search.toLowerCase())
    );
    if (matchedCategories.length) {
      orClauses.push({ category: { $in: matchedCategories } });
    }

    filter.$or = orClauses;
  }

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const skip = (page - 1) * limit;

  const [items, total, totalAmountAgg] = await Promise.all([
    Expense.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Expense.countDocuments(filter),
    Expense.aggregate([{ $match: filter }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
  ]);

  return { items, total, totalAmount: totalAmountAgg[0]?.sum ?? 0 };
}

function findById(id) {
  return Expense.findById(id).populate('createdBy', 'name');
}

module.exports = { create, findAndCount, findById };