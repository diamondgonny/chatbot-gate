/**
 * Council feature용 순위 계산 utility
 * Peer review 순위의 파싱 및 집계 처리
 */

import type { Stage2Review, AggregateRanking } from "./council.types";

/**
 * 검토 텍스트에서 순위 레이블 파싱
 * 순위 텍스트에서 "Response A", "Response B" 등을 추출
 *
 * @example
 * parseRankingFromText("FINAL RANKING:\n1. Response B\n2. Response A\n3. Response C");
 * // ["Response B", "Response A", "Response C"]
 */
export function parseRankingFromText(rankingText: string): string[] {
  // 구조화된 FINAL RANKING 섹션에서 파싱 시도
  if (rankingText.includes("FINAL RANKING:")) {
    const parts = rankingText.split("FINAL RANKING:");
    if (parts.length >= 2) {
      const rankingSection = parts[1];

      // 먼저 번호 형식 시도 (예: "1. Response A")
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatches) {
        return numberedMatches
          .map((m) => {
            const match = m.match(/Response [A-Z]/);
            return match ? match[0] : "";
          })
          .filter(Boolean);
      }

      // 단순 Response X 패턴으로 fallback
      const matches = rankingSection.match(/Response [A-Z]/g);
      return matches || [];
    }
  }

  // 텍스트 전체에서 Response X 패턴 찾기로 fallback
  const matches = rankingText.match(/Response [A-Z]/g);
  return matches || [];
}

/**
 * Stage2 review에서 집계 순위 계산
 * 모든 reviewer에 걸쳐 각 model의 평균 순위 위치를 계산
 *
 * @example
 * const reviews = [
 *   { model: "gpt-4o", parsedRanking: ["Response B", "Response A"], ... },
 *   { model: "claude", parsedRanking: ["Response A", "Response B"], ... }
 * ];
 * const labelToModel = { "Response A": "gpt-4o", "Response B": "claude" };
 * calculateAggregateRankings(reviews, labelToModel);
 * // [
 * //   { model: "gpt-4o", averageRank: 1.5, rankingsCount: 2 },
 * //   { model: "claude", averageRank: 1.5, rankingsCount: 2 }
 * // ]
 */
export function calculateAggregateRankings(
  stage2: Stage2Review[],
  labelToModel: Record<string, string>
): AggregateRanking[] {
  const modelPositions: Record<string, number[]> = {};

  for (const review of stage2) {
    // 누락되거나 유효하지 않은 parsedRanking에 대한 보호 (이전 레코드 또는 추출 실패)
    const parsedRanking =
      Array.isArray(review.parsedRanking) && review.parsedRanking.length > 0
        ? review.parsedRanking
        : parseRankingFromText(review.ranking || "");

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

  // 각 model의 평균 순위 계산
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

  // 평균 순위 기준 정렬 (최상위 우선)
  aggregate.sort((a, b) => a.averageRank - b.averageRank);
  return aggregate;
}

export function getWinner(rankings: AggregateRanking[]): AggregateRanking | undefined {
  return rankings[0];
}

/**
 * 순위가 결정적인지 확인 (명확한 승자)
 * 상위 model이 평균 순위에서 현저히 우수하면 결정적
 */
export function isRankingConclusive(
  rankings: AggregateRanking[],
  threshold = 0.5
): boolean {
  if (rankings.length < 2) return true;
  const [first, second] = rankings;
  return second.averageRank - first.averageRank >= threshold;
}
