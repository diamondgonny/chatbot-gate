/**
 * Validation 서비스
 * Chat 기능의 모든 입력 검증 로직을 중앙화
 */

import { SESSION, CHAT } from '@shared';
import type { SessionLimitError } from '@shared';
import type { SendMessageResult } from './message.service';

/**
 * 메시지 내용 검증
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
 * 세션 ID 형식 검증 (UUID v4)
 */
export const validateSessionId = (sessionId: unknown): boolean => {
  return typeof sessionId === 'string' && SESSION.ID_PATTERN.test(sessionId);
};

/**
 * 세션 제한 에러에 대한 Type guard
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
 * 일반 에러에 대한 Type guard
 */
export const isError = (
  result: SendMessageResult
): result is { error: string } => {
  return 'error' in result && !('code' in result);
};
