/**
 * SSE Event Accumulator
 * Accumulates event state for replay on reconnection.
 */

import type { SSEEvent } from '@shared';
import { ActiveProcessing } from './sseJobTracker';

export class SSEEventAccumulator {
  /**
   * Record event and update accumulated state
   */
  recordEvent(processing: ActiveProcessing, event: SSEEvent): void {
    processing.lastEventAt = new Date();

    // Update state based on event type
    switch (event.type) {
      case 'stage1_start':
        processing.currentStage = 'stage1';
        break;
      case 'stage1_chunk':
        // Accumulate streaming content for this model
        if ('model' in event && 'delta' in event && event.model && event.delta) {
          processing.stage1StreamingContent[event.model] =
            (processing.stage1StreamingContent[event.model] || '') + event.delta;
        }
        break;
      case 'stage1_response':
        if (event.data) {
          // Clear streaming content for completed model
          delete processing.stage1StreamingContent[event.data.model];
          processing.stage1Results.push(event.data);
        }
        break;
      case 'stage1_complete':
        // Clear all stage1 streaming content
        processing.stage1StreamingContent = {};
        break;
      case 'stage2_start':
        processing.currentStage = 'stage2';
        break;
      case 'stage2_chunk':
        // Accumulate streaming content for this model
        if ('model' in event && 'delta' in event && event.model && event.delta) {
          processing.stage2StreamingContent[event.model] =
            (processing.stage2StreamingContent[event.model] || '') + event.delta;
        }
        break;
      case 'stage2_response':
        if (event.data) {
          // Clear streaming content for completed model
          delete processing.stage2StreamingContent[event.data.model];
          processing.stage2Results.push(event.data);
        }
        break;
      case 'stage2_complete':
        // Clear all stage2 streaming content
        processing.stage2StreamingContent = {};
        if (event.data && 'labelToModel' in event.data) {
          processing.labelToModel = event.data.labelToModel;
          processing.aggregateRankings = event.data.aggregateRankings;
        }
        break;
      case 'stage3_start':
        processing.currentStage = 'stage3';
        break;
      case 'stage3_reasoning_chunk':
        if ('delta' in event && event.delta) {
          processing.stage3Reasoning += event.delta;
        }
        break;
      case 'stage3_chunk':
        if ('delta' in event && event.delta) {
          processing.stage3Content += event.delta;
        }
        break;
    }
  }
}
