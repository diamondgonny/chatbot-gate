/**
 * Database Helper for Tests
 * Provides utilities for setting up and cleaning test data
 */

import { randomUUID } from 'crypto';
import { ChatSession } from '../../src/models/ChatSession';

/**
 * Create a test session for a user
 */
export const createTestSession = async (
  userId: string,
  options?: {
    sessionId?: string;
    title?: string;
    messages?: Array<{ role: 'user' | 'ai' | 'system'; content: string }>;
  }
): Promise<string> => {
  const sessionId = options?.sessionId || randomUUID();
  const messages = (options?.messages || []).map((msg) => ({
    ...msg,
    timestamp: new Date(),
  }));

  const session = new ChatSession({
    userId,
    sessionId,
    title: options?.title || 'Test Session',
    messages,
  });

  await session.save();
  return sessionId;
};

/**
 * Create multiple test sessions for a user
 */
export const createManySessions = async (
  userId: string,
  count: number
): Promise<string[]> => {
  const sessionIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const sessionId = randomUUID();
    const session = new ChatSession({
      userId,
      sessionId,
      title: `Test Session ${i + 1}`,
      messages: [],
    });
    await session.save();
    sessionIds.push(sessionId);
  }

  return sessionIds;
};

/**
 * Get session count for a user
 */
export const getSessionCount = async (userId: string): Promise<number> => {
  return ChatSession.countDocuments({ userId });
};

/**
 * Clear all sessions for a user
 */
export const clearUserSessions = async (userId: string): Promise<void> => {
  await ChatSession.deleteMany({ userId });
};

/**
 * Clear all sessions
 */
export const clearAllSessions = async (): Promise<void> => {
  await ChatSession.deleteMany({});
};

/**
 * Generate a valid UUID v4 for session ID
 */
export const generateSessionId = (): string => {
  return randomUUID();
};

/**
 * Generate an invalid session ID (not UUID format)
 */
export const generateInvalidSessionId = (): string => {
  return 'invalid-session-id';
};
