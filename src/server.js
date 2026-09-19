const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const { initSocket } = require('./utils/socket');   // add this

async function bootstrap() {
  try {
    await connectDB();
    const server = app.listen(env.port, () => {
      logger.info(`HHC POS API running on port ${env.port} [${env.nodeEnv}]`);
    });

    initSocket(server);   // add this — attaches socket.io to the same HTTP server

    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

bootstrap();