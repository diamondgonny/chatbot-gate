/**
 * Session Service
 * Handles session CRUD operations and business logic.
 */

import { randomUUID } from 'crypto';
import { ChatSession, SESSION, type IChatSession } from '../../../shared';
import type {
  SessionResponse,
  SessionListItem,
  SessionDetailResponse,
  SessionLimitError,
} from '../../../shared';
import { sessionOperations, getDeploymentEnv } from '../../../shared';

/**
 * Result of findOrCreateSession operation
 */
export interface FindOrCreateResult {
  session: IChatSession;
  isNewSession: boolean;
}

/**
 * Check if user has reached session limit
 */
export const checkSessionLimit = async (
  userId: string
): Promise<{ allowed: boolean; count: number }> => {
  const count = await ChatSession.countDocuments({ userId });
  return {
    allowed: count < SESSION.MAX_PER_USER,
    count,
  };
};

/**
 * Create a new session for user
 * Includes race condition prevention with double-check
 */
export const createSession = async (
  userId: string
): Promise<SessionResponse | SessionLimitError> => {
  // Initial check
  const { allowed, count } = await checkSessionLimit(userId);
  if (!allowed) {
    return {
      error: 'Session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
      limit: SESSION.MAX_PER_USER,
      count,
    };
  }

  const sessionId = randomUUID();
  const session = new ChatSession({
    userId,
    sessionId,
    messages: [],
    title: 'New Chat',
  });

  await session.save();

  // Double-check to prevent race condition
  const finalCount = await ChatSession.countDocuments({ userId });
  if (finalCount > SESSION.MAX_PER_USER) {
    // Rollback
    await ChatSession.deleteOne({ sessionId });
    return {
      error: 'Session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
      limit: SESSION.MAX_PER_USER,
      count: finalCount - 1,
    };
  }

  // Track metric
  sessionOperations.labels('create', getDeploymentEnv()).inc();

  return {
    sessionId: session.sessionId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

/**
 * Find existing session or create new one with limit check
 * Consolidates session lookup, creation, and limit enforcement
 */
export const findOrCreateSession = async (
  userId: string,
  sessionId: string
): Promise<FindOrCreateResult | SessionLimitError> => {
  // Try to find existing session
  let session = await ChatSession.findOne({ userId, sessionId });

  if (session) {
    return { session, isNewSession: false };
  }

  // Check limit before creation
  const { allowed, count } = await checkSessionLimit(userId);
  if (!allowed) {
    return {
      error: 'Session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
      limit: SESSION.MAX_PER_USER,
      count,
    };
  }

  // Create new session
  session = new ChatSession({
    userId,
    sessionId,
    messages: [],
    title: 'New Chat',
  });
  await session.save();

  // Double-check for race condition
  const finalCount = await ChatSession.countDocuments({ userId });
  if (finalCount > SESSION.MAX_PER_USER) {
    await ChatSession.deleteOne({ sessionId });
    return {
      error: 'Session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
      limit: SESSION.MAX_PER_USER,
      count: finalCount - 1,
    };
  }

  // Track metric
  sessionOperations.labels('create', getDeploymentEnv()).inc();

  return { session, isNewSession: true };
};

/**
 * Get all sessions for a user
 */
export const getUserSessions = async (
  userId: string
): Promise<SessionListItem[]> => {
  const sessions = await ChatSession.find({ userId }).sort({ updatedAt: -1 });

  const sessionList = sessions.map((session) => {
    const lastMessage =
      session.messages.length > 0
        ? session.messages[session.messages.length - 1]
        : null;

    return {
      sessionId: session.sessionId,
      title: lastMessage ? lastMessage.content : session.title,
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            role: lastMessage.role as 'user' | 'ai' | 'system',
            timestamp: lastMessage.timestamp,
          }
        : null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  });

  // Track metric
  sessionOperations.labels('list', getDeploymentEnv()).inc();

  return sessionList;
};

/**
 * Get a specific session by ID
 */
export const getSessionById = async (
  userId: string,
  sessionId: string
): Promise<SessionDetailResponse | null> => {
  const session = await ChatSession.findOne({ userId, sessionId });

  if (!session) {
    return null;
  }

  // Track metric
  sessionOperations.labels('get', getDeploymentEnv()).inc();

  return {
    sessionId: session.sessionId,
    title: session.title,
    messages: session.messages.map((msg) => ({
      role: msg.role as 'user' | 'ai' | 'system',
      content: msg.content,
      timestamp: msg.timestamp,
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

/**
 * Delete a session
 * Returns true if deleted, false if not found
 */
export const deleteSession = async (
  userId: string,
  sessionId: string
): Promise<boolean> => {
  const result = await ChatSession.deleteOne({ userId, sessionId });

  if (result.deletedCount === 0) {
    return false;
  }

  // Track metric
  sessionOperations.labels('delete', getDeploymentEnv()).inc();

  return true;
};