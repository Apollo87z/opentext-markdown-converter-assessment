import { randomUUID } from 'node:crypto';
import pino from 'pino';

import { config } from '../config';

const isProduction = config.env === 'production';

const transport = isProduction
  ? undefined
  : pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });

export const logger = pino(
  {
    level: config.logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      req: (req: any) => ({
        id: req.id,
        method: req.method,
        url: req.originalUrl || req.url,
        route: req.route?.path,
        remoteAddress: req.socket?.remoteAddress,
        userAgent: req.headers?.['user-agent'],
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
    },
  },
  transport,
);

const redactHeaders = (headers: Record<string, any> = {}) => {
  const redacted: Record<string, any> = { ...headers };

  const sensitiveKeys = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'api-key',
    'apikey',
  ];

  for (const key of sensitiveKeys) {
    if (Object.prototype.hasOwnProperty.call(redacted, key)) {
      redacted[key] = '[REDACTED]';
    }
  }

  return redacted;
};

export const requestLogger = (req: any, res: any, next: () => void) => {
  const requestId = req.get?.('x-request-id') ?? randomUUID();
  const startedAt = Date.now();

  req.id = requestId;
  const childLogger = logger.child({
    requestId,
    request: {
      method: req.method,
      url: req.originalUrl || req.url,
      route: req.route?.path,
      remoteAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      headers: redactHeaders(req.headers),
    },
  });

  req.log = childLogger;
  res.locals.logger = childLogger;

  childLogger.info({ event: 'request_started' }, 'Request started');

  res.on('finish', () => {
    childLogger.info(
      {
        event: 'request_completed',
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'Request completed',
    );
  });

  next();
};
