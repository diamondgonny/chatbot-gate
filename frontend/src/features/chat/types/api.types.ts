import type { Session } from "./chat.types";

export interface SessionsResponse {
  sessions: Session[];
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
