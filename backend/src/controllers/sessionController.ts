/**
 * Session Controller
 * Handles HTTP request/response for session management.
 * Business logic delegated to sessionService.
 */

import { Request, Response } from 'express';
import { sessionService } from '../services';

/**
 * Create a new chat session for the current user
 */
export const createSession = async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  try {
    const result = await sessionService.createSession(userId);

    if (sessionService.isSessionLimitError(result)) {
      return res.status(429).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error creating session:', error);
    return res.status(500).json({ error: 'Failed to create session' });
  }
};

/**
 * Get all sessions for the current user
 */
export const getUserSessions = async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  try {
    const sessions = await sessionService.getUserSessions(userId);
    return res.json({ sessions });
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

/**
 * Get a specific session by ID
 */
export const getSessionById = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!sessionId || !sessionService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  try {
    const session = await sessionService.getSessionById(userId, sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
};

/**
 * Delete a session
 */
export const deleteSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!sessionId || !sessionService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  try {
    const deleted = await sessionService.deleteSession(userId, sessionId);

    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
};
