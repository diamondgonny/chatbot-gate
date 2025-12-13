/**
 * Ranking calculation utilities for Council feature
 * Handles parsing and aggregation of peer review rankings
 */

import type { Stage2Review, AggregateRanking } from "./council.types";

/**
 * Parse ranking labels from review text
 * Extracts "Response A", "Response B", etc. from ranking text
 *
 * @example
 * parseRankingFromText("FINAL RANKING:\n1. Response B\n2. Response A\n3. Response C");
 * // ["Response B", "Response A", "Response C"]
 */
export function parseRankingFromText(rankingText: string): string[] {
  // Try to parse from structured FINAL RANKING section
  if (rankingText.includes("FINAL RANKING:")) {
    const parts = rankingText.split("FINAL RANKING:");
    if (parts.length >= 2) {
      const rankingSection = parts[1];

      // Try numbered format first (e.g., "1. Response A")
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatches) {
        return numberedMatches
          .map((m) => {
            const match = m.match(/Response [A-Z]/);
            return match ? match[0] : "";
          })
          .filter(Boolean);
      }

      // Fall back to simple Response X pattern
      const matches = rankingSection.match(/Response [A-Z]/g);
      return matches || [];
    }
  }

  // Fall back to finding all Response X patterns in the text
  const matches = rankingText.match(/Response [A-Z]/g);
  return matches || [];
}

/**
 * Calculate aggregate rankings from stage2 reviews
 * Computes average rank position for each model across all reviewers
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
    // Guard against missing/invalid parsedRanking (older records or failed extraction)
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

  // Calculate average rank for each model
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

  // Sort by average rank (best first)
  aggregate.sort((a, b) => a.averageRank - b.averageRank);
  return aggregate;
}

/**
 * Get the winner (best ranked model) from aggregate rankings
 */
export function getWinner(rankings: AggregateRanking[]): AggregateRanking | undefined {
  return rankings[0];
}

/**
 * Check if rankings are conclusive (clear winner)
 * A ranking is conclusive if the top model has a significantly better average rank
 */
export function isRankingConclusive(
  rankings: AggregateRanking[],
  threshold = 0.5
): boolean {
  if (rankings.length < 2) return true;
  const [first, second] = rankings;
  return second.averageRank - first.averageRank >= threshold;
}
