import { Request, Response } from 'express';
import { ChatSession } from '../models/ChatSession';
import { randomUUID } from 'crypto';
import { sessionOperations, activeSessions, getDeploymentEnv } from '../metrics/metricsRegistry';

const MAX_SESSIONS_PER_USER = 50;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Create a new chat session for the current user
 */
export const createSession = async (req: Request, res: Response) => {
  const userId = req.userId; // From JWT

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  try {
    const sessionCount = await ChatSession.countDocuments({ userId });
    if (sessionCount >= MAX_SESSIONS_PER_USER) {
      return res.status(429).json({
        error: 'Session limit reached. Delete old sessions to continue.',
        code: 'SESSION_LIMIT_REACHED',
        limit: MAX_SESSIONS_PER_USER,
        count: sessionCount,
      });
    }

    // Generate new session ID
    const sessionId = randomUUID();

    // Create new session
    const session = new ChatSession({
      userId,
      sessionId,
      messages: [],
      title: 'New Chat',
    });

    await session.save();

    // Double-check to prevent race condition
    // If multiple requests hit simultaneously, some might slip through the first check
    const finalCount = await ChatSession.countDocuments({ userId });
    if (finalCount > MAX_SESSIONS_PER_USER) {
      // Rollback: delete the session we just created
      await ChatSession.deleteOne({ sessionId });
      return res.status(429).json({
        error: 'Session limit reached. Delete old sessions to continue.',
        code: 'SESSION_LIMIT_REACHED',
        limit: MAX_SESSIONS_PER_USER,
        count: finalCount - 1, // Subtract the one we just deleted
      });
    }

    // Track successful session creation
    sessionOperations.labels('create', getDeploymentEnv()).inc();
    activeSessions.labels(getDeploymentEnv()).inc();

    return res.json({
      sessionId: session.sessionId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  } catch (error) {
    console.error('Error creating session:', error);
    return res.status(500).json({ error: 'Failed to create session' });
  }
};

/**
 * Get all sessions for the current user
 * Returns list of sessions with metadata
 */
export const getUserSessions = async (req: Request, res: Response) => {
  const userId = req.userId; // From JWT

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  try {
    // Find all sessions belonging to this user
    const sessions = await ChatSession.find({ userId }).sort({ updatedAt: -1 });

    const sessionList = sessions.map(session => {
      const lastMessage = session.messages.length > 0 
        ? session.messages[session.messages.length - 1]
        : null;

      return {
        sessionId: session.sessionId,
        title: lastMessage ? lastMessage.content : session.title,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          role: lastMessage.role,
          timestamp: lastMessage.timestamp,
        } : null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
    });

    // Track session list retrieval
    sessionOperations.labels('list', getDeploymentEnv()).inc();

    return res.json({ sessions: sessionList });
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
  const userId = req.userId; // From JWT

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  try {
    const session = await ChatSession.findOne({ userId, sessionId });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Track session retrieval
    sessionOperations.labels('get', getDeploymentEnv()).inc();

    return res.json({
      sessionId: session.sessionId,
      title: session.title,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
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
  const userId = req.userId; // From JWT

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  try {
    const result = await ChatSession.deleteOne({ userId, sessionId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Track session deletion
    sessionOperations.labels('delete', getDeploymentEnv()).inc();
    activeSessions.labels(getDeploymentEnv()).dec();

    return res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
};
