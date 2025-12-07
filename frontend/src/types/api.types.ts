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

export interface SessionsResponse {
  sessions: import("./chat.types").Session[];
}

export interface CreateSessionResponse {
  sessionId: string;
  title: string;
  updatedAt: string;
  createdAt?: string;
}

export interface ChatHistoryResponse {
  messages: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
}

export interface ChatMessageRequest {
  message: string;
  sessionId: string;
}

export interface ChatMessageResponse {
  response: string;
  timestamp: string;
  sessionId: string;
}
