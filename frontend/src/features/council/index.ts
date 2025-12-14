/**
 * Council Feature
 *
 * Multiple AI models collaborating to answer questions.
 * Re-exports public API from internal layers.
 */

// ============================================================================
// Domain Layer - Types and pure business logic
// ============================================================================

// Core types
export type {
  CouncilMode,
  CouncilSession,
  CouncilSessionDetail,
  CouncilMessage,
  CouncilUserMessage,
  CouncilAssistantMessage,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
} from "./domain";

// API response types
export type {
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "./domain";

// SSE event types
export type { SSEEventType, SSEEvent, Stage1ChunkEvent, Stage1ModelCompleteEvent } from "./domain";

// Internal state types
export type { CurrentStage, ModelMapping, ComputedMessageData, StreamState } from "./domain";
export { createInitialStreamState } from "./domain";

// Pure utility functions
export {
  formatModelName,
  buildLabelToModel,
  buildModelToLabel,
  buildModelMapping,
  getLabelForModel,
  getModelForLabel,
  parseRankingFromText,
  calculateAggregateRankings,
  getWinner,
  isRankingConclusive,
  computeMessageDisplayData,
  isMessageComplete,
  getMessageCompletionStatus,
} from "./domain";

// ============================================================================
// Services Layer - API communication
// ============================================================================

export {
  createCouncilSession,
  getCouncilSessions,
  getCouncilSession,
  deleteCouncilSession,
  getProcessingStatus,
  abortCouncilProcessing,
  getCouncilMessageUrl,
  getReconnectUrl,
} from "./services";

// Stream utilities (advanced usage)
export { streamSSE, reconnectSSE, StreamError } from "./services";
export { StreamEventProcessor } from "./services";
export type { StreamEventCallbacks, StreamEventProcessorOptions } from "./services";

// ============================================================================
// State Layer - React hooks and context
// ============================================================================

// Context provider and consumer (primary API)
export { CouncilProvider, useCouncilContext } from "./state";
export type { CouncilContextValue } from "./state";

// Split contexts for render optimization
export {
  CouncilMessagesProvider,
  useCouncilMessagesContext,
  CouncilStreamProvider,
  useCouncilStreamContext,
  CouncilStatusProvider,
  useCouncilStatusContext,
} from "./state";
export type {
  CouncilMessagesContextValue,
  CouncilStreamContextValue,
  CouncilStatusContextValue,
} from "./state";

// Sessions context (for layout-level persistence)
export { CouncilSessionsProvider, useCouncilSessionsContext } from "./state";
export type { CouncilSessionsContextValue } from "./state";

// Sessions management hook (for standalone usage)
export { useCouncilSessions } from "./state";

// UI utilities
export { useTitleAlert } from "./state";

// Internal state hooks (advanced usage)
export { useCouncilState, useCouncilStream } from "./state";
export type {
  CouncilState,
  CouncilStateActions,
  UseCouncilStreamCallbacks,
  UseCouncilStreamReturn,
} from "./state";

// ============================================================================
// UI Layer - React components
// ============================================================================

// Layout components
export { CouncilSidebar } from "./ui";

// Message display components
export { MessageList } from "./ui";
export {
  UserMessage,
  AssistantMessage,
  StreamingMessage,
  PendingMessage,
  ErrorMessage,
} from "./ui";

// Input component
export { InputArea } from "./ui";

// Stage visualization components
export { StageProgress } from "./ui";
export { Stage1Panel, Stage2Panel, Stage3Panel } from "./ui";

// Utility components
export { MarkdownRenderer } from "./ui";
