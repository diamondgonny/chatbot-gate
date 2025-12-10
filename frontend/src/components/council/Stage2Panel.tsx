"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Stage2Review, AggregateRanking } from "@/types";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Stage2PanelProps {
  reviews: Stage2Review[];
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  isLoading?: boolean;
}

function formatModelName(model: string): string {
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Replace "Response X" labels with actual model names for markdown rendering
 */
function deAnonymizeForMarkdown(
  text: string,
  labelToModel: Record<string, string>
): string {
  return text.replace(/Response [A-Z]/g, (match) => {
    const modelName = labelToModel[match];
    if (modelName) {
      return `**${formatModelName(modelName)}**`;
    }
    return match;
  });
}

export function Stage2Panel({
  reviews,
  labelToModel,
  aggregateRankings,
  isLoading,
}: Stage2PanelProps) {
  // Tab index: 0 = Results, 1+ = individual reviews
  const [activeTab, setActiveTab] = useState(0);

  // Reset to Results tab when reviews change (e.g., new question started)
  useEffect(() => {
    setActiveTab(0);
  }, [reviews.length]);

  if (reviews.length === 0 && !isLoading) {
    return null;
  }

  const hasResults = aggregateRankings.length > 0;

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">
          Stage 2: Peer Reviews
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Models evaluated each other anonymously. Model names shown in{" "}
          <span className="text-blue-400 font-semibold">blue</span> are for
          readability only.
          <span className="relative inline-block group ml-2 align-middle">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-300">
              i
            </span>
            <span className="absolute left-1/2 z-10 mt-2 w-64 -translate-x-1/2 rounded-md bg-slate-900/95 px-3 py-2 text-[11px] text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Responses are relabeled as Response A/B/C so reviewers can&apos;t
              favor their own model. The mapping is only used here for
              readability.
            </span>
          </span>
        </p>
      </div>

      {/* Tab buttons */}
      <div className="flex overflow-x-auto border-b border-slate-700 bg-slate-800/30">
        {/* Results tab (first) */}
        {hasResults && (
          <button
            onClick={() => setActiveTab(0)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              activeTab === 0
                ? "text-green-400 border-b-2 border-green-400 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Results
          </button>
        )}
        {reviews.map((review, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(hasResults ? index + 1 : index)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              activeTab === (hasResults ? index + 1 : index)
                ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {formatModelName(review.model)}
          </button>
        ))}
        {isLoading && (
          <div className="px-4 py-2 text-sm text-slate-500 flex items-center gap-2">
            <span className="animate-spin">⏳</span> Loading...
          </div>
        )}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {/* Results tab content */}
        {activeTab === 0 && hasResults && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4"
          >
            <h4 className="text-sm font-medium text-slate-300 mb-3">
              Aggregate Rankings (Lower = Better)
            </h4>
            <div className="space-y-2">
              {aggregateRankings.map((ranking, index) => (
                <div
                  key={ranking.model}
                  className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                        index === 0
                          ? "bg-yellow-500/20 text-yellow-400"
                          : index === 1
                          ? "bg-slate-400/20 text-slate-300"
                          : index === 2
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-slate-600/20 text-slate-400"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-slate-300 text-sm">
                      {formatModelName(ranking.model)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-sm">
                      Avg: {ranking.averageRank.toFixed(2)}
                    </span>
                    <span className="text-slate-600 text-xs ml-2">
                      ({ranking.rankingsCount} votes)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Individual review tab content */}
        {(() => {
          const reviewIndex = hasResults ? activeTab - 1 : activeTab;
          const isReviewTab = hasResults ? activeTab > 0 : activeTab >= 0;
          const review = reviews[reviewIndex];

          if (!isReviewTab || !review) return null;

          return (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-500">
                  Reviewed by: {formatModelName(review.model)}
                </span>
                <span className="text-xs text-slate-600">
                  {review.responseTimeMs}ms
                  {review.promptTokens !== undefined && (
                    <> | {review.promptTokens}+{review.completionTokens} tokens</>
                  )}
                </span>
              </div>

              {/* De-anonymized review text with Markdown */}
              <MarkdownRenderer
                content={deAnonymizeForMarkdown(review.ranking, labelToModel)}
              />

              {/* Parsed ranking */}
              {Array.isArray(review.parsedRanking) &&
                review.parsedRanking.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <h4 className="text-xs font-medium text-slate-400 mb-2">
                    Extracted Ranking:
                  </h4>
                  <ol className="list-decimal list-inside text-sm text-slate-400">
                    {review.parsedRanking.map((label, idx) => (
                      <li key={idx}>
                        <span className="text-blue-400 font-semibold">
                          {labelToModel[label]
                            ? formatModelName(labelToModel[label])
                            : label}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
