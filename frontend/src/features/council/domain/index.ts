/**
 * Council Domain Layer
 *
 * Council feature를 위한 순수 비즈니스 로직과 type
 * React 의존성 없음 - 어디서나 사용 가능
 */

// API/External type (council.types.ts에서)
export type {
  CouncilMode,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  CouncilUserMessage,
  CouncilAssistantMessage,
  CouncilMessage,
  CouncilSession,
  CouncilSessionDetail,
  AggregateRanking,
  SSEEventType,
  Stage1ChunkEvent,
  Stage1ModelCompleteEvent,
  SSEEvent,
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "./council.types";

// Domain type (types.ts에서)
export type { CurrentStage, ModelMapping, ComputedMessageData, StreamState } from "./types";
export { createInitialStreamState } from "./types";

// Model mapping utility
export {
  formatModelName,
  buildLabelToModel,
  buildModelToLabel,
  buildModelMapping,
  getLabelForModel,
  getModelForLabel,
} from "./modelMapping";

// Ranking 계산 utility
export {
  parseRankingFromText,
  calculateAggregateRankings,
  getWinner,
  isRankingConclusive,
} from "./rankingCalculations";

// Message 재구성 utility
export {
  computeMessageDisplayData,
  isMessageComplete,
  getMessageCompletionStatus,
} from "./messageReconstruction";
