/**
 * Council Session Service
 * Handles council session CRUD operations and validation.
 */

import { randomUUID } from 'crypto';
import { CouncilSession } from '../../models/CouncilSession';
import { COUNCIL, SESSION } from '../../constants';
import {
  CreateSessionResult,
  GetSessionsResult,
  GetSessionResult,
  DeleteSessionResult,
} from '../../types/council';

/**
 * Validate session ID format (UUID v4)
 */
export const validateSessionId = (sessionId: unknown): boolean => {
  return typeof sessionId === 'string' && SESSION.ID_PATTERN.test(sessionId);
};

/**
 * Validate message content
 */
export const validateMessage = (
  message: unknown
): { valid: boolean; error?: string } => {
  if (typeof message !== 'string' || !message.trim()) {
    return { valid: false, error: 'Message is required' };
  }
  if (message.length > COUNCIL.MAX_MESSAGE_LENGTH) {
    return { valid: false, error: 'Message too long' };
  }
  return { valid: true };
};

/**
 * Create a new council session
 */
export const createSession = async (userId: string): Promise<CreateSessionResult> => {
  const count = await CouncilSession.countDocuments({ userId });
  if (count >= COUNCIL.MAX_SESSIONS_PER_USER) {
    return {
      success: false,
      error: 'Council session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
    };
  }

  const session = new CouncilSession({
    userId,
    sessionId: randomUUID(),
    title: 'New Council Session',
    messages: [],
  });

  await session.save();

  // Double-check to prevent race condition
  const finalCount = await CouncilSession.countDocuments({ userId });
  if (finalCount > COUNCIL.MAX_SESSIONS_PER_USER) {
    await CouncilSession.deleteOne({ sessionId: session.sessionId });
    return {
      success: false,
      error: 'Council session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
    };
  }

  return { success: true, session };
};

/**
 * Get all council sessions for a user
 */
export const getSessions = async (userId: string): Promise<GetSessionsResult> => {
  try {
    const sessions = await CouncilSession.find({ userId })
      .select('sessionId title createdAt updatedAt')
      .sort({ updatedAt: -1 });
    return { success: true, sessions };
  } catch {
    return { success: false, error: 'Failed to fetch sessions' };
  }
};

/**
 * Get a specific council session
 */
export const getSession = async (
  userId: string,
  sessionId: string
): Promise<GetSessionResult> => {
  const session = await CouncilSession.findOne({ userId, sessionId });
  if (!session) {
    return { success: false, error: 'Session not found' };
  }
  return { success: true, session };
};

/**
 * Delete a council session
 */
export const deleteSession = async (
  userId: string,
  sessionId: string
): Promise<DeleteSessionResult> => {
  const result = await CouncilSession.deleteOne({ userId, sessionId });
  if (result.deletedCount === 0) {
    return { success: false, error: 'Session not found' };
  }
  return { success: true };
};

/**
 * Type guard for session limit error
 */
export const isSessionLimitError = (
  result: CreateSessionResult
): result is { success: false; error: string; code: string } => {
  return !result.success && 'code' in result && result.code === 'SESSION_LIMIT_REACHED';
};
