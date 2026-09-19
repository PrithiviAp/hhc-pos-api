const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/customer.service');
const Customer = require('../models/Customer');

const searchNames = asyncHandler(async (req, res) => {
  const q = req.query.q || '';
  const customers = await Customer.find({ isActive: true, name: new RegExp(q, 'i') })
    .select('name phone address').limit(10);
  new ApiResponse(200, customers).send(res);
});


const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query);
  new ApiResponse(200, items, 'Customers fetched', meta).send(res);
});
const getOne = asyncHandler(async (req, res) => new ApiResponse(200, await service.getById(req.params.id)).send(res));
const create = asyncHandler(async (req, res) => new ApiResponse(201, await service.create(req.body), 'Customer created').send(res));
const update = asyncHandler(async (req, res) => new ApiResponse(200, await service.update(req.params.id, req.body), 'Customer updated').send(res));
const remove = asyncHandler(async (req, res) => new ApiResponse(200, await service.remove(req.params.id), 'Customer removed').send(res));
const history = asyncHandler(async (req, res) => new ApiResponse(200, await service.getHistory(req.params.id)).send(res));
const payPending = asyncHandler(async (req, res) => {
  const result = await service.payPending(
    req.params.id,
    Number(req.body.amount),
    req.body.paymentMethod,
    req.body.refundGivenNow != null ? Number(req.body.refundGivenNow) : undefined,
    !!req.body.waiveOverpayment,
  );
  new ApiResponse(200, result, 'Payment recorded').send(res);
});
// customer.controller.js
const settlePending = asyncHandler(async (req, res) => {
  const result = await service.settlePendingAcrossBills(req.params.id, {
    amount: Number(req.body.amount),
    paymentMethod: req.body.paymentMethod,
    discountRemaining: !!req.body.discountRemaining,
    returnAllProducts: !!req.body.returnAllProducts,
    refundGivenNow: req.body.refundGivenNow != null ? Number(req.body.refundGivenNow) : undefined,
    waiveOverpayment: !!req.body.waiveOverpayment,
  });
  new ApiResponse(200, result, 'Pending settled').send(res);
});


module.exports = { list, getOne, create, update, remove, history, payPending, settlePending, searchNames };