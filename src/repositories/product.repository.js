const Product = require('../models/Product');
const ProductHistory = require('../models/ProductHistory');

// const create = (data) => Product.create(data);

// const findById = (id) => Product.findById(id).populate('category', 'name nameTa');

// const findMany = ({ filter, skip, limit, sort = '-createdAt' }) =>
//   Product.find(filter).populate('category', 'name nameTa').sort(sort).skip(skip).limit(limit);

// const count = (filter) => Product.countDocuments(filter);

// const update = (id, data) => Product.findByIdAndUpdate(id, data, { new: true, runValidators: true });

// const softDelete = (id) => Product.findByIdAndUpdate(id, { isActive: false }, { new: true });

// const addHistory = (entry) => ProductHistory.create(entry);

// const listHistory = (productId) =>
//   ProductHistory.find({ product: productId }).populate('performedBy', 'name username').sort('-createdAt');

// module.exports = { create, findById, findMany, count, update, softDelete, addHistory, listHistory };

const create = async (data) => {
  const doc = await Product.create(data);
  return doc.populate('category', 'name nameTa');
};

const findById = (id) => Product.findById(id).populate('category', 'name nameTa');

const findMany = ({ filter, skip, limit, sort = '-createdAt' }) =>
  Product.find(filter).populate('category', 'name nameTa').sort(sort).skip(skip).limit(limit);

const count = (filter) => Product.countDocuments(filter);

const update = (id, data) =>
  Product.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('category', 'name nameTa');

const softDelete = (id) => Product.findByIdAndUpdate(id, { isActive: false }, { new: true });

const addHistory = (entry) => ProductHistory.create(entry);

const listHistory = (productId) =>
  ProductHistory.find({ product: productId }).populate('performedBy', 'name username').sort('-createdAt');

module.exports = { create, findById, findMany, count, update, softDelete, addHistory, listHistory };