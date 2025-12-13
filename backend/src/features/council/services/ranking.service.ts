/**
 * Council Ranking Service
 * Handles ranking text parsing and aggregate ranking calculations.
 */

import type { IStage2Review } from '../../../shared';
import type { AggregateRanking } from '../../../shared';

/**
 * Parse ranking from model's evaluation text
 * Looks for "FINAL RANKING:" section and extracts Response labels
 */
export const parseRankingFromText = (rankingText: string): string[] => {
  // Look for "FINAL RANKING:" section
  if (rankingText.includes('FINAL RANKING:')) {
    const parts = rankingText.split('FINAL RANKING:');
    if (parts.length >= 2) {
      const rankingSection = parts[1];
      // Try numbered list format first (e.g., "1. Response A")
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatches) {
        return numberedMatches.map((m) => {
          const match = m.match(/Response [A-Z]/);
          return match ? match[0] : '';
        }).filter(Boolean);
      }
      // Fallback: Extract all "Response X" patterns in order
      const matches = rankingSection.match(/Response [A-Z]/g);
      return matches || [];
    }
  }
  // Fallback: try to find any "Response X" patterns
  const matches = rankingText.match(/Response [A-Z]/g);
  return matches || [];
};

/**
 * Calculate aggregate rankings across all evaluations
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

  // Sort by average rank (lower is better)
  aggregate.sort((a, b) => a.averageRank - b.averageRank);

  return aggregate;
};
