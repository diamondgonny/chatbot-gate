/**
 * Message 서비스
 * Chat 메시지 흐름 오케스트레이션: 세션 관리, 메시지 저장, AI 응답
 */

import {
  ChatSession,
  chatMessagesTotal,
  chatMessageDuration,
  getDeploymentEnv,
} from '@shared';
import type { ChatMessageResponse, ChatHistoryResponse, SessionLimitError } from '@shared';
import { getCompletion, buildConversationHistory } from './openai.service';
import { findOrCreateSession } from './session.service';
import { isSessionLimitError } from './validation.service';

/**
 * 지정된 길이로 텍스트를 말줄임표와 함께 자르기
 */
const truncateTitle = (text: string, maxLength = 50): string =>
  text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

export type SendMessageResult =
  | ChatMessageResponse
  | SessionLimitError
  | { error: string };

/**
 * 메시지 전송 및 AI 응답 받기
 * 오케스트레이션: 세션 조회/생성, 메시지 저장, AI 상호작용
 */
export const sendMessage = async (
  userId: string,
  sessionId: string,
  message: string
): Promise<SendMessageResult> => {
  const chatStartTime = process.hrtime.bigint();
  const deploymentEnv = getDeploymentEnv();

  // 세션 찾기 또는 생성 (제한 확인 포함)
  const result = await findOrCreateSession(userId, sessionId);
  if (isSessionLimitError(result)) {
    return result;
  }

  const { session } = result;

  // 세션에 사용자 메시지 추가
  session.messages.push({
    role: 'user',
    content: message,
    timestamp: new Date(),
  });

  // 첫 사용자 메시지로부터 제목 자동 생성
  if (session.messages.length === 1) {
    session.title = truncateTitle(message);
  }

  await session.save();

  // 사용자 메시지 메트릭 추적
  chatMessagesTotal.labels('user', deploymentEnv).inc();

  // 대화 히스토리 구성 및 AI 응답 받기
  const conversationHistory = buildConversationHistory(session.messages);
  const completion = await getCompletion(conversationHistory);

  // AI 응답을 데이터베이스에 저장
  session.messages.push({
    role: 'ai',
    content: completion.content,
    timestamp: new Date(),
  });

  // 최신 AI 응답으로 제목 업데이트
  session.title = truncateTitle(completion.content);

  await session.save();

  // AI 메시지 메트릭 추적
  chatMessagesTotal.labels('ai', deploymentEnv).inc();

  // 전체 chat 소요 시간 추적
  const chatDurationMs =
    Number(process.hrtime.bigint() - chatStartTime) / 1_000_000;
  chatMessageDuration.labels(deploymentEnv).observe(chatDurationMs / 1000);

  return {
    response: completion.content,
    timestamp: new Date().toISOString(),
  };
};

/**
 * 세션의 chat 히스토리 조회
 */
export const getChatHistory = async (
  userId: string,
  sessionId: string
): Promise<ChatHistoryResponse> => {
  const session = await ChatSession.findOne({ userId, sessionId });

  if (!session) {
    return { messages: [] };
  }

  return {
    messages: session.messages.map((msg) => ({
      role: msg.role as 'user' | 'ai' | 'system',
      content: msg.content,
      timestamp: msg.timestamp,
    })),
  };
};
