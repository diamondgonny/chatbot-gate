/**
 * Chat Feature
 *
 * Complete chat functionality including messaging and session management.
 */

// Services (API layer)
export {
  getChatHistory,
  sendChatMessage,
  getSessions,
  createSession,
  deleteSession,
} from "./services";

// Hooks
export { useChat, useSessions, useChatPageOrchestration } from "./hooks";
export type {
  UseChatReturn,
  UseSessionsReturn,
  UseChatPageOrchestrationReturn,
  OrchestrationServices,
} from "./hooks";

// Components
export { SessionSidebar } from "./components";

// Types
export type {
  Message,
  Session,
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  SessionsResponse,
  CreateSessionResponse,
} from "./types";
