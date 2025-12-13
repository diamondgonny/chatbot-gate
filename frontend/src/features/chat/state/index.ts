// Core chat state
export { useChat } from "./useChat";
export type { UseChatReturn, ChatServices } from "./useChat";

// Session management
export { useSessions } from "./useSessions";
export type { UseSessionsReturn, SessionServices } from "./useSessions";

// Page orchestration
export { useChatPageOrchestration } from "./useChatPageOrchestration";
export type {
  UseChatPageOrchestrationReturn,
  OrchestrationServices,
} from "./useChatPageOrchestration";

// Focused hooks (SRP-compliant)
export { useChatScroll } from "./useChatScroll";
export type { UseChatScrollReturn } from "./useChatScroll";

export { useAutoError } from "./useAutoError";

export { useDeleteSession } from "./useDeleteSession";
export type { UseDeleteSessionReturn, DeleteSessionConfig } from "./useDeleteSession";

export { useSyncMessageToSession } from "./useSyncMessageToSession";
export type { SyncConfig } from "./useSyncMessageToSession";
