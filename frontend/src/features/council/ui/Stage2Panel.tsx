"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Stage2Review, AggregateRanking } from "../domain";
import { formatModelName } from "../domain";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Stage2PanelProps {
  reviews: Stage2Review[];
  streamingContent?: Record<string, string>;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  isLoading?: boolean;
  hideResults?: boolean;
  wasAborted?: boolean;
}

/**
 * Replace "Response X" labels with actual model names for markdown rendering
 * Uses word boundary to avoid matching inside words (e.g., "Evaluations")
 */
function deAnonymizeForMarkdown(
  text: string,
  labelToModel: Record<string, string>
): string {
  return text.replace(/\bResponse [A-Z]\b/g, (match) => {
    const modelName = labelToModel[match];
    if (modelName) {
      return `**${formatModelName(modelName)}**`;
    }
    return match;
  });
}

export function Stage2Panel({
  reviews,
  streamingContent = {},
  labelToModel,
  aggregateRankings,
  isLoading,
  hideResults = false,
  wasAborted,
}: Stage2PanelProps) {
  // Tab index: 0 = Results, 1+ = individual reviews
  const [activeTab, setActiveTab] = useState(0);

  // Combine completed reviews and streaming models
  const allModels = useMemo(() => {
    const completedModels = reviews.map((r) => r.model);
    const streamingModels = Object.keys(streamingContent).filter(
      (m) => !completedModels.includes(m)
    );
    return [...completedModels, ...streamingModels];
  }, [reviews, streamingContent]);

  // Reset tab when reviews change or hideResults changes
  useEffect(() => {
    // If results are hidden, default to first model tab (index 0 without results tab)
    // Otherwise, default to Results tab (index 0)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on data change
    setActiveTab(0);
  }, [reviews.length, hideResults]);

  if (allModels.length === 0 && !isLoading) {
    return null;
  }

  const hasResults = aggregateRankings.length > 0 && !hideResults;

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">
          Stage 2: Peer Reviews
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Models evaluated each other anonymously. Model names shown in{" "}
          <span className="text-slate-200 font-semibold">bold</span> are for
          readability only.
          <span className="relative inline-flex items-center justify-center w-8 h-8 align-middle group">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-300">
              i
            </span>
            <span className="absolute left-1/2 top-full z-10 mt-1 w-64 -translate-x-1/2 rounded-md bg-slate-900/95 px-3 py-2 text-[11px] text-slate-200 opacity-0 shadow-lg transition-opacity pointer-events-none group-hover:opacity-100">
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
        {allModels.map((model, index) => {
          const isModelStreaming = !reviews.find((r) => r.model === model);
          return (
            <button
              key={model}
              onClick={() => setActiveTab(hasResults ? index + 1 : index)}
              className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                activeTab === (hasResults ? index + 1 : index)
                  ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800/50"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              {formatModelName(model)}
              {isModelStreaming && !wasAborted && (
                <span className="ml-1 inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
        {isLoading && allModels.length === 0 && (
          <div className="px-4 py-2 text-sm text-slate-500 flex items-center gap-2">
            <span className="animate-spin">⏳</span> Connecting...
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

          if (!isReviewTab || reviewIndex < 0 || reviewIndex >= allModels.length) return null;

          const activeModel = allModels[reviewIndex];
          const completedReview = reviews.find((r) => r.model === activeModel);
          const isStreaming = !completedReview && !!streamingContent[activeModel];
          const activeContent = completedReview?.ranking || streamingContent[activeModel] || "";

          if (!activeModel) return null;

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
                  Reviewed by: {formatModelName(activeModel)}
                  {isStreaming && !wasAborted && (
                    <span className="ml-2 text-green-400">● Streaming...</span>
                  )}
                </span>
                {completedReview && (
                  <span className="text-xs text-slate-600">
                    {completedReview.responseTimeMs}ms
                    {completedReview.promptTokens !== undefined && (
                      <> | {completedReview.promptTokens}+{completedReview.completionTokens} tokens</>
                    )}
                  </span>
                )}
              </div>

              {/* De-anonymized review text with Markdown */}
              <div>
                <MarkdownRenderer
                  content={deAnonymizeForMarkdown(activeContent, labelToModel)}
                  className="stage2-review"
                />
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
