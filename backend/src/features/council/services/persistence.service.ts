/**
 * Council Persistence Service
 * Handles database operations for council messages.
 */

import {
  ICouncilSession,
  IStage1Response,
  IStage2Review,
  IStage3Synthesis,
  CouncilMode,
  getChairmanForMode,
} from '../../../shared';

export interface SaveMessageOptions {
  session: ICouncilSession;
  mode: CouncilMode;
  stage1: IStage1Response[];
  stage2?: IStage2Review[];
  stage3?: IStage3Synthesis | null;
  wasAborted?: boolean;
}

/**
 * Save an aborted council message with partial results
 * Only saves if at least some stage1 results exist
 */
export const saveAbortedMessage = async (
  session: ICouncilSession,
  mode: CouncilMode,
  stage1: IStage1Response[],
  stage2: IStage2Review[],
  stage3Content: string | null,
  stage3Reasoning?: string | null
): Promise<boolean> => {
  // Only save if we have at least some stage1 results
  if (stage1.length === 0) {
    console.log('[Council] No results to save on abort');
    return false;
  }

  session.messages.push({
    role: 'assistant',
    mode,
    stage1,
    stage2: stage2.length > 0 ? stage2 : undefined,
    stage3: stage3Content
      ? {
          model: getChairmanForMode(mode),
          response: stage3Content,
          reasoning: stage3Reasoning || undefined,
          responseTimeMs: 0,
        }
      : undefined,
    wasAborted: true,
    timestamp: new Date(),
  });

  await session.save();
  console.log('[Council] Saved partial results on abort');
  return true;
};

/**
 * Save a complete council message with all stage results
 */
export const saveCompleteMessage = async (
  session: ICouncilSession,
  mode: CouncilMode,
  stage1Results: IStage1Response[],
  stage2Results: IStage2Review[],
  stage3Result: IStage3Synthesis
): Promise<void> => {
  session.messages.push({
    role: 'assistant',
    mode,
    stage1: stage1Results,
    stage2: stage2Results,
    stage3: stage3Result,
    timestamp: new Date(),
  });

  // Save both user and assistant messages atomically
  // Note: Title is saved separately via callback for immediate UI update
  await session.save();
};
