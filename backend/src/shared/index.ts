// Config
export { config, cookieConfig } from './config';

// Database
export { connectDB, stopActiveSessionsTracking } from './db';

// Constants
export {
  SESSION,
  CHAT,
  BACKOFF,
  COUNCIL,
  getModelsForMode,
  getChairmanForMode,
  type CouncilMode,
} from './constants';

// Models
export {
  ChatSession,
  CouncilSession,
  type IChatSession,
  type IMessage,
  type ICouncilSession,
  type ICouncilMessage,
  type ICouncilUserMessage,
  type ICouncilAssistantMessage,
  type IStage1Response,
  type IStage2Review,
  type IStage3Synthesis,
} from './models';

// Middleware
export { authMiddleware, createRateLimiter } from './middleware';

// Services
export {
  signToken,
  verifyToken,
  generateTitle,
  isOpenRouterConfigured,
  chatCompletion,
  queryCouncilModels,
  queryChairman,
  chatCompletionStream,
  chatCompletionStreamWithReasoning,
  queryCouncilModelsStreaming,
  type JWTPayload,
  type OpenRouterMessage,
  type ModelResponse,
  type StreamChunk,
  type StreamComplete,
  type StreamEvent,
  type ModelStreamChunk,
  type ModelStreamComplete,
  type ModelStreamEvent,
} from './services';

// Types
export type {
  GateValidateRequest,
  GateValidateSuccessResponse,
  GateValidateFailureResponse,
  GateBackoffResponse,
  GateValidateResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  ChatHistoryMessage,
  ChatHistoryResponse,
  SessionResponse,
  SessionDetailResponse,
  SessionLastMessage,
  SessionListItem,
  SessionListResponse,
  ErrorResponse,
  SessionLimitError,
  RateLimitError,
  BackoffCheckResult,
  FailureBucket,
} from './types';

export type {
  AggregateRanking,
  SSEEvent,
  CreateSessionResult,
  GetSessionsResult,
  GetSessionResult,
  DeleteSessionResult,
} from './types/council';
