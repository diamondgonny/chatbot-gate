/**
 * Validation Service
 * Centralizes all input validation logic for chat feature.
 */

import { SESSION, CHAT } from '../../../shared';
import type { SessionLimitError } from '../../../shared';
import type { SendMessageResult } from './message.service';

/**
 * Validate message content
 */
export const validateMessage = (
  message: unknown
): { valid: boolean; error?: string } => {
  if (typeof message !== 'string' || !message.trim()) {
    return { valid: false, error: 'Message is required' };
  }
  if (message.length > CHAT.MAX_MESSAGE_LENGTH) {
    return { valid: false, error: 'Message too long' };
  }
  return { valid: true };
};

/**
 * Validate session ID format (UUID v4)
 */
export const validateSessionId = (sessionId: unknown): boolean => {
  return typeof sessionId === 'string' && SESSION.ID_PATTERN.test(sessionId);
};

/**
 * Type guard for session limit error
 */
export const isSessionLimitError = (
  result: unknown
): result is SessionLimitError => {
  return (
    typeof result === 'object' &&
    result !== null &&
    'code' in result &&
    (result as { code: string }).code === 'SESSION_LIMIT_REACHED'
  );
};

/**
 * Type guard for general error
 */
export const isError = (
  result: SendMessageResult
): result is { error: string } => {
  return 'error' in result && !('code' in result);
};
