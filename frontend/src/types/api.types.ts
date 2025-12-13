/**
 * @deprecated Import from @/shared for auth types, @/features/chat for chat types
 */

// Auth types - re-export from shared
export type {
  AuthStatusResponse,
  GateValidateRequest,
  GateValidateResponse,
} from "@/shared";

// Chat types - re-export from features/chat for backward compatibility
export type {
  SessionsResponse,
  CreateSessionResponse,
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from "@/features/chat";
