
import app from './app';
import { config } from './config';
import { logger } from './lib/logger';

const server = app.listen(config.port, () => {
    logger.info(
        { port: config.port, environment: config.env },
        'Server started',
    );
});

let shuttingDown = false;

const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received');

    const timeout = setTimeout(() => {
        logger.error('Graceful shutdown timed out');
        process.exit(1);
    }, 10_000);

    timeout.unref();

    server.close((error) => {
        clearTimeout(timeout);

        if (error) {
            logger.error({ error }, 'HTTP server shutdown failed');
            process.exitCode = 1;
            return;
        }

        logger.info('HTTP server closed');
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
