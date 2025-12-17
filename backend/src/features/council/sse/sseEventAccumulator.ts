/**
 * SSE 이벤트 누적기
 * 재연결 시 재생을 위한 이벤트 상태 누적
 */

import type { SSEEvent } from '@shared';
import { ActiveProcessing } from './sseJobTracker';

export class SSEEventAccumulator {
  /**
   * 이벤트 기록 및 누적 상태 업데이트
   */
  recordEvent(processing: ActiveProcessing, event: SSEEvent): void {
    processing.lastEventAt = new Date();

    // 이벤트 타입에 따라 상태 업데이트
    switch (event.type) {
      case 'stage1_start':
        processing.currentStage = 'stage1';
        break;
      case 'stage1_chunk':
        // 이 모델의 스트리밍 컨텐츠 누적
        if ('model' in event && 'delta' in event && event.model && event.delta) {
          processing.stage1StreamingContent[event.model] =
            (processing.stage1StreamingContent[event.model] || '') + event.delta;
        }
        break;
      case 'stage1_response':
        if (event.data) {
          // 완료된 모델의 스트리밍 컨텐츠 정리
          delete processing.stage1StreamingContent[event.data.model];
          processing.stage1Results.push(event.data);
        }
        break;
      case 'stage1_complete':
        // 모든 stage1 스트리밍 컨텐츠 정리
        processing.stage1StreamingContent = {};
        break;
      case 'stage2_start':
        processing.currentStage = 'stage2';
        break;
      case 'stage2_chunk':
        // 이 모델의 스트리밍 컨텐츠 누적
        if ('model' in event && 'delta' in event && event.model && event.delta) {
          processing.stage2StreamingContent[event.model] =
            (processing.stage2StreamingContent[event.model] || '') + event.delta;
        }
        break;
      case 'stage2_response':
        if (event.data) {
          // 완료된 모델의 스트리밍 컨텐츠 정리
          delete processing.stage2StreamingContent[event.data.model];
          processing.stage2Results.push(event.data);
        }
        break;
      case 'stage2_complete':
        // 모든 stage2 스트리밍 컨텐츠 정리
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
