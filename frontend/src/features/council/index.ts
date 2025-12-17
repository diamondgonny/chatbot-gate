/**
 * Council Feature
 *
 * 질문에 답하기 위해 협력하는 여러 AI model
 * 내부 layer로부터 public API를 재export
 */

// ============================================================================
// Domain Layer - Type 및 순수 비즈니스 로직
// ============================================================================

// 핵심 type
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

// API response type
export type {
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "./domain";

// SSE event type
export type { SSEEventType, SSEEvent, Stage1ChunkEvent, Stage1ModelCompleteEvent } from "./domain";

// 내부 state type
export type { CurrentStage, ModelMapping, ComputedMessageData, StreamState } from "./domain";
export { createInitialStreamState } from "./domain";

// 순수 utility 함수
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
// Services Layer - API 통신
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

// Stream utility (고급 사용)
export { streamSSE, reconnectSSE, StreamError } from "./services";
export { StreamEventProcessor } from "./services";
export type { StreamEventCallbacks, StreamEventProcessorOptions } from "./services";

// ============================================================================
// State Layer - React hook 및 context
// ============================================================================

// Context provider 및 consumer (기본 API)
export { CouncilProvider, useCouncilContext } from "./state";
export type { CouncilContextValue } from "./state";

// Render 최적화를 위한 분리된 context
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

// Session context (layout 레벨 지속성)
export { CouncilSessionsProvider, useCouncilSessionsContext } from "./state";
export type { CouncilSessionsContextValue } from "./state";

// Session 관리 hook (독립 실행용)
export { useCouncilSessions } from "./state";

// UI utility
export { useTitleAlert } from "./state";

// 내부 state hook (고급 사용)
export { useCouncilState, useCouncilStream } from "./state";
export type {
  CouncilState,
  CouncilStateActions,
  UseCouncilStreamCallbacks,
  UseCouncilStreamReturn,
} from "./state";

// ============================================================================
// UI Layer - React component
// ============================================================================

// Layout component
export { CouncilSidebar } from "./ui";

// Message 표시 component
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

// Stage 시각화 component
export { StageProgress } from "./ui";
export { Stage1Panel, Stage2Panel, Stage3Panel } from "./ui";

// Utility component
export { MarkdownRenderer } from "./ui";
