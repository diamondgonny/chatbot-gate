/**
 * Message reconstruction utilities for Council feature
 * Computes derived display data from stored message data
 */

import type { CouncilAssistantMessage } from "@/types/council.types";
import type { ComputedMessageData } from "./types";
import { buildLabelToModel } from "./modelMapping";
import { calculateAggregateRankings } from "./rankingCalculations";

/**
 * Compute display data for a single assistant message
 * Reconstructs labelToModel mapping and aggregate rankings from stage1/stage2 data
 *
 * This function centralizes the computation that was previously duplicated
 * in page.tsx and useCouncilChat.ts
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

/**
 * Check if an assistant message has complete data (all 3 stages)
 */
export function isMessageComplete(message: CouncilAssistantMessage): boolean {
  return (
    message.stage1.length > 0 &&
    (message.stage2?.length ?? 0) > 0 &&
    message.stage3 !== undefined &&
    !message.wasAborted
  );
}

/**
 * Get the completion status of an assistant message
 */
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
