/**
 * Council 순위 서비스
 * 순위 텍스트 파싱 및 집계 순위 계산 처리
 */

import type { IStage2Review } from '@shared';
import type { AggregateRanking } from '@shared';

/**
 * 모델의 평가 텍스트에서 순위 파싱
 * "FINAL RANKING:" 섹션을 찾아서 Response 라벨 추출
 */
export const parseRankingFromText = (rankingText: string): string[] => {
  // "FINAL RANKING:" 섹션 찾기
  if (rankingText.includes('FINAL RANKING:')) {
    const parts = rankingText.split('FINAL RANKING:');
    if (parts.length >= 2) {
      const rankingSection = parts[1];
      // 먼저 번호 목록 형식 시도 (예: "1. Response A")
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatches) {
        return numberedMatches.map((m) => {
          const match = m.match(/Response [A-Z]/);
          return match ? match[0] : '';
        }).filter(Boolean);
      }
      // 대체: 모든 "Response X" 패턴을 순서대로 추출
      const matches = rankingSection.match(/Response [A-Z]/g);
      return matches || [];
    }
  }
  // 대체: 모든 "Response X" 패턴 찾기 시도
  const matches = rankingText.match(/Response [A-Z]/g);
  return matches || [];
};

/**
 * 모든 평가에 걸친 집계 순위 계산
 */
export const calculateAggregateRankings = (
  stage2Results: IStage2Review[],
  labelToModel: Record<string, string>
): AggregateRanking[] => {
  const modelPositions: Record<string, number[]> = {};

  for (const review of stage2Results) {
    const parsedRanking = parseRankingFromText(review.ranking);

    parsedRanking.forEach((label, index) => {
      const position = index + 1;
      if (labelToModel[label]) {
        const modelName = labelToModel[label];
        if (!modelPositions[modelName]) {
          modelPositions[modelName] = [];
        }
        modelPositions[modelName].push(position);
      }
    });
  }

  const aggregate: AggregateRanking[] = [];
  for (const [model, positions] of Object.entries(modelPositions)) {
    if (positions.length > 0) {
      const avgRank = positions.reduce((a, b) => a + b, 0) / positions.length;
      aggregate.push({
        model,
        averageRank: Math.round(avgRank * 100) / 100,
        rankingsCount: positions.length,
      });
    }
  }

  // 평균 순위로 정렬 (낮을수록 좋음)
  aggregate.sort((a, b) => a.averageRank - b.averageRank);

  return aggregate;
};
