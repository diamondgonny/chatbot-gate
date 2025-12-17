/**
 * API endpoint를 위한 Request/Response 타입 정의
 * Controller 및 Service 레이어에 타입 안전성 제공
 */

// ===== Gate 타입 =====

export interface GateValidateRequest {
  code: string;
  userId?: string; // 기존 userId 재사용을 위해
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

// ===== 채팅 타입 =====

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

// ===== 세션 타입 =====

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

// ===== 에러 타입 =====

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

// ===== Backoff 상태 타입 (gateService용) =====

export interface BackoffCheckResult {
  blocked: boolean;
  retryAfter?: number;
  failures?: number;
}

export interface FailureBucket {
  count: number;
  lastFail: number;
}
