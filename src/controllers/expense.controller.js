// src/controllers/expense.controller.js
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const expenseService = require('../services/expense.service');

const createExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.createExpense(req.body, req.user._id);
  new ApiResponse(201, expense, 'Expense added').send(res);
});

const listExpenses = asyncHandler(async (req, res) => {
  const { search, category, fromDate, toDate, page, limit } = req.query;
  const { items, total, totalAmount, page: currentPage, totalPages } = await expenseService.listExpenses({
    search,
    category,
    fromDate,
    toDate,
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    message: 'Expenses fetched',
    data: items,
    total,
    totalAmount,
    page: currentPage,
    totalPages,
  });
});

const getExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.getExpense(req.params.id);
  new ApiResponse(200, expense).send(res);
});

module.exports = { createExpense, listExpenses, getExpense };