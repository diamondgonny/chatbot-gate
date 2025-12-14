/**
 * Chat Services
 * Barrel export for chat-related services.
 */

// Validation (single source of truth)
export {
  validateMessage,
  validateSessionId,
  isSessionLimitError,
  isError,
} from './validation.service';

// Session management
export {
  checkSessionLimit,
  createSession,
  findOrCreateSession,
  getUserSessions,
  getSessionById,
  deleteSession,
  type FindOrCreateResult,
} from './session.service';

// Message orchestration
export {
  sendMessage,
  getChatHistory,
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
