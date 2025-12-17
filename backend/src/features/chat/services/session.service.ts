/**
 * Session 서비스
 * 세션 CRUD 작업 및 비즈니스 로직 처리
 */

import { randomUUID } from 'crypto';
import { ChatSession, SESSION, type IChatSession } from '@shared';
import type {
  SessionResponse,
  SessionListItem,
  SessionDetailResponse,
  SessionLimitError,
} from '@shared';
import { sessionOperations, getDeploymentEnv } from '@shared';

/**
 * findOrCreateSession 작업의 결과
 */
export interface FindOrCreateResult {
  session: IChatSession;
  isNewSession: boolean;
}

/**
 * 사용자가 세션 제한에 도달했는지 확인
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
 * 사용자를 위한 새 세션 생성
 * Double-check를 통한 race condition 방지 포함
 */
export const createSession = async (
  userId: string
): Promise<SessionResponse | SessionLimitError> => {
  // 초기 확인
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

  // Race condition 방지를 위한 double-check
  const finalCount = await ChatSession.countDocuments({ userId });
  if (finalCount > SESSION.MAX_PER_USER) {
    // 롤백
    await ChatSession.deleteOne({ sessionId });
    return {
      error: 'Session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
      limit: SESSION.MAX_PER_USER,
      count: finalCount - 1,
    };
  }

  // 메트릭 추적
  sessionOperations.labels('create', getDeploymentEnv()).inc();

  return {
    sessionId: session.sessionId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

/**
 * 기존 세션 찾기 또는 제한 확인과 함께 새 세션 생성
 * 세션 조회, 생성 및 제한 적용을 통합
 */
export const findOrCreateSession = async (
  userId: string,
  sessionId: string
): Promise<FindOrCreateResult | SessionLimitError> => {
  // 기존 세션 찾기 시도
  let session = await ChatSession.findOne({ userId, sessionId });

  if (session) {
    return { session, isNewSession: false };
  }

  // 생성 전 제한 확인
  const { allowed, count } = await checkSessionLimit(userId);
  if (!allowed) {
    return {
      error: 'Session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
      limit: SESSION.MAX_PER_USER,
      count,
    };
  }

  // 새 세션 생성
  session = new ChatSession({
    userId,
    sessionId,
    messages: [],
    title: 'New Chat',
  });
  await session.save();

  // Race condition에 대한 double-check
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

  // 메트릭 추적
  sessionOperations.labels('create', getDeploymentEnv()).inc();

  return { session, isNewSession: true };
};

/**
 * 사용자의 모든 세션 조회
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

  // 메트릭 추적
  sessionOperations.labels('list', getDeploymentEnv()).inc();

  return sessionList;
};

/**
 * ID로 특정 세션 조회
 */
export const getSessionById = async (
  userId: string,
  sessionId: string
): Promise<SessionDetailResponse | null> => {
  const session = await ChatSession.findOne({ userId, sessionId });

  if (!session) {
    return null;
  }

  // 메트릭 추적
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
 * 세션 삭제
 * 삭제되면 true, 찾지 못하면 false 반환
 */
export const deleteSession = async (
  userId: string,
  sessionId: string
): Promise<boolean> => {
  const result = await ChatSession.deleteOne({ userId, sessionId });

  if (result.deletedCount === 0) {
    return false;
  }

  // 메트릭 추적
  sessionOperations.labels('delete', getDeploymentEnv()).inc();

  return true;
};