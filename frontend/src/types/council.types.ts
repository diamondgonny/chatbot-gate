// Stage 1: Individual model response
export interface Stage1Response {
  model: string;
  response: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

// Stage 2: Peer review with ranking
export interface Stage2Review {
  model: string;
  ranking: string;
  parsedRanking: string[];
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

// Stage 3: Chairman synthesis
export interface Stage3Synthesis {
  model: string;
  response: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

// User message
export interface CouncilUserMessage {
  role: "user";
  content: string;
  timestamp: string;
}

// Assistant message with 3 stages
export interface CouncilAssistantMessage {
  role: "assistant";
  stage1: Stage1Response[];
  stage2: Stage2Review[];
  stage3: Stage3Synthesis;
  timestamp: string;
}

export type CouncilMessage = CouncilUserMessage | CouncilAssistantMessage;

// Council session (list view)
export interface CouncilSession {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// Council session with messages (detail view)
export interface CouncilSessionDetail extends CouncilSession {
  messages: CouncilMessage[];
}

// Aggregate ranking (computed from Stage 2)
export interface AggregateRanking {
  model: string;
  averageRank: number;
  rankingsCount: number;
}

// SSE Event types
export type SSEEventType =
  | "stage1_start"
  | "stage1_chunk"
  | "stage1_model_complete"
  | "stage1_response"
  | "stage1_complete"
  | "stage2_start"
  | "stage2_chunk"
  | "stage2_model_complete"
  | "stage2_response"
  | "stage2_complete"
  | "stage3_start"
  | "stage3_chunk"
  | "stage3_response"
  | "complete"
  | "error"
  | "reconnected";

// Stage 1 streaming chunk event
export interface Stage1ChunkEvent {
  type: "stage1_chunk";
  model: string;
  delta: string;
}

// Stage 1 model complete event
export interface Stage1ModelCompleteEvent {
  type: "stage1_model_complete";
  model: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface SSEEvent {
  type: SSEEventType;
  data?: Stage1Response | Stage2Review | Stage3Synthesis | { labelToModel: Record<string, string>; aggregateRankings: AggregateRanking[] };
  error?: string;
  // Streaming fields (for chunk and model_complete events across all stages)
  model?: string;
  delta?: string;
  responseTimeMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  // Reconnection fields
  stage?: string;
  userMessage?: string;
}

// API response types
export interface CreateCouncilSessionResponse {
  sessionId: string;
  title: string;
  createdAt: string;
}

export interface GetCouncilSessionsResponse {
  sessions: CouncilSession[];
}

export interface GetCouncilSessionResponse extends CouncilSessionDetail {}

// Processing status for reconnection
export interface ProcessingStatus {
  isProcessing: boolean;
  canReconnect: boolean;
  currentStage?: "stage1" | "stage2" | "stage3";
  startedAt?: string;
  partialResults?: {
    stage1Count: number;
    stage2Count: number;
    hasStage3: boolean;
  };
}
