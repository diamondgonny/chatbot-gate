/**
 * Request/Response type definitions for API endpoints.
 * Provides type safety for controller and service layers.
 */

// ===== Gate Types =====

export interface GateValidateRequest {
  code: string;
  userId?: string; // For reusing existing userId
}

export interface GateValidateSuccessResponse {
  valid: true;
  message: string;
  userId: string;
}

export interface GateValidateFailureResponse {
  valid: false;
  message: string;
}

export interface GateBackoffResponse {
  error: string;
  code: 'GATE_BACKOFF';
  retryAfter: number;
}

export type GateValidateResponse =
  | GateValidateSuccessResponse
  | GateValidateFailureResponse
  | GateBackoffResponse;

// ===== Chat Types =====

export interface ChatMessageRequest {
  message: string;
  sessionId: string;
}

export interface ChatMessageResponse {
  response: string;
  timestamp: string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
}

export interface ChatHistoryResponse {
  messages: ChatHistoryMessage[];
}

// ===== Session Types =====

export interface SessionResponse {
  sessionId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDetailResponse extends SessionResponse {
  messages: ChatHistoryMessage[];
}

export interface SessionLastMessage {
  content: string;
  role: 'user' | 'ai' | 'system';
  timestamp: Date;
}

export interface SessionListItem {
  sessionId: string;
  title: string;
  lastMessage: SessionLastMessage | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionListResponse {
  sessions: SessionListItem[];
}

// ===== Error Types =====

export interface ErrorResponse {
  error: string;
  requestId?: string;
}

export interface SessionLimitError {
  error: string;
  code: 'SESSION_LIMIT_REACHED';
  limit: number;
  count: number;
}

export interface RateLimitError {
  error: string;
  limit: number;
  windowMs: number;
  retryAfter: number;
}

// ===== Backoff State Types (for gateService) =====

export interface BackoffCheckResult {
  blocked: boolean;
  retryAfter?: number;
  failures?: number;
}

export interface FailureBucket {
  count: number;
  lastFail: number;
}
