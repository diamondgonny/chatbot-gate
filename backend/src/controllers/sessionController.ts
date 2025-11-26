import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession } from '../models/ChatSession';

/**
 * Create a new chat session for the current user
 */
export const createSession = async (req: Request, res: Response) => {
  const userId = req.userId; // From JWT

  if (!userId) {
    return res.status(401).json({ error: 'User ID not found. Authentication required.' });
  }

  try {
    // Generate new session ID
    const sessionId = uuidv4();

    // Create new session
    const session = new ChatSession({
      userId,
      sessionId,
      messages: [],
      title: 'New Chat',
    });

    await session.save();

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
        title: session.title,
        messageCount: session.messages.length,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          role: lastMessage.role,
          timestamp: lastMessage.timestamp,
        } : null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
    });

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

  try {
    const session = await ChatSession.findOne({ userId, sessionId });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

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

  try {
    const result = await ChatSession.deleteOne({ userId, sessionId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
};
