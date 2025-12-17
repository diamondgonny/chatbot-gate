/**
 * Council 영속성 서비스
 * Council 메시지의 데이터베이스 작업 처리
 */

import {
  ICouncilSession,
  IStage1Response,
  IStage2Review,
  IStage3Synthesis,
  CouncilMode,
} from '@shared';

/**
 * 부분 결과를 포함한 중단된 council 메시지 저장
 * 최소한 일부 stage1 결과가 존재할 때만 저장
 */
export const saveAbortedMessage = async (
  session: ICouncilSession,
  mode: CouncilMode,
  chairmanModel: string,
  stage1: IStage1Response[],
  stage2: IStage2Review[],
  stage3Content: string | null,
  stage3Reasoning?: string | null
): Promise<boolean> => {
  // 최소한 일부 stage1 결과가 있을 때만 저장
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
          model: chairmanModel,
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
 * 모든 stage 결과를 포함한 완전한 council 메시지 저장
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

  // 사용자 및 assistant 메시지를 원자적으로 저장
  // 참고: 제목은 즉각적인 UI 업데이트를 위해 callback을 통해 별도로 저장됨
  await session.save();
};
