const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/category.service');

const list = asyncHandler(async (_req, res) => new ApiResponse(200, await service.list()).send(res));
const create = asyncHandler(async (req, res) => new ApiResponse(201, await service.create(req.body), 'Category created').send(res));
const update = asyncHandler(async (req, res) => new ApiResponse(200, await service.update(req.params.id, req.body), 'Category updated').send(res));
const remove = asyncHandler(async (req, res) => new ApiResponse(200, await service.remove(req.params.id), 'Category removed').send(res));

module.exports = { list, create, update, remove };
