/**
 * Council 세션 서비스
 * Council 세션 CRUD 작업 및 검증 처리
 */

import { randomUUID } from 'crypto';
import { CouncilSession, COUNCIL, SESSION } from '@shared';
import type {
  CreateSessionResult,
  GetSessionsResult,
  GetSessionResult,
  DeleteSessionResult,
} from '@shared';
import { councilSessionsTotal, getDeploymentEnv } from '@shared';

/**
 * 세션 ID 형식 검증 (UUID v4)
 */
export const validateSessionId = (sessionId: unknown): boolean => {
  return typeof sessionId === 'string' && SESSION.ID_PATTERN.test(sessionId);
};

/**
 * 메시지 내용 검증
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
 * 새 council 세션 생성
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

  // Race condition 방지를 위한 double-check
  const finalCount = await CouncilSession.countDocuments({ userId });
  if (finalCount > COUNCIL.MAX_SESSIONS_PER_USER) {
    await CouncilSession.deleteOne({ sessionId: session.sessionId });
    return {
      success: false,
      error: 'Council session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
    };
  }

  // 세션 생성 기록
  councilSessionsTotal.labels('create', getDeploymentEnv()).inc();

  return { success: true, session };
};

/**
 * 사용자의 모든 council 세션 조회
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
 * 특정 council 세션 조회
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
 * Council 세션 삭제
 */
export const deleteSession = async (
  userId: string,
  sessionId: string
): Promise<DeleteSessionResult> => {
  const result = await CouncilSession.deleteOne({ userId, sessionId });
  if (result.deletedCount === 0) {
    return { success: false, error: 'Session not found' };
  }

  // 세션 삭제 기록
  councilSessionsTotal.labels('delete', getDeploymentEnv()).inc();

  return { success: true };
};

/**
 * 세션 제한 에러에 대한 Type guard
 */
export const isSessionLimitError = (
  result: CreateSessionResult
): result is { success: false; error: string; code: string } => {
  return !result.success && 'code' in result && result.code === 'SESSION_LIMIT_REACHED';
};
