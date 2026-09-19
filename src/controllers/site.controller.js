const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/site.service');

const create = asyncHandler(async (req, res) => {
  const site = await service.createSite({ ...req.body, createdBy: req.user._id });
  new ApiResponse(201, site, 'Site created').send(res);
});

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listSites(req.query);
  new ApiResponse(200, items, 'Sites fetched', meta).send(res);
});

const listForCustomer = asyncHandler(async (req, res) => {
  const rows = await service.listSitesForCustomer(req.params.customerId);
  new ApiResponse(200, rows).send(res);
});

const getOne = asyncHandler(async (req, res) => {
  new ApiResponse(200, await service.getSite(req.params.id)).send(res);
});

const update = asyncHandler(async (req, res) => {
  new ApiResponse(200, await service.updateSite(req.params.id, req.body), 'Site updated').send(res);
});

const remove = asyncHandler(async (req, res) => {
  new ApiResponse(200, await service.deleteSite(req.params.id), 'Site removed').send(res);
});

const getBills = asyncHandler(async (req, res) => {
  const { items, meta } = await service.getSiteBills(req.params.id, req.query);
  new ApiResponse(200, items, 'Site bills fetched', meta).send(res);
});

const getBillsExport = asyncHandler(async (req, res) => {
  const { items } = await service.getSiteBillsForExport(req.params.id, req.query);
  new ApiResponse(200, items, 'All matching site bills fetched').send(res);
});

module.exports = { create, list, listForCustomer, getOne, update, remove, getBills, getBillsExport };