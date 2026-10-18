import type {
  ErrorRequestHandler,
  Request,
  Response,
  NextFunction,
} from 'express';

import { logger } from '../lib/logger';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public expose = true,
  ) {
    super(message);
    this.name = 'HttpError';
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

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  next(new HttpError(404, 'Route not found'));
};

type ErrorBody = { error: string; message: string };

const DEFAULT_ERROR: ErrorBody = {
  error: 'Internal server error',
  message: 'Something went wrong. Please try again later.',
};

const ERROR_BODIES: Record<number, ErrorBody> = {
  400: {
    error: 'Validation failed',
    message: 'Please check your request and try again.',
  },
  401: {
    error: 'Unauthorized',
    message: 'Authentication is required.',
  },
  403: {
    error: 'Forbidden',
    message: 'You do not have permission to perform this action.',
  },
  404: {
    error: 'Route not found',
    message: 'The requested route could not be found.',
  },
  406: {
    error: 'Not acceptable',
    message: 'The requested response format is not supported.',
  },
  413: {
    error: 'Payload too large',
    message: 'Your request is too large. Please reduce the content and try again.',
  },
  429: {
    error: 'Too many requests',
    message: 'Please try again later.',
  },
  502: {
    error: 'Bad gateway',
    message: 'The upstream service failed. Please try again later.',
  },
  504: {
    error: 'Gateway timeout',
    message: 'The upstream service timed out. Please try again later.',
  },
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  _next,
) => {
  const requestLogger = (req as any).log ?? logger;

  const isHttpError = error instanceof HttpError;
  const isBodyTooLarge =
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large';

  const isInvalidJson = error instanceof SyntaxError && 'body' in error;

  const statusCode = isHttpError
    ? error.statusCode
    : isBodyTooLarge
      ? 413
      : isInvalidJson
        ? 400
        : 500;

  requestLogger[statusCode >= 500 ? 'error' : 'warn'](
    {
      err: error,
      request: {
        method: req.method,
        url: req.originalUrl,
        requestId: (req as any).id,
      },
    },
    'Request error handled',
  );


  const response: ErrorBody = { ...(ERROR_BODIES[statusCode] ?? DEFAULT_ERROR) };

 
  if (isHttpError && error.expose) {
    response.message = error.message;
  }

  return res.status(statusCode).json({
    status: 'error',
    ...response,
  });
};