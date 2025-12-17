/**
 * 부분 결과 빌더
 * 스트리밍 컨텐츠에서 부분 결과를 빌드하는 유틸리티 함수
 * 처리가 중간에 중단될 때 사용
 */

import type { IStage1Response, IStage2Review } from '@shared';

/**
 * 완료된 결과 + 스트리밍 컨텐츠에서 부분 Stage 1 응답 빌드
 * Stage 1 중에 처리가 중단될 때 사용
 */
export const buildPartialStage1Responses = (
  completedResponses: IStage1Response[],
  streamingContent: Record<string, string>
): IStage1Response[] => {
  const partialResponses: IStage1Response[] = [...completedResponses];

  for (const [model, content] of Object.entries(streamingContent)) {
    if (content.trim()) {
      partialResponses.push({
        model,
        response: content,  // 부분 컨텐츠
        responseTimeMs: 0,  // 완료되지 않아 알 수 없음
      });
    }
  }

  return partialResponses;
};

/**
 * 완료된 결과 + 스트리밍 컨텐츠에서 부분 Stage 2 리뷰 빌드
 * Stage 2 중에 처리가 중단될 때 사용
 * @param parseRankingFn - 텍스트에서 순위를 파싱하는 함수 (dependency injection)
 */
export const buildPartialStage2Reviews = (
  completedReviews: IStage2Review[],
  streamingContent: Record<string, string>,
  parseRankingFn: (text: string) => string[]
): IStage2Review[] => {
  const partialReviews: IStage2Review[] = [...completedReviews];

  for (const [model, content] of Object.entries(streamingContent)) {
    if (content.trim()) {
      partialReviews.push({
        model,
        ranking: content,  // 부분 컨텐츠
        parsedRanking: parseRankingFn(content),  // 가진 것으로 파싱 시도
        responseTimeMs: 0,  // 완료되지 않아 알 수 없음
      });
    }
  }

  return partialReviews;
};
