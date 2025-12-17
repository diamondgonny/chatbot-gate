/**
 * Council Feature
 *
 * 질문에 답하기 위해 협력하는 여러 AI model
 * 내부 layer로부터 public API를 재export
 */

// ============================================================================
// Types Layer - Type 정의
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
} from "./types";

// API response type
export type {
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "./types";

// SSE event type
export type { SSEEventType, SSEEvent, Stage1ChunkEvent, Stage1ModelCompleteEvent } from "./types";

// 내부 state type
export type { CurrentStage, ModelMapping, ComputedMessageData, StreamState } from "./types";
export { createInitialStreamState } from "./types";

// ============================================================================
// Utils Layer - 순수 비즈니스 로직
// ============================================================================

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
} from "./utils";

// ============================================================================
// API Layer - API 통신
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
} from "./api";

// Stream utility (고급 사용)
export { streamSSE, reconnectSSE, StreamError } from "./api";
export { StreamEventProcessor } from "./api";
export type { StreamEventCallbacks, StreamEventProcessorOptions } from "./api";

// ============================================================================
// Hooks Layer - React hook 및 context
// ============================================================================

// Context provider 및 consumer (기본 API)
export { CouncilProvider, useCouncilContext } from "./hooks";
export type { CouncilContextValue } from "./hooks";

// Render 최적화를 위한 분리된 context
export {
  CouncilMessagesProvider,
  useCouncilMessagesContext,
  CouncilStreamProvider,
  useCouncilStreamContext,
  CouncilStatusProvider,
  useCouncilStatusContext,
} from "./hooks";
export type {
  CouncilMessagesContextValue,
  CouncilStreamContextValue,
  CouncilStatusContextValue,
} from "./hooks";

// Session context (layout 레벨 지속성)
export { CouncilSessionsProvider, useCouncilSessionsContext } from "./hooks";
export type { CouncilSessionsContextValue } from "./hooks";

// Session 관리 hook (독립 실행용)
export { useCouncilSessions } from "./hooks";

// UI utility
export { useTitleAlert } from "./hooks";

// 내부 state hook (고급 사용)
export { useCouncilState, useCouncilStream } from "./hooks";
export type {
  CouncilState,
  CouncilStateActions,
  UseCouncilStreamCallbacks,
  UseCouncilStreamReturn,
} from "./hooks";

// ============================================================================
// Components Layer - React component
// ============================================================================

// Layout component
export { CouncilSidebar } from "./components";

// Message 표시 component
export { MessageList } from "./components";
export {
  UserMessage,
  AssistantMessage,
  StreamingMessage,
  PendingMessage,
  ErrorMessage,
} from "./components";

// Input component
export { InputArea } from "./components";

// Stage 시각화 component
export { StageProgress } from "./components";
export { Stage1Panel, Stage2Panel, Stage3Panel } from "./components";

// Utility component
export { MarkdownRenderer } from "./components";
