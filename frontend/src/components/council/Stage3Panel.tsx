"use client";

import { motion } from "framer-motion";
import type { Stage3Synthesis } from "@/types";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Stage3PanelProps {
  synthesis: Stage3Synthesis | null;
  streamingContent?: string;
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

export function Stage3Panel({ synthesis, streamingContent = "", isLoading }: Stage3PanelProps) {
  const isStreaming = !synthesis && !!streamingContent;
  const displayContent = synthesis?.response || streamingContent;

  if (!synthesis && !streamingContent && !isLoading) {
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
          {isStreaming && (
            <span className="ml-2 text-xs text-green-500/70">● Streaming...</span>
          )}
        </h3>
      </div>

      <div className="p-4">
        {isLoading && !displayContent ? (
          <div className="flex items-center gap-3 text-slate-400">
            <span className="animate-spin">⏳</span>
            <span>Chairman is synthesizing the final answer...</span>
          </div>
        ) : displayContent ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-green-500/70">
                Chairman: {synthesis ? formatModelName(synthesis.model) : "GPT 5.1"}
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
