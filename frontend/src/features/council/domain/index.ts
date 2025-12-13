/**
 * Council Domain Layer
 *
 * Pure business logic and types for the Council feature.
 * No React dependencies - can be used anywhere.
 */

// API/External types (from council.types.ts)
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

// Domain types (from types.ts)
export type { CurrentStage, ModelMapping, ComputedMessageData, StreamState } from "./types";
export { createInitialStreamState } from "./types";

// Model mapping utilities
export {
  formatModelName,
  buildLabelToModel,
  buildModelToLabel,
  buildModelMapping,
  getLabelForModel,
  getModelForLabel,
} from "./modelMapping";

// Ranking calculation utilities
export {
  parseRankingFromText,
  calculateAggregateRankings,
  getWinner,
  isRankingConclusive,
} from "./rankingCalculations";

// Message reconstruction utilities
export {
  computeMessageDisplayData,
  isMessageComplete,
  getMessageCompletionStatus,
} from "./messageReconstruction";
