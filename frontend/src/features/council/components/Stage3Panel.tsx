"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Stage3Synthesis } from "../types";
import { formatModelName } from "../utils";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Stage3PanelProps {
  synthesis: Stage3Synthesis | null;
  streamingContent?: string;
  streamingReasoning?: string;
  isLoading?: boolean;
  wasAborted?: boolean;
}

export function Stage3Panel({
  synthesis,
  streamingContent = "",
  streamingReasoning = "",
  isLoading,
  wasAborted,
}: Stage3PanelProps) {
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);

  const isStreaming = !synthesis && !!streamingContent;
  const isThinking = !synthesis && !!streamingReasoning;
  const displayContent = synthesis?.response || streamingContent;
  const displayReasoning = synthesis?.reasoning || streamingReasoning;
  // Synthesis가 존재하고 responseTimeMs > 0인 경우에만 완료로 간주 (0ms는 중단을 나타냄)
  const isComplete = !!synthesis && (synthesis.responseTimeMs ?? 0) > 0;

  if (!synthesis && !streamingContent && !streamingReasoning && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border overflow-hidden ${
        isComplete
          ? "bg-gradient-to-br from-green-900/20 to-slate-800/50 border-green-700/30"
          : "bg-slate-800/50 border-slate-700"
      }`}
    >
      <div className={`px-4 py-3 border-b ${
        isComplete
          ? "border-green-700/30 bg-green-900/10"
          : "border-slate-700"
      }`}>
        <h3 className={`text-sm font-medium flex items-center gap-2 ${
          isComplete ? "text-green-400" : "text-slate-300"
        }`}>
          Stage 3: Council&apos;s Final Answer
          {isThinking && !isStreaming && !wasAborted && (
            <span className="ml-2 text-xs text-blue-400/70">● Thinking...</span>
          )}
          {isStreaming && !wasAborted && (
            <span className="ml-2 text-xs text-green-400">● Streaming...</span>
          )}
        </h3>
      </div>

      <div className="p-4">
        {/* Reasoning Section (접기 가능) */}
        {displayReasoning && (
          <div className="mb-4">
            <button
              onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
              className="flex items-center gap-2 text-xs text-blue-400/70 hover:text-blue-300 transition-colors mb-2 cursor-pointer"
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
                {isThinking && !synthesis && !wasAborted && (
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
                    {isThinking && !synthesis && !wasAborted && (
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
              <span className={`text-xs ${isComplete ? "text-green-500/70" : "text-slate-500"}`}>
                Chairman: {synthesis ? formatModelName(synthesis.model) : "🤖"}
              </span>
              {synthesis && synthesis.responseTimeMs > 0 && (
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
              {isStreaming && !wasAborted && (
                <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-0.5" />
              )}
            </div>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
