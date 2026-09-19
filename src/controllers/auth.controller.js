const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const authService = require('../services/auth.service');
const env = require('../config/env');

const REFRESH_COOKIE = 'hhc_refresh_token';

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);

  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  new ApiResponse(200, { user, accessToken }, 'Login successful').send(res);
});

const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(REFRESH_COOKIE);
  new ApiResponse(200, null, 'Logged out').send(res);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.me(req.user._id);
  new ApiResponse(200, user).send(res);
});

module.exports = { login, logout, me };
