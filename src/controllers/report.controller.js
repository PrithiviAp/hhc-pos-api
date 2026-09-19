const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/report.service');

const summary = asyncHandler(async (req, res) => new ApiResponse(200, await service.salesSummary(req.query)).send(res));
const byDay = asyncHandler(async (req, res) => new ApiResponse(200, await service.salesByDay(req.query)).send(res));
const topProducts = asyncHandler(async (req, res) => new ApiResponse(200, await service.topProducts(req.query)).send(res));
const dashboard = asyncHandler(async (_req, res) => new ApiResponse(200, await service.dashboardStats()).send(res));

const incomeTrend = asyncHandler(async (req, res) =>
  new ApiResponse(200, await service.incomeTrend(req.query)).send(res));
const topBorrowedProducts = asyncHandler(async (req, res) =>
  new ApiResponse(200, await service.topBorrowedProducts(req.query)).send(res));
const topCustomers = asyncHandler(async (req, res) =>
  new ApiResponse(200, await service.topCustomers(req.query)).send(res));

const salesReport = asyncHandler(async (req, res) => {
  const { items, meta } = await service.salesReport(req.query);
  new ApiResponse(200, items, 'Sales report fetched', meta).send(res);
});
const productsReport = asyncHandler(async (req, res) => {
  const { items, meta } = await service.productsReport(req.query);
  new ApiResponse(200, items, 'Products report fetched', meta).send(res);
});
const pendingReport = asyncHandler(async (req, res) => {
  const { items, meta } = await service.pendingReport(req.query);
  new ApiResponse(200, items, 'Pending report fetched', meta).send(res);
});
const billsReport = asyncHandler(async (req, res) => {
  const { items, meta } = await service.billsReport(req.query);
  new ApiResponse(200, items, 'Bills report fetched', meta).send(res);
});

const expensesReport = asyncHandler(async (req, res) => {
  const { items, meta } = await service.expensesReport(req.query);
  new ApiResponse(200, items, 'Expenses report fetched', meta).send(res);
});

const paymentMethodsReport = asyncHandler(async (req, res) => {
  const { items, meta } = await service.paymentMethodsReport(req.query);
  new ApiResponse(200, items, 'Payment methods report fetched', meta).send(res);
});


module.exports = {
  summary, byDay, topProducts, dashboard, incomeTrend, topBorrowedProducts, topCustomers,
  salesReport, productsReport, pendingReport, billsReport,
  expensesReport,paymentMethodsReport // add
};