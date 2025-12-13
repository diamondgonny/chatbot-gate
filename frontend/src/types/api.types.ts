// Auth types (shared concern)
export interface AuthStatusResponse {
  authenticated: boolean;
  userId?: string;
}

export interface GateValidateRequest {
  code: string;
  userId?: string;
}

export interface GateValidateResponse {
  valid: boolean;
  userId: string;
}

/**
 * @deprecated Import from @/features/chat instead
 * Re-exported for backward compatibility
 */
export type {
  SessionsResponse,
  CreateSessionResponse,
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from "@/features/chat";
