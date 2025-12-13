/**
 * Session Controller
 * Handles HTTP request/response for session management.
 * Business logic delegated to sessionService.
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError, ErrorCodes } from '../../shared';
import * as sessionService from './session.service';

/**
 * Create a new chat session for the current user
 */
export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  const result = await sessionService.createSession(userId);

  if (sessionService.isSessionLimitError(result)) {
    return res.status(429).json(result);
  }

  return res.json(result);
});

/**
 * Get all sessions for the current user
 */
export const getUserSessions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  const sessions = await sessionService.getUserSessions(userId);
  return res.json({ sessions });
});

/**
 * Get a specific session by ID
 */
export const getSessionById = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!sessionId || !sessionService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const session = await sessionService.getSessionById(userId, sessionId);

  if (!session) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Session not found');
  }

  return res.json(session);
});

/**
 * Delete a session
 */
export const deleteSession = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!sessionId || !sessionService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const deleted = await sessionService.deleteSession(userId, sessionId);

  if (!deleted) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Session not found');
  }

  return res.json({ message: 'Session deleted successfully' });
});
