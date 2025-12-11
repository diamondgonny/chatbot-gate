"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Stage3Synthesis } from "@/types";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Stage3PanelProps {
  synthesis: Stage3Synthesis | null;
  streamingContent?: string;
  streamingReasoning?: string;
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

export function Stage3Panel({
  synthesis,
  streamingContent = "",
  streamingReasoning = "",
  isLoading
}: Stage3PanelProps) {
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);

  const isStreaming = !synthesis && !!streamingContent;
  const isThinking = !synthesis && !!streamingReasoning;
  const displayContent = synthesis?.response || streamingContent;
  const displayReasoning = synthesis?.reasoning || streamingReasoning;

  if (!synthesis && !streamingContent && !streamingReasoning && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-green-900/20 to-slate-800/50 rounded-xl border border-green-700/30 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-green-700/30 bg-green-900/10">
        <h3 className="text-sm font-medium text-green-400 flex items-center gap-2">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Stage 3: Council&apos;s Final Answer
          {isThinking && !isStreaming && (
            <span className="ml-2 text-xs text-blue-400/70">● Thinking...</span>
          )}
          {isStreaming && (
            <span className="ml-2 text-xs text-green-500/70">● Streaming...</span>
          )}
        </h3>
      </div>

      <div className="p-4">
        {/* Reasoning Section (Collapsible) */}
        {displayReasoning && (
          <div className="mb-4">
            <button
              onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
              className="flex items-center gap-2 text-xs text-blue-400/70 hover:text-blue-300 transition-colors mb-2"
            >
              <svg
                className={`w-3 h-3 transition-transform ${isReasoningExpanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span>
                Reasoning Process
                {synthesis?.reasoningTokens !== undefined && (
                  <span className="text-slate-500 ml-1">
                    ({synthesis.reasoningTokens} tokens)
                  </span>
                )}
                {isThinking && !synthesis && (
                  <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse ml-1" />
                )}
              </span>
            </button>
            <AnimatePresence>
              {isReasoningExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="bg-blue-900/10 border border-blue-700/20 rounded-lg p-3 text-sm text-slate-300">
                    <MarkdownRenderer content={displayReasoning} />
                    {isThinking && !synthesis && (
                      <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Main Content */}
        {isLoading && !displayContent && !displayReasoning ? (
          <div className="flex items-center gap-3 text-slate-400">
            <span className="animate-spin">⏳</span>
            <span>Chairman is synthesizing the final answer...</span>
          </div>
        ) : displayContent ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-green-500/70">
                Chairman: {synthesis ? formatModelName(synthesis.model) : "🤖"}
              </span>
              {synthesis && (
                <span className="text-xs text-slate-600">
                  {synthesis.responseTimeMs}ms
                  {synthesis.promptTokens !== undefined && (
                    <> | {synthesis.promptTokens}+{synthesis.completionTokens} tokens</>
                  )}
                </span>
              )}
            </div>
            <div>
              <MarkdownRenderer content={displayContent} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-0.5" />
              )}
            </div>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
