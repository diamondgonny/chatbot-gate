/**
 * @deprecated Import from @/features/council instead
 *
 * Council Domain Layer - Re-exports for backward compatibility
 */

// Re-export everything from the new location
export {
  // Types
  type CurrentStage,
  type ModelMapping,
  type ComputedMessageData,
  type StreamState,
  createInitialStreamState,
  // Model mapping utilities
  formatModelName,
  buildLabelToModel,
  buildModelToLabel,
  buildModelMapping,
  getLabelForModel,
  getModelForLabel,
  // Ranking calculation utilities
  parseRankingFromText,
  calculateAggregateRankings,
  getWinner,
  isRankingConclusive,
  // Message reconstruction utilities
  computeMessageDisplayData,
  isMessageComplete,
  getMessageCompletionStatus,
} from "@/features/council/domain";
