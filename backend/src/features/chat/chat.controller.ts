/**
 * Chat Controller
 * Handles HTTP request/response for chat functionality.
 * Business logic delegated to chatService.
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError, ErrorCodes } from '../../shared';
import * as chatService from './chat.service';

/**
 * Send a message to the AI and get a response
 */
export const chatWithAI = asyncHandler(async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;
  const userId = req.userId;

  // Validate message
  const messageValidation = chatService.validateMessage(message);
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
  if (!chatService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  // Check OpenAI configuration
  if (!chatService.isOpenAIConfigured()) {
    console.error('OPENAI_API_KEY is missing');
    throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 500, 'Server misconfiguration: API Key missing');
  }

  const result = await chatService.sendMessage(userId, sessionId, message);

  // Handle session limit error
  if (chatService.isSessionLimitError(result)) {
    return res.status(429).json(result);
  }

  // Handle general error
  if (chatService.isError(result)) {
    return res.status(500).json(result);
  }

  return res.json(result);
});

/**
 * Get chat history for a session
 */
export const getChatHistory = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.query;
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  if (!chatService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const history = await chatService.getChatHistory(userId, sessionId as string);
  return res.json(history);
});
