import type {
  ErrorRequestHandler,
  Request,
  Response,
  NextFunction,
} from 'express';

import { logger } from '../lib/logger';

export class HttpError extends Error {
  statusCode: number;
  expose: boolean;

  constructor(
    statusCode: number,
    message: string,
    options: { expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.expose = options.expose ?? true;
  }
}

export const asyncHandler =
  (
    handler: (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => Promise<unknown> | unknown,
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

const isValidationError = (error: unknown): boolean => {
  if (error instanceof HttpError && error.statusCode === 400) {
    return true;
  }

  if (error instanceof Error) {
    return (
      error.name === 'ValidationError' ||
      /validation failed/i.test(error.message) ||
      /required/i.test(error.message) ||
      /invalid.*(body|payload|request)/i.test(error.message)
    );
  }

  return false;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

const getStatusCode = (error: unknown): number => {
  if (error instanceof HttpError) return error.statusCode;
  if (error instanceof SyntaxError && 'body' in error) return 400;
  if (isValidationError(error)) return 400;

  return 500;
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  next(new HttpError(404, 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
) => {
  const requestLogger = (req as any).log ?? logger;
  const statusCode = getStatusCode(error);

  // Keep technical details in server logs, never in API responses.
  const logContext = {
    err: error,
    request: {
      method: req.method,
      url: req.originalUrl,
      route: req.route?.path,
      requestId: (req as any).id,
    },
  };

  if (statusCode >= 500) {
    requestLogger.error(
      logContext,
      error instanceof HttpError
        ? 'HTTP error handled'
        : 'Unhandled server error',
    );
  } else {
    requestLogger.warn(logContext, 'Request error handled');
  }

  const exposedMessage =
    error instanceof HttpError && error.expose
      ? error.message
      : undefined;

  const safeError =
    statusCode === 404 ? 'Route not found'
    : statusCode === 400 ? 'Validation failed'
    : statusCode === 401 ? 'Unauthorized'
    : statusCode === 403 ? 'Forbidden'
    : statusCode === 406 ? 'Not acceptable'
    : statusCode === 429 ? 'Too many requests'
    : statusCode === 502 ? 'Bad gateway'
    : 'Internal server error';

  const safeMessage =
    exposedMessage ??
    (statusCode === 404 ? 'The requested route could not be found.'
      : statusCode === 400 ? getErrorMessage(error, 'Please check your request and try again.')
      : statusCode === 401 ? 'Please sign in to access this resource.'
      : statusCode === 403 ? 'You do not have permission to perform this action.'
      : statusCode === 429 ? 'Too many requests. Please try again later.'
      : 'Something went wrong. Please try again later.');

  return res.status(statusCode).json({
    status: 'error',
    error: safeError, // CHANGED: this field was missing before
    message: safeMessage,
  });
};