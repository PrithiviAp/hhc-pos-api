const ApiError = require('../utils/ApiError');
const { signAccessToken, signRefreshToken } = require('../utils/jwt.util');
const userRepository = require('../repositories/user.repository');

async function login({ username, password }) {
  const user = await userRepository.findByUsername(username);
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid username or password');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw ApiError.unauthorized('Invalid username or password');

  await userRepository.updateLastLogin(user._id);

  const payload = { sub: user._id.toString(), role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const safeUser = await userRepository.findById(user._id);
  return { user: safeUser, accessToken, refreshToken };
}

async function me(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

module.exports = { login, me };
