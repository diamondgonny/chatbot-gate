"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Stage2Review, AggregateRanking } from "@/types";

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

function deAnonymizeText(
  text: string,
  labelToModel: Record<string, string>
): React.ReactNode {
  // Replace "Response X" with the actual model name in bold
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = /Response [A-Z]/g;
  let match;
  let partIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${partIndex++}`}>
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }

    const label = match[0];
    const modelName = labelToModel[label];

    if (modelName) {
      parts.push(
        <span key={`model-${partIndex++}`} className="font-semibold text-blue-400">
          {formatModelName(modelName)}
        </span>
      );
    } else {
      parts.push(
        <span key={`label-${partIndex++}`}>{label}</span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${partIndex}`}>{text.slice(lastIndex)}</span>
    );
  }

  return parts;
}

export function Stage2Panel({
  reviews,
  labelToModel,
  aggregateRankings,
  isLoading,
}: Stage2PanelProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (reviews.length === 0 && !isLoading) {
    return null;
  }

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
        </p>
      </div>

      {/* Tab buttons */}
      <div className="flex overflow-x-auto border-b border-slate-700 bg-slate-800/30">
        {reviews.map((review, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              activeTab === index
                ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {formatModelName(review.model)}
          </button>
        ))}
        {/* Aggregate tab */}
        {aggregateRankings.length > 0 && (
          <button
            onClick={() => setActiveTab(reviews.length)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              activeTab === reviews.length
                ? "text-green-400 border-b-2 border-green-400 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Aggregate
          </button>
        )}
        {isLoading && (
          <div className="px-4 py-2 text-sm text-slate-500 flex items-center gap-2">
            <span className="animate-spin">⏳</span> Loading...
          </div>
        )}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab < reviews.length && reviews[activeTab] && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500">
                Reviewed by: {formatModelName(reviews[activeTab].model)}
              </span>
              <span className="text-xs text-slate-600">
                {reviews[activeTab].responseTimeMs}ms
              </span>
            </div>

            {/* De-anonymized review text */}
            <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed mb-4">
              {deAnonymizeText(reviews[activeTab].ranking, labelToModel)}
            </div>

            {/* Parsed ranking */}
            {Array.isArray(reviews[activeTab].parsedRanking) &&
              reviews[activeTab].parsedRanking.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <h4 className="text-xs font-medium text-slate-400 mb-2">
                  Extracted Ranking:
                </h4>
                <ol className="list-decimal list-inside text-sm text-slate-400">
                  {reviews[activeTab].parsedRanking.map((label, idx) => (
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
        )}

        {/* Aggregate rankings tab */}
        {activeTab === reviews.length && aggregateRankings.length > 0 && (
          <motion.div
            key="aggregate"
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
      </AnimatePresence>
    </div>
  );
}
