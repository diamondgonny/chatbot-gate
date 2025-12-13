/**
 * Error Handler Middleware
 * Centralized error handling with AppError support.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

/**
 * Express error handling middleware.
 * Handles AppError instances with proper status codes and error codes.
 * Falls back to 500 for unknown errors.
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const errorId = Date.now().toString(36);

  // Log error with ID for correlation
  console.error(`[${errorId}]`, err);

  // Handle known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId: errorId,
    });
    return;
  }

  // Handle unknown errors (don't leak internal details)
  const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
  res.status(statusCode).json({
    error: 'Internal server error',
    requestId: errorId,
  });
};
