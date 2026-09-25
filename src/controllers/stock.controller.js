const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/stock.service');

const create = asyncHandler(async (req, res) => {
  const movement = await service.recordMovement({ ...req.body, performedBy: req.user._id });
  new ApiResponse(201, movement, 'Stock movement recorded').send(res);
});

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listMovements(req.query);
  new ApiResponse(200, items, 'Stock movements fetched', meta).send(res);
});

const summary = asyncHandler(async (req, res) => {
  const { items, meta, fromDate, toDate } = await service.getSummary(req.query);
  new ApiResponse(200, items, 'Stock summary fetched', { ...meta, fromDate, toDate }).send(res);
});
const drilldown = asyncHandler(async (req, res) => {
  const items = await service.getDrilldown(req.query);
  new ApiResponse(200, items, 'Stock drilldown fetched').send(res);
});
const categorySummary = asyncHandler(async (req, res) => {
  const data = await service.getCategorySummary(req.query);
  new ApiResponse(200, data, 'Category stock summary fetched').send(res);
});

module.exports = { create, list, summary, drilldown, categorySummary };