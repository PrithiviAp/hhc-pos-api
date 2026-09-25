require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  mongoUri:process.env.MONGODB_URI || 'mongodb+srv://prithivi:Prithiviap3022%40@cluster0.yyj5ttn.mongodb.net/hhc_pos',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',

  seedAdmin: {
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'Welcome@123',
    name: process.env.SEED_ADMIN_NAME || 'Hariharasudhan',
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
