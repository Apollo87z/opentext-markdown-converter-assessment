import app from './app';
import { config } from './config';
import { logger } from './lib/logger';

const server = app.listen(config.port, () => {
    logger.info({ port: config.port, environment: config.env }, 'Server started');
});

const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));