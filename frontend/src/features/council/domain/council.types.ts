// Model routing을 위한 council mode
export type CouncilMode = 'lite' | 'ultra';

// Stage 1: 개별 model response
export interface Stage1Response {
  model: string;
  response: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

// Stage 2: Ranking을 포함한 peer review
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
  reasoning?: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

// User message
export interface CouncilUserMessage {
  role: "user";
  content: string;
  timestamp: string;
}

// 3개의 stage를 포함한 assistant message
export interface CouncilAssistantMessage {
  role: "assistant";
  stage1: Stage1Response[];
  stage2?: Stage2Review[];    // abort된 경우 optional
  stage3?: Stage3Synthesis;   // abort된 경우 optional
  wasAborted?: boolean;       // 처리가 abort된 경우 true
  timestamp: string;
}

export type CouncilMessage = CouncilUserMessage | CouncilAssistantMessage;

// Council session (목록 view)
export interface CouncilSession {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// Message를 포함한 council session (상세 view)
export interface CouncilSessionDetail extends CouncilSession {
  messages: CouncilMessage[];
}

// Stage 2에서 계산된 aggregate ranking
export interface AggregateRanking {
  model: string;
  averageRank: number;
  rankingsCount: number;
}

// SSE Event type
export type SSEEventType =
  | "heartbeat"
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
  | "stage3_reasoning_chunk"
  | "stage3_chunk"
  | "stage3_response"
  | "title_complete"
  | "complete"
  | "error"
  | "reconnected";

// Stage 1 streaming chunk event
export interface Stage1ChunkEvent {
  type: "stage1_chunk";
  model: string;
  delta: string;
}

// Stage 1 model 완료 event
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
  // 모든 stage의 chunk 및 model_complete event용 streaming field
  model?: string;
  delta?: string;
  responseTimeMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  // 재연결 field
  stage?: string;
  userMessage?: string;
}

// API response type
export interface CreateCouncilSessionResponse {
  sessionId: string;
  title: string;
  createdAt: string;
}

export interface GetCouncilSessionsResponse {
  sessions: CouncilSession[];
}

export type GetCouncilSessionResponse = CouncilSessionDetail;

// 재연결을 위한 processing status
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
