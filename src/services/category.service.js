const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');

const list = () => Category.find({ isActive: true }).sort('name');
const create = (data) => Category.create(data);
const update = async (id, data) => {
  const cat = await Category.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!cat) throw ApiError.notFound('Category not found');
  return cat;
};
const remove = async (id) => {
  const cat = await Category.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!cat) throw ApiError.notFound('Category not found');
  return cat;
};

module.exports = { list, create, update, remove };
