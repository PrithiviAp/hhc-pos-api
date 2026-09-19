const userRepository = require('../repositories/user.repository');
const { decrypt } = require('../utils/crypto.util');

function serialize(user) {
  const obj = user.toObject();
  obj.password = obj.passwordEncrypted ? decrypt(obj.passwordEncrypted) : null;
  delete obj.passwordEncrypted;
  delete obj.passwordHash;
  return obj;
}

async function listUsers(req, res, next) {
  try {
    const users = await userRepository.list();
    res.json({ success: true, statusCode: 200, message: 'Users fetched', data: users.map(serialize) });
  } catch (err) { next(err); }
}

async function createUser(req, res, next) {
  try {
    const user = await userRepository.create(req.body);
    res.status(201).json({ success: true, statusCode: 201, message: 'User created', data: serialize(user) });
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    const user = await userRepository.updateById(req.params.id, req.body);
    res.json({ success: true, statusCode: 200, message: 'User updated', data: serialize(user) });
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    await userRepository.deleteById(req.params.id);
    res.json({ success: true, statusCode: 200, message: 'User deleted' });
  } catch (err) { next(err); }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };