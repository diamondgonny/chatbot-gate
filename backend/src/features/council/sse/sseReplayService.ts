/**
 * SSE 재생 서비스
 * 재연결하는 클라이언트에 누적된 상태 재생 처리
 */

import { Response } from 'express';
import type { ActiveProcessing } from './sseJobTracker';

/**
 * 응답에 SSE 이벤트 작성
 */
const writeEvent = (res: Response, event: object): void => {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

/**
 * Stage 1 누적 상태 재생
 */
const replayStage1 = (res: Response, processing: ActiveProcessing): void => {
  const hasData = processing.stage1Results.length > 0 ||
    Object.keys(processing.stage1StreamingContent).length > 0;

  if (!hasData && processing.currentStage !== 'stage1') {
    return;
  }

  writeEvent(res, { type: 'stage1_start' });

  // 완료된 응답 전송
  for (const result of processing.stage1Results) {
    writeEvent(res, { type: 'stage1_response', data: result });
  }

  // 아직 진행 중인 모델의 스트리밍 컨텐츠 전송
  if (processing.currentStage === 'stage1') {
    for (const [model, content] of Object.entries(processing.stage1StreamingContent)) {
      if (content) {
        writeEvent(res, { type: 'stage1_chunk', model, delta: content });
      }
    }
  }

  // Stage 1이 실제로 완료된 경우에만 complete 전송
  if (processing.currentStage !== 'stage1') {
    writeEvent(res, { type: 'stage1_complete' });
  }
};

/**
 * Stage 2 누적 상태 재생
 */
const replayStage2 = (res: Response, processing: ActiveProcessing): void => {
  const hasData = processing.stage2Results.length > 0 ||
    Object.keys(processing.stage2StreamingContent).length > 0;

  if (!hasData && processing.currentStage !== 'stage2') {
    return;
  }

  writeEvent(res, { type: 'stage2_start' });

  // 완료된 응답 전송
  for (const result of processing.stage2Results) {
    writeEvent(res, { type: 'stage2_response', data: result });
  }

  // 아직 진행 중인 모델의 스트리밍 컨텐츠 전송
  if (processing.currentStage === 'stage2') {
    for (const [model, content] of Object.entries(processing.stage2StreamingContent)) {
      if (content) {
        writeEvent(res, { type: 'stage2_chunk', model, delta: content });
      }
    }
  }

  // Stage 2가 실제로 완료된 경우에만 complete 전송 (labelToModel 데이터 존재)
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
 * Stage 3 누적 상태 재생
 */
const replayStage3 = (res: Response, processing: ActiveProcessing): void => {
  const hasData = !!processing.stage3Content || !!processing.stage3Reasoning;

  if (!hasData && processing.currentStage !== 'stage3') {
    return;
  }

  writeEvent(res, { type: 'stage3_start' });

  // 누적된 reasoning 먼저 전송
  if (processing.stage3Reasoning) {
    writeEvent(res, { type: 'stage3_reasoning_chunk', delta: processing.stage3Reasoning });
  }

  // 누적된 컨텐츠 전송
  if (processing.stage3Content) {
    writeEvent(res, { type: 'stage3_chunk', delta: processing.stage3Content });
  }
};

/**
 * 재연결하는 클라이언트에 모든 누적 상태 재생
 */
export const replayAccumulatedState = (res: Response, processing: ActiveProcessing): void => {
  // 각 stage의 누적 상태 재생
  replayStage1(res, processing);
  replayStage2(res, processing);
  replayStage3(res, processing);

  // 현재 stage와 함께 재연결 마커 전송
  writeEvent(res, {
    type: 'reconnected',
    stage: processing.currentStage,
    userMessage: processing.userMessage,
  });
};
