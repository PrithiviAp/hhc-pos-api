const User = require('../models/User');
const { encrypt } = require('../utils/crypto.util');

async function create({ name, username, password, role, isActive }) {
  const passwordHash = await User.hashPassword(password);
  const passwordEncrypted = encrypt(password);
  return User.create({ name, username, passwordHash, passwordEncrypted, role, isActive });
}

async function list() {
  return User.find().select('+passwordEncrypted').sort({ createdAt: -1 });
}

async function updateById(id, updates) {
  delete updates.username; // username is never editable after creation
  if (updates.password) {
    updates.passwordHash = await User.hashPassword(updates.password);
    updates.passwordEncrypted = encrypt(updates.password);
    delete updates.password;
  }
  return User.findByIdAndUpdate(id, updates, { new: true }).select('+passwordEncrypted');
}

async function deleteById(id) {
  return User.findByIdAndDelete(id);
}


const findByUsername = (username) =>
  User.findOne({ username: username.toLowerCase() }).select('+passwordHash');

const findById = (id) => User.findById(id);

const updateLastLogin = (id) => User.findByIdAndUpdate(id, { lastLoginAt: new Date() });

module.exports = { findByUsername, findById, updateLastLogin, create, list, updateById, deleteById };
