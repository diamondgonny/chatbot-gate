/**
 * Chat Feature
 *
 * Messaging과 session 관리를 포함한 완전한 chat 기능
 */

// Domain (Type과 순수 로직)
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

// State (Hook)
export { useChat, useSessions, useChatPageOrchestration } from "./state";
export type {
  UseChatReturn,
  UseSessionsReturn,
  UseChatPageOrchestrationReturn,
  OrchestrationServices,
} from "./state";

// UI (Component)
export { SessionSidebar } from "./ui";

// Utils
export { formatTimeAgo } from "@/shared/utils";
