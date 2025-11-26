import { Request, Response } from 'express';
import { ChatSession } from '../models/ChatSession';

/**
 * Get all sessions for the current user
 * Returns list of sessions with metadata
 */
export const getUserSessions = async (req: Request, res: Response) => {
  const sessionId = req.sessionId; // Current session from JWT

  if (!sessionId) {
    return res.status(401).json({ error: 'Session ID not found. Authentication required.' });
  }

  try {
    // For now, return only the current session
    // In the future, we could track multiple sessions per user
    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      return res.json({ sessions: [] });
    }

    // Get last message
    const lastMessage = session.messages.length > 0 
      ? session.messages[session.messages.length - 1]
      : null;

    const sessionData = {
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

    return res.json({ sessions: [sessionData] });
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
  const requestSessionId = req.sessionId; // From JWT

  if (!requestSessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const session = await ChatSession.findOne({ sessionId });

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
  const requestSessionId = req.sessionId; // From JWT

  if (!requestSessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await ChatSession.deleteOne({ sessionId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
};
