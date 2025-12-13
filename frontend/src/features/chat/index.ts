/**
 * Chat Feature
 *
 * Complete chat functionality including messaging and session management.
 */

// Domain (Types and pure logic)
export type {
  Message,
  Session,
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  SessionsResponse,
  CreateSessionResponse,
} from "./domain";

// Services (API layer)
export {
  getChatHistory,
  sendChatMessage,
  getSessions,
  createSession,
  deleteSession,
} from "./services";

// State (Hooks)
export { useChat, useSessions, useChatPageOrchestration } from "./state";
export type {
  UseChatReturn,
  UseSessionsReturn,
  UseChatPageOrchestrationReturn,
  OrchestrationServices,
} from "./state";

// UI (Components)
export { SessionSidebar } from "./ui";

// Utils
export { formatTimeAgo } from "./utils";
