/**
 * Chat Controller
 * Handles HTTP request/response for chat and session functionality.
 * Business logic delegated to services.
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError, ErrorCodes } from '../../../shared';
import {
  validateMessage,
  validateSessionId,
  isOpenAIConfigured,
  sendMessage,
  isSessionLimitError,
  isError,
  getChatHistory as getChatHistoryService,
  createSession as createSessionService,
  getUserSessions as getUserSessionsService,
  getSessionById as getSessionByIdService,
  deleteSession as deleteSessionService,
} from '../services';

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new chat session for the current user
 */
export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  const result = await createSessionService(userId);

  if (isSessionLimitError(result)) {
    return res.status(429).json(result);
  }

  return res.json(result);
});

/**
 * Get all sessions for the current user
 */
export const getSessions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  const sessions = await getUserSessionsService(userId);
  return res.json({ sessions });
});

/**
 * Get a specific session by ID
 */
export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!sessionId || !validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const session = await getSessionByIdService(userId, sessionId);

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

  if (!sessionId || !validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const deleted = await deleteSessionService(userId, sessionId);

  if (!deleted) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Session not found');
  }

  return res.json({ message: 'Session deleted successfully' });
});

// ============================================================================
// Chat Operations
// ============================================================================

/**
 * Send a message to the AI and get a response
 */
export const sendChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  const userId = req.userId;

  // Validate message
  const messageValidation = validateMessage(message);
  if (!messageValidation.valid) {
    const statusCode = messageValidation.error === 'Message too long' ? 413 : 400;
    const code = statusCode === 413 ? ErrorCodes.PAYLOAD_TOO_LARGE : ErrorCodes.VALIDATION_ERROR;
    throw new AppError(code, statusCode, messageValidation.error!);
  }

  // Validate user authentication
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  // Validate session ID
  if (!validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  // Check OpenAI configuration
  if (!isOpenAIConfigured()) {
    console.error('OPENAI_API_KEY is missing');
    throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 500, 'Server misconfiguration: API Key missing');
  }

  const result = await sendMessage(userId, sessionId, message);

  // Handle session limit error
  if (isSessionLimitError(result)) {
    return res.status(429).json(result);
  }

  // Handle general error
  if (isError(result)) {
    return res.status(500).json(result);
  }

  return res.json(result);
});

/**
 * Get chat history for a session
 */
export const getChatHistory = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  if (!validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const history = await getChatHistoryService(userId, sessionId);
  return res.json(history);
});
