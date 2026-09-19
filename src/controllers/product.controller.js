const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const productService = require('../services/product.service');

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await productService.listProducts(req.query);
  new ApiResponse(200, items, 'Products fetched', meta).send(res);
});

const getOne = asyncHandler(async (req, res) => {
  const product = await productService.getProduct(req.params.id);
  new ApiResponse(200, product).send(res);
});

const create = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body, req.user._id);
  new ApiResponse(201, product, 'Product created').send(res);
});

// POST /products/bulk  body: { "products": [ {...}, {...} ] }
// Partial success is allowed: rows that fail validation are reported back
// individually instead of rejecting the whole batch.
const bulkCreate = asyncHandler(async (req, res) => {
  const result = await productService.bulkCreateProducts(req.body.products, req.user._id);
  const status = result.failed.length > 0 ? 207 : 201; // 207 Multi-Status when some rows failed
  const message = `Bulk upload processed: ${result.created.length} created, ${result.failed.length} failed`;
  new ApiResponse(status, result, message).send(res);
});

const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body, req.user._id);
  new ApiResponse(200, product, 'Product updated').send(res);
});

const remove = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  new ApiResponse(200, null, 'Product deleted').send(res);
});

const history = asyncHandler(async (req, res) => {
  const entries = await productService.getProductHistory(req.params.id);
  new ApiResponse(200, entries).send(res);
});

const alerts = asyncHandler(async (req, res) => {
  const buckets = await productService.getAlertBuckets();
  new ApiResponse(200, buckets).send(res);
});

module.exports = { list, getOne, create, bulkCreate, update, remove, history, alerts };