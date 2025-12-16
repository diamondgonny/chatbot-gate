/**
 * Partial Result Builder
 * Utility functions for building partial results from streaming content.
 * Used when processing is aborted mid-stream.
 */

import type { IStage1Response, IStage2Review } from '@shared';

/**
 * Build partial Stage 1 responses from completed results + streaming content
 * Used when processing is aborted during Stage 1
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
        response: content,  // Partial content
        responseTimeMs: 0,  // Unknown since not completed
      });
    }
  }

  return partialResponses;
};

/**
 * Build partial Stage 2 reviews from completed results + streaming content
 * Used when processing is aborted during Stage 2
 * @param parseRankingFn - Function to parse ranking from text (dependency injection)
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
        ranking: content,  // Partial content
        parsedRanking: parseRankingFn(content),  // Try to parse what we have
        responseTimeMs: 0,  // Unknown since not completed
      });
    }
  }

  return partialReviews;
};
