/**
 * Council feature용 message 재구성 utility
 * 저장된 message 데이터로부터 파생된 표시 데이터를 계산
 */

import type { CouncilAssistantMessage } from "./council.types";
import type { ComputedMessageData } from "./types";
import { buildLabelToModel } from "./modelMapping";
import { calculateAggregateRankings } from "./rankingCalculations";

/**
 * 단일 assistant message의 표시 데이터 계산
 * stage1/stage2 데이터로부터 labelToModel mapping 및 집계 순위를 재구성
 *
 * page.tsx와 useCouncilChat.ts에서 중복되던 계산을 중앙화
 *
 * @example
 * const message = {
 *   role: "assistant",
 *   stage1: [{ model: "gpt-4o", response: "..." }, ...],
 *   stage2: [{ model: "claude", ranking: "..." }, ...],
 *   ...
 * };
 * const { labelToModel, aggregateRankings } = computeMessageDisplayData(message);
 */
export function computeMessageDisplayData(
  message: CouncilAssistantMessage
): ComputedMessageData {
  const labelToModel = buildLabelToModel(message.stage1);
  const aggregateRankings = calculateAggregateRankings(
    message.stage2 || [],
    labelToModel
  );

  return {
    labelToModel,
    aggregateRankings,
  };
}

export function isMessageComplete(message: CouncilAssistantMessage): boolean {
  return (
    message.stage1.length > 0 &&
    (message.stage2?.length ?? 0) > 0 &&
    message.stage3 !== undefined &&
    !message.wasAborted
  );
}

export function getMessageCompletionStatus(message: CouncilAssistantMessage): {
  hasStage1: boolean;
  hasStage2: boolean;
  hasStage3: boolean;
  isComplete: boolean;
  wasAborted: boolean;
} {
  return {
    hasStage1: message.stage1.length > 0,
    hasStage2: (message.stage2?.length ?? 0) > 0,
    hasStage3: message.stage3 !== undefined,
    isComplete: isMessageComplete(message),
    wasAborted: message.wasAborted ?? false,
  };
}
