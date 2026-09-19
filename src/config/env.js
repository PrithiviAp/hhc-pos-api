require('dotenv').config();

/**
 * Centralised, validated environment configuration.
 * Every other module should read config from here instead of
 * touching process.env directly.
 */
const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hhc_pos',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',

  seedAdmin: {
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@123',
    name: process.env.SEED_ADMIN_NAME || 'Administrator',
  },
};

const requiredInProd = ['jwt.accessSecret', 'jwt.refreshSecret'];
if (env.nodeEnv === 'production') {
  for (const path of requiredInProd) {
    const value = path.split('.').reduce((acc, key) => acc?.[key], env);
    if (!value) {
      // eslint-disable-next-line no-console
      console.error(`Missing required env value: ${path}`);
      process.exit(1);
    }
  }
}

module.exports = env;
