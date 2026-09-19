// src/services/expense.service.js
const ApiError = require('../utils/ApiError');
const expenseRepository = require('../repositories/expense.repository');

async function createExpense(payload, userId) {
  const { category, categoryLabel, description, amount } = payload;

  return expenseRepository.create({
    category,
    categoryLabel: category === 'OTHER' ? categoryLabel : undefined,
    description,
    amount,
    createdBy: userId,
  });
}

async function listExpenses({ search, category, fromDate, toDate, page, limit }) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Number(limit) || 20);

  const { items, total, totalAmount } = await expenseRepository.findAndCount({
    search,
    category,
    fromDate,
    toDate,
    page: pageNum,
    limit: limitNum,
  });

  return {
    items,
    total,
    totalAmount,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  };
}

async function getExpense(id) {
  const expense = await expenseRepository.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  return expense;
}

module.exports = { createExpense, listExpenses, getExpense };