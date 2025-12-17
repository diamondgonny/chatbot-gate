/**
 * Chat Feature
 *
 * Messaging과 session 관리를 포함한 완전한 chat 기능
 */

// Types (Type과 순수 로직)
export type {
  Message,
  Session,
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  SessionsResponse,
  CreateSessionResponse,
} from "./types";

// API (API layer)
export {
  getChatHistory,
  sendChatMessage,
  getSessions,
  createSession,
  deleteSession,
} from "./api";

// Hooks (Hook)
export { useChat, useSessions, useChatPageOrchestration } from "./hooks";
export type {
  UseChatReturn,
  UseSessionsReturn,
  UseChatPageOrchestrationReturn,
  OrchestrationServices,
} from "./hooks";

// Components (Component)
export { SessionSidebar } from "./components";

// Utils
export { formatTimeAgo } from "@/shared/utils";
