const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/bill.service');

const create = asyncHandler(async (req, res) => {
  const bill = await service.createBill({ ...req.body, createdBy: req.user._id });
  new ApiResponse(201, bill, 'Bill created').send(res);
});

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listBills(req.query);
  new ApiResponse(200, items, 'Bills fetched', meta).send(res);
});

const getOne = asyncHandler(async (req, res) => new ApiResponse(200, await service.getBill(req.params.id)).send(res));

const cancel = asyncHandler(async (req, res) => new ApiResponse(200, await service.cancelBill(req.params.id), 'Bill cancelled').send(res));

const returnItems = asyncHandler(async (req, res) => {
  const bill = await service.recordReturn(req.params.id, {
    items: req.body.items,
    amountPaid: req.body.amountPaid,
    refundGivenNow: req.body.refundGivenNow,
    paymentMethod: req.body.paymentMethod,
    waiveOverdue: !!req.body.waiveOverdue,
    waiveRefund: !!req.body.waiveRefund,
    waiveRemaining: !!req.body.waiveRemaining,
    performedBy: req.user._id,
  });
  new ApiResponse(200, bill, 'Return recorded').send(res);
});

const pay = asyncHandler(async (req, res) => {
  const bill = await service.recordPayment(
    req.params.id,
    req.body.amount,
    req.body.paymentMethod,
    !!req.body.waiveRemaining,
    req.user._id
  );
  new ApiResponse(200, bill, 'Payment recorded').send(res);
});

const alerts = asyncHandler(async (req, res) => {
  const buckets = await service.getBillAlertBuckets();
  new ApiResponse(200, buckets).send(res);
});
const acknowledgeAlert = asyncHandler(async (req, res) => {
  const bill = await service.acknowledgeBillAlert(req.params.id, req.body.product);
  new ApiResponse(200, bill, 'Alert marked as read').send(res);
});
const updateAlertDate = asyncHandler(async (req, res) => {
  const { product, dueDate } = req.body;
  if (!product) throw new (require('../utils/ApiError'))().badRequest?.('product is required') || null;
  const bill = await service.updateAlertDueDate(req.params.id, product, dueDate);
  new ApiResponse(200, bill, 'Alert date updated').send(res);
});

const matrix = asyncHandler(async (req, res) => {
  const data = await service.getStockMatrix();
  new ApiResponse(200, data, 'Stock matrix fetched').send(res);
});

const remove = asyncHandler(async (req, res) => {
  const bill = await service.deleteBill(req.params.id, req.user._id);
  new ApiResponse(200, bill, 'Bill deleted').send(res);
});


module.exports = { list, getOne, create, cancel, returnItems, pay, alerts, acknowledgeAlert, updateAlertDate,matrix,remove };