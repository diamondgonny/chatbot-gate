/**
 * Council feature를 위한 domain type
 * 순수 TypeScript type, React 의존성 없음
 */

import type {
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
} from "./council.types";

/**
 * 현재 처리 중인 stage identifier
 */
export type CurrentStage = "idle" | "stage1" | "stage2" | "stage3";

/**
 * 익명화된 label과 실제 model 이름 간의 mapping
 * 예: "Response A" -> "anthropic/claude-sonnet-4"
 */
export interface ModelMapping {
  labelToModel: Record<string, string>;
  modelToLabel: Record<string, string>;
}

/**
 * 단일 assistant message의 계산된 표시 데이터
 * UI rendering을 위해 stage1/stage2 데이터로부터 유도
 */
export interface ComputedMessageData {
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
}

/**
 * SSE 처리 중 누적된 stream state
 */
export interface StreamState {
  stage1Responses: Stage1Response[];
  stage1StreamingContent: Record<string, string>;
  stage1CompletedModels: string[];
  stage2Reviews: Stage2Review[];
  stage2StreamingContent: Record<string, string>;
  stage2CompletedModels: string[];
  stage3Synthesis: Stage3Synthesis | null;
  stage3StreamingContent: string;
  stage3ReasoningContent: string;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  currentStage: CurrentStage;
}

/**
 * 초기 빈 stream state factory
 */
export function createInitialStreamState(): StreamState {
  return {
    stage1Responses: [],
    stage1StreamingContent: {},
    stage1CompletedModels: [],
    stage2Reviews: [],
    stage2StreamingContent: {},
    stage2CompletedModels: [],
    stage3Synthesis: null,
    stage3StreamingContent: "",
    stage3ReasoningContent: "",
    labelToModel: {},
    aggregateRankings: [],
    currentStage: "idle",
  };
}
