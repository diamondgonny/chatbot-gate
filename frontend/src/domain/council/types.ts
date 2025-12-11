/**
 * Domain types for Council feature
 * Pure TypeScript types, no React dependencies
 */

import type {
  Stage1Response,
  Stage2Review,
  AggregateRanking,
} from "@/types/council.types";

/**
 * Current processing stage identifier
 */
export type CurrentStage = "idle" | "stage1" | "stage2" | "stage3";

/**
 * Mapping between anonymized labels and actual model names
 * e.g., "Response A" -> "anthropic/claude-sonnet-4"
 */
export interface ModelMapping {
  labelToModel: Record<string, string>;
  modelToLabel: Record<string, string>;
}

/**
 * Computed display data for a single assistant message
 * Derived from stage1/stage2 data for UI rendering
 */
export interface ComputedMessageData {
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
}

/**
 * Stream state accumulated during SSE processing
 */
export interface StreamState {
  stage1Responses: Stage1Response[];
  stage1StreamingContent: Record<string, string>;
  stage2Reviews: Stage2Review[];
  stage2StreamingContent: Record<string, string>;
  stage3Synthesis: import("@/types/council.types").Stage3Synthesis | null;
  stage3StreamingContent: string;
  stage3ReasoningContent: string;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  currentStage: CurrentStage;
}

/**
 * Initial empty stream state factory
 */
export function createInitialStreamState(): StreamState {
  return {
    stage1Responses: [],
    stage1StreamingContent: {},
    stage2Reviews: [],
    stage2StreamingContent: {},
    stage3Synthesis: null,
    stage3StreamingContent: "",
    stage3ReasoningContent: "",
    labelToModel: {},
    aggregateRankings: [],
    currentStage: "idle",
  };
}
