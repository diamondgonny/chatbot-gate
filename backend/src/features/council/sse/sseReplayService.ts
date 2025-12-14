/**
 * SSE Replay Service
 * Handles replaying accumulated state to reconnecting clients.
 */

import { Response } from 'express';
import type { ActiveProcessing } from './sseJobTracker';

/**
 * Write SSE event to response
 */
const writeEvent = (res: Response, event: object): void => {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

/**
 * Replay Stage 1 accumulated state
 */
const replayStage1 = (res: Response, processing: ActiveProcessing): void => {
  const hasData = processing.stage1Results.length > 0 ||
    Object.keys(processing.stage1StreamingContent).length > 0;

  if (!hasData && processing.currentStage !== 'stage1') {
    return;
  }

  writeEvent(res, { type: 'stage1_start' });

  // Send completed responses
  for (const result of processing.stage1Results) {
    writeEvent(res, { type: 'stage1_response', data: result });
  }

  // Send streaming content for models still in progress
  if (processing.currentStage === 'stage1') {
    for (const [model, content] of Object.entries(processing.stage1StreamingContent)) {
      if (content) {
        writeEvent(res, { type: 'stage1_chunk', model, delta: content });
      }
    }
  }

  // Only send complete if Stage 1 is actually done
  if (processing.currentStage !== 'stage1') {
    writeEvent(res, { type: 'stage1_complete' });
  }
};

/**
 * Replay Stage 2 accumulated state
 */
const replayStage2 = (res: Response, processing: ActiveProcessing): void => {
  const hasData = processing.stage2Results.length > 0 ||
    Object.keys(processing.stage2StreamingContent).length > 0;

  if (!hasData && processing.currentStage !== 'stage2') {
    return;
  }

  writeEvent(res, { type: 'stage2_start' });

  // Send completed responses
  for (const result of processing.stage2Results) {
    writeEvent(res, { type: 'stage2_response', data: result });
  }

  // Send streaming content for models still in progress
  if (processing.currentStage === 'stage2') {
    for (const [model, content] of Object.entries(processing.stage2StreamingContent)) {
      if (content) {
        writeEvent(res, { type: 'stage2_chunk', model, delta: content });
      }
    }
  }

  // Only send complete if Stage 2 is actually done (has labelToModel data)
  if (processing.currentStage !== 'stage2' && Object.keys(processing.labelToModel).length > 0) {
    writeEvent(res, {
      type: 'stage2_complete',
      data: {
        labelToModel: processing.labelToModel,
        aggregateRankings: processing.aggregateRankings,
      },
    });
  }
};

/**
 * Replay Stage 3 accumulated state
 */
const replayStage3 = (res: Response, processing: ActiveProcessing): void => {
  const hasData = !!processing.stage3Content || !!processing.stage3Reasoning;

  if (!hasData && processing.currentStage !== 'stage3') {
    return;
  }

  writeEvent(res, { type: 'stage3_start' });

  // Send accumulated reasoning first
  if (processing.stage3Reasoning) {
    writeEvent(res, { type: 'stage3_reasoning_chunk', delta: processing.stage3Reasoning });
  }

  // Send accumulated content
  if (processing.stage3Content) {
    writeEvent(res, { type: 'stage3_chunk', delta: processing.stage3Content });
  }
};

/**
 * Replay all accumulated state to a reconnecting client
 */
export const replayAccumulatedState = (res: Response, processing: ActiveProcessing): void => {
  // Replay each stage's accumulated state
  replayStage1(res, processing);
  replayStage2(res, processing);
  replayStage3(res, processing);

  // Send reconnection marker with current stage
  writeEvent(res, {
    type: 'reconnected',
    stage: processing.currentStage,
    userMessage: processing.userMessage,
  });
};
