/**
 * Chat Controller
 * Handles HTTP request/response for chat functionality.
 * Business logic delegated to chatService.
 */

import { Request, Response } from 'express';
import { chatService } from '../services';

/**
 * Send a message to the AI and get a response
 */
export const chatWithAI = async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;
  const userId = req.userId;

  // Validate message
  const messageValidation = chatService.validateMessage(message);
  if (!messageValidation.valid) {
    const statusCode = messageValidation.error === 'Message too long' ? 413 : 400;
    return res.status(statusCode).json({ error: messageValidation.error });
  }

  // Validate user authentication
  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  // Validate session ID
  if (!chatService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  // Check OpenAI configuration
  if (!chatService.isOpenAIConfigured()) {
    console.error('OPENAI_API_KEY is missing');
    return res.status(500).json({ error: 'Server misconfiguration: API Key missing' });
  }

  try {
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
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return res.status(500).json({ error: 'Failed to get response from AI' });
  }
};

/**
 * Get chat history for a session
 */
export const getChatHistory = async (req: Request, res: Response) => {
  const { sessionId } = req.query;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  if (!chatService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  try {
    const history = await chatService.getChatHistory(userId, sessionId as string);
    return res.json(history);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return res.status(500).json({ error: 'Failed to fetch chat history' });
  }
};
