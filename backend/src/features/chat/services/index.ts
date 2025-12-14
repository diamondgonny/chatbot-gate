/**
 * Chat Services
 * Barrel export for chat-related services.
 */

// Session management
export {
  validateSessionId,
  checkSessionLimit,
  createSession,
  getUserSessions,
  getSessionById,
  deleteSession,
  isSessionLimitError,
} from './session.service';

// Message handling
export {
  validateMessage,
  validateSessionId as validateMessageSessionId,
  sendMessage,
  getChatHistory,
  isSessionLimitError as isMessageSessionLimitError,
  isError,
  type SendMessageResult,
} from './message.service';

// OpenAI integration
export {
  isOpenAIConfigured,
  getCompletion,
  buildConversationHistory,
  SYSTEM_PROMPT,
  type ChatCompletionResult,
} from './openai.service';
