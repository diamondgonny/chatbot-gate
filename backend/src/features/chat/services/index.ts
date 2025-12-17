/**
 * Chat 서비스
 * Chat 관련 서비스의 Barrel export
 */

// Validation (단일 진실 소스)
export {
  validateMessage,
  validateSessionId,
  isSessionLimitError,
  isError,
} from './validation.service';

// 세션 관리
export {
  checkSessionLimit,
  createSession,
  findOrCreateSession,
  getUserSessions,
  getSessionById,
  deleteSession,
  type FindOrCreateResult,
} from './session.service';

// 메시지 오케스트레이션
export {
  sendMessage,
  getChatHistory,
  type SendMessageResult,
} from './message.service';

// OpenAI 통합
export {
  isOpenAIConfigured,
  getCompletion,
  buildConversationHistory,
  SYSTEM_PROMPT,
  type ChatCompletionResult,
} from './openai.service';
